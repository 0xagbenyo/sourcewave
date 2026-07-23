import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { appAlert as Alert } from '../services/appAlert';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import {
  initializePaystackCharge,
  mapProviderToPaystack,
  convertToPesewas,
  isPaystackChargeAmountValid,
  PAYSTACK_MIN_CHARGE_GHS,
  isPaystackChargeTransactionSuccessful,
  getPaystackChargeStep,
  normalizeGhanaMoMoPhoneForPaystack,
  submitPaystackChargeOtp,
  checkPendingPaystackCharge,
  type PaystackChargeResponse,
} from '../services/paystack';
import {
  isPaystackClientSecretEnabled,
  paystackDirectApiConfigurationError,
  verifyPaystackPaymentSecure,
} from '../services/paystackSecure';
import { userFacingError } from '../utils/userFacingError';
import { formatGhanaCedis } from '../utils/currency';
import { PaystackSecureBadge } from './PaystackSecureBadge';
import { SubscriptionPaystackCardCheckout } from './SubscriptionPaystackCardCheckout';
import {
  SubscriptionPaystackPending,
  type PendingPaystackPayment,
} from './SubscriptionPaystackPending';

const mtnMomoImage = require('../assets/images/mtn momo.png');
const telecelCashImage = require('../assets/images/telecel cash.png');
const hairline = StyleSheet.hairlineWidth;
const SHEET_PAD = 10;

type Props = {
  visible: boolean;
  invoiceName: string;
  currency: string;
  maxAmount: number;
  onClose: () => void;
  onSuccess: () => void;
  /** When `delivery_note`, `invoiceName` is the Delivery Note id and only the delivery fee is paid. */
  paymentKind?: 'sales_invoice' | 'delivery_note';
  /** Lock checkout to `maxAmount` (delivery fee only). */
  lockAmount?: boolean;
};

function paystackDocReference(kind: 'sales_invoice' | 'delivery_note', docName: string): string {
  const safe = String(docName || '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 24);
  const prefix = kind === 'delivery_note' ? 'SW-DN' : 'SW-INV';
  const fallback = kind === 'delivery_note' ? 'DN' : 'SI';
  return `${prefix}-${safe || fallback}-${Date.now()}`;
}

function formatMoney(amount: number, currency: string): string {
  const c = currency.trim() || 'GHS';
  const n = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: c }).format(n);
  } catch {
    return `${c} ${n.toFixed(2)}`;
  }
}

type CheckoutSession = {
  authorizationUrl: string;
  reference: string;
  amountGhs: number;
  /** ERPNext Payment Request — Paystack secret stays on server. */
  erpPaymentRequestName?: string;
};

