/**
 * Company logo with integrity check: `custom.logo_sha256` when present
 * (spec/repository.md §2) — on mismatch a neutral placeholder is shown and
 * nothing else is affected.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { loadImage, logoDisplayable } from '../lib/media';
import { VerifiedImage } from './kit';
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
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!url || !logoDisplayable(url, expectedSha)) {
      // a linked logo without logo_sha256 is a metadata error: placeholder only
      setSrc(null);
      return;
    }
    void loadImage(url, origin, expectedSha).then((s) => {
      if (alive) setSrc(s);
    });
    return () => {
      alive = false;
    };
  }, [url, origin, expectedSha]);

  const frame = { width: size, height: size, borderRadius: 12, overflow: 'hidden' as const, backgroundColor: c.surface2 };
  if (!src) return <View style={frame} accessibilityElementsHidden importantForAccessibility="no" />;
  return (
    <View style={frame}>
      <VerifiedImage uri={src} aspectRatio={1} />
    </View>
  );
}
