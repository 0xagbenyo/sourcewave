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
  initializePaystackCardTransaction,
  mapProviderToPaystack,
  convertToPesewas,
  verifyPaystackPayment,
  isPaystackChargeAmountValid,
  PAYSTACK_MIN_CHARGE_GHS,
  getPaystackConfigStatus,
  paystackConfigurationError,
  isPaystackChargeTransactionSuccessful,
  getPaystackChargeStep,
  normalizeGhanaMoMoPhoneForPaystack,
  submitPaystackChargeOtp,
  checkPendingPaystackCharge,
  type PaystackChargeResponse,
} from '../services/paystack';
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
};

function invoicePaystackReference(invoiceName: string): string {
  const safe = String(invoiceName || '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 24);
  return `SW-INV-${safe || 'SI'}-${Date.now()}`;
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

export const InvoicePaystackPaymentSheet: React.FC<Props> = ({
  visible,
  invoiceName,
  currency,
  maxAmount,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
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
  const [cardCheckout, setCardCheckout] = useState<{
    authorizationUrl: string;
    reference: string;
    amountGhs: number;
  } | null>(null);
  const [cardCheckoutLoading, setCardCheckoutLoading] = useState(false);
  const [cardCheckoutError, setCardCheckoutError] = useState<string | null>(null);
  const [cardInitKey, setCardInitKey] = useState(0);

  const cardSessionCacheRef = useRef<{
    key: string;
    session: { authorizationUrl: string; reference: string; amountGhs: number };
  } | null>(null);
  const cardInitPromiseRef = useRef<Promise<{
    authorizationUrl: string;
    reference: string;
    amountGhs: number;
  } | null> | null>(null);
  const momoAutoPayRef = useRef(false);

  const defaultAmount = useMemo(() => {
    const max = Number.isFinite(maxAmount) ? maxAmount : 0;
    if (max <= 0) return PAYSTACK_MIN_CHARGE_GHS.toFixed(2);
    if (max < PAYSTACK_MIN_CHARGE_GHS) return PAYSTACK_MIN_CHARGE_GHS.toFixed(2);
    return max.toFixed(2);
  }, [maxAmount]);

  const payAmountGhs = useMemo(() => {
    const v = parseFloat(String(amountText).replace(/,/g, '').trim());
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (maxAmount > 0 && maxAmount >= PAYSTACK_MIN_CHARGE_GHS) return Math.min(v, maxAmount);
    if (maxAmount > 0 && maxAmount < PAYSTACK_MIN_CHARGE_GHS) {
      return Math.max(v, PAYSTACK_MIN_CHARGE_GHS);
    }
    return v;
  }, [amountText, maxAmount]);

  const lowOutstanding = maxAmount > 0 && maxAmount < PAYSTACK_MIN_CHARGE_GHS;
  const paystackReady = getPaystackConfigStatus().configured;
  const paystackSetupError = paystackReady ? null : paystackConfigurationError();

  const momoPhoneReady = useMemo(() => {
    const momoPhone = normalizeGhanaMoMoPhoneForPaystack(paymentNumber.trim());
    return /^0[0-9]{9}$/.test(momoPhone);
  }, [paymentNumber]);

  const paystackAmountOk = isPaystackChargeAmountValid(payAmountGhs);

  const canPayMoMo =
    paystackReady &&
    (selectedPayment === 'mtn' || selectedPayment === 'telecel') &&
    paystackAmountOk &&
    momoPhoneReady &&
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
      momoAutoPayRef.current = false;
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

  const finishInvoicePayment = useCallback(
    async (reference: string) => {
      const ref = String(reference || '').trim();
      if (!ref || !invoiceName.trim()) return;
      setVerifying(true);
      try {
        await getERPNextClient().recordPaystackPaymentAgainstSalesInvoice({
          salesInvoiceName: invoiceName.trim(),
          paystackReference: ref,
        });
        Alert.alert(t('invoicePayment.successTitle'), t('invoicePayment.successBody'));
        resetState();
        onSuccess();
        onClose();
      } catch (e: unknown) {
        Alert.alert(t('invoicePayment.failedTitle'), userFacingError(e, t('invoicePayment.failedBody')));
      } finally {
        setVerifying(false);
      }
    },
    [invoiceName, onClose, onSuccess, resetState, t]
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
        momoAutoPayRef.current = false;
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
            await finishInvoicePayment(pendingPayment.reference);
            setPendingPayment(null);
            setPaymentOtp('');
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

  const loadCardCheckout = useCallback(async (): Promise<{
    authorizationUrl: string;
    reference: string;
    amountGhs: number;
  } | null> => {
    if (!user?.email?.trim() || payAmountGhs <= 0) return null;

    const sessionKey = `${invoiceName}-${payAmountGhs}`;
    const cached = cardSessionCacheRef.current;
    if (cached?.key === sessionKey) return cached.session;

    if (cardInitPromiseRef.current) return cardInitPromiseRef.current;

    const promise = (async () => {
      const reference = invoicePaystackReference(invoiceName);
      try {
        const init = await initializePaystackCardTransaction({
          email: user.email,
          amount: convertToPesewas(payAmountGhs),
          currency: currency.trim() || 'GHS',
          reference,
          channels: ['card'],
          metadata: {
            sales_invoice: invoiceName,
            amount_ghs: String(payAmountGhs),
          },
        });
        const ref = init.data.reference || reference;
        const session = {
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
  }, [currency, invoiceName, payAmountGhs, user?.email]);

  useEffect(() => {
    if (!visible || selectedPayment !== 'card') {
      setCardCheckoutError(null);
      if (!cardCheckoutLoading) setCardCheckoutLoading(false);
      return;
    }
    if (!user?.email?.trim() || payAmountGhs <= 0) return;

    let cancelled = false;
    const sessionKey = `${invoiceName}-${payAmountGhs}`;
    const cached = cardSessionCacheRef.current;

    if (cached?.key === sessionKey) {
      setCardCheckout(cached.session);
      setCardCheckoutLoading(false);
      setCardCheckoutError(null);
      return;
    }

    setCardCheckoutLoading(true);
    setCardCheckoutError(null);

    void (async () => {
      const session = await loadCardCheckout();
      if (cancelled) return;
      if (!session) {
        setCardCheckout(null);
        setCardCheckoutError(t('subscriptionPage.cardLoadFailed'));
      } else {
        setCardCheckout(session);
        setCardCheckoutError(null);
      }
      setCardCheckoutLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, selectedPayment, user?.email, invoiceName, payAmountGhs, cardInitKey, loadCardCheckout, t]);

  useEffect(() => {
    if (selectedPayment === 'card') {
      cardSessionCacheRef.current = null;
      cardInitPromiseRef.current = null;
      setCardCheckout(null);
      setCardInitKey((k) => k + 1);
    }
  }, [payAmountGhs, selectedPayment]);

  const handlePayMoMo = useCallback(async () => {
    const setupErr = paystackConfigurationError();
    if (setupErr) {
      Alert.alert(t('invoicePayment.failedTitle'), setupErr);
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
    const reference = invoicePaystackReference(invoiceName);

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
        metadata: {
          sales_invoice: invoiceName,
          amount_ghs: String(payAmountGhs),
        },
      });

      const ref = paystackResponse.data?.reference || reference;
      await processPaystackChargeResponse(paystackResponse, ref, payAmountGhs, provider);
    } catch (e: unknown) {
      momoAutoPayRef.current = false;
      const msg = e instanceof Error ? e.message : t('invoicePayment.failedBody');
      Alert.alert(t('subscriptionPage.paymentFailed'), msg);
    } finally {
      setPaying(false);
    }
  }, [
    currency,
    invoiceName,
    payAmountGhs,
    paymentNumber,
    processPaystackChargeResponse,
    selectedPayment,
    t,
    user?.email,
  ]);

  useEffect(() => {
    if (!momoPhoneReady) momoAutoPayRef.current = false;
  }, [momoPhoneReady]);

  useEffect(() => {
    if (!visible) return;
    if (
      !(selectedPayment === 'mtn' || selectedPayment === 'telecel') ||
      !momoPhoneReady ||
      !paystackAmountOk ||
      paying ||
      pendingPayment ||
      momoAutoPayRef.current
    ) {
      return;
    }
    momoAutoPayRef.current = true;
    void handlePayMoMo();
  }, [
    visible,
    selectedPayment,
    momoPhoneReady,
    paystackAmountOk,
    paying,
    pendingPayment,
    handlePayMoMo,
  ]);

  const handleCardPaymentRedirect = async (reference: string) => {
    setVerifying(true);
    try {
      const v = await verifyPaystackPayment(reference);
      if (v.data?.status === 'success') {
        setCardCheckout(null);
        await finishInvoicePayment(v.data.reference || reference);
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
      const v = await verifyPaystackPayment(pendingPayment.reference);
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
            <Text style={styles.headTitle}>{t('invoicePayment.title')}</Text>
            <Text style={styles.headSubtitle} numberOfLines={1}>
              {t('invoicePayment.invoiceRef', { name: invoiceName })}
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
                      <Text style={styles.heroBadgeText}>{t('invoicePayment.youPay')}</Text>
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
                  ) : (
                    <Text style={styles.heroHint}>{t('invoicePayment.outstandingHint', { amount: formatMoney(maxAmount, currency) })}</Text>
                  )}

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
                  {payAmountGhs > 0 && !paystackAmountOk ? (
                    <Text style={styles.amountWarn}>{t('invoicePayment.paystackMinAmount')}</Text>
                  ) : null}
                </View>

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
                                setCardInitKey((key) => key + 1);
                              }
                            : undefined
                        }
                        onPaymentRedirect={handleCardPaymentRedirect}
                      />
                    )}
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
                  momoAutoPayRef.current = false;
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
