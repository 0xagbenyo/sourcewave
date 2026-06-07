/**
 * Light theme tokens for the native team chat UI.
 * @see https://github.com/The-Commit-Company/raven (frontend uses Radix Themes + Tailwind)
 */
export const RavenLight = {
  bg: '#FCFCFD',
  panel: '#FFFFFF',
  sidebar: '#F9F9FB',
  sidebarHover: '#F0F0F3',
  border: '#E8E8EC',
  borderStrong: '#D9D9E0',
  text: '#1C2024',
  textMuted: '#60646C',
  textSubtle: '#8B8D98',
  accent: '#5758E6',
  accentHover: '#4B4CD4',
  accentSoft: '#E8E9FF',
  success: '#30A46C',
  canvas: '#F4F4F6',
  bubbleOther: '#FFFFFF',
  bubbleMine: '#5758E6',
  bubbleMineText: '#FFFFFF',
  danger: '#E5484D',
  radiusMd: 10,
  radiusLg: 14,
  radiusFull: 999,
  fontSans: 'System',
  /** Messenger-style attachment card (reference UI) */
  messengerFileBg: '#F5F5F5',
  messengerFileBorder: '#E8E8EC',
  messengerEyeBtnBg: '#5D5FEF',
  messengerEyeIcon: '#FFFFFF',
  railBorder: '#E8E8EC',
  onlineGreen: '#30A46C',
  /** Soft shadow for elevated chat surfaces (iOS). */
  shadowSoft: 'rgba(28, 32, 36, 0.06)',
} as const;
