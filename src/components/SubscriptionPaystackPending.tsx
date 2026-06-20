import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { formatGhanaCedis } from '../utils/currency';

export type PendingPaystackPayment = {
  reference: string;
  amountGhs: number;
  displayText: string;
  step: 'pay_offline' | 'send_otp' | 'pending';
  provider: 'mtn' | 'telecel';
};

type Props = {
  pending: PendingPaystackPayment;
  otp: string;
  onOtpChange: (value: string) => void;
  onSubmitOtp: () => void;
  submittingOtp: boolean;
  verifying: boolean;
  onVerify: () => void;
  onCancel: () => void;
};

export const SubscriptionPaystackPending: React.FC<Props> = ({
  pending,
  otp,
  onOtpChange,
  onSubmitOtp,
  submittingOtp,
  verifying,
  onVerify,
  onCancel,
}) => {
  const { t } = useTranslation();
  const isMtn = pending.provider === 'mtn';
  const steps = isMtn
    ? [
        t('subscriptionPage.momoStep1Mtn'),
        t('subscriptionPage.momoStep2Mtn'),
        t('subscriptionPage.momoStep3'),
      ]
    : [
        t('subscriptionPage.momoStep1Telecel'),
        t('subscriptionPage.momoStep2Telecel'),
        t('subscriptionPage.momoStep3'),
      ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>{t('subscriptionPage.momoPendingTitle')}</Text>
      <Text style={styles.sectionHint}>{t('subscriptionPage.momoPendingLead')}</Text>

      <View style={styles.group}>
        <View style={styles.row}>
          <Ionicons name="cash-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{t('subscriptionPage.momoAmountDue')}</Text>
            <Text style={styles.rowSubtitle}>{formatGhanaCedis(pending.amountGhs)}</Text>
          </View>
        </View>

        {pending.displayText ? (
          <View style={styles.notePad}>
            <Text style={styles.noteText}>{pending.displayText}</Text>
          </View>
        ) : null}

        <View style={styles.stepsPad}>
          <Text style={styles.stepsLabel}>{t('subscriptionPage.momoStepsHeading')}</Text>
          {steps.map((step, index) => (
            <View key={step.slice(0, 24)} style={styles.stepRow}>
              <Text style={styles.stepNum}>{index + 1}.</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          <Text style={styles.timerHint}>{t('subscriptionPage.momoTimerHint')}</Text>
        </View>

        {pending.step === 'send_otp' ? (
          <View style={[styles.fieldPad, styles.fieldPadBorder]}>
            <Text style={styles.fieldLabel}>{t('subscriptionPage.momoOtpLabel')}</Text>
            <Text style={styles.fieldHint}>{t('subscriptionPage.momoOtpHint')}</Text>
            <TextInput
              style={styles.otpInput}
              value={otp}
              onChangeText={onOtpChange}
              placeholder={t('subscriptionPage.momoOtpPlaceholder')}
              placeholderTextColor={Colors.TEXT_SECONDARY}
              keyboardType="number-pad"
              maxLength={8}
              textAlign="center"
            />
            <TouchableOpacity
              style={[styles.otpBtn, (submittingOtp || !otp.trim()) && styles.btnDisabled]}
              onPress={onSubmitOtp}
              disabled={submittingOtp || !otp.trim()}
              activeOpacity={0.85}
            >
              {submittingOtp ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <Text style={styles.otpBtnText}>{t('subscriptionPage.momoSubmitOtp')}</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.verifyRow, verifying && styles.btnDisabled]}
          onPress={onVerify}
          disabled={verifying}
          activeOpacity={0.75}
        >
          {verifying ? (
            <ActivityIndicator color={Colors.WINE} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color={Colors.WINE} style={styles.rowIcon} />
              <Text style={styles.verifyText}>{t('subscriptionPage.verifyPayment')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.cancelRow, styles.rowLast]} onPress={onCancel} activeOpacity={0.75}>
          <Text style={styles.cancelText}>{t('subscriptionPage.momoCancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const hairline = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
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
  },
  rowSubtitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.WINE,
    marginTop: 2,
  },
  notePad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 12,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.OFF_WHITE,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.DARK_GRAY,
    fontWeight: '500',
  },
  stepsPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  stepsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stepNum: {
    width: 20,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.WINE,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.DARK_GRAY,
  },
  timerHint: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.TEXT_SECONDARY,
    marginTop: 4,
  },
  fieldPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
  },
  fieldPadBorder: {
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.BLACK,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 17,
  },
  otpInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 6,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
    marginBottom: 12,
  },
  otpBtn: {
    backgroundColor: Colors.WINE,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  otpBtnText: {
    color: Colors.WHITE,
    fontWeight: '600',
    fontSize: 15,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  verifyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.WINE,
  },
  cancelRow: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
  },
  btnDisabled: { opacity: 0.55 },
});
