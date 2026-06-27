import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { CONTACT_US_TOPIC_KEYS, type ContactUsTopicKey } from '../constants/contactUsTopics';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import type { RootStackParamList } from '../types';

const hairline = StyleSheet.hairlineWidth;

export const ContactUsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();
  const [topicKey, setTopicKey] = useState<ContactUsTopicKey | ''>('');
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const email = (user?.email || '').trim();

  const topicLabel = topicKey ? t(`contactUs.topics.${topicKey}`) : '';

  const submit = useCallback(async () => {
    if (!email) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.needLogin'));
      return;
    }
    if (!topicKey) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.topicRequired'));
      return;
    }
    const body = message.trim();
    if (!body) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.messageRequired'));
      return;
    }

    const subject = t(`contactUs.topics.${topicKey}`);
    const messageForTicket = `${t('contactUs.topicLinePrefix', { topic: subject })}\n\n${body}`;

    try {
      setSubmitting(true);
      const client = getERPNextClient();
      let customer: string | undefined;
      try {
        const row = await client.getCustomerByEmail(email);
        if (row?.name) customer = String(row.name).trim();
      } catch {
        // Issue can still be created with raised_by only
      }
      const { name } = await client.createSupportIssue({
        subject,
        message: messageForTicket,
        raisedByEmail: email,
        customer: customer || undefined,
      });
      Alert.alert(t('contactUs.successTitle'), t('contactUs.successBody', { id: name }), [
        { text: t('contactUs.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('contactUs.errorTitle'), msg || t('contactUs.genericError'));
    } finally {
      setSubmitting(false);
    }
  }, [email, topicKey, message, navigation, t]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={t('contactUs.title')} subtitle={t('contactUs.subtitle')} />

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
          {!email ? (
            <Text style={styles.warn}>{t('contactUs.needLogin')}</Text>
          ) : (
            <>
              <Text style={styles.sectionLabel}>{t('contactUs.sectionAccount')}</Text>
              <View style={styles.group}>
                <View style={[styles.fieldPad, styles.fieldPadLast]}>
                  <Text style={styles.label}>{t('contactUs.emailLabel')}</Text>
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText}>{email}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionLabel}>{t('contactUs.sectionTopic')}</Text>
              <View style={styles.group}>
                <TouchableOpacity
                  style={styles.selectRow}
                  onPress={() => !submitting && setTopicPickerOpen(true)}
                  activeOpacity={0.75}
                  disabled={submitting}
                >
                  <View style={styles.selectMain}>
                    <Text style={styles.label}>{t('contactUs.topicLabel')}</Text>
                    <Text style={topicKey ? styles.selectValue : styles.selectPlaceholder}>
                      {topicKey ? topicLabel : t('contactUs.topicPlaceholder')}
                    </Text>
                    <Text style={styles.fieldHint}>{t('contactUs.topicHint')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>{t('contactUs.sectionMessage')}</Text>
              <View style={styles.group}>
                <View style={[styles.fieldPad, styles.fieldPadLast]}>
                  <Text style={styles.label}>{t('contactUs.messageLabel')}</Text>
                  <TextInput
                    style={[styles.textInput, styles.textarea]}
                    value={message}
                    onChangeText={setMessage}
                    placeholder={t('contactUs.messagePlaceholder')}
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                    multiline
                    textAlignVertical="top"
                    editable={!submitting}
                    maxLength={4000}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {email ? (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.WHITE} />
              ) : (
                <>
                  <Ionicons name="send-outline" size={20} color={Colors.WHITE} />
                  <Text style={styles.submitBtnText}>{t('contactUs.submit')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={topicPickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setTopicPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalGrab}>
              <View style={styles.modalHandle} />
            </View>
            <Text style={styles.modalTitle}>{t('contactUs.topicPickerTitle')}</Text>
            <FlatList
              data={[...CONTACT_US_TOPIC_KEYS]}
              keyExtractor={(item) => item}
              style={styles.modalList}
              renderItem={({ item }) => {
                const label = t(`contactUs.topics.${item}`);
                const selected = item === topicKey;
                return (
                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => {
                      setTopicKey(item);
                      setTopicPickerOpen(false);
                    }}
                  >
                    <Text style={styles.modalRowText}>{label}</Text>
                    {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.WINE} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
            <SafeAreaView edges={['bottom']} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  kav: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 8,
  },
  warn: {
    color: Colors.ERROR,
    fontSize: 14,
    marginTop: Spacing.MD,
    marginHorizontal: Spacing.SCREEN_PADDING,
    lineHeight: 20,
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
  group: {
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  fieldPad: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  fieldPadLast: {
    borderBottomWidth: 0,
  },
  label: {
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
  readonlyBox: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.OFF_WHITE,
  },
  readonlyText: {
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
  },
  selectMain: {
    flex: 1,
    minWidth: 0,
  },
  selectValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
  },
  selectPlaceholder: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: -0.2,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
  },
  textarea: {
    minHeight: 140,
    paddingTop: 12,
  },
  footer: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.WHITE,
    borderTopWidth: hairline,
    borderTopColor: Colors.BORDER,
  },
  submitBtn: {
    backgroundColor: Colors.SUCCESS,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.WHITE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '78%',
    paddingBottom: Spacing.SM,
  },
  modalGrab: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.MEDIUM_GRAY,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.BLACK,
    paddingHorizontal: Spacing.MD,
    marginBottom: Spacing.SM,
  },
  modalList: {
    paddingHorizontal: Spacing.SM,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Spacing.SM,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  modalRowText: {
    fontSize: 16,
    color: Colors.BLACK,
    flex: 1,
    paddingRight: 8,
  },
});
