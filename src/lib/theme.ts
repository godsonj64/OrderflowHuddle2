/**
 * Storefront theme engine. Owners pick a preset and optionally override colors, fonts,
 * corner style and layout. The resolved theme is applied as CSS custom properties on
 * the storefront wrapper, which Tailwind utilities such as `bg-brand`, `text-ink` and
 * `rounded-card` read at runtime (see src/index.css). Admin screens are not themed.
 */
import type { CSSProperties } from 'react';
import type { AnnouncementTone, CornerStyle, HeroStyle, MenuLayout, StorefrontTheme, SurfaceMode } from '../types';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  accentColor: string;
  mode: SurfaceMode;
  font: string;
  corners: CornerStyle;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'classic', name: 'Kupa Fresh', description: 'Crisp white surfaces with botanical emerald green', brandColor: '#287350', accentColor: '#EBF5F0', mode: 'light', font: 'geist', corners: 'rounded' },
  { id: 'fresh', name: 'Forest Warm', description: 'Warm neutrals with deep forest green', brandColor: '#1F5E41', accentColor: '#EADDC5', mode: 'warm', font: 'poppins', corners: 'pill' },
  { id: 'street', name: 'Street Food', description: 'Bold red, loud headlines', brandColor: '#DC2626', accentColor: '#FACC15', mode: 'light', font: 'oswald', corners: 'rounded' },
  { id: 'midnight', name: 'Midnight', description: 'Dark mode with amber glow', brandColor: '#F59E0B', accentColor: '#FDE68A', mode: 'dark', font: 'grotesk', corners: 'rounded' },
  { id: 'coastal', name: 'Coastal', description: 'Calm teal, airy layout', brandColor: '#0E7490', accentColor: '#A5F3FC', mode: 'light', font: 'dm', corners: 'rounded' },
  { id: 'bistro', name: 'Bistro', description: 'Elegant serif, rich terracotta', brandColor: '#9A3412', accentColor: '#FED7AA', mode: 'warm', font: 'playfair', corners: 'sharp' },
  { id: 'boba', name: 'Boba', description: 'Playful pink, rounded everything', brandColor: '#DB2777', accentColor: '#FBCFE8', mode: 'light', font: 'nunito', corners: 'pill' },
];

export interface FontPairing {
  id: string;
  name: string;
  display: string;
  body: string;
  /** Google Fonts css2 `family=` values (without the prefix). */
  google: string[];
}

const SANS_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF_FALLBACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

export const FONT_PAIRINGS: FontPairing[] = [
  { id: 'geist', name: 'Minimalist (Geist)', display: `"Geist", ${SANS_FALLBACK}`, body: `"Geist", ${SANS_FALLBACK}`, google: ['Geist:wght@300;400;500;600;700;800'] },
  { id: 'inter', name: 'Modern (Inter)', display: `"Inter", ${SANS_FALLBACK}`, body: `"Inter", ${SANS_FALLBACK}`, google: [] },
  { id: 'poppins', name: 'Friendly (Poppins)', display: `"Poppins", ${SANS_FALLBACK}`, body: `"Poppins", ${SANS_FALLBACK}`, google: ['Poppins:wght@400;500;600;700;800'] },
  { id: 'dm', name: 'Refined (DM Serif + DM Sans)', display: `"DM Serif Display", ${SERIF_FALLBACK}`, body: `"DM Sans", ${SANS_FALLBACK}`, google: ['DM+Serif+Display', 'DM+Sans:wght@400;500;600;700'] },
  { id: 'playfair', name: 'Elegant (Playfair Display)', display: `"Playfair Display", ${SERIF_FALLBACK}`, body: `"Inter", ${SANS_FALLBACK}`, google: ['Playfair+Display:wght@600;700;800'] },
  { id: 'oswald', name: 'Bold (Oswald)', display: `"Oswald", ${SANS_FALLBACK}`, body: `"Inter", ${SANS_FALLBACK}`, google: ['Oswald:wght@500;600;700'] },
  { id: 'nunito', name: 'Rounded (Nunito)', display: `"Nunito", ${SANS_FALLBACK}`, body: `"Nunito", ${SANS_FALLBACK}`, google: ['Nunito:wght@400;600;700;800'] },
  { id: 'grotesk', name: 'Trendy (Space Grotesk)', display: `"Space Grotesk", ${SANS_FALLBACK}`, body: `"Inter", ${SANS_FALLBACK}`, google: ['Space+Grotesk:wght@500;600;700'] },
];

interface Surface {
  page: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  soft: string;
}

export const SURFACES: Record<SurfaceMode, Surface> = {
  light: { page: '#FFFFFF', card: '#FFFFFF', ink: '#121615', muted: '#7A8280', line: '#EDF0EE', soft: '#F6F7F8' },
  warm: { page: '#FCFBF9', card: '#FFFFFF', ink: '#141A16', muted: '#6E7A72', line: '#ECEAE4', soft: '#F4F3EF' },
  dark: { page: '#0D0F0E', card: '#171A18', ink: '#F4F2ED', muted: '#9AA29B', line: '#2A302C', soft: '#202622' },
};

