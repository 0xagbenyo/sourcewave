import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { appAlert as Alert } from '../services/appAlert';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import {
  SubscriptionPaystackPending,
  type PendingPaystackPayment,
} from '../components/SubscriptionPaystackPending';
import { SubscriptionPaystackCardCheckout } from '../components/SubscriptionPaystackCardCheckout';
import { PaystackSecureBadge } from '../components/PaystackSecureBadge';
import {
  SOURCEWAVE_SUBSCRIPTION_PLANS,
  DEFAULT_SUBSCRIPTION_PLAN_ID,
  type SubscriptionPlanId,
  getErpSubscriptionPlanName,
  getErpSubscriptionCompany,
  formatSubscriptionMonthlyRate,
  getPlanTotalSavingsGhs,
} from '../constants/subscriptions';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import {
  initializePaystackCharge,
  initializePaystackCardTransaction,
  mapProviderToPaystack,
  convertToPesewas,
  verifyPaystackPayment,
  isPaystackChargeTransactionSuccessful,
  getPaystackChargeStep,
  normalizeGhanaMoMoPhoneForPaystack,
  submitPaystackChargeOtp,
  checkPendingPaystackCharge,
  type PaystackChargeResponse,
} from '../services/paystack';
import { getERPNextClient } from '../services/erpnext';
import { formatGhanaCedis } from '../utils/currency';
import { toYmd, erpSubscriptionCoversThrough } from '../utils/subscriptionErpnext';
import type { AppliedSubscriptionPromo } from '../utils/subscriptionPromoCode';
import { normalizePromoCode } from '../utils/subscriptionPromoCode';
import type { RootStackParamList } from '../types';

const hairline = StyleSheet.hairlineWidth;

const mtnMomoImage = require('../assets/images/mtn momo.png');
const telecelCashImage = require('../assets/images/telecel cash.png');

