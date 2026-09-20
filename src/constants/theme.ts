export const colors = {
  // Fundo neutro (grafite com um toque de verde) em vez de preto-esverdeado —
  // deixa a cor de destaque vir dos acentos, não do fundo inteiro.
  bg: '#11161A',
  bgElevated: '#171E23',
  card: '#1B2329',
  cardBorder: '#2B353C',
  pitch: '#1E8E3E',
  pitchDark: '#136428',
  primary: '#22C55E',
  primaryDark: '#16A34A',
  secondary: '#3B82F6',
  secondaryDark: '#1D4ED8',
  gold: '#D4AF37',
  silver: '#9CA3AF',
  bronze: '#B08D57',
  special: '#7C3AED',
  text: '#F3F7F4',
  textMuted: '#9AA6AE',
  textFaint: '#5F6B72',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#22C55E',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;
