/**
 * Flora design tokens. The ONLY file where raw hex colors are allowed
 * (enforced by ESLint no-restricted-syntax) — everything else imports from here.
 */

export const colors = Object.freeze({
  primary: '#2F6B4F',
  primaryDeep: '#27593F',
  ink: '#22372B',
  terracotta: '#C4653F',
  bg: '#F4EDDE',
  cream: '#FFFDF6',
  hairline: '#EBDFC8',
  border: '#D8CCB2',
  greenTint: '#E4EDE2',
  mutedText: '#75816B',
  sage: '#A3AC9B',
  terracottaTint: '#F6E3D7',
});

export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
});

export const radii = Object.freeze({
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
});

/** Font family names as registered by expo-font / @expo-google-fonts. */
export const fonts = Object.freeze({
  display: 'Baloo2_700Bold',
  displaySemi: 'Baloo2_600SemiBold',
  displayArabic: 'BalooBhaijaan2_700Bold',
  displayArabicSemi: 'BalooBhaijaan2_600SemiBold',
  body: 'Mulish_400Regular',
  bodySemi: 'Mulish_600SemiBold',
  bodyBold: 'Mulish_700Bold',
});

export const typeScale = Object.freeze({
  display: 28,
  title: 22,
  heading: 18,
  body: 15,
  caption: 13,
  micro: 11,
});

export const theme = { colors, spacing, radii, fonts, typeScale };
export default theme;
