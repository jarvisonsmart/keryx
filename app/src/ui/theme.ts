/**
 * Design tokens (Substack-derived, see ../GRAPHICAL_DESIGN.md): system font,
 * electric blue accent, near-black text, 8px spacing base, pill controls, and
 * a dark mode from the same palette. One semantic red, for destructive
 * actions only. Type sizes scale with the OS text-size setting (RN Text
 * honors it by default); there is no in-app size control.
 */
import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#ffffff',
  surface: '#ffffff',
  surface2: '#f4f4f6',
  text: '#313131',
  text2: '#6e6e73',
  accent: '#0000ee',
  accentSoft: 'rgba(0, 0, 238, 0.08)',
  onAccent: '#ffffff',
  border: 'rgba(49, 49, 49, 0.14)',
  borderStrong: '#313131',
  danger: '#d70015',
  dangerSoft: 'rgba(215, 0, 21, 0.08)',
  okSoft: 'rgba(26, 127, 55, 0.1)',
  backdrop: 'rgba(0, 0, 0, 0.35)',
};

const dark: typeof light = {
  bg: '#101013',
  surface: '#16161a',
  surface2: '#1f1f24',
  text: '#f2f2f4',
  text2: '#a1a1a8',
  accent: '#6b6bff',
  accentSoft: 'rgba(107, 107, 255, 0.16)',
  onAccent: '#ffffff',
  border: 'rgba(242, 242, 244, 0.16)',
  borderStrong: '#e8e8ea',
  danger: '#ff453a',
  dangerSoft: 'rgba(255, 69, 58, 0.14)',
  okSoft: 'rgba(74, 222, 128, 0.14)',
  backdrop: 'rgba(0, 0, 0, 0.5)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' });

export const radius = { pill: 50, card: 16 };

/** The readable column: phones use the full width, wide screens center it. */
export const MAX_WIDTH = 640;
