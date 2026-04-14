import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => (navigation as any).goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Settings</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const renderSettingItem = (
    icon: string,
    title: string,
    subtitle?: string,
    onPress?: () => void,
    showArrow = true,
    rightComponent?: React.ReactNode,
    iconColor: string = Colors.ROYAL_BLUE
  ) => (
    <TouchableOpacity 
      style={styles.settingItem} 
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.settingLeft}>
        <View style={styles.settingIcon}>
          <Ionicons name={icon as any} size={20} color={iconColor} />
        </View>
        <View style={styles.settingContent}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingRight}>
        {rightComponent}
        {showArrow && onPress && (
          <Ionicons name="chevron-forward" size={16} color={Colors.TEXT_SECONDARY} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderSection('Account', (
          <>
            {renderSettingItem(
              'person-outline',
              'Profile Information',
              'Edit your personal details',
              () => (navigation as any).navigate('EditProfile'),
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'location-outline',
              'Shipping Addresses',
              'Manage your delivery addresses',
              () => (navigation as any).navigate('AddressBook'),
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'card-outline',
              'Payment Methods',
              'Manage your payment options',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'shield-checkmark-outline',
              'Security',
              'Password and account security',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
          </>
        ))}

        {renderSection('Preferences', (
          <>
            {renderSettingItem(
              'notifications-outline',
              'Push Notifications',
              'Get updates about orders and deals',
              undefined,
              false,
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: Colors.LIGHT_GRAY, true: Colors.ROYAL_BLUE }}
                thumbColor={Colors.WHITE}
              />,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'mail-outline',
              'Email Notifications',
              'Receive updates via email',
              undefined,
              false,
              <Switch
                value={emailNotifications}
                onValueChange={setEmailNotifications}
                trackColor={{ false: Colors.LIGHT_GRAY, true: Colors.ROYAL_BLUE }}
                thumbColor={Colors.WHITE}
              />,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'moon-outline',
              'Dark Mode',
              'Switch to dark theme',
              undefined,
              false,
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: Colors.LIGHT_GRAY, true: Colors.ROYAL_BLUE }}
                thumbColor={Colors.WHITE}
              />,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'language-outline',
              'Language',
              'English (US)',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'cash-outline',
              'Currency',
              'Ghanaian Cedi (GH₵)',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
          </>
        ))}

        {renderSection('Support', (
          <>
            {renderSettingItem(
              'help-circle-outline',
              'Help Center',
              'Get help and find answers',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'chatbubble-outline',
              'Contact Us',
              'Reach out to our support team',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'document-text-outline',
              'Terms of Service',
              'Read our terms and conditions',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'shield-outline',
              'Privacy Policy',
              'Learn about data protection',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
          </>
        ))}

        {renderSection('About', (
          <>
            {renderSettingItem(
              'information-circle-outline',
              'App Version',
              'SOURCEWAVE v1.0.0',
              undefined,
              false,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'star-outline',
              'Rate App',
              'Share your feedback',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
            {renderSettingItem(
              'share-outline',
              'Share App',
              'Tell friends about SOURCEWAVE',
              () => {},
              true,
              undefined,
              Colors.ROYAL_BLUE
            )}
          </>
        ))}

        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={20} color={Colors.ERROR} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <View style={styles.footerAccent} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.BLACK,
  },
  headerSpacer: {
    width: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    marginBottom: 8,
    marginLeft: 16,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: Colors.ROYAL_BLUE,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    marginTop: 2,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.ERROR,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.ERROR,
  },
  footerAccent: {
    height: 2,
    backgroundColor: Colors.ROYAL_BLUE,
    marginTop: 12,
    borderRadius: 1,
    opacity: 0.3,
  },
});
