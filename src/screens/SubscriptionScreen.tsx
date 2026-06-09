import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import {
  SOURCEWAVE_SUBSCRIPTION_PLANS,
  type SubscriptionPlanId,
  getErpSubscriptionPlanName,
  getErpSubscriptionCompany,
} from '../constants/subscriptions';
import { useUserSession } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import {
  initializePaystackCharge,
  mapProviderToPaystack,
  convertToPesewas,
  verifyPaystackPayment,
  isPaystackChargeTransactionSuccessful,
} from '../services/paystack';
import { getERPNextClient } from '../services/erpnext';
import { formatGhanaCedis } from '../utils/currency';
import { toYmd, erpSubscriptionCoversThrough } from '../utils/subscriptionErpnext';
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

  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlanId>('sw-6m');
  const [selectedPayment, setSelectedPayment] = useState<'mtn' | 'telecel' | null>(null);
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paying, setPaying] = useState(false);
  const [lastReference, setLastReference] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const selectedPlan = SOURCEWAVE_SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlanId)!;

  const finishActivation = async (reference: string) => {
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
            await client.createSubscriptionDoc({
              party_type: 'Customer',
              party: customer.name,
              company: getErpSubscriptionCompany(),
              start_date: toYmd(new Date()),
              end_date: toYmd(expires),
              plans: [{ plan: erpPlanName, qty: 1 }],
              generate_invoice_at: 'End of the current subscription period',
              days_until_due: 7,
              submit_invoice: 0,
            });
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Subscription create failed', e);
        erpWarning = t('subscriptionPage.erpSaveFailed', { message: msg });
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

  const handlePay = async () => {
    if (!user?.email) {
      Alert.alert(t('subscriptionPage.signInRequired'), t('subscriptionPage.signInBody'));
      return;
    }
    if (!selectedPayment) {
      Alert.alert(t('subscriptionPage.choosePayment'), t('subscriptionPage.choosePaymentBody'));
      return;
    }
    if (!paymentNumber.trim()) {
      Alert.alert(t('subscriptionPage.enterWallet'), t('subscriptionPage.enterWalletBody'));
      return;
    }

    setPaying(true);
    const reference = `SW-SUB-${selectedPlan.id}-${Date.now()}`;
    try {
      const paystackResponse = await initializePaystackCharge({
        email: user.email,
        amount: convertToPesewas(selectedPlan.priceGhs),
        currency: 'GHS',
        reference,
        mobile_money: {
          phone: paymentNumber.trim(),
          provider: mapProviderToPaystack(selectedPayment),
        },
      });

      const displayText = paystackResponse.data?.display_text;
      const ref = paystackResponse.data?.reference || reference;

      if (isPaystackChargeTransactionSuccessful(paystackResponse)) {
        await finishActivation(ref);
        setLastReference(null);
        setPaying(false);
        return;
      }

      setLastReference(ref);
      setPaying(false);
      Alert.alert(t('subscriptionPage.completePayment'), displayText || t('subscriptionPage.completePaymentBody'), [
        { text: t('contactUs.ok') },
        {
          text: t('subscriptionPage.verifyPayment'),
          onPress: () => handleVerify(ref),
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payment could not be started.';
      Alert.alert(t('subscriptionPage.paymentFailed'), msg);
      setPaying(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleVerify = async (ref?: string) => {
    const r = ref || lastReference;
    if (!r) {
      Alert.alert(t('subscriptionPage.verifyNoRef'), t('subscriptionPage.verifyNoRefBody'));
      return;
    }
    setVerifying(true);
    try {
      const v = await verifyPaystackPayment(r);
      if (v.data?.status === 'success') {
        await finishActivation(v.data.reference || r);
        setLastReference(null);
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

  const showPurchaseFooter = !isLoading && !isActive;
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
                <View style={styles.statusBlock}>
                  <Ionicons name="checkmark-circle" size={24} color={Colors.SUCCESS} />
                  <View style={styles.statusText}>
                    <Text style={styles.statusTitle}>{t('subscriptionPage.activeTitle')}</Text>
                    <Text style={styles.statusSub}>
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
            <Text style={styles.mutedLead}>{t('subscriptionPage.inactiveLead')}</Text>
          ) : null}

          {!isLoading && !isActive ? (
            <>
              <Text style={styles.sectionLabel}>{t('subscriptionPage.sectionPlan')}</Text>
              <View style={styles.group}>
                {SOURCEWAVE_SUBSCRIPTION_PLANS.map((plan, index) => {
                  const selected = plan.id === selectedPlanId;
                  const last = index === SOURCEWAVE_SUBSCRIPTION_PLANS.length - 1;
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[styles.planRow, !last && styles.planRowBorder, selected && styles.planRowSelected]}
                      onPress={() => setSelectedPlanId(plan.id)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
                      <View style={styles.planMain}>
                        <Text style={styles.planTitle}>{plan.title}</Text>
                        <Text style={styles.planDuration}>{plan.durationLabel}</Text>
                        <Text style={styles.planDesc}>{plan.description}</Text>
                      </View>
                      <Text style={styles.planPrice}>{formatGhanaCedis(plan.priceGhs)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>{t('subscriptionPage.sectionPay')}</Text>
              <View style={styles.group}>
                <View style={styles.payRow}>
                  <TouchableOpacity
                    style={[styles.payOption, selectedPayment === 'mtn' && styles.payOptionSelected]}
                    onPress={() => setSelectedPayment('mtn')}
                    activeOpacity={0.85}
                  >
                    <Image source={mtnMomoImage} style={styles.payLogo} resizeMode="contain" />
                    <Text style={styles.payLabel}>MTN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.payOption, selectedPayment === 'telecel' && styles.payOptionSelected]}
                    onPress={() => setSelectedPayment('telecel')}
                    activeOpacity={0.85}
                  >
                    <Image source={telecelCashImage} style={styles.payLogo} resizeMode="contain" />
                    <Text style={styles.payLabel}>Telecel</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.fieldPad, styles.fieldPadLast]}>
                  <Text style={styles.label}>{t('subscriptionPage.walletLabel')}</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder={t('subscriptionPage.walletPlaceholder')}
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                    keyboardType="phone-pad"
                    value={paymentNumber}
                    onChangeText={setPaymentNumber}
                  />
                </View>
              </View>

              <Text style={styles.footnote}>{t('subscriptionPage.footnote')}</Text>
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
              style={[styles.payBtn, paying && styles.payBtnDisabled]}
              onPress={handlePay}
              disabled={paying}
              activeOpacity={0.85}
            >
              {paying ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Text style={styles.payBtnText}>
                  {t('subscriptionPage.payCta', { amount: formatGhanaCedis(selectedPlan.priceGhs) })}
                </Text>
              )}
            </TouchableOpacity>
            {lastReference ? (
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => handleVerify()}
                disabled={verifying}
                activeOpacity={0.75}
              >
                {verifying ? (
                  <ActivityIndicator color={Colors.WINE} />
                ) : (
                  <Text style={styles.verifyBtnText}>{t('subscriptionPage.verifyCompleted')}</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
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
    marginBottom: Spacing.MD,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  group: {
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  statusBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 16,
    gap: 12,
  },
  statusText: { flex: 1, minWidth: 0 },
  statusTitle: { fontWeight: '700', fontSize: 16, color: Colors.BLACK },
  statusSub: { fontSize: 14, color: Colors.TEXT_SECONDARY, marginTop: 6, lineHeight: 20 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
  },
  planRowBorder: {
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  planRowSelected: {
    backgroundColor: 'rgba(230, 0, 18, 0.05)',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.WINE,
  },
  planMain: { flex: 1, minWidth: 0 },
  planTitle: { fontSize: 16, fontWeight: '700', color: Colors.BLACK },
  planDuration: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 2 },
  planDesc: { fontSize: 13, color: Colors.DARK_GRAY, marginTop: 6, lineHeight: 18 },
  planPrice: { fontSize: 15, fontWeight: '800', color: Colors.WINE, marginLeft: 8 },
  payRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  payOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.OFF_WHITE,
  },
  payOptionSelected: {
    borderColor: Colors.WINE,
    backgroundColor: 'rgba(230, 0, 18, 0.06)',
  },
  payLogo: { width: 32, height: 32 },
  payLabel: { fontWeight: '700', fontSize: 14, color: Colors.BLACK },
  fieldPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
  },
  fieldPadLast: {},
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
  },
  footnote: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 17,
    marginTop: Spacing.MD,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  footer: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderTopColor: Colors.BORDER,
    gap: 10,
  },
  payBtn: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnDisabled: { opacity: 0.65 },
  payBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '600' },
  verifyBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  verifyBtnText: { color: Colors.WINE, fontWeight: '700', fontSize: 15 },
  doneBtn: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '600' },
});
