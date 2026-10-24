import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { Chess, Move, Square } from 'chess.js';
import { Side } from '../lib/types';
import { GraphicsQuality, ThreeCameraPreset, ThreePieceStyle } from '../lib/preferences';
import { palette } from './theme';

export type { ThreePieceStyle } from '../lib/preferences';
type Props = { fen: string; moves?: Move[]; orientation: Side; pieceStyle?: ThreePieceStyle; quality?: GraphicsQuality; showCoordinates?: boolean; cameraPreset?: ThreeCameraPreset; onMove?: (from: Square, to: Square) => void };
type SceneState = { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; pieces: THREE.Group; captured: THREE.Group; board: THREE.Group; hints: THREE.Group; effects: THREE.Group; supportsInstancing: boolean; gl: ExpoWebGLRenderingContext };
type CombatState = { from: Square; to: Square; initialFen: string; startedAt: number; attacker: THREE.Group; victim: THREE.Group; origin: THREE.Vector3; target: THREE.Vector3; slash: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> };
const files = 'abcdefgh';
const mobileMudTextures = new Map<string, THREE.DataTexture>();
const hintMaterial = new THREE.MeshBasicMaterial({ color: '#c9ff83', transparent: true, opacity: .96, depthWrite: false, depthTest: false });
const selectedHintMaterial = new THREE.MeshBasicMaterial({ color: '#ffdb87', transparent: true, opacity: .98, depthWrite: false, depthTest: false });
const hintDotGeometry = new THREE.SphereGeometry(.052, 8, 6);
const hintCenterGeometry = new THREE.SphereGeometry(.125, 12, 8);

function muddySquareTexture(light: boolean, variant: number) {
  const key = `${light}-${variant}`;
  const cached = mobileMudTextures.get(key);
  if (cached) return cached;
  const data = new Uint8Array(64 * 64 * 4);
  const base = light ? [186, 160, 118] : [105, 94, 66];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const coarse = ((Math.imul(x >> 3, 37) ^ Math.imul(y >> 3, 83) ^ variant * 71) & 31) - 15;
    const grain = ((Math.imul(x, 17) ^ Math.imul(y, 29) ^ variant * 13) & 15) - 7;
    const puddle = ((x - (20 + variant * 7)) ** 2 / 240 + (y - (42 - variant * 5)) ** 2 / 85) < 1 ? -24 : 0;
    const offset = (y * 64 + x) * 4;
    data[offset] = Math.max(0, base[0] + coarse + grain + puddle);
    data[offset + 1] = Math.max(0, base[1] + coarse + grain + puddle);
    data[offset + 2] = Math.max(0, base[2] + coarse + grain + puddle / 2);
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  mobileMudTextures.set(key, texture);
  return texture;
}

