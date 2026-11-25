import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Btn, Card, Muted, st } from '../src/components/ui';
import { extractVin } from '../src/lib/vin-core';
import { readVinFromPhoto } from '../src/lib/identify';
import { C, F, S } from '../src/theme';

// Door-jamb certification labels carry the VIN as a barcode (usually Code 39; some Data Matrix / QR).
// The dash VIN plate has no barcode, so that one is read from a photo (Gemini, needs signal).
const TYPES = ['code39', 'code128', 'datamatrix', 'qr', 'pdf417', 'code93'] as const;

export default function ScanVin() {
  const r = useRouter();
  const cam = useRef<CameraView>(null);
  const [perm, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [found, setFound] = useState<{ vin: string; checked: boolean; how: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locked = useRef(false);

  const go = (vin: string) => r.replace(`/search?vin=${vin}`);

  function onScan({ data }: { data: string }) {
    if (locked.current) return;
    const v = extractVin(data);
    if (!v) return; // not a VIN barcode (tire size, part number…) — keep scanning
    locked.current = true;
    if (v.checked) go(v.vin); // check digit passes: straight to lookup
    else setFound({ ...v, how: 'barcode' });
  }

  async function fromPhoto() {
    setErr(''); setBusy(true);
    try {
      const shot = await cam.current?.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!shot?.uri) throw new Error('Could not take the photo.');
      const v = await readVinFromPhoto(shot.uri);
      if (!v) throw new Error('No VIN found in that photo. Get closer, hold steady, use the light.');
      locked.current = true;
      if (v.checked) go(v.vin); else setFound({ ...v, how: 'photo' });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!perm) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg, gap: S.md }}>
        <Stack.Screen options={{ title: 'Scan VIN' }} />
        <Text style={st.body}>FULLCHARGE needs the camera to read the VIN barcode.</Text>
        <Btn tone="red" label="ALLOW CAMERA" onPress={ask} />
        <Btn tone="ghost" label="TYPE THE VIN INSTEAD" onPress={() => r.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ title: 'Scan VIN' }} />
      <CameraView
        ref={cam} style={{ flex: 1 }} facing="back" enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...TYPES] }}
        onBarcodeScanned={found ? undefined : onScan}
      />
      {/* aiming frame */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '30%', left: '8%', right: '8%', height: 110, borderWidth: 2, borderColor: C.text, borderRadius: 10 }} />
      <View style={{ position: 'absolute', top: S.md, left: S.md, right: S.md }}>
        <Text style={{ color: C.text, fontFamily: F.narrowBold, fontSize: 16, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 6 }}>
          Door jamb sticker: aim at the barcode{'\n'}Dash plate: tap READ FROM PHOTO
        </Text>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: S.lg, gap: S.sm, backgroundColor: 'rgba(10,10,10,0.92)' }}>
        {found ? (
          <Card>
            <Text style={st.label}>VIN read from {found.how}</Text>
            <Text style={[st.body, { fontFamily: F.narrowBold, fontSize: 22, letterSpacing: 1 }]}>{found.vin}</Text>
            <Muted>Check digit doesn't match — compare it with the vehicle before using it.</Muted>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <View style={{ flex: 1 }}><Btn tone="red" label="USE IT" onPress={() => go(found.vin)} /></View>
              <View style={{ flex: 1 }}><Btn tone="ghost" label="SCAN AGAIN" onPress={() => { setFound(null); locked.current = false; }} /></View>
            </View>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <View style={{ flex: 1 }}><Btn label={busy ? 'READING…' : 'READ FROM PHOTO'} disabled={busy} onPress={fromPhoto} /></View>
              <Pressable onPress={() => setTorch(!torch)} accessibilityRole="button" accessibilityLabel={torch ? 'Light off' : 'Light on'}
                style={{ width: 64, borderRadius: 10, borderWidth: 1, borderColor: torch ? C.text : C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.text, fontFamily: F.narrowBold }}>{torch ? 'LIGHT\nON' : 'LIGHT'}</Text>
              </Pressable>
            </View>
            {busy && <ActivityIndicator color={C.text} />}
            {!!err && <Text style={[st.body, { color: C.hazmat }]}>{err}</Text>}
            <Muted>Barcode scanning works with no signal. Reading from a photo needs signal.</Muted>
          </>
        )}
      </View>
    </View>
  );
}
