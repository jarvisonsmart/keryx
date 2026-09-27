/**
 * The app's UI primitives (theme.ts tokens): screens, text, buttons, cards,
 * banners, toggles, chips, the bottom sheet and verified images.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { MAX_WIDTH, mono, radius, useColors } from './theme';

// --- layout -------------------------------------------------------------------

/** A full-height, scrollable screen in the readable column. */
export function Screen({
  children,
  header,
  padded = true,
  top = 48,
}: {
  children: ReactNode;
  /** a sticky app bar above the scrolling content */
  header?: ReactNode;
  padded?: boolean;
  /** extra top padding when there is no header */
  top?: number;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: header ? 0 : insets.top + top,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View style={[styles.column, padded && styles.padded]}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** A centered spinner with an optional line of text. */
export function Loading({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator color={c.accent} size="large" />
      {label ? <Txt variant="body" muted style={{ marginTop: 12, textAlign: 'center' }}>{label}</Txt> : null}
    </View>
  );
}

/** The sticky top bar; it reserves the status bar height. */
export function AppBar({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={[styles.column, styles.appbar]}>{children}</View>
    </View>
  );
}

export function Stack({ gap = 10, style, children }: { gap?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

// --- text ---------------------------------------------------------------------

type Variant = 'title' | 'section' | 'body' | 'small' | 'mono';

export function Txt({
  variant = 'body',
  muted,
  bold,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; bold?: boolean }) {
  const c = useColors();
  const color = muted || variant === 'small' ? c.text2 : c.text;
  return (
    <Text
      {...rest}
      style={[styles[variant], { color }, bold && { fontWeight: '600' }, style]}
    />
  );
}

/** Bullet points ("what happens next"), with a bold lead per point. */
export function Points({ items }: { items: [lead: string, rest: string][] }) {
  const c = useColors();
  return (
    <Stack gap={10} style={{ marginBottom: 24 }}>
      {items.map(([lead, rest]) => (
        <View key={lead} style={{ flexDirection: 'row', gap: 8 }}>
          <Txt variant="small">•</Txt>
          <Txt variant="small" style={{ flex: 1 }}>
            <Txt variant="small" bold style={{ color: c.text }}>{lead}</Txt> {rest}
          </Txt>
        </View>
      ))}
    </Stack>
  );
}

// --- controls -------------------------------------------------------------------

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  kind = 'primary',
  label,
  icon,
  onPress,
  disabled,
  busy,
  compact,
}: {
  kind?: ButtonKind;
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  /** show a spinner over the label; the button keeps its size */
  busy?: boolean;
  /** the small banner/inline size */
  compact?: boolean;
}) {
  const c = useColors();
  const palette: Record<ButtonKind, { bg: string; fg: string }> = {
    primary: { bg: c.accent, fg: c.onAccent },
    secondary: { bg: c.surface2, fg: c.text },
    danger: { bg: c.dangerSoft, fg: c.danger },
    ghost: { bg: 'transparent', fg: c.accent },
  };
  const { bg, fg } = palette[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={[styles.buttonInner, { opacity: busy ? 0 : 1 }]}>
        {icon}
        <Text style={[styles.buttonLabel, compact && styles.buttonLabelCompact, { color: fg }]}>{label}</Text>
      </View>
      {busy ? <ActivityIndicator color={fg} style={StyleSheet.absoluteFill} /> : null}
    </Pressable>
  );
}

export function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: c.surface2 }]}
    >
      {children}
    </Pressable>
  );
}

export function Toggle({ on }: { on: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.toggle,
        { backgroundColor: on ? c.accent : c.surface2, borderColor: on ? c.accent : c.border },
      ]}
    >
      <View style={[styles.toggleKnob, { transform: [{ translateX: on ? 20 : 0 }] }]} />
    </View>
  );
}