function drawLegalHints(hints: THREE.Group, chess: Chess, selected: Square | null, supportsInstancing: boolean) {
  hints.clear();
  if (!selected) return;
  const selectedDots: THREE.Vector3[] = []; const moveDots: THREE.Vector3[] = []; const centerDots: THREE.Vector3[] = [];
  const markRing = (square: Square, radius: number, count: number, positions: THREE.Vector3[]) => {
    const x = files.indexOf(square[0]) - 3.5;
    const z = 8 - Number(square[1]) - 3.5;
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count;
      positions.push(new THREE.Vector3(x + Math.cos(angle) * radius, .2, z + Math.sin(angle) * radius));
    }
  };
  markRing(selected, .39, 12, selectedDots);
  chess.moves({ square: selected, verbose: true }).forEach((move) => {
    if (move.captured || move.flags.includes('e')) markRing(move.to, .34, 12, moveDots);
    else {
      centerDots.push(new THREE.Vector3(files.indexOf(move.to[0]) - 3.5, .2, 8 - Number(move.to[1]) - 3.5));
      markRing(move.to, .23, 8, moveDots);
    }
  });
  const addInstances = (positions: THREE.Vector3[], geometry: THREE.BufferGeometry, material: THREE.Material) => {
    if (!positions.length) return;
    if (!supportsInstancing) {
      positions.forEach((position) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(position); hints.add(mesh); });
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const transform = new THREE.Object3D();
    positions.forEach((position, index) => { transform.position.copy(position); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    hints.add(mesh);
  };
  addInstances(selectedDots, hintDotGeometry, selectedHintMaterial);
  addInstances(moveDots, hintDotGeometry, hintMaterial);
  addInstances(centerDots, hintCenterGeometry, hintMaterial);
}
const rankGlyphs: Record<string, string[]> = {
  p: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  n: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  b: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  r: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  k: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
};
const rankTextures = new Map<string, THREE.DataTexture>();

function rankTexture(type: string, white: boolean) {
  const key = `${white ? 'w' : 'b'}-${type}`;
  const cached = rankTextures.get(key);
  if (cached) return cached;
  const data = new Uint8Array(64 * 64 * 4);
  const glyph = rankGlyphs[type] ?? rankGlyphs.p;
  const fill = white ? [244, 225, 173] : [104, 43, 34];
  const ink = white ? [49, 39, 25] : [255, 226, 162];
  const edge = [212, 168, 79];
  for (let y = 4; y < 61; y++) for (let x = 4; x < 60; x++) {
    const halfWidth = y < 12 ? 18 + (y - 4) : y < 39 ? 26 : 26 - (y - 39) * 1.1;
    if (Math.abs(x - 31.5) > halfWidth) continue;
    const letterX = Math.floor((x - 20) / 5);
    const letterY = Math.floor((y - 14) / 5);
    const letter = letterX >= 0 && letterX < 5 && letterY >= 0 && letterY < 7 && glyph[letterY][letterX] === '1';
    const border = y < 8 || y > 57 || Math.abs(x - 31.5) > halfWidth - 3;
    const color = letter ? ink : border ? edge : fill;
    const offset = ((63 - y) * 64 + x) * 4;
    data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  rankTextures.set(key, texture);
  return texture;
}

function addRankMarker(root: THREE.Group, type: string, white: boolean) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const height = (bounds.max.y - root.position.y) / root.scale.y;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: rankTexture(type, white), transparent: true, depthWrite: false, depthTest: false }));
  marker.position.set(0, height + .25, 0);
  marker.scale.set(.34, .34, 1);
  marker.userData.rankMarker = true;
  root.add(marker);
}

