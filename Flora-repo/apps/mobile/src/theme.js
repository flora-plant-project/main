/**
 * Flora design tokens — v2 visual system (design_handoff_flora_v2).
 * Light-neutral canvas, fresh green, charcoal for attention. No terracotta.
 * The ONLY file where raw hex colors are allowed (enforced by ESLint
 * no-restricted-syntax) — everything else imports from here.
 */

export const colors = Object.freeze({
  // Green scale
  primary: '#12A05B',
  primaryPressed: '#0E8C4E',
  primaryDeep: '#0E7A44',
  greenMid: '#3FBE79',
  greenLight: '#8ED6AC',
  greenTint: '#E4F6EC',
  greenTintSoft: '#E9F4EC',
  greenTintBorder: '#D3EEDF',
  potSilhouette: '#C8DECF', // empty-state illustration pot

  // Neutrals
  ink: '#111815', // headings, attention banner, primary text
  inkBody: '#2C3830', // body copy inside cards
  mutedText: '#7C857C', // subtitles, supporting copy
  sage: '#9BA39B', // meta, resting tabs, low confidence
  chipText: '#5F6E64',
  chipFill: '#F1F4F0', // neutral chips, number tiles, hover
  track: '#EDF0EC', // confidence bar track
  barLow: '#C3CFC6', // low-confidence fill
  divider: '#F0F2EF', // in-card dividers
  border: '#E9ECE7', // card and bar borders
  checkbox: '#D7DDD7', // unchecked task circle
  surface: '#FFFFFF', // cards, app bar, tab bar
  onPrimary: '#FFFFFF', // labels/icons on a green or charcoal fill
  bg: '#F5F7F4', // screen canvas

  // Overlays (kept here so screens stay hex-free)
  scrim: 'rgba(255,255,255,0.92)', // back button over photography
  badgeOnInk: 'rgba(255,255,255,0.12)',
  badgeOnGreen: 'rgba(255,255,255,0.18)',
  subOnInk: 'rgba(255,255,255,0.62)',
  subOnGreen: 'rgba(255,255,255,0.75)',
  shadowPrimary: 'rgba(18,160,91,0.24)',
  shadowCamera: 'rgba(18,160,91,0.34)',
});

export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  card: 15, // card inner padding
  lg: 16,
  page: 20, // page gutter
  xl: 24,
  xxl: 32,
});

export const radii = Object.freeze({
  xs: 7, // step-number tile
  sm: 8, // status chip
  badge: 10, // verdict badge
  md: 12, // back button, inputs
  card: 14, // plant card, buttons
  lg: 16, // content cards, verdict banner
  xl: 20, // sheet top corners
  tile: 34, // empty-state illustration tile
  pill: 999,
});

/** Font family names as registered by expo-font / @expo-google-fonts. */
export const fonts = Object.freeze({
  display: 'Manrope_800ExtraBold',
  displaySemi: 'Manrope_700Bold',
  displayArabic: 'Cairo_700Bold',
  displayArabicSemi: 'Cairo_600SemiBold',
  body: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyArabic: 'Cairo_500Medium',
});

export const typeScale = Object.freeze({
  display: 26, // screen title
  title: 21, // empty-state / sheet title
  heading: 17, // detail + section title
  button: 14.5,
  body: 14, // plant name, primary body
  label: 13.5, // task title, secondary button
  filter: 13, // segmented filter label
  caption: 12.5, // card header, card body, meta
  meta: 11.5,
  micro: 11,
  chip: 10,
  tab: 9.5,
});

/** Green→gray confidence scale: rank 0 is the strongest finding. */
export const confidenceScale = Object.freeze([
  { fill: colors.primaryDeep, text: colors.primaryDeep },
  { fill: colors.greenMid, text: colors.greenMid },
  { fill: colors.barLow, text: colors.sage },
]);

/** Shadow under the primary green button (design token `0 8px 18px`). */
export const primaryShadow = Object.freeze({
  elevation: 4,
  shadowColor: colors.primary,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.24,
  shadowRadius: 18,
});

export const theme = { colors, spacing, radii, fonts, typeScale, confidenceScale, primaryShadow };
export default theme;
