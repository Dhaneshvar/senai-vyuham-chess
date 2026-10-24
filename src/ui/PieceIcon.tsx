import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { PieceSymbol } from 'chess.js';
import { Side } from '../lib/types';
import { PieceFinish } from './theme';

export function PieceIcon({ type, color, size = 42, finish = 'ivory' }: { type: PieceSymbol; color: Side; size?: number; finish?: PieceFinish }) {
  const light = color === 'w';
  const finishes = { ivory: { fill: ['#FFF9EA', '#24312A'], stroke: ['#665E50', '#101A14'], detail: ['#D1BEA0', '#57705A'] }, onyx: { fill: ['#D7DED8', '#101819'], stroke: ['#53665B', '#030807'], detail: ['#9AAFA4', '#526A5A'] }, gold: { fill: ['#FFE1A0', '#523715'], stroke: ['#895B24', '#2D1B0B'], detail: ['#F5BD5B', '#D69742'] } } as const;
  const colors = finishes[finish]; const index = light ? 0 : 1;
  const fill = colors.fill[index];
  const stroke = colors.stroke[index];
  const detail = colors.detail[index];
  const common = { fill, stroke, strokeWidth: 1.8, strokeLinejoin: 'round' as const };
  return <Svg width={size} height={size} viewBox="0 0 48 48">
    <Ellipse cx="24" cy="42" rx="17" ry="3" fill="rgba(0,0,0,.16)" />
    {type === 'p' && <><Circle cx="24" cy="13" r="6" {...common}/><Path d="M19 20Q15 26 18 33H30Q33 26 29 20Z" {...common}/><Path d="M16 34H32L35 39H13Z" {...common}/></>}
    {type === 'r' && <><Path d="M13 8H18V12H21V8H27V12H30V8H35L33 17H15Z" {...common}/><Path d="M17 18H31L30 33H18Z" {...common}/><Path d="M15 34H33L36 39H12Z" {...common}/><Path d="M20 20H28" stroke={detail} strokeWidth="2"/></>}
    {type === 'n' && <><Path d="M14 36Q16 29 14 22L10 19L17 13L19 8L26 10L33 17L31 25L26 25L24 32L33 36L35 39H12Z" {...common}/><Circle cx="23" cy="17" r="1.8" fill={detail}/><Path d="M11 19L19 21" stroke={detail} strokeWidth="2"/></>}
    {type === 'b' && <><Path d="M24 6C19 10 16 15 17 21C18 26 21 28 19 33H29C27 28 30 26 31 21C32 15 29 10 24 6Z" {...common}/><Path d="M27 12L21 24" stroke={detail} strokeWidth="2.3"/><Circle cx="24" cy="6" r="2" {...common}/><Path d="M16 34H32L35 39H13Z" {...common}/></>}
    {type === 'q' && <><Circle cx="9" cy="12" r="2.5" {...common}/><Circle cx="19" cy="8" r="2.5" {...common}/><Circle cx="29" cy="8" r="2.5" {...common}/><Circle cx="39" cy="12" r="2.5" {...common}/><Path d="M10 16L15 31H33L38 16L29 24L24 16L19 24Z" {...common}/><Path d="M15 33H33L36 39H12Z" {...common}/><Path d="M18 28H30" stroke={detail} strokeWidth="2"/></>}
    {type === 'k' && <><Path d="M24 5V17M18 11H30" stroke={stroke} strokeWidth="4" strokeLinecap="round"/><Path d="M18 17Q15 21 18 27L20 33H28L30 27Q33 21 30 17Z" {...common}/><Rect x="18" y="17" width="12" height="4" rx="2" {...common}/><Path d="M15 34H33L36 39H12Z" {...common}/><Path d="M20 27H28" stroke={detail} strokeWidth="2"/></>}
    <Path d="M12 40H36" stroke={stroke} strokeWidth="1.5" />
  </Svg>;
}