export const InvoicePaystackPaymentSheet: React.FC<Props> = ({
  visible,
  invoiceName,
  currency,
  maxAmount,
  onClose,
  onSuccess,
  paymentKind = 'sales_invoice',
  lockAmount = false,
}) => {
  const { t } = useTranslation();
  const isDelivery = paymentKind === 'delivery_note';
  const usesErpHostedCheckout = !isDelivery;
  const { user } = useUserSession();
  const insets = useSafeAreaInsets();

  const [amountText, setAmountText] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<'mtn' | 'telecel' | 'card' | null>(null);
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPaystackPayment | null>(null);
  const [paymentOtp, setPaymentOtp] = useState('');
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [cardCheckout, setCardCheckout] = useState<CheckoutSession | null>(null);
  const [cardCheckoutLoading, setCardCheckoutLoading] = useState(false);
  const [cardCheckoutError, setCardCheckoutError] = useState<string | null>(null);
  const [cardPaymentStarted, setCardPaymentStarted] = useState(false);

  const cardSessionCacheRef = useRef<{
    key: string;
    session: CheckoutSession;
  } | null>(null);
  const cardInitPromiseRef = useRef<Promise<CheckoutSession | null> | null>(null);

  const defaultAmount = useMemo(() => {
    const max = Number.isFinite(maxAmount) ? maxAmount : 0;
    if (max <= 0) return PAYSTACK_MIN_CHARGE_GHS.toFixed(2);
    if (max < PAYSTACK_MIN_CHARGE_GHS) return PAYSTACK_MIN_CHARGE_GHS.toFixed(2);
    return max.toFixed(2);
  }, [maxAmount]);

  const payAmountGhs = useMemo(() => {
    if (lockAmount) {
      const max = Number.isFinite(maxAmount) ? maxAmount : 0;
      return max > 0 ? max : 0;
    }
    const v = parseFloat(String(amountText).replace(/,/g, '').trim());
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (maxAmount > 0 && maxAmount >= PAYSTACK_MIN_CHARGE_GHS) return Math.min(v, maxAmount);
    if (maxAmount > 0 && maxAmount < PAYSTACK_MIN_CHARGE_GHS) {
      return Math.max(v, PAYSTACK_MIN_CHARGE_GHS);
    }
    return v;
  }, [amountText, maxAmount, lockAmount]);

  const lowOutstanding = maxAmount > 0 && maxAmount < PAYSTACK_MIN_CHARGE_GHS;
  const paystackReady = usesErpHostedCheckout || isPaystackClientSecretEnabled();
  const paystackSetupError = paystackReady
    ? null
    : paystackDirectApiConfigurationError() || 'Paystack is not configured.';

  const momoPhoneReady = useMemo(() => {
    const momoPhone = normalizeGhanaMoMoPhoneForPaystack(paymentNumber.trim());
    return /^0[0-9]{9}$/.test(momoPhone);
  }, [paymentNumber]);

  const paystackAmountOk = isPaystackChargeAmountValid(payAmountGhs);

  const canPayMoMo =
    paystackReady &&
    (selectedPayment === 'mtn' || selectedPayment === 'telecel') &&
    paystackAmountOk &&
    (usesErpHostedCheckout || momoPhoneReady) &&
    !paying &&
    !pendingPayment;

  const resetState = useCallback(() => {
    setAmountText(defaultAmount);
    setSelectedPayment(null);
    setPaymentNumber('');
    setPaying(false);
    setVerifying(false);
    setPendingPayment(null);
    setPaymentOtp('');
    setSubmittingOtp(false);
    setCardCheckout(null);
    setCardCheckoutLoading(false);
    setCardCheckoutError(null);
    cardSessionCacheRef.current = null;
    cardInitPromiseRef.current = null;
    setCardPaymentStarted(false);
  }, [defaultAmount]);

  useEffect(() => {
    if (visible) {
      setAmountText(defaultAmount);
      setSelectedPayment(null);
      setPaymentNumber('');
      setPendingPayment(null);
      setCardCheckout(null);
      setCardCheckoutError(null);
      cardSessionCacheRef.current = null;
      cardInitPromiseRef.current = null;
      setCardPaymentStarted(false);
    }
  }, [visible, defaultAmount]);

  useEffect(() => {
    if (!visible || maxAmount <= 0) return;
    setAmountText((prev) => {
      const v = parseFloat(String(prev).replace(/,/g, '').trim());
      if (!Number.isFinite(v) || v <= 0) return defaultAmount;
      if (maxAmount < PAYSTACK_MIN_CHARGE_GHS) {
        if (v < PAYSTACK_MIN_CHARGE_GHS) return PAYSTACK_MIN_CHARGE_GHS.toFixed(2);
        return prev;
      }
      if (v > maxAmount) return maxAmount.toFixed(2);
      return prev;
    });
  }, [visible, maxAmount, defaultAmount]);

  const completeErpHostedPayment = useCallback(
    async (paymentRequestName: string, paystackRef?: string) => {
      const prName = String(paymentRequestName || '').trim();
      if (!prName) return;
      setVerifying(true);
      try {
        const pr = await getERPNextClient().confirmPaystackSalesInvoicePayment({
          paymentRequestName: prName,
          paystackReference: String(paystackRef || '').trim(),
          salesInvoiceName: invoiceName.trim(),
        });
        const status = String(pr?.status || '').trim().toLowerCase();
        if (status === 'paid' || status === 'partially paid') {
          Alert.alert(t('invoicePayment.successTitle'), t('invoicePayment.successBody'));
          resetState();
          onSuccess();
          onClose();
        } else {
          Alert.alert(t('subscriptionPage.notCompleted'), t('subscriptionPage.notCompleted'));
        }
      } catch (e: unknown) {
        Alert.alert(
          t('invoicePayment.failedTitle'),
          userFacingError(e, t('invoicePayment.failedBody'))
        );
      } finally {
        setVerifying(false);
      }
    },
    [invoiceName, onClose, onSuccess, resetState, t]
  );

  const finishInvoicePayment = useCallback(
    async (reference: string) => {
      const ref = String(reference || '').trim();
      const docName = invoiceName.trim();
      if (!ref || !docName) return;
      setVerifying(true);
      try {
        if (isDelivery) {
          await getERPNextClient().recordPaystackPaymentAgainstDeliveryNote({
            deliveryNoteName: docName,
            paystackReference: ref,
          });
          Alert.alert(t('deliveryPayment.successTitle'), t('deliveryPayment.successBody'));
        } else {
          await getERPNextClient().recordPaystackPaymentAgainstSalesInvoice({
            salesInvoiceName: docName,
            paystackReference: ref,
          });
          Alert.alert(t('invoicePayment.successTitle'), t('invoicePayment.successBody'));
        }
        resetState();
        onSuccess();
        onClose();
      } catch (e: unknown) {
        Alert.alert(
          isDelivery ? t('deliveryPayment.failedTitle') : t('invoicePayment.failedTitle'),
          userFacingError(
            e,
            isDelivery ? t('deliveryPayment.failedBody') : t('invoicePayment.failedBody')
          )
        );
      } finally {
        setVerifying(false);
      }
    },
    [invoiceName, isDelivery, onClose, onSuccess, resetState, t]
  );

  const processPaystackChargeResponse = useCallback(
    async (
      paystackResponse: PaystackChargeResponse,
      ref: string,
      amountGhs: number,
      provider: 'mtn' | 'telecel'
    ) => {
      if (isPaystackChargeTransactionSuccessful(paystackResponse)) {
        await finishInvoicePayment(ref);
        setPendingPayment(null);
        setPaymentOtp('');
        return;
      }

      const step = getPaystackChargeStep(paystackResponse);
      if (step === 'failed' || step === 'timeout') {
        Alert.alert(
          t('subscriptionPage.paymentFailed'),
          paystackResponse.data?.display_text || paystackResponse.message || t('subscriptionPage.momoFailed')
        );
        return;
      }

      setPendingPayment({
        reference: ref,
        amountGhs,
        displayText:
          paystackResponse.data?.display_text?.trim() || t('subscriptionPage.momoDefaultDisplay'),
        step: step === 'send_otp' ? 'send_otp' : step === 'pending' ? 'pending' : 'pay_offline',
        provider,
      });
    },
    [finishInvoicePayment, t]
  );

  useEffect(() => {
    if (!pendingPayment) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const startPoll = setTimeout(() => {
      intervalId = setInterval(async () => {
        if (cancelled) return;
        try {
          const res = await checkPendingPaystackCharge(pendingPayment.reference);
          if (cancelled) return;
          if (isPaystackChargeTransactionSuccessful(res)) {
            try {
              await finishInvoicePayment(pendingPayment.reference);
              setPendingPayment(null);
              setPaymentOtp('');
            } catch {
              /* finishInvoicePayment already alerts */
            }
            return;
          }
          const step = getPaystackChargeStep(res);
          if (step === 'send_otp') {
            setPendingPayment((current) =>
              current
                ? {
                    ...current,
                    step: 'send_otp',
                    displayText: res.data?.display_text || current.displayText,
                  }
                : null
            );
          }
        } catch {
          /* ignore transient poll errors */
        }
      }, 15000);
    }, 12000);

    return () => {
      cancelled = true;
      clearTimeout(startPoll);
      if (intervalId) clearInterval(intervalId);
    };
  }, [pendingPayment?.reference, finishInvoicePayment]);

  const loadCardCheckout = useCallback(async (): Promise<CheckoutSession | null> => {
    if (!user?.email?.trim() || payAmountGhs <= 0) return null;

    const sessionKey = `${invoiceName}-${payAmountGhs}-${usesErpHostedCheckout ? 'erp' : 'direct'}`;
    const cached = cardSessionCacheRef.current;
    if (cached?.key === sessionKey) return cached.session;

    if (cardInitPromiseRef.current) return cardInitPromiseRef.current;

    const promise = (async () => {
      try {
        if (usesErpHostedCheckout) {
          const init = await getERPNextClient().initiatePaystackPaymentRequestForSalesInvoice({
            salesInvoiceName: invoiceName,
            amount: payAmountGhs,
            payerEmail: user.email,
          });
          const session: CheckoutSession = {
            authorizationUrl: init.paymentUrl,
            reference: init.paymentRequestName,
            amountGhs: payAmountGhs,
            erpPaymentRequestName: init.paymentRequestName,
          };
          cardSessionCacheRef.current = { key: sessionKey, session };
          return session;
        }

        const { initializePaystackCardTransaction } = await import('../services/paystack');
        const reference = paystackDocReference(paymentKind, invoiceName);
        const init = await initializePaystackCardTransaction({
          email: user.email,
          amount: convertToPesewas(payAmountGhs),
          currency: currency.trim() || 'GHS',
          reference,
          channels: ['card'],
          metadata: isDelivery
            ? {
                delivery_note: invoiceName,
                amount_ghs: String(payAmountGhs),
              }
            : {
                sales_invoice: invoiceName,
                amount_ghs: String(payAmountGhs),
              },
        });
        const ref = init.data.reference || reference;
        const session: CheckoutSession = {
          authorizationUrl: init.data.authorization_url,
          reference: ref,
          amountGhs: payAmountGhs,
        };
        cardSessionCacheRef.current = { key: sessionKey, session };
        return session;
      } catch {
        return null;
      } finally {
        cardInitPromiseRef.current = null;
      }
    })();

    cardInitPromiseRef.current = promise;
    return promise;
  }, [currency, invoiceName, isDelivery, payAmountGhs, paymentKind, usesErpHostedCheckout, user?.email]);

  const startCardCheckout = useCallback(async () => {
    if (!paystackReady) {
      Alert.alert(t('invoicePayment.failedTitle'), paystackSetupError || t('invoicePayment.failedBody'));
      return;
    }
    if (!user?.email?.trim()) {
      Alert.alert(t('subscriptionPage.signInRequired'), t('subscriptionPage.signInBody'));
      return;
    }
    if (payAmountGhs <= 0) {
      Alert.alert(t('invoicePayment.failedTitle'), t('invoicePayment.amountInvalid'));
      return;
    }
    if (!isPaystackChargeAmountValid(payAmountGhs)) {
      Alert.alert(t('invoicePayment.failedTitle'), t('invoicePayment.paystackMinAmount'));
      return;
    }

    setCardPaymentStarted(true);
    setCardCheckoutLoading(true);
    setCardCheckoutError(null);

    const session = await loadCardCheckout();
    if (!session) {
      setCardCheckout(null);
      setCardCheckoutError(t('subscriptionPage.cardLoadFailed'));
    } else {
      setCardCheckout(session);
      setCardCheckoutError(null);
    }
    setCardCheckoutLoading(false);
  }, [loadCardCheckout, payAmountGhs, paystackReady, paystackSetupError, t, user?.email]);

  useEffect(() => {
    setCardPaymentStarted(false);
    cardSessionCacheRef.current = null;
    cardInitPromiseRef.current = null;
    setCardCheckout(null);
    setCardCheckoutError(null);
    setCardCheckoutLoading(false);
  }, [payAmountGhs, selectedPayment]);

  const handlePayMoMo = useCallback(async () => {
    if (!paystackReady) {
      Alert.alert(t('invoicePayment.failedTitle'), paystackSetupError || t('invoicePayment.failedBody'));
      return;
    }
    if (usesErpHostedCheckout) {
      await startCardCheckout();
      return;
    }
    if (!user?.email?.trim()) {
      Alert.alert(t('subscriptionPage.signInRequired'), t('subscriptionPage.signInBody'));
      return;
    }
    if (!selectedPayment || selectedPayment === 'card') {
      Alert.alert(t('subscriptionPage.choosePayment'), t('subscriptionPage.choosePaymentBody'));
      return;
    }
    if (payAmountGhs <= 0) {
      Alert.alert(t('invoicePayment.failedTitle'), t('invoicePayment.amountInvalid'));
      return;
    }
    if (!isPaystackChargeAmountValid(payAmountGhs)) {
      Alert.alert(t('invoicePayment.failedTitle'), t('invoicePayment.paystackMinAmount'));
      return;
    }
    if (!paymentNumber.trim()) {
      Alert.alert(t('subscriptionPage.enterWallet'), t('subscriptionPage.enterWalletBody'));
      return;
    }

    const momoPhone = normalizeGhanaMoMoPhoneForPaystack(paymentNumber.trim());
    if (!/^0[0-9]{9}$/.test(momoPhone)) {
      Alert.alert(t('subscriptionPage.enterWallet'), t('subscriptionPage.invalidMoMoPhone'));
      return;
    }

    const provider = selectedPayment;
    setPaying(true);
    setPendingPayment(null);
    setPaymentOtp('');
    const reference = paystackDocReference(paymentKind, invoiceName);

    try {
      const paystackResponse = await initializePaystackCharge({
        email: user.email,
        amount: convertToPesewas(payAmountGhs),
        currency: currency.trim() || 'GHS',
        reference,
        mobile_money: {
          phone: momoPhone,
          provider: mapProviderToPaystack(provider),
        },
        metadata: isDelivery
          ? {
              delivery_note: invoiceName,
              amount_ghs: String(payAmountGhs),
            }
          : {
              sales_invoice: invoiceName,
              amount_ghs: String(payAmountGhs),
            },
      });

      const ref = paystackResponse.data?.reference || reference;
      await processPaystackChargeResponse(paystackResponse, ref, payAmountGhs, provider);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('invoicePayment.failedBody');
      Alert.alert(t('subscriptionPage.paymentFailed'), msg);
    } finally {
      setPaying(false);
    }
  }, [
    currency,
    invoiceName,
    isDelivery,
    payAmountGhs,
    paymentKind,
    paymentNumber,
    processPaystackChargeResponse,
    selectedPayment,
    startCardCheckout,
    t,
    usesErpHostedCheckout,
    user?.email,
    paystackReady,
    paystackSetupError,
  ]);

  const handleCardPaymentRedirect = async (reference: string) => {
    const ref = String(reference || '').trim();
    if (!ref) return;
    if (cardCheckout?.erpPaymentRequestName) {
      await completeErpHostedPayment(cardCheckout.erpPaymentRequestName, ref);
      return;
    }
    await finishInvoicePayment(ref);
  };

  const handleConfirmCardPayment = async () => {
    const ref = String(cardCheckout?.reference || '').trim();
    if (!ref) return;
    if (cardCheckout?.erpPaymentRequestName) {
      await completeErpHostedPayment(cardCheckout.erpPaymentRequestName, ref);
      return;
    }
    await finishInvoicePayment(ref);
  };

  const handleSubmitPaymentOtp = async () => {
    if (!pendingPayment || !paymentOtp.trim()) return;
    setSubmittingOtp(true);
    try {
      const res = await submitPaystackChargeOtp(paymentOtp.trim(), pendingPayment.reference);
      await processPaystackChargeResponse(
        res,
        pendingPayment.reference,
        pendingPayment.amountGhs,
        pendingPayment.provider
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('subscriptionPage.momoOtpFailed');
      Alert.alert(t('subscriptionPage.paymentFailed'), msg);
    } finally {
      setSubmittingOtp(false);
    }
  };

  const handleVerifyPending = async () => {
    if (!pendingPayment) return;
    setVerifying(true);
    try {
      const v = await verifyPaystackPaymentSecure(pendingPayment.reference);
      if (v.data?.status === 'success') {
        await finishInvoicePayment(v.data.reference || pendingPayment.reference);
        setPendingPayment(null);
        setPaymentOtp('');
      } else {
        Alert.alert(
          t('subscriptionPage.notCompleted'),
          v.data?.gateway_response || t('subscriptionPage.notCompleted')
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('subscriptionPage.verifyFailed');
      Alert.alert(t('subscriptionPage.verifyFailed'), msg);
    } finally {
      setVerifying(false);
    }
  };

  const canStartCard =
    paystackReady &&
    selectedPayment === 'card' &&
    paystackAmountOk &&
    !!user?.email?.trim() &&
    !cardCheckoutLoading &&
    !verifying;

  const handleClose = () => {
    if (paying || verifying || submittingOtp) return;
    resetState();
    onClose();
  };

  const paymentStep = pendingPayment ? 3 : selectedPayment ? 2 : payAmountGhs > 0 ? 1 : 0;
  const currencyLabel = currency.trim() || 'GHS';
  const showCheckoutForm = !pendingPayment;

  const renderStepPill = (step: number, label: string) => {
    const active = paymentStep >= step;
    const current = paymentStep === step;
    return (
      <View key={label} style={styles.stepPillWrap}>
        <View style={[styles.stepPill, active && styles.stepPillActive, current && styles.stepPillCurrent]}>
          <Text style={[styles.stepPillNum, active && styles.stepPillNumActive]}>{step}</Text>
        </View>
        <Text style={[styles.stepPillLabel, active && styles.stepPillLabelActive]}>{label}</Text>
      </View>
    );
  };

  const renderMethodChip = (
    id: 'card' | 'mtn' | 'telecel',
    label: string,
    icon: React.ReactNode
  ) => {
    const selected = selectedPayment === id;
    return (
      <TouchableOpacity
        key={id}
        style={[styles.methodChip, selected && styles.methodChipSelected]}
        onPress={() => setSelectedPayment(id)}
        activeOpacity={0.8}
        disabled={!!pendingPayment || paying}
      >
        <View style={[styles.methodChipIcon, selected && styles.methodChipIconSelected]}>{icon}</View>
        <Text style={[styles.methodChipLabel, selected && styles.methodChipLabelSelected]} numberOfLines={2}>
          {label}
        </Text>
        {selected ? (
          <View style={styles.methodChipCheck}>
            <Ionicons name="checkmark" size={12} color={Colors.WHITE} />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headTextWrap}>
            <Text style={styles.headTitle}>
              {isDelivery ? t('deliveryPayment.title') : t('invoicePayment.title')}
            </Text>
            <Text style={styles.headSubtitle} numberOfLines={1}>
              {isDelivery
                ? t('deliveryPayment.deliveryRef', { name: invoiceName })
                : t('invoicePayment.invoiceRef', { name: invoiceName })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            hitSlop={12}
            disabled={paying || verifying}
          >
            <Ionicons name="close" size={22} color={Colors.DARK_GRAY} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {showCheckoutForm ? (
              <>
                <LinearGradient
                  colors={[Colors.GRADIENT_WINE_START, Colors.GRADIENT_WINE_END]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroCard}
                >
                  <View style={styles.heroTopRow}>
                    <View style={styles.heroBadge}>
                      <Ionicons name="document-text-outline" size={14} color={Colors.WHITE} />
                      <Text style={styles.heroBadgeText}>
                        {isDelivery ? t('deliveryPayment.deliveryFee') : t('invoicePayment.youPay')}
                      </Text>
                    </View>
                    <Text style={styles.heroBalance}>
                      {t('invoicePayment.balanceDue')}: {formatMoney(maxAmount, currency)}
                    </Text>
                  </View>

                  <Text style={styles.heroAmount}>
                    {payAmountGhs > 0 ? formatGhanaCedis(payAmountGhs) : formatMoney(0, currency)}
                  </Text>

                  {lowOutstanding ? (
                    <Text style={styles.heroHint}>
                      {t('invoicePayment.lowOutstandingHint', {
                        balance: formatMoney(maxAmount, currency),
                        min: formatMoney(PAYSTACK_MIN_CHARGE_GHS, currency),
                      })}
                    </Text>
                  ) : null}

                  <View style={styles.stepRow}>
                    {renderStepPill(1, t('invoicePayment.stepAmount'))}
                    <View style={[styles.stepConnector, paymentStep >= 2 && styles.stepConnectorActive]} />
                    {renderStepPill(2, t('invoicePayment.stepMethod'))}
                    <View style={[styles.stepConnector, paymentStep >= 3 && styles.stepConnectorActive]} />
                    {renderStepPill(3, t('invoicePayment.stepPay'))}
                  </View>
                </LinearGradient>

                {!paystackReady && paystackSetupError ? (
                  <View style={styles.configWarnBox}>
                    <Ionicons name="warning-outline" size={18} color={Colors.ERROR} />
                    <Text style={styles.configWarnText}>{paystackSetupError}</Text>
                  </View>
                ) : null}

                {!lockAmount ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t('invoicePayment.editAmount')}</Text>
                  <View style={styles.amountInputRow}>
                    <Text style={styles.amountCurrency}>{currencyLabel}</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={amountText}
                      onChangeText={setAmountText}
                      keyboardType="decimal-pad"
                      placeholder={defaultAmount}
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      editable={!paying && !pendingPayment}
                    />
                  </View>
                  {payAmountGhs > 0 && paystackAmountOk ? (
                    <Text style={styles.amountHint}>
                      {lowOutstanding
                        ? t('invoicePayment.payAmountOverpayHint', {
                            amount: formatGhanaCedis(payAmountGhs),
                            balance: formatMoney(maxAmount, currency),
                          })
                        : t('invoicePayment.payAmountHint', { amount: formatGhanaCedis(payAmountGhs) })}
                    </Text>
                  ) : null}
                  <Text style={styles.partialPayNote}>{t('invoicePayment.payPartialPaymentNote')}</Text>
                  {payAmountGhs > 0 && !paystackAmountOk ? (
                    <Text style={styles.amountWarn}>{t('invoicePayment.paystackMinAmount')}</Text>
                  ) : null}
                </View>
                ) : null}

                <Text style={styles.sectionTitle}>{t('invoicePayment.chooseMethod')}</Text>
                <View style={styles.methodGrid}>
                  {renderMethodChip(
                    'card',
                    t('subscriptionPage.cardLabel'),
                    <Ionicons name="card-outline" size={26} color={Colors.WINE} />
                  )}
                  {renderMethodChip('mtn', 'MTN MoMo', (
                    <Image source={mtnMomoImage} style={styles.methodLogo} resizeMode="contain" />
                  ))}
                  {renderMethodChip('telecel', 'Telecel Cash', (
                    <Image source={telecelCashImage} style={styles.methodLogo} resizeMode="contain" />
                  ))}
                </View>

                {selectedPayment === 'mtn' || selectedPayment === 'telecel' ? (
                  <View style={styles.card}>
                    <View style={styles.walletHeader}>
                      <Ionicons name="phone-portrait-outline" size={20} color={Colors.WINE} />
                      <Text style={styles.cardTitle}>{t('subscriptionPage.walletLabel')}</Text>
                    </View>
                    <Text style={styles.cardSubtitle}>{t('subscriptionPage.paySubtitle')}</Text>
                    <View style={styles.walletInputRow}>
                      <View style={styles.walletPrefix}>
                        <Text style={styles.walletPrefixText}>+233</Text>
                      </View>
                      <TextInput
                        style={styles.walletInput}
                        placeholder={t('subscriptionPage.walletShortPlaceholder')}
                        placeholderTextColor={Colors.TEXT_SECONDARY}
                        keyboardType="phone-pad"
                        value={paymentNumber}
                        onChangeText={setPaymentNumber}
                        maxLength={15}
                        editable={!paying && !pendingPayment}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (canPayMoMo) void handlePayMoMo();
                        }}
                      />
                      {momoPhoneReady ? (
                        <View style={styles.phoneOkBadge}>
                          <Ionicons name="checkmark-circle" size={22} color={Colors.SUCCESS} />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.fieldHint}>{t('subscriptionPage.walletHint')}</Text>

                    <TouchableOpacity
                      style={[styles.payBtn, !canPayMoMo && styles.btnDisabled]}
                      onPress={() => void handlePayMoMo()}
                      disabled={!canPayMoMo}
                      activeOpacity={0.88}
                    >
                      {paying ? (
                        <ActivityIndicator color={Colors.WHITE} />
                      ) : (
                        <>
                          <Ionicons name="lock-closed" size={18} color={Colors.WHITE} />
                          <Text style={styles.payBtnText}>
                            {t('subscriptionPage.payCtaShort', { amount: formatGhanaCedis(payAmountGhs) })}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : selectedPayment === 'card' ? (
                  <View style={styles.card}>
                    <View style={styles.walletHeader}>
                      <Ionicons name="card-outline" size={20} color={Colors.WINE} />
                      <Text style={styles.cardTitle}>{t('subscriptionPage.cardLabel')}</Text>
                    </View>
                    <Text style={styles.cardSubtitle}>{t('subscriptionPage.cardHint')}</Text>
                    {!user?.email ? (
                      <Text style={styles.fieldHint}>{t('subscriptionPage.signInBody')}</Text>
                    ) : payAmountGhs <= 0 ? (
                      <Text style={styles.fieldHint}>{t('invoicePayment.amountInvalid')}</Text>
                    ) : !cardPaymentStarted ? (
                      <TouchableOpacity
                        style={[styles.payBtn, !canStartCard && styles.btnDisabled]}
                        onPress={() => void startCardCheckout()}
                        disabled={!canStartCard}
                        activeOpacity={0.88}
                      >
                        {cardCheckoutLoading ? (
                          <ActivityIndicator color={Colors.WHITE} />
                        ) : (
                          <>
                            <Ionicons name="lock-closed" size={18} color={Colors.WHITE} />
                            <Text style={styles.payBtnText}>
                              {t('subscriptionPage.payCtaShort', { amount: formatGhanaCedis(payAmountGhs) })}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <SubscriptionPaystackCardCheckout
                        authorizationUrl={cardCheckout?.authorizationUrl}
                        reference={cardCheckout?.reference}
                        preparing={cardCheckoutLoading && !cardCheckout}
                        error={cardCheckoutError}
                        onRetry={
                          cardCheckoutError
                            ? () => {
                                cardSessionCacheRef.current = null;
                                cardInitPromiseRef.current = null;
                                void startCardCheckout();
                              }
                            : undefined
                        }
                        onPaymentRedirect={handleCardPaymentRedirect}
                      />
                    )}
                    {cardPaymentStarted && cardCheckout?.reference ? (
                      <TouchableOpacity
                        style={[styles.confirmPayBtn, verifying && styles.btnDisabled]}
                        onPress={() => void handleConfirmCardPayment()}
                        disabled={verifying}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.confirmPayBtnText}>{t('invoicePayment.verifyCta')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.chooseHintCard}>
                    <Ionicons name="hand-left-outline" size={22} color={Colors.WINE} />
                    <Text style={styles.chooseHintText}>{t('subscriptionPage.choosePaymentBody')}</Text>
                  </View>
                )}

                <PaystackSecureBadge />
              </>
            ) : null}

            {pendingPayment ? (
              <SubscriptionPaystackPending
                pending={pendingPayment}
                otp={paymentOtp}
                onOtpChange={setPaymentOtp}
                onSubmitOtp={handleSubmitPaymentOtp}
                submittingOtp={submittingOtp}
                verifying={verifying}
                onVerify={handleVerifyPending}
                onCancel={() => {
                  setPendingPayment(null);
                  setPaymentOtp('');
                }}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        {verifying || paying ? (
          <View style={styles.verifyingOverlay}>
            <View style={styles.verifyingCard}>
              <ActivityIndicator size="large" color={Colors.WINE} />
              <Text style={styles.verifyingTitle}>
                {verifying ? t('invoicePayment.verifying') : t('invoicePayment.processingPayment')}
              </Text>
              <Text style={styles.verifyingText}>{t('subscriptionPage.momoTimerHint')}</Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FA' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SHEET_PAD + 6,
    paddingBottom: 16,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  headTextWrap: { flex: 1, minWidth: 0, paddingRight: 12 },
  headTitle: { fontSize: 20, fontWeight: '700', color: Colors.BRAND_NAVY },
  headSubtitle: { fontSize: 14, color: Colors.TEXT_SECONDARY, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.LIGHT_GRAY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SHEET_PAD,
    paddingTop: 12,
  },
  heroCard: {
    marginTop: 4,
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroBadgeText: {
    color: Colors.WHITE,
    fontSize: 12,
    fontWeight: '600',
  },
  heroBalance: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  heroAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: Colors.WHITE,
    letterSpacing: -0.5,
  },
  heroHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.88)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: hairline,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  stepPillWrap: { alignItems: 'center', flex: 1 },
  stepPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepPillActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  stepPillCurrent: {
    backgroundColor: Colors.WHITE,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  stepPillNum: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  stepPillNumActive: { color: Colors.WINE },
  stepPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  stepPillLabelActive: { color: Colors.WHITE },
  stepConnector: {
    flex: 0.4,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 22,
    borderRadius: 1,
  },
  stepConnectorActive: { backgroundColor: 'rgba(255,255,255,0.55)' },
  configWarnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFEBEE',
    borderWidth: hairline,
    borderColor: '#EF9A9A',
  },
  configWarnText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.ERROR,
  },
  card: {
    marginTop: 14,
    backgroundColor: Colors.WHITE,
    borderRadius: 18,
    padding: 20,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    marginTop: 22,
    marginBottom: 12,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: Colors.BORDER,
    borderRadius: 14,
    backgroundColor: Colors.OFF_WHITE,
    overflow: 'hidden',
    minHeight: 56,
  },
  amountCurrency: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.WINE,
    backgroundColor: Colors.BRAND_SOFT,
    borderRightWidth: hairline,
    borderRightColor: Colors.BORDER,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.BLACK,
  },
  amountHint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 10,
    lineHeight: 17,
  },
  partialPayNote: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 10,
    lineHeight: 18,
  },
  amountWarn: {
    fontSize: 12,
    color: Colors.ERROR,
    marginTop: 10,
    lineHeight: 17,
  },
  methodGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: Colors.WHITE,
    borderWidth: 2,
    borderColor: Colors.BORDER,
    minHeight: 118,
    position: 'relative',
  },
  methodChipSelected: {
    borderColor: Colors.WINE,
    backgroundColor: Colors.BRAND_SOFT,
  },
  methodChipIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.OFF_WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  methodChipIconSelected: {
    backgroundColor: Colors.WHITE,
  },
  methodLogo: { width: 34, height: 34 },
  methodChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.DARK_GRAY,
    textAlign: 'center',
    lineHeight: 16,
  },
  methodChipLabelSelected: { color: Colors.WINE },
  methodChipCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  walletInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.BORDER,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.OFF_WHITE,
    marginTop: 8,
    minHeight: 54,
  },
  walletPrefix: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: Colors.BRAND_SOFT,
    borderRightWidth: hairline,
    borderRightColor: Colors.BORDER,
  },
  walletPrefixText: { fontSize: 15, fontWeight: '700', color: Colors.WINE },
  walletInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.BLACK,
    paddingHorizontal: 16,
    paddingVertical: 16,
    letterSpacing: 0.5,
  },
  phoneOkBadge: {
    paddingRight: 12,
  },
  fieldHint: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 8, lineHeight: 17 },
  payBtn: {
    marginTop: 18,
    backgroundColor: Colors.WINE,
    borderRadius: 14,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.WINE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  payBtnText: { color: Colors.WHITE, fontSize: 17, fontWeight: '700' },
  confirmPayBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: hairline,
    borderColor: Colors.WINE,
  },
  confirmPayBtnText: { color: Colors.WINE, fontSize: 15, fontWeight: '600' },
  chooseHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 18,
    borderRadius: 16,
    backgroundColor: Colors.BRAND_SOFT,
    borderWidth: hairline,
    borderColor: '#C5DCFF',
  },
  chooseHintText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.DARK_GRAY,
    fontWeight: '500',
  },
  btnDisabled: { opacity: 0.55 },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 27, 51, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  verifyingCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.WHITE,
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  verifyingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    textAlign: 'center',
  },
  verifyingText: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 18,
  },
});
