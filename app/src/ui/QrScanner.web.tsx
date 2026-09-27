/**
 * The web QR scanner: a visible camera preview scanned with BarcodeDetector
 * or jsQR (lib/scan.ts); aborts on cancel or unmount.
 */
import { createElement, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { scanQr } from '../lib/scan';
import { Button, Card, Screen, Txt } from './kit';
import type { QrScannerProps } from './QrScanner';

export function QrScanner({ onResult, onError, onCancel }: QrScannerProps) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    scanQr(video.current ?? undefined, ctrl.signal)
      .then((text) => {
        if (ctrl.signal.aborted) return;
        if (text) onResult(text);
        else onError('no-code');
      })
      .catch(() => {
        if (!ctrl.signal.aborted) onError('no-camera');
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <Txt variant="title">Scan QR code</Txt>
      <Card style={{ padding: 0, overflow: 'hidden', marginVertical: 16 }}>
        {createElement('video', {
          ref: video,
          autoPlay: true,
          playsInline: true,
          muted: true,
          style: { display: 'block', width: '100%', aspectRatio: '3/4', objectFit: 'cover' },
        })}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: 200, height: 200, borderWidth: 2, borderColor: '#fff', borderRadius: 12 }} />
        </View>
      </Card>
      <Txt muted style={{ marginBottom: 16 }}>
        Point the camera at the company's QR code.
      </Txt>
      <Button kind="secondary" label="Cancel" onPress={onCancel} />
    </Screen>
  );
}
