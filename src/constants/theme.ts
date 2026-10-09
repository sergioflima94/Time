/**
 * Clube Vivo — sistema visual do BoraJogo.
 *
 * O uso diário é claro e acolhedor. A partida ao vivo usa `liveColors` para
 * aumentar contraste sem transformar o restante do produto em um app escuro.
 * As cores de cada modalidade continuam vindo de `constants/sports.ts`.
 */
export const colors = {
  bg: '#F5F2EA',
  bgElevated: '#ECE8DE',
  card: '#FFFEFA',
  cardBorder: '#DED9CD',
  cardPressed: '#F1EDE4',
  pitch: '#74C923',
  pitchDark: '#315F22',
  primary: '#579B0E',
  primaryDark: '#356F0D',
  action: '#9DEB22',
  onPrimary: '#FFFFFF',
  onAction: '#17200D',
  secondary: '#176BDE',
  secondaryDark: '#0E4DA8',
  social: '#F2635D',
  socialSoft: '#FDE4E1',
  infoSoft: '#E3EEFF',
  gold: '#D99B19',
  silver: '#8B949B',
  bronze: '#A96F3B',
  special: '#7558D9',
  text: '#171A1D',
  textMuted: '#626B72',
  textFaint: '#969DA2',
  danger: '#D94040',
  warning: '#D88412',
  success: '#4E9917',
  white: '#FFFFFF',
  black: '#111315',
  overlay: 'rgba(17,19,21,0.48)',
  shadow: '#352F26',
} as const;

export const liveColors = {
  ...colors,
  bg: '#111416',
  bgElevated: '#1A1E20',
  card: '#1D2224',
  cardBorder: '#303638',
  cardPressed: '#262C2E',
  text: '#F8F6EF',
  textMuted: '#B8C0C3',
  textFaint: '#737D81',
  primary: '#A6F22E',
  primaryDark: '#73B91F',
  action: '#A6F22E',
  onPrimary: '#131A0B',
  onAction: '#131A0B',
  secondary: '#6DA8FF',
  social: '#FF7770',
  success: '#8FE046',
  warning: '#FFB547',
  gold: '#F4C55B',
  overlay: 'rgba(0,0,0,0.64)',
  shadow: '#000000',
} as const;

export type AppColors = typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 44,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const typography = {
  display: 32,
  title: 24,
  section: 17,
  body: 15,
  caption: 12,
} as const;
