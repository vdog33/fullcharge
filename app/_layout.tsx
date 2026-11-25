import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold } from '@expo-google-fonts/archivo-narrow';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/lib/auth';
import { ensureIndex, loadPacks, resumeInterrupted } from '../src/lib/packs';
import { C, F } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const [loaded, err] = useFonts({ Archivo_700Bold, Archivo_800ExtraBold, ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold });
  useEffect(() => { loadPacks().then(() => ensureIndex()).then(() => resumeInterrupted()).catch(() => {}); }, []);
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
            headerTitleStyle: { fontFamily: F.narrowBold },
            contentStyle: { backgroundColor: C.bg },
            headerBackTitle: 'Back',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="camera" options={{ title: 'Identify by Camera' }} />
          <Stack.Screen name="search" options={{ title: 'Search a Vehicle' }} />
          <Stack.Screen name="vehicle/[id]" options={{ title: 'Vehicle' }} />
          <Stack.Screen name="bess/index" options={{ title: 'BESS' }} />
          <Stack.Screen name="bess/[id]" options={{ title: 'BESS' }} />
          <Stack.Screen name="erg-pdf" options={{ title: 'Manufacturer ERG' }} />
          <Stack.Screen name="guide" options={{ title: 'Cut sheets' }} />
          <Stack.Screen name="sheet" options={{ title: 'Rescue sheet' }} />
          <Stack.Screen name="scan-vin" options={{ title: 'Scan VIN' }} />
          <Stack.Screen name="hazmat" options={{ title: 'Hazmat ERG 147' }} />
          <Stack.Screen name="zones" options={{ title: 'Isolation Zones' }} />
          <Stack.Screen name="quick" options={{ title: 'Quick Sheet' }} />
          <Stack.Screen name="recents" options={{ title: 'Recents' }} />
          <Stack.Screen name="history" options={{ title: 'ID History' }} />
          <Stack.Screen name="settings/downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
