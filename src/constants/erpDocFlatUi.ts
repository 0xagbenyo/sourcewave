import { StyleSheet } from 'react-native';
import { Colors } from './colors';

/** Shared flat ERP document detail palette (delivery note, invoice, order, etc.). */
export const ERP_DOC_FLAT = {
  hairline: StyleSheet.hairlineWidth,
  border: '#E2E4E8',
  muted: '#6B7280',
  ink: Colors.BRAND_NAVY,
  accent: Colors.WINE,
  surface: Colors.WHITE,
  surfaceMuted: '#F2F3F5',
  pageBg: '#ECEFF1',
} as const;