const CORNERS: Record<CornerStyle, { card: string; btn: string; chip: string }> = {
  sharp: { card: '8px', btn: '8px', chip: '8px' },
  rounded: { card: '18px', btn: '14px', chip: '9999px' },
  pill: { card: '24px', btn: '9999px', chip: '9999px' },
};

export const THEME_DEFAULTS = {
  menuLayout: 'grid' as MenuLayout,
  heroStyle: 'image' as HeroStyle,
  heroHeight: 'compact' as 'compact' | 'tall',
  heroOverlay: 55,
  tagline: '',
  showSearch: true,
  showFeatured: true,
  featuredTitle: 'Top of Week',
  showRatings: true,
  showPrepTime: true,
  showCalories: true,
  showPoweredBy: true,
  spotlightTitle: 'Spotlight',
  spotlightSubtitle: 'Discover our latest highlights and exclusive offers.',
  announcementEnabled: false,
  announcementText: '',
  announcementTone: 'brand' as AnnouncementTone,
  showPromoCard: true,
  promoTitle: '',
  promoSubtitle: '',
  promoBannerUrl: '',
  promoOverlay: 45,
};

export type ResolvedTheme = typeof THEME_DEFAULTS & {
  preset: string;
  brandColor: string;
  accentColor: string;
  mode: SurfaceMode;
  font: string;
  corners: CornerStyle;
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHexColor = (value?: string | null): value is string => !!value && HEX.test(value);

function defined<T extends object>(obj: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) (out as any)[k] = v;
  }
  return out;
}

export function resolveTheme(theme?: StorefrontTheme | null): ResolvedTheme {
  const t = theme || {};
  const preset = THEME_PRESETS.find((p) => p.id === t.preset) || THEME_PRESETS[0];
  const overrides = defined(t);
  return {
    ...THEME_DEFAULTS,
    ...(overrides as Partial<typeof THEME_DEFAULTS>),
    preset: preset.id,
    brandColor: isHexColor(t.brandColor) ? t.brandColor : preset.brandColor,
    accentColor: isHexColor(t.accentColor) ? t.accentColor : preset.accentColor,
    mode: t.mode && SURFACES[t.mode] ? t.mode : preset.mode,
    font: FONT_PAIRINGS.some((f) => f.id === t.font) ? (t.font as string) : preset.font,
    corners: t.corners && CORNERS[t.corners] ? t.corners : preset.corners,
    heroOverlay: Math.min(90, Math.max(0, Number(t.heroOverlay ?? THEME_DEFAULTS.heroOverlay))),
    promoOverlay: Math.min(90, Math.max(0, Number(t.promoOverlay ?? THEME_DEFAULTS.promoOverlay))),
  };
}

function expandHex(hex: string): string {
  const h = hex.replace('#', '');
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
}

function luminance(hex: string): number {
  const h = expandHex(hex);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  if (!isHexColor(a) || !isHexColor(b)) return 21;
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  if (!isHexColor(background)) return '#FFFFFF';
  return contrastRatio(background, '#FFFFFF') >= contrastRatio(background, '#111111') ? '#FFFFFF' : '#111111';
}

export function themeStyle(theme: ResolvedTheme): CSSProperties {
  const s = SURFACES[theme.mode];
  const r = CORNERS[theme.corners];
  const font = FONT_PAIRINGS.find((f) => f.id === theme.font) || FONT_PAIRINGS[0];
  return {
    '--color-brand': theme.brandColor,
    '--color-on-brand': readableTextOn(theme.brandColor),
    '--color-accent': theme.accentColor,
    '--color-on-accent': readableTextOn(theme.accentColor),
    '--color-page': s.page,
    '--color-card': s.card,
    '--color-ink': s.ink,
    '--color-muted': s.muted,
    '--color-line': s.line,
    '--color-soft': s.soft,
    '--radius-card': r.card,
    '--radius-btn': r.btn,
    '--radius-chip': r.chip,
    '--font-sans': font.body,
    '--font-display': font.display,
    colorScheme: theme.mode === 'dark' ? 'dark' : 'light',
  } as CSSProperties;
}

/** Owner-facing warnings shown in the appearance editor. */
export function themeWarnings(theme: ResolvedTheme): string[] {
  const warnings: string[] = [];
  const s = SURFACES[theme.mode];
  if (contrastRatio(theme.brandColor, s.page) < 1.6) {
    warnings.push('Your brand color is very close to the page background, so buttons may be hard to see.');
  }
  return warnings;
}

const loadedFonts = new Set<string>();

/** Lazily loads the Google Fonts needed by a pairing (Inter is bundled via index.css). */
export function ensureFontLoaded(fontId: string) {
  if (typeof document === 'undefined') return;
  const font = FONT_PAIRINGS.find((f) => f.id === fontId);
  if (!font || font.google.length === 0 || loadedFonts.has(font.id)) return;
  loadedFonts.add(font.id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${font.google.map((f) => `family=${f}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}

export const ANNOUNCEMENT_STYLES: Record<AnnouncementTone, string> = {
  brand: 'bg-brand text-on-brand',
  info: 'bg-sky-600 text-white',
  warning: 'bg-amber-400 text-black',
  success: 'bg-emerald-600 text-white',
};
