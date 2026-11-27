// Say the car: "Tesla Model Y", "F-150 Lightning", "Chevy Bolt". On-device speech recognition (iPhone's own,
// no signal needed on phones that support it). What it hears goes straight into the search box — the forgiving
// search does the rest, so a slightly wrong word still finds the car.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Icon } from './Icon';
import { C, F, R } from '../theme';

// Spoken numbers → digits, so "model three" finds "Model 3" and "f one fifty" finds "F-150".
const NUM: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100',
};
export function spokenToQuery(t: string): string {
  let s = t.toLowerCase().replace(/[.,!?]/g, ' ');
  s = s.replace(/\bone fifty\b/g, '150').replace(/\btwo fifty\b/g, '250').replace(/\bthree fifty\b/g, '350');
  s = s.replace(/\b[a-z]+\b/g, (w) => NUM[w] ?? w);
  return s.replace(/\s+/g, ' ').trim();
}

/** Big mic button. hints = brand / model names to bias recognition (e.g. "Ioniq", "Lyriq", "Rivian"). */
/** autoStart: start listening as soon as the screen opens (the Voice choice on Start New). */
export function VoiceSearchBtn({ onText, hints, autoStart }: { onText: (q: string) => void; hints?: string[]; autoStart?: boolean }) {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  useSpeechRecognitionEvent('start', () => setOn(true));
  useSpeechRecognitionEvent('end', () => setOn(false));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results?.[0]?.transcript;
    if (t) onText(spokenToQuery(t));
    if (e.isFinal) setMsg('');
  });
  useSpeechRecognitionEvent('error', (e) => {
    setOn(false);
    setMsg(e.error === 'no-speech' || e.error === 'speech-timeout' ? "Didn't catch that — tap and say the car again."
      : e.error === 'not-allowed' ? 'Microphone is off for FULLCHARGE — turn it on in Settings.'
      : e.error === 'network' ? 'This phone needs signal for voice — type instead.' : 'Voice not available — type instead.');
  });

  async function start() {
    if (on) { ExpoSpeechRecognitionModule.stop(); return; }
    setMsg('');
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!p.granted) { setMsg('Microphone is off for FULLCHARGE — turn it on in Settings.'); return; }
    let offline = false;
    try { offline = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(); } catch { /* older iOS */ }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US', interimResults: true, continuous: false,
      requiresOnDeviceRecognition: offline, // on the phone, no signal needed
      contextualStrings: (hints ?? []).slice(0, 100),
    });
  }

  useEffect(() => { if (autoStart) start().catch(() => {}); }, []);

  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={on ? 'Stop listening' : 'Say the car'}
        style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: R.card,
          borderWidth: 2, borderColor: on ? C.red : C.line, backgroundColor: on ? C.red : pressed ? C.surface2 : C.surface })}>
        <Icon name="mic" size={24} color={on ? '#FFF' : C.text} />
        <Text style={{ color: on ? '#FFF' : C.text, fontFamily: F.display, fontSize: 18 }}>{on ? 'Listening… tap to stop' : 'Say the car'}</Text>
      </Pressable>
      {!!msg && <Text style={{ color: C.hazmat, fontWeight: '700', fontSize: 15 }}>{msg}</Text>}
    </View>
  );
}