/** A tappable list row (contacts, channels). */
export function Row({
  onPress,
  children,
  divider = true,
  label,
  selected,
}: {
  onPress?: () => void;
  children: ReactNode;
  divider?: boolean;
  label?: string;
  /** a switch row's state, for accessibility */
  selected?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'switch'}
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderBottomWidth: 1, borderBottomColor: c.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Chip({ label, accent, onPress }: { label: string; accent?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected: !!accent } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: accent ? c.accentSoft : c.surface2 }]}
    >
      <Text style={[styles.chipLabel, { color: accent ? c.accent : c.text }]}>{label}</Text>
    </Pressable>
  );
}

// --- surfaces -------------------------------------------------------------------

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export function Alert({
  danger,
  title,
  children,
}: {
  danger?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        danger
          ? { backgroundColor: c.dangerSoft, borderColor: 'transparent' }
          : { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      {title ? <Txt bold style={{ fontSize: 17, marginBottom: 4 }}>{title}</Txt> : null}
      {typeof children === 'string' ? <Txt variant="small" style={{ fontSize: 14 }}>{children}</Txt> : children}
    </View>
  );
}

export type BannerTone = 'danger' | 'ok' | 'neutral';

/** The app-wide notification status strip. */
export function Banner({ tone, text, actions }: { tone: BannerTone; text: string; actions?: ReactNode }) {
  const c = useColors();
  const bg = tone === 'danger' ? c.dangerSoft : tone === 'ok' ? c.okSoft : c.surface2;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: bg }]}>
      <Txt style={{ flexBasis: 160, flexGrow: 1, fontSize: 14, color: tone === 'neutral' ? c.text2 : c.text }}>{text}</Txt>
      {actions ? <View style={{ flexDirection: 'row', gap: 8 }}>{actions}</View> : null}
    </View>
  );
}

/** A bottom sheet over a dimmed backdrop; tapping the backdrop closes it. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 24 }]}>
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: 1, backgroundColor: c.border }, style]} />;
}

// --- images ---------------------------------------------------------------------

const SVG_DATA = /^data:image\/svg\+xml(;base64)?,/;

/**
 * A verified image URI (lib/media.ts) or an inline data URI. SVG renders
 * through react-native-svg: the apps' Image cannot decode it. Without a fixed
 * aspect ratio the image takes its natural one.
 */
export function VerifiedImage({
  uri,
  style,
  aspectRatio,
  label,
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  aspectRatio?: number;
  label?: string;
}) {
  const [natural, setNatural] = useState<number | null>(null);
  const ratio = aspectRatio ?? natural ?? 16 / 9;
  const svg = SVG_DATA.exec(uri);
  const isSvg = !!svg;

  useEffect(() => {
    if (aspectRatio || isSvg) return;
    let alive = true;
    Image.getSize(uri, (width, height) => alive && height > 0 && setNatural(width / height), () => {});
    return () => {
      alive = false;
    };
  }, [uri, aspectRatio, isSvg]);

  if (svg) {
    const body = uri.slice(svg[0].length);
    const xml = svg[1] ? atob(body) : decodeURIComponent(body);
    return (
      <View accessibilityLabel={label} style={[{ aspectRatio: ratio, overflow: 'hidden' }, style]}>
        <SvgXml xml={xml} width="100%" height="100%" />
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel={label}
      source={{ uri }}
      resizeMode="cover"
      style={[{ width: '100%', aspectRatio: ratio }, style]}
    />
  );
}

// --- styles -----------------------------------------------------------------------

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  padded: { paddingHorizontal: 20, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  appbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, minHeight: 64 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 35, letterSpacing: -0.28 },
  section: { fontSize: 20, fontWeight: '600', lineHeight: 25 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 13, lineHeight: 19 },
  mono: { fontFamily: mono, fontSize: 13, lineHeight: 20 },
  button: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: 24, justifyContent: 'center', alignSelf: 'stretch' },
  buttonCompact: { minHeight: 36, paddingHorizontal: 16, alignSelf: 'auto' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  buttonLabelCompact: { fontSize: 14 },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 51, height: 31, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  toggleKnob: {
    width: 25,
    height: 25,
    marginLeft: 2,
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  chipLabel: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  card: { borderRadius: radius.card, borderWidth: 1, padding: 16 },
  banner: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '86%',
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
  },
});
