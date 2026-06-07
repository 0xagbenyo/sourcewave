import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';

export interface SourceWaveStackHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}

export const SourceWaveStackHeader: React.FC<SourceWaveStackHeaderProps> = ({
  title,
  subtitle,
  onBack,
  right,
}) => {
  return (
    <LinearGradient
      colors={[Colors.ROYAL_BLUE, '#556fd4']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.row}>
          <TouchableOpacity onPress={onBack} style={styles.sideSlot} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={26} color={Colors.WHITE} />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.sideSlot}>{right}</View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    marginBottom: Spacing.SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  safe: {
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.MD,
    paddingTop: Spacing.SM,
    minHeight: 52,
  },
  sideSlot: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.WHITE,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
