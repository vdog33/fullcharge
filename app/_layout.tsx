import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Archivo_700Bold, Archivo_800ExtraBold, Archivo_900Black } from '@expo-google-fonts/archivo';
import { ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold } from '@expo-google-fonts/archivo-narrow';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/lib/auth';
import { ensureIndex, loadPacks, resumeInterrupted } from '../src/lib/packs';
import { ensureBessCatalog } from '../src/lib/bess-catalog';
import { warm } from '../src/lib/here';
import { C, F } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const [loaded, err] = useFonts({ Archivo_700Bold, Archivo_800ExtraBold, Archivo_900Black, ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold });
  useEffect(() => {
    loadPacks().then(() => ensureIndex()).then(() => resumeInterrupted()).catch(() => {});
    ensureBessCatalog().catch(() => {});
    warm(); // maps open on your spot at once
  }, []);
  // Fonts are bundled; if they ever fail we still render with system fonts — never block the scene.
  useEffect(() => { if (loaded || err) SplashScreen.hideAsync().catch(() => {}); }, [loaded, err]);
  if (!loaded && !err) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
            headerTitleStyle: { fontFamily: F.display, fontSize: 19 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: C.bg },
            // iOS's own Back button. Our custom one sat inside iOS 26's glass capsule and got clipped ("tic tac").
            headerBackTitle: 'Back',
            headerBackButtonDisplayMode: 'default',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="camera" options={{ title: 'Identify by Camera' }} />
          <Stack.Screen name="search" options={{ title: 'Search a Vehicle' }} />
          <Stack.Screen name="vehicle/[id]" options={{ title: 'Vehicle' }} />
          <Stack.Screen name="bess/index" options={{ title: 'BESS' }} />
          <Stack.Screen name="bess/[id]" options={{ title: 'BESS' }} />
          <Stack.Screen name="bess/brand" options={{ title: 'Home batteries' }} />
          <Stack.Screen name="bess/family" options={{ title: 'Home battery' }} />
          <Stack.Screen name="bess/camera" options={{ title: 'Identify home battery' }} />
          <Stack.Screen name="erg-pdf" options={{ headerShadowVisible: true, headerStyle: { backgroundColor: '#0A0A0A' }, headerTintColor: '#F5F5F5', headerTitleStyle: { fontFamily: F.narrowBold }, title: 'Manufacturer ERG' }} />
          <Stack.Screen name="guide" options={{ title: 'Cut sheets' }} />
          <Stack.Screen name="sheet" options={{ headerShadowVisible: true, headerStyle: { backgroundColor: '#0A0A0A' }, headerTintColor: '#F5F5F5', headerTitleStyle: { fontFamily: F.narrowBold }, title: 'Rescue sheet' }} />
          <Stack.Screen name="scan-vin" options={{ title: 'Scan VIN' }} />
          <Stack.Screen name="hazmat" options={{ title: 'Hazmat ERG 147' }} />
          <Stack.Screen name="guide147" options={{ title: 'Guide 147 full text' }} />
          <Stack.Screen name="zones" options={{ title: 'Isolation Zones' }} />
          <Stack.Screen name="quick" options={{ title: 'Quick Sheet' }} />
          <Stack.Screen name="recents" options={{ title: 'Recents' }} />
          <Stack.Screen name="test" options={{ title: 'Test vehicles' }} />
          <Stack.Screen name="setup" options={{ title: 'Scene-ready setup' }} />
          <Stack.Screen name="zone/index" options={{ title: 'Zone sharing' }} />
          <Stack.Screen name="zone/share" options={{ title: 'Share to zone' }} />
          <Stack.Screen name="zone/[id]" options={{ title: 'Shared scene' }} />
          <Stack.Screen name="command" options={{ title: 'Command view' }} />
          <Stack.Screen name="history" options={{ title: 'ID History' }} />
          <Stack.Screen name="settings/downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
