import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Chess, PieceSymbol, Square } from 'chess.js';
import Svg, { Line, Polygon } from 'react-native-svg';
import { Side } from '../lib/types';
import { boardThemes, BoardTheme, PieceFinish } from './theme';
import { PieceIcon } from './PieceIcon';
import { useGame } from '../state/GameContext';

type Arrow = { from: string; to: string; color?: string };
type Props = {
  fen: string;
  orientation?: Side;
  theme?: BoardTheme;
  pieceFinish?: PieceFinish;
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  enabled?: boolean;
  showCoordinates?: boolean;
  onMove?: (from: Square, to: Square, promotion?: string) => void;
  onSquare?: (square: Square) => void;
};
const files = 'abcdefgh';

export function ChessBoard({ fen, orientation = 'w', theme = 'ivory', pieceFinish, lastMove, arrows = [], enabled = true, showCoordinates = true, onMove, onSquare }: Props) {
  const { pieceFinish: globalFinish } = useGame();
  const game = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [width, setWidth] = useState(320);
  const activeSelected = selected && game.get(selected)?.color === game.turn() ? selected : null;
  const legal = activeSelected ? game.moves({ square: activeSelected, verbose: true }) : [];
  const ranks = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const columns = orientation === 'w' ? [...files] : [...files].reverse();
  const themeColors = boardThemes[theme];
  const coordinate = (square: string) => {
    const col = columns.indexOf(square[0]); const row = ranks.indexOf(Number(square[1]));
    return { x: (col + .5) * width / 8, y: (row + .5) * width / 8 };
  };
  const handle = (square: Square) => {
    onSquare?.(square);
    if (!enabled) return;
    const matching = legal.find((move) => move.to === square);
    if (activeSelected && matching) {
      if (matching.flags.includes('p')) {
        // Promotion choice is handled by the containing screen.
        onMove?.(activeSelected, square, 'q');
      } else onMove?.(activeSelected, square);
      setSelected(null); return;
    }
    const piece = game.get(square);
    setSelected(piece?.color === game.turn() ? square : null);
  };
  const measure = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => Math.abs(current - next) > 1 ? next : current);
  };
  return <View onLayout={measure} style={[styles.edge, { backgroundColor: themeColors.edge }]}>
    <View style={styles.board}>
      {ranks.map((rank, row) => <View style={styles.row} key={rank}>
        {columns.map((file, col) => {
          const square = `${file}${rank}` as Square;
          const piece = game.get(square);
          const light = (row + col) % 2 === 0;
          const target = legal.some((move) => move.to === square);
          const isCheck = piece?.type === 'k' && piece.color === game.turn() && game.isCheck();
          const highlighted = lastMove?.from === square || lastMove?.to === square;
          return <Pressable key={square} accessibilityRole="button" accessibilityLabel={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`} onPress={() => handle(square)}
            style={[styles.square, { backgroundColor: activeSelected === square ? '#B8D66A' : isCheck ? '#E78374' : highlighted ? '#C7D388' : light ? themeColors.light : themeColors.dark }]}>
            {showCoordinates && col === 0 && <Text style={[styles.rank, { color: light ? themeColors.dark : themeColors.light }]}>{rank}</Text>}
            {showCoordinates && row === 7 && <Text style={[styles.file, { color: light ? themeColors.dark : themeColors.light }]}>{file}</Text>}
            {target && <View style={piece ? styles.capture : styles.dot}/>}
            {piece && <PieceIcon type={piece.type as PieceSymbol} color={piece.color} finish={pieceFinish ?? globalFinish} size={Math.max(28, width / 8 * .87)}/>}
          </Pressable>;
        })}
      </View>)}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={width}>
        {arrows.map((arrow, index) => {
          if (!files.includes(arrow.from[0]) || !files.includes(arrow.to[0])) return null;
          const a = coordinate(arrow.from), b = coordinate(arrow.to);
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const stop = { x: b.x - Math.cos(angle) * width / 20, y: b.y - Math.sin(angle) * width / 20 };
          const size = width / 28;
          const points = `${b.x},${b.y} ${stop.x + Math.sin(angle) * size},${stop.y - Math.cos(angle) * size} ${stop.x - Math.sin(angle) * size},${stop.y + Math.cos(angle) * size}`;
          return <React.Fragment key={`${arrow.from}${arrow.to}${index}`}><Line x1={a.x} y1={a.y} x2={stop.x} y2={stop.y} stroke={arrow.color ?? '#8BE356'} strokeWidth={width / 46} strokeLinecap="round" opacity={.82}/><Polygon points={points} fill={arrow.color ?? '#8BE356'} opacity={.9}/></React.Fragment>;
        })}
      </Svg>
    </View>
  </View>;
}
const styles = StyleSheet.create({ edge: { width: '100%', aspectRatio: 1, flexShrink: 0, alignSelf: 'center', padding: 3, borderRadius: 8, overflow: 'hidden' }, board: { width: '100%', height: '100%', flex: 0, borderRadius: 4, overflow: 'hidden' }, row: { height: '12.5%', flexDirection: 'row' }, square: { width: '12.5%', height: '100%', alignItems: 'center', justifyContent: 'center' }, rank: { position: 'absolute', top: 2, left: 3, fontSize: 9, fontWeight: '800' }, file: { position: 'absolute', bottom: 1, right: 3, fontSize: 9, fontWeight: '800' }, dot: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: 'rgba(20,45,24,.35)' }, capture: { position: 'absolute', width: '90%', height: '90%', borderRadius: 100, borderColor: 'rgba(32,72,35,.6)', borderWidth: 4 } });