function addPiece(group: THREE.Group, piece: { type: string; color: string }, x: number, z: number, square: string, style: ThreePieceStyle, quality: GraphicsQuality) {
  const white = piece.color === 'w';
  const segments = quality === 'low' ? 8 : quality === 'medium' ? 14 : 20;
  const paletteByStyle: Record<ThreePieceStyle, [string, string]> = {
    warrior: white ? ['#EEE6D5', '#C7AD80'] : ['#24322D', '#6C8A70'], obsidian: white ? ['#D6D9D5', '#5C6B65'] : ['#101817', '#3C4A46'], royal: white ? ['#F2E4B9', '#C4933E'] : ['#26345A', '#A8C8E8'],
    bharat: white ? ['#F0DFBE', '#C58B35'] : ['#173B2D', '#E07B39'], frontier: white ? ['#E7D6AF', '#B86F3C'] : ['#273B2B', '#B54D37'], rangers: white ? ['#E9E0C8', '#8EAFBD'] : ['#172D3C', '#4B9AC4'], redstar: white ? ['#E8D5AE', '#C79D55'] : ['#321F25', '#B33A32'], dragon: white ? ['#EAD8B7', '#B8A25C'] : ['#243347', '#B84B39'], lanka: white ? ['#F0DFBA', '#D2A64B'] : ['#27354A', '#C65A43'], family: white ? ['#4D9AA4', '#E0AB55'] : ['#70466F', '#EF7B4D'],
  };
  const colors = paletteByStyle[style];
  const material = new THREE.MeshStandardMaterial({ color: colors[0], roughness: style === 'warrior' ? .37 : .24, metalness: style === 'royal' ? .52 : .16 });
  const trim = new THREE.MeshStandardMaterial({ color: colors[1], roughness: .3, metalness: .42 });
  const root = new THREE.Group(); root.position.set(x, .13, z); root.scale.setScalar(.01); root.userData.square = square; root.userData.spawnedAt = Date.now();
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material, y: number) => { const mesh = new THREE.Mesh(geometry, mat); mesh.position.y = y; mesh.castShadow = true; root.add(mesh); };
  if (style === 'family') {
    const skin = new THREE.MeshStandardMaterial({ color: white ? '#C88662' : '#8B5B46', roughness: .82 });
    const hair = new THREE.MeshStandardMaterial({ color: white ? '#51382E' : '#171B2C', roughness: .88 });
    const block = (size: [number, number, number], mat: THREE.Material, y: number, x = 0, z = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); mesh.position.set(x, y, z); mesh.castShadow = true; root.add(mesh); };
    block([.58, .16, .58], trim, .08); block([.4, .42, .3], material, .42); block([.28, .26, .26], skin, .82); block([.34, .07, .32], hair, 1.0);
    const face = new THREE.MeshStandardMaterial({ color: '#24201E', roughness: .9 });
    block([.035, .04, .018], face, .85, -.065, .139);
    block([.035, .04, .018], face, .85, .065, .139);
    block([.09, .015, .018], face, .74, 0, .139);
    root.rotation.y = white ? Math.PI : 0;
    block([.13, .3, .14], material, .44, -.25); block([.13, .3, .14], material, .44, .25); block([.16, .28, .18], trim, .13, -.12); block([.16, .28, .18], trim, .13, .12);
    if (piece.type === 'k') { block([.38, .08, .38], trim, 1.08); block([.08, .16, .08], trim, 1.2); block([.5, .08, .06], trim, .58, 0, -.17); }
    if (piece.type === 'q') { block([.42, .14, .34], hair, 1.02); block([.38, .06, .34], trim, 1.13); }
    if (piece.type === 'r') block([.46, .18, .38], trim, .9);
    if (piece.type === 'b') block([.34, .22, .34], trim, 1.02);
    if (piece.type === 'n') { block([.58, .28, .72], material, .56, 0, .12); block([.3, .4, .34], material, .86, 0, .34); }
    addRankMarker(root, piece.type, white);
    group.add(root); return root;
  }
  add(new THREE.CylinderGeometry(.32, .38, .16, segments), material, .08);
  add(new THREE.CylinderGeometry(.26, .31, .13, segments), trim, .21);
  if (piece.type === 'p') { add(new THREE.CylinderGeometry(.13, .21, .40, segments), material, .48); add(new THREE.SphereGeometry(.18, segments, Math.max(6, segments - 4)), material, .77); }
  if (piece.type === 'r') { add(new THREE.CylinderGeometry(.24, .28, .64, segments), material, .59); add(new THREE.CylinderGeometry(.32, .26, .17, segments), trim, .98); for (let i = 0; i < 4; i++) { const cube = new THREE.Mesh(new THREE.BoxGeometry(.18,.17,.18), material); cube.position.set(Math.sin(i*Math.PI/2)*.22,1.14,Math.cos(i*Math.PI/2)*.22); root.add(cube); } }
  if (piece.type === 'n') { add(new THREE.CylinderGeometry(.18,.27,.35,segments), material,.45); const head = new THREE.Mesh(new THREE.ConeGeometry(.32,.67,Math.max(4, Math.floor(segments / 2))), material); head.position.set(-.08,.91,0); head.rotation.z = -.3; root.add(head); add(new THREE.SphereGeometry(.055,Math.max(6, segments - 4),6), trim, 1.08); }
  if (piece.type === 'b') { add(new THREE.CylinderGeometry(.17,.27,.52,segments), material,.52); add(new THREE.SphereGeometry(.25,segments,Math.max(6, segments - 4)), material,.94); add(new THREE.ConeGeometry(.17,.34,segments), trim,1.23); }
  if (piece.type === 'q' || piece.type === 'k') { add(new THREE.CylinderGeometry(.19,.29,.66,segments), material,.62); add(new THREE.CylinderGeometry(.32,.20,.16,segments),trim,1.01); if (piece.type === 'q') { for (let i=0;i<5;i++) { const gem=new THREE.Mesh(new THREE.SphereGeometry(.11,Math.max(6, segments - 4),6),trim); gem.position.set(Math.sin(i*Math.PI*2/5)*.24,1.16,Math.cos(i*Math.PI*2/5)*.24);root.add(gem); } } else { const stem=new THREE.Mesh(new THREE.BoxGeometry(.11,.42,.11),trim);stem.position.y=1.29;root.add(stem); const cross=new THREE.Mesh(new THREE.BoxGeometry(.34,.10,.11),trim);cross.position.y=1.33;root.add(cross); } }
  if (!['warrior', 'obsidian', 'royal'].includes(style)) {
    const accent = new THREE.MeshStandardMaterial({ color: colors[1], roughness: .38, metalness: .3 });
    if (piece.type === 'p' || piece.type === 'r') add(new THREE.BoxGeometry(.28, .08, .22), accent, piece.type === 'p' ? .56 : .72);
    if (piece.type === 'n') { const plume = new THREE.Mesh(new THREE.ConeGeometry(.07, .3, 8), accent); plume.position.set(.02, 1.25, 0); root.add(plume); }
    if (piece.type === 'b' || piece.type === 'q') { const sash = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 20), accent); sash.rotation.x = Math.PI / 2; sash.position.y = .62; root.add(sash); }
    if (piece.type === 'k') { const crest = new THREE.Mesh(new THREE.ConeGeometry(.1, .2, 6), accent); crest.position.y = 1.36; root.add(crest); }
  }
  addRankMarker(root, piece.type, white);
  group.add(root); return root;
}

