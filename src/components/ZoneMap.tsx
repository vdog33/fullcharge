// Live zone map: Apple Maps on iPhone / iPad (react-native-maps uses MapKit on iOS by default).
// Native pinch / pan / zoom; rings are real map circles in METRES, so they hold true ground size at any zoom.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Circle, Marker, Polygon } from 'react-native-maps';
import { ZONES } from '../data/catalog';
import { LatLng, plumePolygon, regionFor } from '../lib/geo';
import { C, F } from '../theme';

export type ZoneMapHandle = { frame: (radiusM: number) => void };

type Props = {
  fire: LatLng;
  you: LatLng | null;
  mapType: 'satellite' | 'standard';
  plumeHeading: number;
  plumeHalfDeg: number;
  plumeLenM: number;
  height: number;
  onMoveFire: (p: LatLng) => void;
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const ll = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export const ZoneMap = forwardRef<ZoneMapHandle, Props>(function ZoneMap(
  { fire, you, mapType, plumeHeading, plumeHalfDeg, plumeLenM, height, onMoveFire }, ref,
) {
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({
    frame: (radiusM) => map.current?.animateToRegion(regionFor(fire, radiusM), 450),
  }), [fire.lat, fire.lng]);

  const plume = plumePolygon(fire, plumeHeading, plumeHalfDeg, plumeLenM).map(ll);

  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden' }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        mapType={mapType === 'satellite' ? 'hybrid' : 'standard'} // hybrid = satellite + street names
        initialRegion={regionFor(fire, ZONES.warm_m)}
        rotateEnabled={false}   // north stays up, so the wind picker and plume read true
        pitchEnabled={false}
        showsCompass
        showsScale
        showsPointsOfInterest={false}
        userInterfaceStyle="dark"
        onLongPress={(e) => { const c = e.nativeEvent.coordinate; onMoveFire({ lat: c.latitude, lng: c.longitude }); }}
      >
        <Polygon coordinates={plume} fillColor={rgba(C.plume, 0.45)} strokeColor={C.hot} strokeWidth={1} />
        <Circle center={ll(fire)} radius={ZONES.cold_m} strokeColor={C.cold} strokeWidth={2.5} fillColor="rgba(0,0,0,0)" />
        <Circle center={ll(fire)} radius={ZONES.warm_m} strokeColor={C.warm} strokeWidth={2.5} fillColor={rgba(C.warm, 0.08)} />
        <Circle center={ll(fire)} radius={ZONES.hot_m} strokeColor={C.hot} strokeWidth={3} fillColor={rgba(C.hot, 0.15)} />
        <Circle center={ll(fire)} radius={ZONES.quarantine_m} strokeColor={C.gold} strokeWidth={2} lineDashPattern={[6, 5]} fillColor="rgba(0,0,0,0)" />

        <Marker
          coordinate={ll(fire)} draggable anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
          onDragEnd={(e) => { const c = e.nativeEvent.coordinate; onMoveFire({ lat: c.latitude, lng: c.longitude }); }}
          accessibilityLabel="Fire marker — drag to move"
        >
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.hot, borderWidth: 2, borderColor: C.text }} />
            <Text style={{ color: C.text, fontFamily: F.narrowBold, fontSize: 13, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 3, marginTop: 2 }}>FIRE</Text>
          </View>
        </Marker>

        {you && (
          <Marker coordinate={ll(you)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.you, borderWidth: 2, borderColor: C.bg }} />
              <Text style={{ color: C.you, fontFamily: F.narrowBold, fontSize: 13, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 3, marginTop: 2 }}>YOU</Text>
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
});
