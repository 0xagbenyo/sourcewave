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
  Linking,
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
import { sourcewaveSupportMailtoUrl } from '../constants/contactUs';
import { useUserSession } from '../context/UserContext';
import { hasFrappeRavenSession } from '../services/frappeRavenSession';
import { getERPNextClient } from '../services/erpnext';
import { isEmailLoginIdentifier } from '../utils/loginIdentifier';
import {
  openSupportAdministratorRavenChat,
  supportAdministratorChatErrorMessage,
} from '../utils/openSupportAdministratorChat';
import type { RootStackParamList } from '../types';

const hairline = StyleSheet.hairlineWidth;

type Panel = 'menu' | 'ticket';

type RowNavProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

const RowNav: React.FC<RowNavProps> = ({ icon, title, subtitle, onPress, loading, disabled }) => (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    activeOpacity={0.75}
    disabled={disabled || loading}
  >
    <Ionicons name={icon} size={22} color={Colors.WINE} style={styles.rowIcon} />
    <View style={styles.rowMain}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    {loading ? (
      <ActivityIndicator size="small" color={Colors.WINE} />
    ) : (
      <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
    )}
  </TouchableOpacity>
);

async function openExternalUrl(url: string, failMessage: string): Promise<void> {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert('Contact us', failMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('Contact us', failMessage);
  }
}

export const ContactUsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useUserSession();
  const [panel, setPanel] = useState<Panel>('menu');
  const [topicKey, setTopicKey] = useState<ContactUsTopicKey | ''>('');
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const accountEmail = (user?.email || '').trim();
  const formEmail = accountEmail || guestEmail.trim();
  const topicLabel = topicKey ? t(`contactUs.topics.${topicKey}`) : '';

  const submit = useCallback(async () => {
    if (!formEmail) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.guestEmailRequired'));
      return;
    }
    if (!accountEmail && !isEmailLoginIdentifier(formEmail)) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.guestEmailInvalid'));
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
        const row = await client.getCustomerByEmail(formEmail);
        if (row?.name) customer = String(row.name).trim();
      } catch {
        /* Issue can still be created with raised_by only */
      }
      const { name } = await client.createSupportIssue({
        subject,
        message: messageForTicket,
        raisedByEmail: formEmail,
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
  }, [formEmail, accountEmail, topicKey, message, navigation, t]);

  const openSupportEmail = () => {
    void openExternalUrl(sourcewaveSupportMailtoUrl(), t('contactUs.openLinkFailed'));
  };

  const openAdministratorChat = useCallback(async () => {
    if (openingChat) return;
    if (!accountEmail) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.chatSignInRequired'));
      return;
    }
    if (!hasFrappeRavenSession()) {
      Alert.alert(t('contactUs.errorTitle'), t('contactUs.chatSessionRequired'));
      return;
    }
    setOpeningChat(true);
    try {
      await openSupportAdministratorRavenChat(navigation, {
        sessionEmail: accountEmail,
        onNeedSignIn: () => Alert.alert(t('contactUs.errorTitle'), t('contactUs.chatSignInRequired')),
      });
    } catch (e: unknown) {
      Alert.alert(t('contactUs.errorTitle'), supportAdministratorChatErrorMessage(e));
    } finally {
      setOpeningChat(false);
    }
  }, [openingChat, accountEmail, navigation, t]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header
        showBackButton
        title={t('contactUs.title')}
        subtitle={panel === 'menu' ? t('contactUs.subtitle') : t('contactUs.ticketSubtitle')}
      />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {panel === 'menu' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>{t('contactUs.intro')}</Text>

            <View style={styles.group}>
              <RowNav
                icon="chatbubble-ellipses-outline"
                title={t('contactUs.chatTitle')}
                subtitle={t('contactUs.chatSubtitle')}
                onPress={() => void openAdministratorChat()}
                loading={openingChat}
              />
              <RowNav
                icon="mail-outline"
                title={t('contactUs.emailTitle')}
                subtitle={t('contactUs.emailSubtitle')}
                onPress={openSupportEmail}
              />
              <RowNav
                icon="document-text-outline"
                title={t('contactUs.ticketTitle')}
                subtitle={t('contactUs.ticketMenuSubtitle')}
                onPress={() => setPanel('ticket')}
              />
            </View>
          </ScrollView>
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <TouchableOpacity style={styles.backToMenu} onPress={() => setPanel('menu')} activeOpacity={0.75}>
                <Ionicons name="chevron-back" size={20} color={Colors.WINE} />
                <Text style={styles.backToMenuText}>{t('contactUs.backToOptions')}</Text>
              </TouchableOpacity>

              {!accountEmail ? (
                <Text style={styles.formHint}>{t('contactUs.needLogin')}</Text>
              ) : null}

              <Text style={styles.sectionLabel}>{t('contactUs.sectionAccount')}</Text>
              <View style={styles.group}>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>
                    {accountEmail ? t('contactUs.emailLabel') : t('contactUs.guestEmailLabel')}
                  </Text>
                  {accountEmail ? (
                    <Text style={styles.fieldValue}>{accountEmail}</Text>
                  ) : (
                    <TextInput
                      style={styles.textInput}
                      value={guestEmail}
                      onChangeText={setGuestEmail}
                      placeholder={t('contactUs.guestEmailPlaceholder')}
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!submitting}
                    />
                  )}
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
                    <Text style={styles.fieldLabel}>{t('contactUs.topicLabel')}</Text>
                    <Text style={topicKey ? styles.selectValue : styles.selectPlaceholder}>
                      {topicKey ? topicLabel : t('contactUs.topicPlaceholder')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>{t('contactUs.sectionMessage')}</Text>
              <View style={styles.group}>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('contactUs.messageLabel')}</Text>
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
            </ScrollView>

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
                  <Text style={styles.submitBtnText}>{t('contactUs.submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
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
    paddingBottom: 24,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.TEXT_SECONDARY,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 8,
    marginBottom: 20,
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
  rowSubtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 3,
    fontWeight: '500',
  },
  backToMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 10,
    marginBottom: 4,
  },
  backToMenuText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.WINE,
    marginLeft: 2,
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
  formHint: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 18,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    marginBottom: 4,
  },
  fieldRow: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    marginBottom: 8,
  },
  fieldValue: {
    fontSize: 16,
    color: Colors.BLACK,
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
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.BLACK,
    backgroundColor: Colors.OFF_WHITE,
  },
  textarea: {
    minHeight: 120,
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
    backgroundColor: Colors.WINE,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '700',
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
