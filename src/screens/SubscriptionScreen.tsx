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
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { SourceWaveStackHeader } from '../components/SourceWaveStackHeader';
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

const mtnMomoImage = require('../assets/images/mtn momo.png');
const telecelCashImage = require('../assets/images/telecel cash.png');

function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

export const SubscriptionScreen: React.FC = () => {
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
          erpWarning = 'No customer record is linked to this email — your subscription was not saved on the server.';
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
        erpWarning = `Subscription was not saved on the server: ${msg}`;
      }
    }

    await refresh();

    Alert.alert(
      'Welcome to SourceWave supplier access',
      [
        `Your plan is active until ${expires.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}.`,
        ` Reference: ${reference}.`,
        erpWarning ? `\n\n${erpWarning}` : '',
      ].join(''),
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  const handlePay = async () => {
    if (!user?.email) {
      Alert.alert('Sign in required', 'Please log in to purchase a subscription.');
      return;
    }
    if (!selectedPayment) {
      Alert.alert('Payment method', 'Choose MTN Mobile Money or Telecel Cash.');
      return;
    }
    if (!paymentNumber.trim()) {
      Alert.alert('Phone number', 'Enter the wallet number you will pay from.');
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
      Alert.alert(
        'Complete payment',
        displayText ||
          'Approve the prompt on your phone. When your network confirms payment, tap “I have paid” to verify.',
        [
          { text: 'OK' },
          {
            text: 'I have paid',
            onPress: () => handleVerify(ref),
          },
        ]
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Payment could not be started.';
      Alert.alert('Payment', msg);
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
      Alert.alert('Verify', 'No payment reference yet. Try Pay again.');
      return;
    }
    setVerifying(true);
    try {
      const v = await verifyPaystackPayment(r);
      if (v.data?.status === 'success') {
        await finishActivation(v.data.reference || r);
        setLastReference(null);
      } else {
        Alert.alert('Not completed yet', v.data?.gateway_response || 'Status is not success yet.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Verification failed.';
      Alert.alert('Verify payment', msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.root}>
      <SourceWaveStackHeader
        title="SourceWave access"
        subtitle="Supplier messaging & Paystack checkout"
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <SafeAreaView style={styles.safe} edges={['bottom']}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
        {isLoading ? (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={Colors.WINE} />
            <Text style={styles.loadingBannerText}>Checking your subscription…</Text>
          </View>
        ) : null}

        {!isLoading && isActive && subscription ? (
          <>
            <Text style={styles.lead}>
              You already have an active SourceWave access plan. Supplier messaging is available — you do not
              need to purchase again until it ends.
            </Text>
            <View style={styles.activeBanner}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.SUCCESS} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.activeTitle}>Plan active</Text>
                <Text style={styles.activeSub}>
                  {subscription.planTitle} · ends{' '}
                  {new Date(subscription.expiresAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {!isLoading && !isActive ? (
          <Text style={styles.lead}>
            Subscribe to unlock in-app supplier messaging and transparent markup guidance on SourceWave-listed
            inventory.
          </Text>
        ) : null}

        {!isLoading && !isActive ? (
          <>
        <Text style={styles.sectionLabel}>Choose term</Text>
        {SOURCEWAVE_SUBSCRIPTION_PLANS.map((plan) => {
          const selected = plan.id === selectedPlanId;
          return (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selected && styles.planCardSelected]}
              onPress={() => setSelectedPlanId(plan.id)}
              activeOpacity={0.9}
            >
              <View style={styles.planRow}>
                <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planDuration}>{plan.durationLabel}</Text>
                  <Text style={styles.planDesc}>{plan.description}</Text>
                </View>
                <Text style={styles.planPrice}>{formatGhanaCedis(plan.priceGhs)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.sectionLabel}>Pay with mobile money</Text>
        <View style={styles.payRow}>
          <TouchableOpacity
            style={[styles.payOption, selectedPayment === 'mtn' && styles.payOptionSelected]}
            onPress={() => setSelectedPayment('mtn')}
          >
            <Image source={mtnMomoImage} style={styles.payLogo} resizeMode="contain" />
            <Text style={styles.payLabel}>MTN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payOption, selectedPayment === 'telecel' && styles.payOptionSelected]}
            onPress={() => setSelectedPayment('telecel')}
          >
            <Image source={telecelCashImage} style={styles.payLogo} resizeMode="contain" />
            <Text style={styles.payLabel}>Telecel</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Wallet number</Text>
        <TextInput
          style={styles.phoneInput}
          placeholder="e.g. 0244123456"
          placeholderTextColor={Colors.TEXT_SECONDARY}
          keyboardType="phone-pad"
          value={paymentNumber}
          onChangeText={setPaymentNumber}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, paying && styles.primaryBtnDisabled]}
          onPress={handlePay}
          disabled={paying}
        >
          {paying ? (
            <ActivityIndicator color={Colors.WHITE} />
          ) : (
            <Text style={styles.primaryBtnText}>
              Pay {formatGhanaCedis(selectedPlan.priceGhs)} with Paystack
            </Text>
          )}
        </TouchableOpacity>

        {lastReference ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => handleVerify()}
            disabled={verifying}
          >
            {verifying ? (
              <ActivityIndicator color={Colors.WINE} />
            ) : (
              <Text style={styles.secondaryBtnText}>Verify completed payment</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <Text style={styles.footnote}>
          Prices are in Ghana Cedis (GHS). After Paystack, access is saved on this device and your plan is recorded on
          the server using the selected term (3, 6, or 9 months).
        </Text>
          </>
        ) : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.BACKGROUND },
  kav: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.BACKGROUND },
  scroll: { padding: Spacing.MD, paddingBottom: 40 },
  lead: {
    fontSize: 14,
    color: Colors.DARK_GRAY,
    lineHeight: 21,
    marginBottom: Spacing.LG,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.MD,
    paddingVertical: Spacing.SM,
  },
  loadingBannerText: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.MD,
    borderRadius: 14,
    backgroundColor: Colors.LIGHT_GRAY,
    marginBottom: Spacing.LG,
  },
  activeTitle: { fontWeight: '700', fontSize: 15, color: Colors.BLACK },
  activeSub: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 4 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    marginBottom: Spacing.SM,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planCard: {
    borderWidth: 2,
    borderColor: Colors.BORDER,
    borderRadius: 16,
    padding: Spacing.MD,
    marginBottom: Spacing.SM,
    backgroundColor: Colors.WHITE,
  },
  planCardSelected: {
    borderColor: Colors.WINE,
    backgroundColor: Colors.LIGHT_PINK,
  },
  planRow: { flexDirection: 'row', alignItems: 'flex-start' },
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
  planTitle: { fontSize: 17, fontWeight: '800', color: Colors.BLACK },
  planDuration: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 2 },
  planDesc: { fontSize: 13, color: Colors.DARK_GRAY, marginTop: 8, lineHeight: 18 },
  planPrice: { fontSize: 16, fontWeight: '800', color: Colors.WINE, marginLeft: 8 },
  payRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.MD },
  payOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  payOptionSelected: { borderColor: Colors.WINE, backgroundColor: Colors.LIGHT_PINK },
  payLogo: { width: 36, height: 36 },
  payLabel: { fontWeight: '700', color: Colors.BLACK },
  phoneInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: Spacing.MD,
    backgroundColor: Colors.WHITE,
    color: Colors.BLACK,
  },
  primaryBtn: {
    backgroundColor: Colors.WINE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: Spacing.SM,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Spacing.LG,
  },
  secondaryBtnText: { color: Colors.WINE, fontWeight: '700', fontSize: 15 },
  footnote: { fontSize: 12, color: Colors.TEXT_SECONDARY, lineHeight: 17 },
});
