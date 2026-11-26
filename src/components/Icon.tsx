// Line icons from design sheet v2 (24×24 grid). Drawn with react-native-svg — no icon font needed.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '../theme';

export type IconName =
  | 'chev' | 'back' | 'cam' | 'img' | 'search' | 'batt' | 'warn' | 'cloud' | 'signal' | 'dl' | 'book' | 'pin'
  | 'clock' | 'id' | 'gear' | 'x' | 'loc' | 'nav' | 'arrow' | 'ext' | 'check' | 'expand' | 'bolt' | 'phone' | 'menu' | 'flask'
  | 'cut' | 'truck' | 'fire' | 'power' | 'eye' | 'doc' | 'share' | 'users' | 'plus' | 'target';

export function Icon({ name, size = 24, color = C.text }: { name: IconName; size?: number; color?: string }) {
  const s = { stroke: color, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'chev': return <Path d="M9 5l7 7-7 7" {...s} strokeWidth={2.6} />;
      case 'back': return <Path d="M15 5l-7 7 7 7" {...s} strokeWidth={2.8} />;
      case 'cam': return <><Path d="M4 8h3l2-3h6l2 3h3v11H4z" {...s} strokeWidth={2.2} /><Circle cx={12} cy={13} r={3.6} {...s} strokeWidth={2.2} /></>;
      case 'img': return <><Rect x={3} y={4} width={18} height={16} rx={2} {...s} strokeWidth={2.2} /><Circle cx={9} cy={9.5} r={1.8} fill={color} /><Path d="M4 18l5.5-5.5 4 4 2.5-2.5L21 19" {...s} strokeWidth={2.2} /></>;
      case 'search': return <><Circle cx={10.5} cy={10.5} r={6.5} {...s} strokeWidth={2.4} /><Path d="M15.5 15.5L21 21" {...s} strokeWidth={2.6} /></>;
      case 'batt': return <><Rect x={3} y={7} width={16} height={10} rx={2} {...s} strokeWidth={2.2} /><Path d="M21 10.5v3" {...s} strokeWidth={2.4} /><Path d="M11.5 8.8L8.5 12.4h3l-1 2.8 3-3.6h-3z" fill={color} /></>;
      case 'warn': return <><Path d="M12 3L2 20.5h20z" {...s} strokeWidth={2.2} /><Path d="M12 9.5v5" {...s} strokeWidth={2.4} /><Circle cx={12} cy={17.4} r={1.3} fill={color} /></>;
      case 'cloud': return <><Path d="M7 18h10.5a4 4 0 00.6-7.96A6 6 0 006.3 9.2 4.5 4.5 0 007 18z" {...s} strokeWidth={2} /><Path d="M4 4l16 16" {...s} strokeWidth={2.2} /></>;
      case 'signal': return <Path d="M4 20v-3M9 20v-7M14 20v-11M19 20V4" {...s} strokeWidth={2.6} />;
      case 'dl': return <Path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" {...s} strokeWidth={2.4} />;
      case 'book': return <><Path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z" {...s} strokeWidth={2.2} /><Path d="M5 17a3 3 0 013-3h10" {...s} strokeWidth={2.2} /></>;
      case 'pin': return <><Path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" {...s} strokeWidth={2.2} /><Circle cx={12} cy={9.5} r={2.5} fill={color} /></>;
      case 'clock': return <><Circle cx={12} cy={12} r={8.5} {...s} strokeWidth={2.2} /><Path d="M12 7.5V12l3 2" {...s} strokeWidth={2.2} /></>;
      case 'id': return <><Rect x={3} y={5} width={18} height={14} rx={2} {...s} strokeWidth={2.2} /><Circle cx={9} cy={11} r={2.2} {...s} strokeWidth={2} /><Path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 13.5h3" {...s} strokeWidth={2} /></>;
      case 'gear': return <><Circle cx={12} cy={12} r={3.2} {...s} strokeWidth={2.2} /><Path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6L5.5 5.5" {...s} strokeWidth={2.2} /></>;
      case 'x': return <Path d="M6 6l12 12M18 6L6 18" {...s} strokeWidth={2.6} />;
      case 'loc': return <><Circle cx={12} cy={12} r={6.5} {...s} strokeWidth={2.2} /><Circle cx={12} cy={12} r={2.2} fill={color} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...s} strokeWidth={2.2} /></>;
      case 'nav': return <Path d="M4 11l16-7-7 16-2-7z" {...s} strokeWidth={2.2} />;
      case 'arrow': return <Path d="M12 20V5m0 0l-6 6m6-6l6 6" {...s} strokeWidth={2.8} />;
      case 'ext': return <Path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" {...s} strokeWidth={2.2} />;
      case 'check': return <Path d="M4 12.5l5 5L20 6.5" {...s} strokeWidth={3} />;
      case 'expand': return <Path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...s} strokeWidth={2.4} />;
      case 'cut': return <><Circle cx={6} cy={18} r={3} {...s} strokeWidth={2.2} /><Circle cx={18} cy={18} r={3} {...s} strokeWidth={2.2} /><Path d="M8 16L17 4M16 16L7 4" {...s} strokeWidth={2.2} /></>;
      case 'truck': return <><Path d="M2 16V7h11v9M13 10h4l3 3v3h-2M2 16h2M9 16h6" {...s} strokeWidth={2.2} /><Circle cx={6.5} cy={17} r={2} {...s} strokeWidth={2.2} /><Circle cx={16.5} cy={17} r={2} {...s} strokeWidth={2.2} /></>;
      case 'fire': return <Path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3.5 2-4.5.3 1.8 1.2 2.8 2.2 3C10.5 9 11 5.5 12 3z" {...s} strokeWidth={2.2} />;
      case 'power': return <><Path d="M12 3v8" {...s} strokeWidth={2.6} /><Path d="M7 6.5a7 7 0 1010 0" {...s} strokeWidth={2.4} /></>;
      case 'eye': return <><Path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" {...s} strokeWidth={2.2} /><Circle cx={12} cy={12} r={3} {...s} strokeWidth={2.2} /></>;
      case 'doc': return <><Path d="M6 3h8l4 4v14H6z" {...s} strokeWidth={2.2} /><Path d="M14 3v4h4M9 12h6M9 16h6" {...s} strokeWidth={2.2} /></>;
      case 'share': return <><Path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" {...s} strokeWidth={2.4} /><Path d="M5 12v8h14v-8" {...s} strokeWidth={2.2} /></>;
      case 'plus': return <Path d="M12 5v14M5 12h14" {...s} strokeWidth={2.8} />;
      case 'target': return <><Circle cx={12} cy={12} r={7} {...s} strokeWidth={2.2} /><Circle cx={12} cy={12} r={2} {...s} strokeWidth={2.4} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...s} strokeWidth={2.2} /></>;
      case 'users': return <><Circle cx={9} cy={8} r={3.2} {...s} strokeWidth={2.2} /><Path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 010 6M18 14c2 .8 3 2.8 3 6" {...s} strokeWidth={2.2} /></>;
      case 'menu': return <Path d="M4 7h16M4 12h16M4 17h16" {...s} strokeWidth={2.6} />;
      case 'flask': return <Path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 001.3 2h12.4a1.5 1.5 0 001.3-2L14 9V3M7.5 14h9" {...s} strokeWidth={2.2} />;
      case 'phone': return <Path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 006.5 6.5L16 14l4 1.5V19a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" {...s} strokeWidth={2.2} />;
      case 'bolt': return <Path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" fill={color} />;
    }
  })();
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}