export function ThreeBoard({ fen, moves = [], orientation, pieceStyle = 'warrior', quality = 'medium', showCoordinates = true, cameraPreset = 'angle', onMove }: Props) {
  const state = useRef<SceneState | null>(null); const frame = useRef<number | null>(null);
  const [angle, setAngle] = useState(0); const [selected, setSelected] = useState<Square | null>(null);
  const combat = useRef<CombatState | null>(null);
  const onMoveRef = useRef(onMove);
  const [size, setSize] = useState({ width: 350, height: 350 });
  const fenRef = useRef(fen);
  const angleRef = useRef(angle);
  const orientationRef = useRef(orientation);
  const cameraPresetRef = useRef(cameraPreset);
  const syncPieces = useCallback(() => {
    if (!state.current) return;
    const { pieces, captured, hints, effects } = state.current;
    if (combat.current) { effects.remove(combat.current.slash); combat.current.slash.geometry.dispose(); combat.current.slash.material.dispose(); combat.current = null; }
    hints.clear();
    for (const group of [pieces, captured]) {
      group.children.forEach((root) => root.traverse((obj) => { const mesh = obj as THREE.Mesh; mesh.geometry?.dispose?.(); }));
      group.clear();
    }
    const chess = new Chess(fenRef.current);
    chess.board().forEach((rank, row) => rank.forEach((piece, col) => { if (piece) addPiece(pieces, piece, col - 3.5, row - 3.5, `${files[col]}${8-row}`, pieceStyle, quality); }));
    const capturedValue = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
    const bySide = (side: Side) => moves.filter((move) => move.color === side && move.captured).sort((a, b) => capturedValue[b.captured!] - capturedValue[a.captured!]);
    bySide('w').forEach((move, index) => { const root = addPiece(captured, { type: move.captured!, color: 'b' }, -3.5 + index % 8, 4.95 + Math.floor(index / 8) * .5, '', pieceStyle, quality); root.userData.captured = true; });
    bySide('b').forEach((move, index) => { const root = addPiece(captured, { type: move.captured!, color: 'w' }, -3.5 + index % 8, -4.95 - Math.floor(index / 8) * .5, '', pieceStyle, quality); root.userData.captured = true; });
  }, [pieceStyle, quality, moves]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { fenRef.current = fen; syncPieces(); }, [fen, syncPieces]);
  useEffect(() => { angleRef.current = angle; orientationRef.current = orientation; cameraPresetRef.current = cameraPreset; if (!state.current) return; const theta = angle * Math.PI / 180 + (orientation === 'w' ? 0 : Math.PI); const position = cameraPreset === 'top' ? [0, 15.5, .01] : cameraPreset === 'side' ? [Math.cos(theta) * 12, 4.2, Math.sin(theta) * 12] : [Math.sin(theta) * 10, cameraPreset === 'cinema' ? 7.2 : 9.2, Math.cos(theta) * 10]; state.current.camera.position.set(position[0], position[1], position[2]); state.current.camera.lookAt(0, 0, 0); }, [angle, orientation, cameraPreset]);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); state.current?.renderer.dispose(); state.current = null; }, []);
  const onCreate = async (gl: ExpoWebGLRenderingContext) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#16231D');
    const camera = new THREE.PerspectiveCamera(45, gl.drawingBufferWidth / gl.drawingBufferHeight, .1, 100);
    const theta = angleRef.current * Math.PI / 180 + (orientationRef.current === 'w' ? 0 : Math.PI); const preset = cameraPresetRef.current;
    const initialPosition = preset === 'top' ? [0, 15.5, .01] : preset === 'side' ? [Math.cos(theta) * 12, 4.2, Math.sin(theta) * 12] : [Math.sin(theta) * 10, preset === 'cinema' ? 7.2 : 9.2, Math.cos(theta) * 10];
    camera.position.set(initialPosition[0], initialPosition[1], initialPosition[2]); camera.lookAt(0,0,0);
    const canvas = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => gl } as unknown as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGLRenderingContext, antialias: quality !== 'low' });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false); renderer.setClearColor('#16231D');
    renderer.shadowMap.enabled = quality === 'high';
    const ambient = new THREE.AmbientLight('#FFFFFF', 2); scene.add(ambient);
    const key = new THREE.DirectionalLight('#FFF0D0', 2.7); key.position.set(4, 10, 6); key.castShadow = quality === 'high'; key.shadow.mapSize.set(1024, 1024); scene.add(key);
    const board = new THREE.Group(); scene.add(board);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(8.4,.22,8.4), new THREE.MeshStandardMaterial({ color: '#554A38', roughness: .54 })); edge.position.y=-.06;board.add(edge);
    for (let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const light = (r+c)%2===0;
      const material = pieceStyle === 'warrior'
        ? quality === 'low'
          ? new THREE.MeshStandardMaterial({ color: light ? '#b59a70' : '#6d7051', roughness: .9 })
          : new THREE.MeshStandardMaterial({ map: muddySquareTexture(light, (r*3+c)%4), roughness: .83, color: '#ffffff' })
        : new THREE.MeshStandardMaterial({ color: light ? '#EDE1C9' : '#789869', roughness: .78 });
      const sq = new THREE.Mesh(new THREE.BoxGeometry(.99,.12,.99), material);
      sq.position.set(c-3.5,.1,r-3.5); sq.userData.square=`${files[c]}${8-r}`; board.add(sq);
    }
    const pieces = new THREE.Group(); const captured = new THREE.Group(); const hints = new THREE.Group(); const effects = new THREE.Group(); scene.add(pieces, captured, hints, effects);
    const supportsInstancing = Boolean(gl.drawArraysInstanced || gl.getExtension('ANGLE_instanced_arrays'));
    state.current = { scene, camera, renderer, pieces, captured, board, hints, effects, supportsInstancing, gl }; syncPieces();
    const render = () => {
      const now = Date.now();
      [...pieces.children, ...captured.children].forEach((root) => {
        const elapsed = Math.min(1, (now - (root.userData.spawnedAt ?? now)) / 210);
        root.scale.setScalar((root.userData.captured ? .55 : 1) * (.82 + (1 - Math.pow(1 - elapsed, 3)) * .18));
      });
      const battle = combat.current;
      if (battle) {
        const progress = Math.min(1, (now - battle.startedAt) / 870);
        const approach = battle.target.clone().lerp(battle.origin, .22);
        if (progress < .52) battle.attacker.position.lerpVectors(battle.origin, approach, 1 - (1 - progress / .52) ** 3);
        else battle.attacker.position.lerpVectors(approach, battle.target, Math.min(1, (progress - .52) / .48));
        if (progress >= .52) {
          const impact = Math.min(1, (progress - .52) / .4);
          battle.attacker.rotation.z = Math.sin(impact * Math.PI) * .26;
          battle.victim.rotation.z = -impact * 1.25;
          battle.slash.material.opacity = Math.max(0, 1 - impact);
          battle.slash.scale.setScalar(.7 + impact * .7);
        }
        if (progress >= 1) {
          effects.remove(battle.slash); battle.slash.geometry.dispose(); battle.slash.material.dispose();
          battle.attacker.rotation.z = 0;
          combat.current = null;
          if (fenRef.current === battle.initialFen) onMoveRef.current?.(battle.from, battle.to);
        }
      }
      if (cameraPresetRef.current === 'cinema') {
        const orbit = now / 12000 + (orientationRef.current === 'w' ? 0 : Math.PI);
        camera.position.set(Math.sin(orbit) * 11, 7.2, Math.cos(orbit) * 11); camera.lookAt(0, 0, 0);
      }
      frame.current=requestAnimationFrame(render);
      renderer.render(scene,camera); gl.endFrameEXP();
    }; render();
  };
  const touch = (x: number, y: number, width: number, height: number) => {
    const current = state.current; if (!current) return;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, -(y / height) * 2 + 1), current.camera);
    const hit = ray.intersectObjects([current.pieces,current.board],true)[0];
    let node = hit?.object as THREE.Object3D | undefined; while (node && !node.userData.square) node = node.parent ?? undefined;
    const square = node?.userData.square as Square | undefined; if (!square) return;
    const chess = new Chess(fenRef.current);
    if (combat.current) return;
    const move = selected ? chess.moves({ square: selected, verbose: true }).find((candidate) => candidate.to === square) : null;
    if (move && selected) {
      current.hints.clear(); setSelected(null);
      if (move.captured || move.flags.includes('e')) {
        const attacker = current.pieces.children.find((piece) => piece.userData.square === selected) as THREE.Group | undefined;
        const victimSquare = move.flags.includes('e') ? `${square[0]}${selected[1]}` : square;
        const victim = current.pieces.children.find((piece) => piece.userData.square === victimSquare) as THREE.Group | undefined;
        if (attacker && victim) {
          const target = new THREE.Vector3(files.indexOf(square[0]) - 3.5, .13, 8 - Number(square[1]) - 3.5);
          const slashMaterial = new THREE.MeshBasicMaterial({ color: '#ffd277', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
          const slash = new THREE.Mesh(new THREE.TorusGeometry(.43, .035, 6, quality === 'low' ? 18 : 32, Math.PI * 1.3), slashMaterial);
          slash.position.set(target.x, .9, target.z); slash.rotation.z = -.75;
          current.effects.add(slash);
          combat.current = { from: selected, to: square, initialFen: fenRef.current, startedAt: Date.now(), attacker, victim, origin: attacker.position.clone(), target, slash };
          return;
        }
      }
      onMoveRef.current?.(selected, square);
      return;
    }
    const next = chess.get(square)?.color === chess.turn() ? square : null;
    setSelected(next);
    drawLegalHints(current.hints, chess, next, current.supportsInstancing);
  };
  const displayFiles = orientation === 'w' ? [...files] : [...files].reverse(); const displayRanks = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  return <View style={styles.container} onLayout={(event)=>setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}><GLView style={styles.gl} onContextCreate={onCreate} onTouchEnd={(event) => { const touchEvent=event.nativeEvent.changedTouches[0]; touch(touchEvent.locationX,touchEvent.locationY,size.width,size.height); }}/>{showCoordinates && <View pointerEvents="none" style={styles.coordinateOverlay}><View style={styles.fileCoordinates}>{displayFiles.map((file) => <Text key={file} style={styles.coordinate}>{file}</Text>)}</View><View style={styles.rankCoordinates}>{displayRanks.map((rank) => <Text key={rank} style={styles.coordinate}>{rank}</Text>)}</View></View>}<View style={styles.controls}><TouchableOpacity style={styles.control} onPress={()=>setAngle((v)=>v-30)}><Text style={styles.controlText}>↶</Text></TouchableOpacity><Text style={styles.hint}>{selected ? `Selected ${selected}` : 'Tap a piece, then a square'}</Text><TouchableOpacity style={styles.control} onPress={()=>setAngle((v)=>v+30)}><Text style={styles.controlText}>↷</Text></TouchableOpacity></View></View>;
}
const styles = StyleSheet.create({ container: { width: '100%', aspectRatio: 1, borderRadius: 15, overflow: 'hidden', backgroundColor: '#16231D' }, gl: { flex: 1 }, coordinateOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, fileCoordinates: { position: 'absolute', left: 22, right: 22, bottom: 48, flexDirection: 'row', justifyContent: 'space-around' }, rankCoordinates: { position: 'absolute', left: 7, top: 22, bottom: 55, justifyContent: 'space-around' }, coordinate: { color: '#F5D58A', fontSize: 9, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 3 }, controls: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, control: { backgroundColor: 'rgba(0,0,0,.45)', height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, controlText: { color: palette.text, fontSize: 25 }, hint: { color: palette.text, fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,.45)', borderRadius: 12, padding: 6 } });
