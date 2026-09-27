/**
 * Company logo with integrity check: `custom.logo_sha256` when present
 * (spec/repository.md §2) — on mismatch a neutral placeholder is shown and
 * nothing else is affected.
 */
import { View } from 'react-native';
import { logoDisplayable } from '../lib/media';
import { VerifiedImage } from './kit';
import { useVerifiedImage } from './useVerifiedImage';
import { useColors } from './theme';

export function CompanyLogo({
  url,
  origin,
  expectedSha,
  size = 44,
}: {
  url?: string;
  origin: string;
  expectedSha?: string;
  size?: number;
}) {
  const c = useColors();
  const src = useVerifiedImage(url, origin, expectedSha, logoDisplayable(url, expectedSha));

  const frame = { width: size, height: size, borderRadius: 12, overflow: 'hidden' as const, backgroundColor: c.surface2 };
  if (!src) return <View style={frame} accessibilityElementsHidden importantForAccessibility="no" />;
  return (
    <View style={frame}>
      <VerifiedImage uri={src} aspectRatio={1} />
    </View>
  );
}
