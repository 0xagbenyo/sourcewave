import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';

const hairline = StyleSheet.hairlineWidth;

type RowNavProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
};

const RowNav: React.FC<RowNavProps> = ({ icon, title, subtitle, onPress }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
    <Ionicons name={icon} size={22} color={Colors.WINE} style={styles.rowIcon} />
    <View style={styles.rowMain}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} />
  </TouchableOpacity>
);

type RowSwitchProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
};

const RowSwitch: React.FC<RowSwitchProps> = ({ icon, title, subtitle, value, onValueChange }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={22} color={Colors.WINE} style={styles.rowIcon} />
    <View style={styles.rowMain}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: Colors.LIGHT_GRAY, true: Colors.WINE_LIGHT }}
      thumbColor={Colors.WHITE}
    />
  </View>
);

type RowStaticProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
};

const RowStatic: React.FC<RowStaticProps> = ({ icon, title, subtitle }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={22} color={Colors.WINE} style={styles.rowIcon} />
    <View style={styles.rowMain}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
  </View>
);

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { user, clearUser } = useUserSession();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);

  const languageSubtitle = useMemo(() => {
    const code = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase();
    if (code.startsWith('zh')) return t('languageSelect.chinese');
    return t('languageSelect.english');
  }, [i18n.language, i18n.resolvedLanguage, t]);

  const handleLogout = () => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: () => {
          clearUser();
          (navigation as any).reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
        },
      },
    ]);
  };

  const nav = navigation as { navigate: (name: string) => void };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={t('settings.title')} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>{t('settings.sectionAccount')}</Text>
        <View style={styles.group}>
          <RowNav
            icon="person-outline"
            title={t('settings.profile')}
            subtitle={t('settings.profileSub')}
            onPress={() => nav.navigate('EditProfile')}
          />
          <RowNav
            icon="location-outline"
            title={t('settings.addresses')}
            subtitle={t('settings.addressesSub')}
            onPress={() => nav.navigate('AddressBook')}
          />
        </View>

        <Text style={styles.sectionLabel}>{t('settings.sectionPreferences')}</Text>
        <View style={styles.group}>
          <RowSwitch
            icon="notifications-outline"
            title={t('settings.push')}
            subtitle={t('settings.pushSub')}
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <RowSwitch
            icon="mail-outline"
            title={t('settings.email')}
            subtitle={t('settings.emailSub')}
            value={emailNotifications}
            onValueChange={setEmailNotifications}
          />
          <RowNav
            icon="language-outline"
            title={t('settings.language')}
            subtitle={languageSubtitle}
            onPress={() => nav.navigate('LanguageSelect', { fromSettings: true })}
          />
        </View>

        <Text style={styles.sectionLabel}>{t('settings.sectionAbout')}</Text>
        <View style={styles.group}>
          <RowNav
            icon="help-circle-outline"
            title={t('settings.faq')}
            subtitle={t('settings.faqSub')}
            onPress={() => nav.navigate('Faq', { scope: 'buyer' })}
          />
          <RowStatic
            icon="information-circle-outline"
            title={t('settings.version')}
            subtitle={t('settings.versionSub')}
          />
        </View>

        {user?.email ? (
          <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={22} color={Colors.ERROR} />
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 32,
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
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    backgroundColor: Colors.WHITE,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ERROR,
    marginLeft: 10,
  },
});
