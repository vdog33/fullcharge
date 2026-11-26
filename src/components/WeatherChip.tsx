// "72°F · wind 12 mph · from NW — NWS KCRQ, 8 min ago". Shows where the map's wind came from.
import React from 'react';
import { Text, View } from 'react-native';
import { Icon } from './Icon';
import { Weather, weatherLine } from '../lib/weather';
import { toCompass } from '../lib/geo';
import { C } from '../theme';

export function WeatherChip({ w, using, compact }: { w: Weather; using: boolean; compact?: boolean }) {
  const mins = Math.max(0, Math.round((Date.now() - w.observedAt) / 60000));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: compact ? 'rgba(0,0,0,0.75)' : C.surface, borderWidth: compact ? 0 : 1, borderColor: C.border, alignSelf: 'flex-start' }}
      accessibilityLabel={`Weather: ${weatherLine(w)}${w.windFromDeg != null ? `, from ${toCompass(w.windFromDeg)}` : ''}. ${w.source}.`}>
      <Icon name="cloud" size={18} color={C.text} />
      <Text style={{ color: C.text, fontWeight: '700', fontSize: compact ? 15 : 16 }}>
        {weatherLine(w)}{w.windFromDeg != null ? ` · from ${toCompass(w.windFromDeg)}` : ''}
      </Text>
      {!compact && <Text style={{ color: C.muted, fontSize: 14 }}>{w.source}, {mins < 1 ? 'now' : `${mins} min ago`}{using ? ' · used for the map' : ''}</Text>}
    </View>
  );
}
