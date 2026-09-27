/**
 * The in-app QR scanner (expo-camera, on-device detection — no Google
 * services needed). Resolves the first decoded QR text once.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Card, Loading, Screen, Txt } from './kit';

export interface QrScannerProps {
  onResult: (text: string) => void;
  /** no camera (no permission, no device), or no code found in time */
  onError: (reason: 'no-camera' | 'no-code') => void;
  onCancel: () => void;
}

export function QrScanner({ onResult, onError, onCancel }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);
  const blocked = !!permission && !permission.granted && !permission.canAskAgain;

  useEffect(() => {
    if (blocked) onError('no-camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  if (!permission || blocked) return <Loading />;
  if (!permission.granted) {
    return (
      <Screen>
        <Txt variant="title">Scan QR code</Txt>
        <Txt muted style={{ marginVertical: 16 }}>
          Keryx needs the camera to read the company's QR code. Nothing else is recorded.
        </Txt>
        <Button
          label="Allow camera"
          onPress={() => void requestPermission()}
        />
        <View style={{ height: 10 }} />
        <Button kind="secondary" label="Cancel" onPress={onCancel} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Txt variant="title">Scan QR code</Txt>
      <Card style={{ padding: 0, overflow: 'hidden', marginVertical: 16 }}>
        <CameraView
          style={{ width: '100%', aspectRatio: 3 / 4 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current || !data) return;
            done.current = true;
            onResult(data);
          }}
        />
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
