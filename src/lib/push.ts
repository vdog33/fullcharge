// Zone notifications even when the app is closed: register this phone's push address with Supabase.
// The database sends the notification (supabase/migrations/0008_zone_push.sql) — nothing to run on a server.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabase';

let token: string | null = null;
export const myPushToken = () => token;

// Show the banner + sound even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Ask once, then quietly keep the address fresh on every launch. Never blocks the app. */
export async function registerPush(): Promise<string | null> {
  try {
    if (!supabase || Platform.OS === 'web') return null;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).status;
    if (status !== 'granted') return null;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    const { data } = await supabase.auth.getUser();
    await supabase.from('push_tokens').upsert({ token, user_id: data.user?.id ?? null, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'token' });
    return token;
  } catch (e) {
    console.warn('push register', (e as Error).message);
    return null;
  }
}

/** Tapping a notification opens that scene. */
export function listenForTaps(): () => void {
  const open = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url);
  };
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
