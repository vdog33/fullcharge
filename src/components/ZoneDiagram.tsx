// Offline zone diagram: true-scale rings drawn in SVG. Works with no signal and no GPS fix.
// Drag the fire marker, or tap anywhere to move it there.
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ZONES } from '../data/catalog';
import { LatLng, offsetM, scaleBar, toScreen, wedgePath } from '../lib/geo';
import { C, F } from '../theme';

type Props = {
  fire: LatLng;
  you: LatLng | null;
  plumeHeading: number;
  plumeHalfDeg: number;
  plumeLenM: number;
  height: number;
  onMoveFire: (p: LatLng) => void;
};

export function ZoneDiagram({ fire, you, plumeHeading, plumeHalfDeg, plumeLenM, height, onMoveFire }: Props) {
  const [w, setW] = useState(360);
  const [close, setClose] = useState(false);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });

  const half = Math.min(w, height) / 2;
  const mpp = (close ? 140 : 560) / half; // full view shows the 1/3-mile cold zone; close view 140 m (460 ft)
  const anchor = you ?? fire;             // screen centre
  const cx = w / 2, cy = height / 2;
  const o = toScreen(anchor, fire, mpp);
  const fpos = { x: cx + o.x + drag.dx, y: cy + o.y + drag.dy };
  const ypos = you ? (() => { const q = toScreen(anchor, you, mpp); return { x: cx + q.x, y: cy + q.y }; })() : null;
  const px = (m: number) => m / mpp;
  const sb = scaleBar(mpp);

  const live = useRef({ mpp, fpos, cx, cy, anchor, fire });
  live.current = { mpp, fpos, cx, cy, anchor, fire };
  const g = useRef({ dragging: false, moved: false, x0: 0, y0: 0 });
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const s = live.current;
      g.current = { moved: false, x0: x, y0: y, dragging: Math.hypot(x - s.fpos.x, y - s.fpos.y) < 44 };
    },
    onPanResponderMove: (_e, gs) => {
      if (Math.abs(gs.dx) + Math.abs(gs.dy) > 6) g.current.moved = true;
      if (g.current.dragging) setDrag({ dx: gs.dx, dy: gs.dy });
    },
    onPanResponderRelease: (_e, gs) => {
      const s = live.current;
      if (g.current.dragging && g.current.moved) onMoveFire(offsetM(s.fire, gs.dx * s.mpp, -gs.dy * s.mpp));
      else if (!g.current.moved) onMoveFire(offsetM(s.anchor, (g.current.x0 - s.cx) * s.mpp, -(g.current.y0 - s.cy) * s.mpp));
      setDrag({ dx: 0, dy: 0 });
    },
  }), [onMoveFire]);

  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} {...pan.panHandlers}>
        <Svg width={w} height={height}>
          <Rect x={0} y={0} width={w} height={height} fill={C.surface} />
          <G>
            <Path d={wedgePath(fpos.x, fpos.y, plumeHeading, plumeHalfDeg, px(plumeLenM))} fill={C.red} fillOpacity={0.35} stroke={C.red} strokeWidth={1} />
            <Circle cx={fpos.x} cy={fpos.y} r={px(ZONES.cold_m)} stroke={C.cold} strokeWidth={2} fill="none" />
            <Circle cx={fpos.x} cy={fpos.y} r={px(ZONES.warm_m)} stroke={C.hazmat} strokeWidth={2} fill={C.hazmat} fillOpacity={0.06} />
            <Circle cx={fpos.x} cy={fpos.y} r={px(ZONES.hot_m)} stroke={C.red} strokeWidth={2.5} fill={C.red} fillOpacity={0.12} />
            <Circle cx={fpos.x} cy={fpos.y} r={px(ZONES.quarantine_m)} stroke={C.gold} strokeWidth={2} strokeDasharray="6 5" fill="none" />
            <Circle cx={fpos.x} cy={fpos.y} r={9} fill={C.red} stroke={C.text} strokeWidth={2} />
            {ypos && (
              <G>
                <Circle cx={ypos.x} cy={ypos.y} r={7} fill={C.you} stroke={C.bg} strokeWidth={2} />
                <SvgText x={ypos.x + 10} y={ypos.y + 4} fill={C.you} fontSize={12} fontWeight="bold">YOU</SvgText>
              </G>
            )}
          </G>
          <Rect x={12} y={height - 22} width={sb.px} height={4} fill={C.text} />
          <SvgText x={12} y={height - 28} fill={C.text} fontSize={11}>{sb.m} m</SvgText>
          <SvgText x={w - 12} y={height - 12} fill={C.muted} fontSize={11} textAnchor="end">N ↑ · tap to move fire</SvgText>
        </Svg>
      </View>
      <Pressable onPress={() => setClose(!close)}
        style={{ position: 'absolute', right: 8, top: 8, paddingHorizontal: 10, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.8)', borderWidth: 1, borderColor: C.border, justifyContent: 'center' }}>
        <Text style={{ color: C.text, fontFamily: F.narrowBold }}>{close ? 'FULL VIEW' : 'CLOSE VIEW'}</Text>
      </Pressable>
    </View>
  );
}
