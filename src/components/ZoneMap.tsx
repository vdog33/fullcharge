// Live zone map: Apple Maps on iPhone / iPad (react-native-maps uses MapKit on iOS by default).
// Native pinch / pan / zoom; rings are real map circles in METRES, so they hold true ground size at any zoom.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Text, View } from 'react-native';
import MapView, { LocalTile, Marker, Polygon } from 'react-native-maps';
import { hasOfflineTiles, loadAreas, TILE_PATH_TEMPLATE } from '../lib/tiles';
import { ZONES } from '../data/catalog';
import { LatLng, plumePolygon, regionFor, ringPolygon } from '../lib/geo';
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
  /** On: one tap on the map puts the fire there (easier than dragging with gloves). */
  tapToPlace?: boolean;
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const ll = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export const ZoneMap = forwardRef<ZoneMapHandle, Props>(function ZoneMap(
  { fire, you, mapType, plumeHeading, plumeHalfDeg, plumeLenM, height, onMoveFire, tapToPlace }, ref,
) {
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({
    frame: (radiusM) => map.current?.animateToRegion(regionFor(fire, radiusM), 450),
  }), [fire.lat, fire.lng]);

  // No signal + map areas saved in setup -> draw our own aerial tiles (Apple's need signal).
  const offline = useOffline();
  const local = offline && mapType === 'satellite' && hasOfflineTiles();

  const plume = plumePolygon(fire, plumeHeading, plumeHalfDeg, plumeLenM).map(ll);
  // Rings are polygons with fixed keys: moving the fire updates the same shapes (no leftover second set).
  const ring = (m: number) => ringPolygon(fire, m).map(ll);

  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden' }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        mapType={local ? 'none' : mapType === 'satellite' ? 'hybrid' : 'standard'} // hybrid = satellite + street names
        maxZoomLevel={local ? 16.5 : undefined}
        initialRegion={regionFor(fire, ZONES.warm_m)}
        rotateEnabled={false}   // north stays up, so the wind picker and plume read true
        pitchEnabled={false}
        showsCompass
        showsScale
        showsPointsOfInterest={false}
        userInterfaceStyle="dark"
        onLongPress={(e) => { const c = e.nativeEvent.coordinate; onMoveFire({ lat: c.latitude, lng: c.longitude }); }}
        onPress={tapToPlace ? (e) => { const c = e.nativeEvent.coordinate; if (c) onMoveFire({ lat: c.latitude, lng: c.longitude }); } : undefined}
      >
        {local && <LocalTile pathTemplate={TILE_PATH_TEMPLATE} tileSize={256} zIndex={-1} />}
        <Polygon key="plume" coordinates={plume.length > 2 ? plume : ring(1)} fillColor={rgba(C.plume, 0.45)} strokeColor={C.hot} strokeWidth={1} />
        <Polygon key="cold" coordinates={ring(ZONES.cold_m)} strokeColor={C.cold} strokeWidth={2.5} fillColor="rgba(0,0,0,0)" />
        <Polygon key="warm" coordinates={ring(ZONES.warm_m)} strokeColor={C.warm} strokeWidth={2.5} fillColor={rgba(C.warm, 0.08)} />
        <Polygon key="hot" coordinates={ring(ZONES.hot_m)} strokeColor={C.hot} strokeWidth={3} fillColor={rgba(C.hot, 0.15)} />
        <Polygon key="quarantine" coordinates={ring(ZONES.quarantine_m)} strokeColor={C.gold} strokeWidth={2} lineDashPattern={[6, 5]} fillColor="rgba(0,0,0,0)" />

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
      {local && <Text style={{ position: 'absolute', left: 6, bottom: 6, color: C.text, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, fontSize: 13 }}>Offline aerial · USGS</Text>}
    </View>
  );
});

function useOffline() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    loadAreas().catch(() => {});
    return NetInfo.addEventListener((s) => setOff(s.isConnected === false || s.isInternetReachable === false));
  }, []);
  return off;
}