function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const SubscriptionScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();
  const { subscription, isActive, isLoading, refresh } = useSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlanId>(DEFAULT_SUBSCRIPTION_PLAN_ID);
  const [selectedPayment, setSelectedPayment] = useState<'mtn' | 'telecel' | 'card' | null>(null);
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paying, setPaying] = useState(false);
  const [lastReference, setLastReference] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<AppliedSubscriptionPromo | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPaystackPayment | null>(null);
  const [cardCheckout, setCardCheckout] = useState<{
    authorizationUrl: string;
    reference: string;
    amountGhs: number;
  } | null>(null);
  const [cardCheckoutLoading, setCardCheckoutLoading] = useState(false);
  const [cardCheckoutError, setCardCheckoutError] = useState<string | null>(null);
  const [cardInitKey, setCardInitKey] = useState(0);
  const [paymentOtp, setPaymentOtp] = useState('');
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const pendingPromoRef = useRef<string | null>(null);
  const cardPromoRef = useRef<string | null>(null);
  const cardSessionCacheRef = useRef<{
    key: string;
    promoCode: string | null;
    session: { authorizationUrl: string; reference: string; amountGhs: number };
  } | null>(null);
  const cardInitPromiseRef = useRef<Promise<{
    authorizationUrl: string;
    reference: string;
    amountGhs: number;
  } | null> | null>(null);

  const selectedPlan = SOURCEWAVE_SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlanId)!;

  const checkoutPriceGhs = appliedPromo?.finalPriceGhs ?? selectedPlan.priceGhs;
  const prevPlanIdRef = useRef(selectedPlanId);

  useEffect(() => {
    if (prevPlanIdRef.current === selectedPlanId) return;
    prevPlanIdRef.current = selectedPlanId;

    const code = appliedPromo?.code;
    if (!code) return;

    let cancelled = false;
    (async () => {
      try {
        const client = getERPNextClient();
        const result = await client.resolveSubscriptionPromoCode(code, selectedPlan.priceGhs);
        if (cancelled) return;
        setAppliedPromo(result);
        setPromoError(result ? null : t('subscriptionPage.promoInvalid'));
      } catch {
        if (!cancelled) {
          setAppliedPromo(null);
          setPromoError(t('subscriptionPage.promoInvalid'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlanId, selectedPlan.priceGhs, appliedPromo?.code, t]);

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
            await finishActivation(pendingPayment.reference, pendingPromoRef.current);
            setPendingPayment(null);
            setLastReference(null);
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
          // Ignore transient poll errors.
        }
      }, 15000);
    }, 12000);

    return () => {
      cancelled = true;
      clearTimeout(startPoll);
      if (intervalId) clearInterval(intervalId);
    };
  }, [pendingPayment?.reference]);

  const loadCardCheckout = useCallback(async (): Promise<{
    authorizationUrl: string;
    reference: string;
    amountGhs: number;
  } | null> => {
    if (!user?.email) return null;

    const sessionKey = `${selectedPlanId}-${checkoutPriceGhs}`;
    const cached = cardSessionCacheRef.current;
    if (cached?.key === sessionKey) {
      return cached.session;
    }

    if (cardInitPromiseRef.current) {
      return cardInitPromiseRef.current;
    }

    const promise = (async () => {
      const reference = `SW-SUB-${selectedPlan.id}-${Date.now()}`;
      try {
        const init = await initializePaystackCardTransaction({
          email: user.email,
          amount: convertToPesewas(checkoutPriceGhs),
          currency: 'GHS',
          reference,
          channels: ['card'],
          metadata: {
            plan_id: selectedPlan.id,
            ...(appliedPromo?.code ? { promo_code: appliedPromo.code } : {}),
          },
        });
        const ref = init.data.reference || reference;
        const session = {
          authorizationUrl: init.data.authorization_url,
          reference: ref,
          amountGhs: checkoutPriceGhs,
        };
        cardSessionCacheRef.current = {
          key: sessionKey,
          promoCode: appliedPromo?.code ?? null,
          session,
        };
        cardPromoRef.current = appliedPromo?.code ?? null;
        setLastReference(ref);
        return session;
      } catch {
        return null;
      } finally {
        cardInitPromiseRef.current = null;
      }
    })();

    cardInitPromiseRef.current = promise;
    return promise;
  }, [user?.email, selectedPlan.id, selectedPlanId, checkoutPriceGhs, appliedPromo?.code]);

  useEffect(() => {
    if (isActive || isLoading || !user?.email) return;
    void loadCardCheckout();
  }, [isActive, isLoading, user?.email, selectedPlanId, checkoutPriceGhs, loadCardCheckout]);

  useEffect(() => {
    if (selectedPayment !== 'card') {
      setCardCheckoutError(null);
      if (!cardCheckoutLoading) {
        setCardCheckoutLoading(false);
      }
      return;
    }
    if (!user?.email) return;

    let cancelled = false;
    const sessionKey = `${selectedPlanId}-${checkoutPriceGhs}`;
    const cached = cardSessionCacheRef.current;

    if (cached?.key === sessionKey) {
      setCardCheckout(cached.session);
      setCardCheckoutLoading(false);
      setCardCheckoutError(null);
      cardPromoRef.current = cached.promoCode;
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
  }, [selectedPayment, user?.email, selectedPlanId, checkoutPriceGhs, cardInitKey, loadCardCheckout, t]);

  const processPaystackChargeResponse = async (
    paystackResponse: PaystackChargeResponse,
    ref: string,
    amountGhs: number,
    promoCodeForErp: string | null,
    provider: 'mtn' | 'telecel'
  ) => {
    if (isPaystackChargeTransactionSuccessful(paystackResponse)) {
      await finishActivation(ref, promoCodeForErp);
      setPendingPayment(null);
      setLastReference(null);
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

    pendingPromoRef.current = promoCodeForErp;
    setLastReference(ref);
    setPendingPayment({
      reference: ref,
      amountGhs,
      displayText:
        paystackResponse.data?.display_text?.trim() || t('subscriptionPage.momoDefaultDisplay'),
      step: step === 'send_otp' ? 'send_otp' : step === 'pending' ? 'pending' : 'pay_offline',
      provider,
    });
  };

  const handleApplyPromo = async () => {
    const code = normalizePromoCode(promoCodeInput);
    if (!code) {
      setPromoError(t('subscriptionPage.promoRequired'));
      setAppliedPromo(null);
      return;
    }

    setPromoValidating(true);
    setPromoError(null);
    try {
      const client = getERPNextClient();
      const result = await client.resolveSubscriptionPromoCode(code, selectedPlan.priceGhs);
      if (!result) {
        setAppliedPromo(null);
        setPromoError(t('subscriptionPage.promoInvalid'));
        return;
      }
      setAppliedPromo(result);
      setPromoCodeInput(result.code);
    } catch (e: unknown) {
      setAppliedPromo(null);
      const msg = e instanceof Error ? e.message : t('subscriptionPage.promoInvalid');
      setPromoError(msg);
    } finally {
      setPromoValidating(false);
    }
  };

  const handleClearPromo = () => {
    setPromoCodeInput('');
    setAppliedPromo(null);
    setPromoError(null);
  };

  const finishActivation = async (reference: string, promoCode?: string | null) => {
    const expires = addMonths(new Date(), selectedPlan.months);
    const erpPlanName = getErpSubscriptionPlanName(selectedPlan.id);
    let erpWarning: string | null = null;
    if (user?.email) {
      try {
        const client = getERPNextClient();
        const customer = await client.getCustomerByEmail(user.email);
        if (!customer?.name) {
          erpWarning = t('subscriptionPage.erpNoCustomer');
        } else {
          const rows = await client.listSubscriptionsForCustomer(customer.name);
          const shouldCreate = !erpSubscriptionCoversThrough(rows, expires);
          if (shouldCreate) {
            const subscriptionPayload: Record<string, unknown> = {
              party_type: 'Customer',
              party: customer.name,
              company: getErpSubscriptionCompany(),
              start_date: toYmd(new Date()),
              end_date: toYmd(expires),
              plans: [{ plan: erpPlanName, qty: 1 }],
              generate_invoice_at: 'End of the current subscription period',
              days_until_due: 7,
              submit_invoice: 0,
            };
            if (promoCode) {
              subscriptionPayload.custom_promo_code = promoCode;
            }
            await client.createSubscriptionDoc(subscriptionPayload);
          }
        }
      } catch (e: unknown) {
        console.warn('Subscription create failed', e);
        erpWarning = t('subscriptionPage.erpSaveFailed');
      }
    }

    await refresh();

    const body =
      t('subscriptionPage.welcomeBody', {
        date: formatShortDate(expires),
        reference,
      }) + (erpWarning ? `\n\n${erpWarning}` : '');

    Alert.alert(t('subscriptionPage.welcomeTitle'), body, [{ text: t('contactUs.ok'), onPress: () => navigation.goBack() }]);
  };

  const resolvePromoForCheckout = async (): Promise<{
    amountGhs: number;
    promoCodeForErp: string | null;
  } | null> => {
    let promoForCheckout = appliedPromo;
    const pendingCode = normalizePromoCode(promoCodeInput);
    if (pendingCode && !appliedPromo) {
      setPromoValidating(true);
      try {
        const client = getERPNextClient();
        promoForCheckout = await client.resolveSubscriptionPromoCode(pendingCode, selectedPlan.priceGhs);
        if (!promoForCheckout) {
          Alert.alert(t('subscriptionPage.promoInvalidTitle'), t('subscriptionPage.promoInvalid'));
          return null;
        }
        setAppliedPromo(promoForCheckout);
      } catch {
        Alert.alert(t('subscriptionPage.promoInvalidTitle'), t('subscriptionPage.promoInvalid'));
        return null;
      } finally {
        setPromoValidating(false);
      }
    }

    const amountGhs = promoForCheckout?.finalPriceGhs ?? selectedPlan.priceGhs;
    return { amountGhs, promoCodeForErp: promoForCheckout?.code ?? null };
  };

  const handlePay = async () => {
    if (!user?.email) {
      Alert.alert(t('subscriptionPage.signInRequired'), t('subscriptionPage.signInBody'));
      return;
    }
    if (!selectedPayment) {
      Alert.alert(t('subscriptionPage.choosePayment'), t('subscriptionPage.choosePaymentBody'));
      return;
    }

    const checkout = await resolvePromoForCheckout();
    if (!checkout) return;

    const { amountGhs, promoCodeForErp } = checkout;

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
    const reference = `SW-SUB-${selectedPlan.id}-${Date.now()}`;
    try {
      const paystackResponse = await initializePaystackCharge({
        email: user.email,
        amount: convertToPesewas(amountGhs),
        currency: 'GHS',
        reference,
        mobile_money: {
          phone: momoPhone,
          provider: mapProviderToPaystack(selectedPayment),
        },
      });

      const ref = paystackResponse.data?.reference || reference;
      await processPaystackChargeResponse(paystackResponse, ref, amountGhs, promoCodeForErp, provider);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payment could not be started.';
      Alert.alert(t('subscriptionPage.paymentFailed'), msg);
    } finally {
      setPaying(false);
    }
  };

  const handleCardPaymentRedirect = async (reference: string) => {
    setVerifying(true);
    try {
      const v = await verifyPaystackPayment(reference);
      if (v.data?.status === 'success') {
        setCardCheckout(null);
        await finishActivation(v.data.reference || reference, cardPromoRef.current);
        setLastReference(null);
        cardPromoRef.current = null;
      } else {
        Alert.alert(t('subscriptionPage.notCompleted'), v.data?.gateway_response || 'Status is not success yet.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
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
        pendingPromoRef.current,
        pendingPayment.provider
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('subscriptionPage.momoOtpFailed');
      Alert.alert(t('subscriptionPage.paymentFailed'), msg);
    } finally {
      setSubmittingOtp(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleVerify = async (ref?: string, promoCode?: string | null) => {
    const r = ref || lastReference;
    if (!r) {
      Alert.alert(t('subscriptionPage.verifyNoRef'), t('subscriptionPage.verifyNoRefBody'));
      return;
    }
    const promoCodeForErp = promoCode ?? appliedPromo?.code ?? null;
    setVerifying(true);
    try {
      const v = await verifyPaystackPayment(r);
      if (v.data?.status === 'success') {
        await finishActivation(v.data.reference || r, promoCodeForErp);
        setLastReference(null);
        setPendingPayment(null);
        setPaymentOtp('');
      } else {
        Alert.alert(t('subscriptionPage.notCompleted'), v.data?.gateway_response || 'Status is not success yet.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
      Alert.alert(t('subscriptionPage.verifyFailed'), msg);
    } finally {
      setVerifying(false);
    }
  };

  const showPurchaseFooter =
    !isLoading && !isActive && !pendingPayment && selectedPayment !== 'card';
  const showActiveFooter = !isLoading && isActive && !!subscription;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={t('subscriptionPage.title')} subtitle={t('subscriptionPage.subtitle')} />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.WINE} />
              <Text style={styles.loadingText}>{t('subscriptionPage.loading')}</Text>
            </View>
          ) : null}

          {!isLoading && isActive && subscription ? (
            <>
              <Text style={styles.mutedLead}>{t('subscriptionPage.activeLead')}</Text>
              <Text style={styles.sectionLabel}>{t('subscriptionPage.sectionStatus')}</Text>
              <View style={styles.group}>
                <View style={[styles.row, styles.rowLast]}>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.SUCCESS} style={styles.rowIcon} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{t('subscriptionPage.activeTitle')}</Text>
                    <Text style={styles.rowSubtitle}>
                      {t('subscriptionPage.activeEnds', {
                        plan: subscription.planTitle,
                        date: new Date(subscription.expiresAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        }),
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : null}

          {!isLoading && !isActive ? (
            <>
              <PaystackSecureBadge />
              <Text style={styles.mutedLead}>{t('subscriptionPage.inactiveLead')}</Text>
            </>
          ) : null}

          {!isLoading && !isActive ? (
            <>
              <Text style={styles.sectionLabel}>{t('subscriptionPage.checkoutHeroEyebrow')}</Text>
              <View style={styles.group}>
                <View style={[styles.row, styles.rowLast]}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{selectedPlan.durationLabel}</Text>
                    {appliedPromo ? (
                      <Text style={styles.rowSubtitle}>
                        {t('subscriptionPage.promoDiscountLine', {
                          percent: appliedPromo.discountPercent,
                          amount: formatGhanaCedis(appliedPromo.discountAmountGhs),
                        })}
                      </Text>
                    ) : selectedPlan.savingsPercent ? (
                      <Text style={styles.rowSubtitle}>
                        {t('subscriptionPage.planSave', { percent: selectedPlan.savingsPercent })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.priceCol}>
                    {appliedPromo ? (
                      <Text style={styles.priceWas}>{formatGhanaCedis(selectedPlan.priceGhs)}</Text>
                    ) : null}
                    <Text style={styles.priceNow}>{formatGhanaCedis(checkoutPriceGhs)}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionLabel}>{t('subscriptionPage.sectionPlan')}</Text>
              <View style={styles.group}>
                {SOURCEWAVE_SUBSCRIPTION_PLANS.map((plan, index) => {
                  const selected = plan.id === selectedPlanId;
                  const totalSaved = getPlanTotalSavingsGhs(plan);
                  const isLast = index === SOURCEWAVE_SUBSCRIPTION_PLANS.length - 1;
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[styles.planRow, selected && styles.planRowSelected, isLast && styles.rowLast]}
                      onPress={() => setSelectedPlanId(plan.id)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? Colors.WINE : Colors.MEDIUM_GRAY}
                        style={styles.rowIcon}
                      />
                      <View style={styles.rowMain}>
                        <View style={styles.planTitleRow}>
                          <Text style={[styles.rowTitle, selected && styles.rowTitleSelected]}>
                            {plan.durationLabel}
                          </Text>
                          {plan.isTestPlan ? (
                            <View style={styles.tagPill}>
                              <Text style={styles.tagPillText}>{t('subscriptionPage.testPlanBadge')}</Text>
                            </View>
                          ) : null}
                          {plan.isBestValue ? (
                            <View style={[styles.tagPill, styles.tagPillBest]}>
                              <Text style={styles.tagPillText}>{t('subscriptionPage.bestValue')}</Text>
                            </View>
                          ) : null}
                        </View>
                        {!plan.isTestPlan ? (
                          <Text style={styles.rowSubtitle}>
                            {t('subscriptionPage.planPerMonth', {
                              amount: formatSubscriptionMonthlyRate(plan.monthlyRateGhs),
                            })}
                          </Text>
                        ) : null}
                        {plan.savingsPercent ? (
                          <Text style={styles.rowMeta}>
                            {t('subscriptionPage.planSave', { percent: plan.savingsPercent })}
                            {totalSaved > 0
                              ? ` · ${t('subscriptionPage.planSaveAmount', { amount: formatGhanaCedis(totalSaved) })}`
                              : ''}
                          </Text>
                        ) : plan.isTestPlan ? null : (
                          <Text style={styles.rowMeta}>{t('subscriptionPage.planBaseline')}</Text>
                        )}
                      </View>
                      <Text style={[styles.planRowPrice, selected && styles.rowTitleSelected]}>
                        {formatGhanaCedis(plan.priceGhs)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>{t('subscriptionPage.sectionPromo')}</Text>
              <Text style={styles.sectionHint}>{t('subscriptionPage.promoSubtitle')}</Text>
              <View style={styles.group}>
                {appliedPromo ? (
                  <>
                    <View style={styles.row}>
                      <Ionicons name="pricetag" size={22} color={Colors.SUCCESS} style={styles.rowIcon} />
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>
                          {t('subscriptionPage.promoApplied', { code: appliedPromo.code })}
                        </Text>
                        <Text style={styles.rowSubtitle}>
                          {t('subscriptionPage.promoDiscountLine', {
                            percent: appliedPromo.discountPercent,
                            amount: formatGhanaCedis(appliedPromo.discountAmountGhs),
                          })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleClearPromo}
                        disabled={promoValidating || paying}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle-outline" size={22} color={Colors.TEXT_SECONDARY} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('subscriptionPage.checkoutSubtotal')}</Text>
                      <Text style={styles.summaryMuted}>{formatGhanaCedis(selectedPlan.priceGhs)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('subscriptionPage.checkoutDiscount')}</Text>
                      <Text style={styles.summaryDiscount}>
                        -{formatGhanaCedis(appliedPromo.discountAmountGhs)}
                      </Text>
                    </View>
                    <View style={[styles.summaryRow, styles.rowLast]}>
                      <Text style={styles.summaryTotalLabel}>{t('subscriptionPage.checkoutTotal')}</Text>
                      <Text style={styles.summaryTotal}>{formatGhanaCedis(checkoutPriceGhs)}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.fieldPad}>
                      <Text style={styles.fieldLabel}>{t('subscriptionPage.sectionPromo')}</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder={t('subscriptionPage.promoPlaceholder')}
                        placeholderTextColor={Colors.TEXT_SECONDARY}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        value={promoCodeInput}
                        onChangeText={(text) => {
                          setPromoCodeInput(text);
                          if (promoError) setPromoError(null);
                        }}
                        editable={!promoValidating && !paying}
                        returnKeyType="done"
                        onSubmitEditing={handleApplyPromo}
                      />
                      {promoError ? (
                        <View style={styles.promoErrorRow}>
                          <Ionicons name="alert-circle" size={16} color={Colors.ERROR} />
                          <Text style={styles.promoError}>{promoError}</Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[styles.inlineActionRow, styles.rowLast, promoValidating && styles.btnDisabled]}
                      onPress={handleApplyPromo}
                      disabled={promoValidating || paying || !promoCodeInput.trim()}
                      activeOpacity={0.75}
                    >
                      {promoValidating ? (
                        <ActivityIndicator color={Colors.WINE} />
                      ) : (
                        <Text style={styles.inlineActionText}>{t('subscriptionPage.promoApply')}</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <Text style={styles.sectionLabel}>{t('subscriptionPage.sectionPay')}</Text>
              <Text style={styles.sectionHint}>
                {selectedPayment === 'card'
                  ? t('subscriptionPage.cardHint')
                  : selectedPayment === 'mtn' || selectedPayment === 'telecel'
                    ? t('subscriptionPage.paySubtitle')
                    : t('subscriptionPage.choosePaymentBody')}
              </Text>
              <View style={styles.group}>
                <TouchableOpacity
                  style={[styles.payProviderRow, selectedPayment === 'card' && styles.planRowSelected]}
                  onPress={() => setSelectedPayment('card')}
                  activeOpacity={0.75}
                >
                  <View style={styles.cardIconWrap}>
                    <Ionicons name="card-outline" size={22} color={Colors.WINE} />
                  </View>
                  <Text style={[styles.rowTitle, styles.payProviderLabel]}>
                    {t('subscriptionPage.cardLabel')}
                  </Text>
                  <Ionicons
                    name={selectedPayment === 'card' ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selectedPayment === 'card' ? Colors.WINE : Colors.MEDIUM_GRAY}
                  />
                </TouchableOpacity>
                {(['mtn', 'telecel'] as const).map((provider) => {
                  const selected = selectedPayment === provider;
                  return (
                    <TouchableOpacity
                      key={provider}
                      style={[styles.payProviderRow, selected && styles.planRowSelected]}
                      onPress={() => setSelectedPayment(provider)}
                      activeOpacity={0.75}
                    >
                      <Image
                        source={provider === 'mtn' ? mtnMomoImage : telecelCashImage}
                        style={styles.payLogo}
                        resizeMode="contain"
                      />
                      <Text style={[styles.rowTitle, styles.payProviderLabel]}>
                        {provider === 'mtn' ? 'MTN MoMo' : 'Telecel Cash'}
                      </Text>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? Colors.WINE : Colors.MEDIUM_GRAY}
                      />
                    </TouchableOpacity>
                  );
                })}
                {selectedPayment === 'mtn' || selectedPayment === 'telecel' ? (
                  <View style={[styles.fieldPad, styles.rowLast]}>
                    <Text style={styles.fieldLabel}>{t('subscriptionPage.walletLabel')}</Text>
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
                      />
                    </View>
                    <Text style={styles.fieldHint}>{t('subscriptionPage.walletHint')}</Text>
                  </View>
                ) : selectedPayment === 'card' ? (
                  <View style={styles.rowLast}>
                    {!user?.email ? (
                      <View style={styles.fieldPad}>
                        <Text style={styles.fieldHint}>{t('subscriptionPage.signInBody')}</Text>
                      </View>
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
                  <View style={[styles.fieldPad, styles.rowLast]}>
                    <Text style={styles.fieldHint}>{t('subscriptionPage.choosePaymentBody')}</Text>
                  </View>
                )}
              </View>

              {!pendingPayment && selectedPayment !== 'card' ? (
                <Text style={styles.footnote}>{t('subscriptionPage.footnote')}</Text>
              ) : null}

              <PaystackSecureBadge />

              {pendingPayment ? (
                <SubscriptionPaystackPending
                  pending={pendingPayment}
                  otp={paymentOtp}
                  onOtpChange={setPaymentOtp}
                  onSubmitOtp={handleSubmitPaymentOtp}
                  submittingOtp={submittingOtp}
                  verifying={verifying}
                  onVerify={() => handleVerify(pendingPayment.reference, pendingPromoRef.current)}
                  onCancel={() => {
                    setPendingPayment(null);
                    setPaymentOtp('');
                    setLastReference(null);
                  }}
                />
              ) : null}
            </>
          ) : null}

          <View style={{ height: 16 }} />
        </ScrollView>

        {showActiveFooter ? (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>{t('subscriptionPage.done')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showPurchaseFooter ? (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.payBtn, (paying || promoValidating) && styles.payBtnDisabled]}
              onPress={handlePay}
              disabled={paying || promoValidating}
              activeOpacity={0.85}
            >
              {paying ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.WHITE} />
                  <Text style={styles.payBtnText}>
                    {t('subscriptionPage.payCtaShort', { amount: formatGhanaCedis(checkoutPriceGhs) })}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.footerHint}>
              {selectedPlan.durationLabel} · {formatGhanaCedis(checkoutPriceGhs)}
            </Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {verifying ? (
        <View style={styles.verifyingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.WINE} />
          <Text style={styles.verifyingText}>{t('subscriptionPage.cardVerifying')}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '500',
  },
  mutedLead: {
    fontSize: 14,
    color: Colors.DARK_GRAY,
    lineHeight: 21,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  group: {
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
  },
  rowTitleSelected: {
    color: Colors.WINE,
  },
  rowSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
    fontWeight: '500',
  },
  rowMeta: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 4,
    lineHeight: 17,
  },
  priceCol: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  priceWas: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
    fontWeight: '500',
  },
  priceNow: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.WINE,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  planRowSelected: {
    backgroundColor: 'rgba(230, 0, 18, 0.04)',
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  planRowPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BLACK,
    marginLeft: 8,
    marginTop: 2,
  },
  tagPill: {
    backgroundColor: Colors.PROMO_ORANGE,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagPillBest: {
    backgroundColor: Colors.SUCCESS,
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.WHITE,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  fieldPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 8,
    lineHeight: 17,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
  },
  promoErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  promoError: {
    flex: 1,
    fontSize: 13,
    color: Colors.ERROR,
    fontWeight: '500',
  },
  inlineActionRow: {
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  inlineActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.WINE,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  summaryMuted: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textDecorationLine: 'line-through',
  },
  summaryDiscount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.SUCCESS,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.WINE,
  },
  payProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  payLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payProviderLabel: {
    flex: 1,
  },
  walletInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.OFF_WHITE,
  },
  walletPrefix: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.LIGHT_GRAY,
    borderRightWidth: hairline,
    borderRightColor: Colors.BORDER,
  },
  walletPrefixText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.DARK_GRAY,
  },
  walletInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.BLACK,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.TEXT_SECONDARY,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 20,
  },
  footer: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderTopColor: Colors.BORDER,
  },
  footerHint: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
  },
  payBtn: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payBtnDisabled: { opacity: 0.65 },
  btnDisabled: { opacity: 0.55 },
  payBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '600' },
  doneBtn: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '600' },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
  },
  verifyingText: {
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '500',
  },
});
