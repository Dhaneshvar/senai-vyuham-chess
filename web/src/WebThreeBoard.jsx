import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Chess } from 'chess.js';
import { medievalModelUrls } from './medievalAssets';

const files = 'abcdefgh';
const presets = {
  warrior: { label: 'Kingdom', white: '#efe3ce', black: '#1f2d28', trim: '#b89762', light: '#e5d8c1', dark: '#71946b' },
  obsidian: { label: 'Obsidian', white: '#d9ddd7', black: '#111918', trim: '#576c65', light: '#a7b5ae', dark: '#354a46' },
  royal: { label: 'Royal', white: '#f3e2b0', black: '#25365f', trim: '#bb8d32', light: '#e7dec4', dark: '#577e91' },
  bharat: { label: 'Bharat Guard', white: '#f0dfbe', black: '#173b2d', trim: '#c58b35', light: '#d9e2b6', dark: '#6d8c63', accent: '#e07b39' },
  frontier: { label: 'Frontier Guard', white: '#e7d6af', black: '#273b2b', trim: '#b86f3c', light: '#d7d2a7', dark: '#6d815b', accent: '#b54d37' },
  rangers: { label: 'Ranger Corps', white: '#e9e0c8', black: '#172d3c', trim: '#8eafbd', light: '#d7ded0', dark: '#688b86', accent: '#4b9ac4' },
  redstar: { label: 'Red Star Guard', white: '#e8d5ae', black: '#321f25', trim: '#c79d55', light: '#ded0aa', dark: '#58745e', accent: '#b33a32' },
  dragon: { label: 'Dragon Guard', white: '#ead8b7', black: '#243347', trim: '#b8a25c', light: '#d4dfc0', dark: '#5f7f88', accent: '#b84b39' },
  lanka: { label: 'Lanka Guard', white: '#f0dfba', black: '#27354a', trim: '#d2a64b', light: '#d9e3c4', dark: '#6e8c73', accent: '#c65a43' },
  family: { label: 'Family Squad', white: '#f3e2c1', black: '#2d3553', trim: '#e0ab55', light: '#d9e7cf', dark: '#5d7890', accent: '#e27b4f' },
};
const importedCharacterStyles = new Set(['warrior']);
const riggedArmyStyles = new Set(['bharat', 'frontier', 'rangers', 'redstar', 'dragon', 'lanka', 'family']);
const modelLoader = new GLTFLoader();
const modelCache = new Map();
const markerTextureCache = new Map();
const rankProfile = {
  p: { height: .92, base: .25, sides: 20, glyph: 'P' },
  n: { height: 1.12, base: .3, sides: 4, glyph: 'N' },
  b: { height: 1.2, base: .3, sides: 6, glyph: 'B' },
  r: { height: 1.25, base: .34, sides: 4, glyph: 'R' },
  q: { height: 1.38, base: .34, sides: 8, glyph: 'Q' },
  k: { height: 1.5, base: .36, sides: 8, glyph: 'K' },
};
const mudTextureCache = new Map();
const hintDotGeometry = new THREE.SphereGeometry(.045, 8, 6);
const hintCenterGeometry = new THREE.SphereGeometry(.115, 12, 8);
const hintDotMaterial = new THREE.MeshBasicMaterial({ color: '#c9ff83', transparent: true, opacity: .94, depthWrite: false, depthTest: false });
const selectedDotMaterial = new THREE.MeshBasicMaterial({ color: '#ffdb87', transparent: true, opacity: .98, depthWrite: false, depthTest: false });
const safeChess = (fen) => { try { return new Chess(fen); } catch { return null; } };

function mudTexture(light, variant) {
  const key = `${light}-${variant}`;
  if (mudTextureCache.has(key)) return mudTextureCache.get(key);
  const pixels = new Uint8Array(64 * 64 * 4);
  const base = light ? [186, 160, 118] : [105, 94, 66];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const coarse = ((Math.imul(x >> 3, 37) ^ Math.imul(y >> 3, 83) ^ variant * 71) & 31) - 15;
    const grain = ((Math.imul(x, 17) ^ Math.imul(y, 29) ^ variant * 13) & 15) - 7;
    const puddleX = 20 + variant * 7; const puddleY = 42 - variant * 5;
    const puddle = ((x - puddleX) ** 2 / 240 + (y - puddleY) ** 2 / 85) < 1 ? -24 : 0;
    const offset = (y * 64 + x) * 4;
    pixels[offset] = Math.max(0, base[0] + coarse + grain + puddle);
    pixels[offset + 1] = Math.max(0, base[1] + coarse + grain + puddle);
    pixels[offset + 2] = Math.max(0, base[2] + coarse + grain + puddle / 2);
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, 64, 64, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  mudTextureCache.set(key, texture);
  return texture;
}

function boardSquareMaterial(style, row, col, quality) {
  const colors = presets[style];
  if (style === 'warrior') {
    const light = (row + col) % 2 === 0;
    if (quality === 'low') return new THREE.MeshPhysicalMaterial({ color: light ? '#b59a70' : '#6d7051', roughness: .9 });
    return new THREE.MeshPhysicalMaterial({ map: mudTexture(light, (row * 3 + col) % 4), color: '#ffffff', roughness: .8, clearcoat: quality === 'high' ? .18 : .08 });
  }
  return new THREE.MeshPhysicalMaterial({ color: (row + col) % 2 ? colors.dark : colors.light, roughness: .58, clearcoat: .18, emissive: '#000000' });
}

function drawMoveHints(hints, chess, source) {
  hints.clear();
  if (!source) return;
  const selectedDots = []; const moveDots = []; const centerDots = [];
  const addDots = (square, radius, count, positions) => {
    const center = boardPosition(square, .23);
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count;
      positions.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius));
    }
  };
  addDots(source, .39, 12, selectedDots);
  chess.moves({ square: source, verbose: true }).forEach((move) => {
    if (move.captured || move.flags.includes('e')) addDots(move.to, .35, 12, moveDots);
    else {
      centerDots.push(boardPosition(move.to, .23));
      addDots(move.to, .23, 8, moveDots);
    }
  });
  const addInstances = (positions, geometry, material) => {
    if (!positions.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const transform = new THREE.Object3D();
    positions.forEach((position, index) => { transform.position.copy(position); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    hints.add(mesh);
  };
  addInstances(selectedDots, hintDotGeometry, selectedDotMaterial);
  addInstances(moveDots, hintDotGeometry, hintDotMaterial);
  addInstances(centerDots, hintCenterGeometry, hintDotMaterial);
}

function loadMedievalModel(piece) {
  const url = medievalModelUrls[piece.color]?.[piece.type];
  if (!url) return Promise.reject(new Error('Missing medieval model'));
  if (!modelCache.has(url)) modelCache.set(url, modelLoader.loadAsync(url).then((gltf) => gltf.scene));
  return modelCache.get(url).then((source) => source.clone(true));
}

function normalizeMedievalModel(model, piece, style = 'warrior') {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true; child.receiveShadow = true;
    if (child.material) {
      child.material = Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone();
      const colors = presets[style] ?? presets.warrior;
      const tint = new THREE.Color(piece.color === 'w' ? colors.white : colors.black);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.color) material.color.lerp(tint, style === 'warrior' ? .04 : .16);
        if (style !== 'warrior' && material.roughness != null) material.roughness = Math.min(.82, material.roughness + .08);
      });
    }
  });
  const box = new THREE.Box3().setFromObject(model); const size = box.getSize(new THREE.Vector3());
  const scale = rankProfile[piece.type].height / Math.max(size.y, .001); model.scale.setScalar(scale); model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model); const center = fitted.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -fitted.min.y, -center.z); model.rotation.y = piece.color === 'w' ? Math.PI : 0;
  return model;
}

function rankMarker(piece, captured = false, characterHeight = rankProfile[piece.type].height) {
  const key = `${piece.color}-${piece.type}`;
  if (!markerTextureCache.has(key)) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const context = canvas.getContext('2d');
    const light = piece.color === 'w'; context.clearRect(0, 0, 128, 128); context.fillStyle = light ? '#f4e1ad' : '#682b22'; context.strokeStyle = '#d4a84f'; context.lineWidth = 8;
    context.beginPath(); context.moveTo(64, 7); context.lineTo(112, 34); context.lineTo(102, 94); context.lineTo(64, 121); context.lineTo(26, 94); context.lineTo(16, 34); context.closePath(); context.fill(); context.stroke();
    context.fillStyle = light ? '#312719' : '#ffe2a2'; context.font = '900 66px Georgia'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(rankProfile[piece.type].glyph, 64, 63);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; markerTextureCache.set(key, texture);
  }
  const material = new THREE.SpriteMaterial({ map: markerTextureCache.get(key), transparent: true, opacity: captured ? .62 : .9, depthWrite: false }); const marker = new THREE.Sprite(material);
  marker.position.set(0, characterHeight + .26, 0); marker.scale.set(.28, .28, .28); marker.userData.rankMarker = true; return marker;
}

function coordinateLabel(text, x, z) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d'); context.clearRect(0, 0, 128, 128); context.fillStyle = '#f5d58a';
  context.font = '900 66px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 64, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  label.position.set(x, .28, z); label.scale.set(.28, .28, .28); return label;
}

function decorateCharacter(root, piece, captured = false) {
  const profile = rankProfile[piece.type]; const light = piece.color === 'w';
  root.updateMatrixWorld(true);
  const characterBounds = new THREE.Box3().setFromObject(root);
  const characterHeight = Math.max(profile.height, (characterBounds.max.y - root.position.y) / root.scale.y);
  const baseMaterial = new THREE.MeshPhysicalMaterial({ color: light ? '#d9c28e' : '#40251f', metalness: .42, roughness: .38, clearcoat: .25 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(profile.base * .86, profile.base, captured ? .055 : .075, profile.sides), baseMaterial); pedestal.position.y = .03; pedestal.castShadow = true; root.add(pedestal, rankMarker(piece, captured, characterHeight));
}

function capturedFromMoves(moves) {
  return (moves ?? []).filter((move) => move.captured || move.flags?.includes('e')).map((move) => ({ type: move.captured ?? 'p', color: move.color === 'w' ? 'b' : 'w' }));
}

function boardPosition(square, y = .13) {
  if (!square) return new THREE.Vector3(0, y, 0);
  return new THREE.Vector3(files.indexOf(square[0]) - 3.5, y, 8 - Number(square[1]) - 3.5);
}

function makeArrestCage() {
  const group = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({ color: '#303a35', emissive: '#101510', emissiveIntensity: .25, metalness: .86, roughness: .28, clearcoat: .72 });
  const edge = new THREE.MeshPhysicalMaterial({ color: '#91ae83', emissive: '#425d37', emissiveIntensity: .32, metalness: .8, roughness: .22, clearcoat: .8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#101510', metalness: .55, roughness: .3 });
  const bars = new THREE.Group();
  for (let i = 0; i < 12; i += 1) { const angle = (i / 12) * Math.PI * 2; const bar = new THREE.Mesh(new THREE.CylinderGeometry(.027, .035, 1.48, 10), metal); bar.position.set(Math.cos(angle) * .38, .81, Math.sin(angle) * .38); bar.castShadow = true; bars.add(bar); }
  [.15, .78, 1.42].forEach((y, index) => { const rail = new THREE.Mesh(new THREE.TorusGeometry(index === 2 ? .4 : .44, .035, 8, 32), index === 2 ? edge : metal); rail.position.y = y; rail.castShadow = true; bars.add(rail); });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.43, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal); dome.position.y = 1.42; dome.scale.y = .95; dome.castShadow = true;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, .12, 12), edge); roof.position.y = 1.83; roof.castShadow = true;
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(.47, .47, .07, 24), dark); floor.position.y = .08; floor.receiveShadow = true;
  const lock = new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 8, 18), edge); lock.position.set(0, .58, -.45); lock.rotation.x = Math.PI / 2;
  const cuffs = new THREE.Group(); [-.18, .18].forEach((x) => { const cuff = new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 8, 18), edge); cuff.position.set(x, .58, -.05); cuff.rotation.x = Math.PI / 2; cuffs.add(cuff); });
  const chain = new THREE.Group(); for (let i = 0; i < 4; i += 1) { const link = new THREE.Mesh(new THREE.TorusGeometry(.075, .018, 7, 16), edge); link.position.set(i % 2 ? .07 : -.07, .58 + i * .08, -.05); link.rotation.x = i % 2 ? Math.PI / 2 : 0; chain.add(link); }
  group.add(floor, bars, dome, roof, lock, cuffs, chain); group.userData.spawnedAt = performance.now(); group.userData.arrest = true; return group;
}

function makeVictoryDecor() {
  const group = new THREE.Group(); const gold = new THREE.MeshPhysicalMaterial({ color: '#e8bf62', emissive: '#7d4b1f', emissiveIntensity: .25, roughness: .3, metalness: .55, clearcoat: .65 }); const leaf = new THREE.MeshPhysicalMaterial({ color: '#4f9a56', roughness: .45, clearcoat: .25 }); const flower = new THREE.MeshPhysicalMaterial({ color: '#e8895b', emissive: '#6d281b', emissiveIntensity: .2, roughness: .32, clearcoat: .4 });
  const wreath = new THREE.Group(); const wreathRing = new THREE.Mesh(new THREE.TorusGeometry(.38, .035, 8, 28, Math.PI * 1.65), gold); wreathRing.rotation.x = Math.PI / 2; wreathRing.rotation.z = -.8; wreathRing.position.y = 1.62; wreath.add(wreathRing);
  for (let i = 0; i < 12; i += 1) { const angle = -.8 + (i / 11) * Math.PI * 1.6; const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 8), leaf); leafMesh.scale.set(.22, .07, .13); leafMesh.position.set(Math.cos(angle) * .39, 1.62 + Math.sin(angle) * .28, Math.sin(angle) * .39); leafMesh.rotation.set(0, angle, angle * .45); wreath.add(leafMesh); }
  for (let i = 0; i < 3; i += 1) { const bloom = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 8), flower); bloom.position.set((i - 1) * .16, 1.77 + (i === 1 ? .07 : 0), -.02); bloom.scale.set(1.2, .55, .8); wreath.add(bloom); }
  const star = new THREE.Mesh(new THREE.TorusGeometry(.48, .018, 6, 24), gold); star.position.y = 1.53; star.rotation.x = Math.PI / 2; group.add(wreath, star); group.userData.spawnedAt = performance.now(); group.userData.victory = true; return group;
}

function makeDrawHandshake() {
  const group = new THREE.Group();
  const cuff = new THREE.MeshPhysicalMaterial({ color: '#b99450', metalness: .72, roughness: .25, clearcoat: .65 });
  const leftSleeve = new THREE.MeshPhysicalMaterial({ color: '#334b45', roughness: .54, metalness: .12, clearcoat: .2 });
  const rightSleeve = new THREE.MeshPhysicalMaterial({ color: '#5b3030', roughness: .54, metalness: .12, clearcoat: .2 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b97c5b', roughness: .72 });
  const makeArm = (side, sleeve) => {
    const arm = new THREE.Group();
    const direction = side === 'left' ? 1 : -1;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .34, 5, 10), sleeve);
    forearm.rotation.z = direction * Math.PI / 2; forearm.position.x = direction * .21;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.105, 16, 12), skin);
    hand.scale.set(1.05, .72, .82); hand.position.x = direction * .08;
    const wrist = new THREE.Mesh(new THREE.TorusGeometry(.085, .018, 8, 18), cuff);
    wrist.rotation.y = Math.PI / 2; wrist.position.x = direction * .12;
    arm.add(forearm, wrist, hand); arm.userData.side = side; arm.userData.direction = direction; return arm;
  };
  const left = makeArm('left', leftSleeve); const right = makeArm('right', rightSleeve);
  group.add(left, right);
  group.userData.spawnedAt = performance.now(); group.userData.draw = true; group.userData.left = left; group.userData.right = right;
  return group;
}

function rigClip(name, duration, tracks) {
  return new THREE.AnimationClip(name, duration, tracks.map(([path, times, values]) => new THREE.NumberKeyframeTrack(path, times, values)));
}

function playRigAction(root, name) {
  const actions = root?.userData?.rigActions; const next = actions?.[name];
  if (!next || root.userData.rigAction === name) return;
  const previous = actions[root.userData.rigAction];
  next.reset(); next.enabled = true; next.clampWhenFinished = name !== 'idle'; next.setLoop(name === 'idle' ? THREE.LoopRepeat : THREE.LoopOnce, name === 'idle' ? Infinity : 1);
  if (previous) next.crossFadeFrom(previous, .16, true); next.play(); root.userData.rigAction = name;
}

// Original voxel-inspired family characters. These are deliberately built from
// simple geometry so the preset is clear at a glance and stays fast at low quality.
function voxelFamilyCharacter(piece, quality = 'high') {
  const light = piece.color === 'w';
  const main = new THREE.MeshStandardMaterial({ color: light ? '#4d9aa4' : '#70466f', roughness: .72 });
  const accent = new THREE.MeshStandardMaterial({ color: light ? '#e6b24f' : '#ef7b4d', roughness: .58 });
  const skin = new THREE.MeshStandardMaterial({ color: light ? '#c88662' : '#8b5b46', roughness: .82 });
  const hair = new THREE.MeshStandardMaterial({ color: light ? '#51382e' : '#171b2c', roughness: .88 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#242735', roughness: .8 });
  const root = new THREE.Group(); root.rotation.y = light ? Math.PI : 0; root.userData.spawnedAt = performance.now(); root.userData.phase = Math.random() * Math.PI * 2;
  const bone = (name, parent, p) => { const b = new THREE.Bone(); b.name = name; b.position.set(...p); parent.add(b); return b; };
  const hips = bone('RigHips', root, [0, .48, 0]); const spine = bone('RigSpine', hips, [0, .28, 0]); const head = bone('RigHead', spine, [0, .43, 0]);
  const la = bone('RigLeftArm', spine, [-.22, .3, 0]); const ra = bone('RigRightArm', spine, [.22, .3, 0]);
  const lf = bone('RigLeftForearm', la, [0, -.24, 0]); const rf = bone('RigRightForearm', ra, [0, -.24, 0]);
  const ll = bone('RigLeftLeg', hips, [-.11, -.06, 0]); const rl = bone('RigRightLeg', hips, [.11, -.06, 0]);
  const ls = bone('RigLeftShin', ll, [0, -.28, 0]); const rs = bone('RigRightShin', rl, [0, -.28, 0]);
  const add = (parent, geometry, material, p = [0, 0, 0], rotation = [0, 0, 0]) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...p); mesh.rotation.set(...rotation); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const block = (parent, size, material, p) => add(parent, new THREE.BoxGeometry(...size), material, p);
  block(hips, [.34, .18, .22], accent, [0, .02, 0]); block(spine, [.35, .36, .24], main, [0, .14, 0]); block(spine, [.39, .06, .25], accent, [0, .3, 0]);
  add(head, new THREE.BoxGeometry(.25, .25, .24), skin, [0, .08, 0]);
  block(head, [.28, .07, .27], hair, [0, .22, 0]);
  [-.13, .13].forEach((x) => block(head, [.06, .16, .25], hair, [x, .1, 0]));
  [la, ra].forEach((arm) => block(arm, [.14, .28, .16], main, [0, -.12, 0]));
  [lf, rf].forEach((forearm) => { block(forearm, [.13, .23, .15], skin, [0, -.1, 0]); add(forearm, new THREE.BoxGeometry(.14, .13, .14), skin, [0, -.23, 0]); });
  [ll, rl].forEach((leg) => block(leg, [.14, .28, .16], main, [0, -.14, 0]));
  [ls, rs].forEach((shin) => { block(shin, [.14, .25, .16], shoe, [0, -.12, 0]); block(shin, [.17, .08, .28], shoe, [0, -.29, .05]); });
  if (piece.type === 'k') { block(head, [.3, .08, .3], accent, [0, .3, 0]); block(head, [.08, .12, .22], accent, [0, .4, 0]); block(head, [.2, .12, .22], hair, [0, -.01, .13]); block(spine, [.5, .42, .03], accent, [0, .08, -.14]); }
  if (piece.type === 'q') { block(head, [.36, .16, .3], hair, [0, .2, 0]); block(head, [.34, .06, .29], accent, [0, .34, 0]); [-.12, 0, .12].forEach((x) => add(head, new THREE.ConeGeometry(.035, .15, 5), accent, [x, .43, 0])); block(spine, [.48, .5, .3], main, [0, -.04, 0]); add(spine, new THREE.TorusGeometry(.08, .018, 6, 16), accent, [0, .2, .14], [Math.PI / 2, 0, 0]); }
  if (piece.type === 'p') { block(head, [.32, .06, .3], accent, [0, .32, 0]); block(spine, [.42, .28, .06], accent, [0, .12, -.15]); }
  if (piece.type === 'r') { block(head, [.35, .18, .3], accent, [0, .25, 0]); block(spine, [.5, .12, .3], accent, [0, .27, 0]); block(lf, [.3, .34, .06], accent, [-.04, -.09, .14]); }
  if (piece.type === 'b') { add(head, new THREE.ConeGeometry(.18, .28, quality === 'low' ? 5 : 8), accent, [0, .32, 0]); block(spine, [.42, .45, .28], main, [0, -.02, 0]); block(rf, [.2, .16, .05], accent, [.02, -.38, .1]); }
  if (piece.type === 'n') {
    hips.position.y = .82; const mount = new THREE.Group(); root.add(mount); block(mount, [.52, .32, .7], main, [0, .38, 0]); block(mount, [.28, .5, .28], main, [0, .7, .28]); block(mount, [.3, .24, .42], main, [0, .98, .48]);
    [-.2, .2].forEach((x) => add(mount, new THREE.BoxGeometry(.1, .42, .1), shoe, [x, .12, -.22])); [-.2, .2].forEach((x) => block(mount, [.1, .42, .1], shoe, [x, .12, .25]));
    [-.09, .09].forEach((x) => add(mount, new THREE.ConeGeometry(.05, .16, 5), accent, [x, 1.18, .48]));
  }
  // Strong role silhouettes make the family set readable without relying on
  // rank markers: each role has a different costume shape and prop language.
  const roleMetal = new THREE.MeshStandardMaterial({ color: light ? '#f0c35e' : '#d65b4b', roughness: .44, metalness: .48 });
  const robe = new THREE.MeshStandardMaterial({ color: light ? '#d96b54' : '#3f5f9e', roughness: .68 });
  if (piece.type === 'p') {
    root.scale.setScalar(.82); block(spine, [.2, .14, .12], accent, [0, .18, -.2]); block(head, [.3, .05, .2], accent, [0, .32, 0]);
  }
  if (piece.type === 'r') {
    block(spine, [.54, .48, .38], roleMetal, [0, .12, 0]); block(head, [.4, .16, .36], roleMetal, [0, .25, 0]);
    [-.16, 0, .16].forEach((x) => block(head, [.08, .14, .1], roleMetal, [x, .39, 0]));
    block(lf, [.38, .42, .08], roleMetal, [-.05, -.1, .18]);
  }
  if (piece.type === 'b') {
    add(spine, new THREE.ConeGeometry(.34, .7, quality === 'low' ? 5 : 8), robe, [0, -.05, 0]);
    add(head, new THREE.ConeGeometry(.18, .34, 5), roleMetal, [0, .38, 0]);
    add(rf, new THREE.BoxGeometry(.22, .18, .08), roleMetal, [.04, -.38, .13]);
    add(rf, new THREE.CylinderGeometry(.025, .025, .78, 6), roleMetal, [.12, -.14, .12]);
  }
  if (piece.type === 'q') {
    add(spine, new THREE.ConeGeometry(.36, .78, 6), robe, [0, -.08, 0]);
    [-.18, .18].forEach((x) => block(head, [.1, .25, .23], hair, [x, .08, .02]));
    [-.15, 0, .15].forEach((x) => add(head, new THREE.ConeGeometry(.04, .2, 5), roleMetal, [x, .44, 0]));
  }
  if (piece.type === 'k') {
    block(spine, [.56, .5, .34], roleMetal, [0, .08, 0]); block(spine, [.58, .56, .035], accent, [0, .04, -.19]);
    block(head, [.42, .1, .34], roleMetal, [0, .34, 0]); [-.15, 0, .15].forEach((x) => block(head, [.08, .16, .08], roleMetal, [x, .46, 0]));
    add(rf, new THREE.CylinderGeometry(.025, .035, .8, 7), roleMetal, [.08, -.14, .1], [0, 0, -.14]);
  }
  // Face cards and held props give every family member a distinct identity.
  const face = new THREE.MeshStandardMaterial({ color: '#17151b', roughness: .55 });
  const mouth = new THREE.MeshStandardMaterial({ color: light ? '#7b3e3e' : '#3c1f36', roughness: .7 });
  add(head, new THREE.BoxGeometry(.038, .045, .018), face, [-.055, .1, .132]);
  add(head, new THREE.BoxGeometry(.038, .045, .018), face, [.055, .1, .132]);
  // +Z is the only face. The whole figure turns toward the opposing army.
  if (piece.type === 'k') { block(head, [.18, .12, .08], hair, [0, -.03, .14]); block(head, [.1, .04, .025], mouth, [0, .03, .18]); }
  if (piece.type === 'q') { block(head, [.08, .05, .025], mouth, [0, .02, .18]); [-.16, .16].forEach((x) => block(head, [.08, .22, .12], hair, [x, .08, .02])); }
  if (piece.type === 'b') { block(head, [.1, .05, .025], mouth, [0, .02, .18]); block(head, [.12, .08, .12], hair, [0, -.03, .14]); }
  if (piece.type === 'r') { block(head, [.18, .05, .025], roleMetal, [0, .02, .16]); }
  if (piece.type === 'p') { add(head, new THREE.SphereGeometry(.018, 6, 5), accent, [0, .01, .15]); }
  if (piece.type === 'n') { block(head, [.13, .05, .025], hair, [0, -.02, .13]); }
  const weapon = new THREE.MeshStandardMaterial({ color: light ? '#f2d17a' : '#c7d2e0', roughness: .32, metalness: .72 });
  const hilt = new THREE.MeshStandardMaterial({ color: light ? '#704824' : '#e0a94c', roughness: .45, metalness: .55 });
  if (piece.type === 'p') { add(rf, new THREE.CylinderGeometry(.018, .024, .52, 7), weapon, [.06, -.18, .12], [0, 0, -.18]); block(rf, [.16, .035, .05], hilt, [.06, -.05, .12]); }
  if (piece.type === 'r') { add(rf, new THREE.CylinderGeometry(.025, .03, .36, 7), hilt, [.08, -.14, .12]); add(rf, new THREE.SphereGeometry(.09, 8, 6), weapon, [.08, -.34, .12]); }
  if (piece.type === 'n') { add(rf, new THREE.CylinderGeometry(.018, .022, .75, 7), weapon, [.1, -.15, .1], [0, 0, -.3]); block(rf, [.18, .035, .05], hilt, [.1, .04, .1]); }
  if (piece.type === 'b') { add(rf, new THREE.CylinderGeometry(.022, .028, .82, 7), hilt, [.13, -.15, .1]); }
  if (piece.type === 'q') { add(rf, new THREE.CylinderGeometry(.018, .023, .6, 7), weapon, [.08, -.16, .1], [0, 0, -.12]); add(rf, new THREE.SphereGeometry(.06, 8, 6), roleMetal, [.08, -.46, .1]); }
  if (piece.type === 'k') { add(rf, new THREE.CylinderGeometry(.025, .03, .72, 7), weapon, [.1, -.16, .1], [0, 0, -.14]); block(rf, [.2, .035, .05], hilt, [.1, .03, .1]); }
  if (['p', 'r', 'n'].includes(piece.type)) add(rf, new THREE.BoxGeometry(.05, .5, .05), accent, [.03, -.18, .1], [0, 0, piece.type === 'p' ? -.2 : .18]);
  const clips = [
    rigClip('idle', 1.6, [['RigSpine.rotation[z]', [0, .8, 1.6], [-.012, .012, -.012]]]),
    rigClip('walk', .7, [['RigLeftArm.rotation[x]', [0, .35, .7], [-.5, .5, -.5]], ['RigRightArm.rotation[x]', [0, .35, .7], [.5, -.5, .5]], ['RigLeftLeg.rotation[x]', [0, .35, .7], [.45, -.45, .45]], ['RigRightLeg.rotation[x]', [0, .35, .7], [-.45, .45, -.45]]]),
    rigClip('attack', .62, [['RigRightArm.rotation[x]', [0, .22, .62], [0, -1.7, 0]], ['RigSpine.rotation[y]', [0, .22, .62], [0, -.35, 0]]]),
    rigClip('death', .9, [['RigHips.rotation[z]', [0, .55, .9], [0, 0, -1.4]], ['RigLeftArm.rotation[x]', [0, .55, .9], [0, -1.1, -1.1]], ['RigRightArm.rotation[x]', [0, .55, .9], [0, -.8, -.8]]]),
  ];
  const mixer = new THREE.AnimationMixer(root); root.userData.mixer = mixer; root.userData.rigActions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)])); mixer.addEventListener('finished', () => { if (root.userData.rigAction !== 'death') { root.userData.rigAction = ''; playRigAction(root, 'idle'); } }); playRigAction(root, 'idle'); return root;
}

function riggedArmyCharacter(piece, style, quality = 'high') {
  if (style === 'family') return voxelFamilyCharacter(piece, quality);
  const colors = presets[style]; const light = piece.color === 'w'; const segments = quality === 'low' ? 6 : quality === 'medium' ? 10 : 14; const root = new THREE.Group(); root.userData.spawnedAt = performance.now(); root.userData.phase = Math.random() * Math.PI * 2; root.userData.baseY = .13;
  const uniform = new THREE.MeshPhysicalMaterial({ color: light ? colors.white : colors.black, roughness: .58, metalness: .1, clearcoat: .12 });
  const armor = new THREE.MeshPhysicalMaterial({ color: colors.trim, roughness: .32, metalness: .58, clearcoat: .32 });
  const accent = new THREE.MeshPhysicalMaterial({ color: colors.accent, roughness: .42, metalness: .24, clearcoat: .18 });
  const skin = new THREE.MeshStandardMaterial({ color: light ? '#a9704e' : '#79513d', roughness: .78 });
  const dark = new THREE.MeshStandardMaterial({ color: '#171c1a', roughness: .72, metalness: .2 });
  const createBone = (name, parent, position) => { const bone = new THREE.Bone(); bone.name = name; bone.position.set(...position); parent.add(bone); return bone; };
  const hips = createBone('RigHips', root, [0, .48, 0]); const spine = createBone('RigSpine', hips, [0, .28, 0]); const head = createBone('RigHead', spine, [0, .43, 0]);
  const leftArm = createBone('RigLeftArm', spine, [-.23, .31, 0]); const rightArm = createBone('RigRightArm', spine, [.23, .31, 0]);
  const leftForearm = createBone('RigLeftForearm', leftArm, [0, -.25, 0]); const rightForearm = createBone('RigRightForearm', rightArm, [0, -.25, 0]);
  const leftLeg = createBone('RigLeftLeg', hips, [-.12, -.06, 0]); const rightLeg = createBone('RigRightLeg', hips, [.12, -.06, 0]);
  const leftShin = createBone('RigLeftShin', leftLeg, [0, -.28, 0]); const rightShin = createBone('RigRightShin', rightLeg, [0, -.28, 0]);
  const addPart = (parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  addPart(hips, new THREE.BoxGeometry(.32, .2, .2), armor, [0, .02, 0]);
  addPart(spine, new THREE.CapsuleGeometry(.18, .3, 5, 10), uniform, [0, .15, 0]);
  addPart(spine, new THREE.BoxGeometry(.42, .12, .24), armor, [0, .27, 0]);
  addPart(spine, new THREE.BoxGeometry(.37, .045, .25), dark, [0, -.02, 0]);
  [-.08, 0, .08].forEach((y) => addPart(spine, new THREE.SphereGeometry(.018, 6, 5), armor, [0, .09 + y, .19]));
  addPart(spine, new THREE.BoxGeometry(.08, .5, .025), accent, [piece.color === 'w' ? -.1 : .1, .12, .18], [0, 0, piece.color === 'w' ? -.38 : .38]);
  addPart(head, new THREE.SphereGeometry(.14, segments, Math.max(5, segments - 3)), skin, [0, .08, 0]);
  if (piece.type === 'p') addPart(head, new THREE.CylinderGeometry(.16, .14, .12, segments), accent, [0, .19, 0]);
  if (piece.type === 'r') addPart(head, new THREE.BoxGeometry(.31, .18, .28), armor, [0, .2, 0]);
  if (piece.type === 'n') addPart(head, new THREE.ConeGeometry(.13, .3, segments), accent, [0, .27, -.02], [-.12, 0, 0]);
  if (piece.type === 'b') { addPart(head, new THREE.ConeGeometry(.15, .38, segments), accent, [0, .32, 0]); addPart(spine, new THREE.ConeGeometry(.25, .72, segments), uniform, [0, -.08, 0]); }
  if (piece.type === 'q') {
    addPart(head, new THREE.SphereGeometry(.17, segments, Math.max(5, segments - 3)), dark, [0, .08, .035]);
    addPart(head, new THREE.CylinderGeometry(.17, .13, .12, 7), armor, [0, .27, 0]);
    addPart(spine, new THREE.ConeGeometry(.3, .72, segments), uniform, [0, -.06, 0]);
    [-.1, 0, .1].forEach((x, index) => addPart(head, new THREE.ConeGeometry(.035, .15 + index * .025, 6), armor, [x, .39, 0]));
  }
  if (piece.type === 'k') {
    addPart(head, new THREE.CylinderGeometry(.2, .17, .1, segments), dark, [0, .22, 0]);
    addPart(head, new THREE.BoxGeometry(.28, .045, .18), accent, [0, .27, .055], [-.12, 0, 0]);
    addPart(spine, new THREE.BoxGeometry(.54, .12, .28), armor, [0, .29, 0]);
  }
  [leftArm, rightArm].forEach((bone) => addPart(bone, new THREE.CapsuleGeometry(.065, .22, 4, 8), uniform, [0, -.12, 0]));
  [leftForearm, rightForearm].forEach((bone) => { addPart(bone, new THREE.CapsuleGeometry(.055, .19, 4, 8), skin, [0, -.1, 0]); addPart(bone, new THREE.SphereGeometry(.065, 8, 6), skin, [0, -.23, 0]); });
  [leftLeg, rightLeg].forEach((bone) => addPart(bone, new THREE.CapsuleGeometry(.075, .25, 4, 8), uniform, [0, -.14, 0]));
  [leftShin, rightShin].forEach((bone) => {
    addPart(bone, new THREE.CapsuleGeometry(.07, .23, 4, 8), dark, [0, -.11, 0]);
    addPart(bone, new THREE.CylinderGeometry(.082, .075, .16, 8), dark, [0, -.23, 0]);
    addPart(bone, new THREE.BoxGeometry(.145, .105, .29), dark, [0, -.31, .065]);
    addPart(bone, new THREE.BoxGeometry(.155, .035, .31), armor, [0, -.37, .07]);
    addPart(bone, new THREE.BoxGeometry(.04, .07, .07), armor, [0, -.35, -.065]);
  });
  if (piece.type === 'n') {
    hips.position.y = .84;
    const horse = new THREE.Group(); horse.name = 'KnightMount'; root.add(horse);
    const body = addPart(horse, new THREE.SphereGeometry(.3, segments, Math.max(5, segments - 3)), uniform, [0, .43, 0]); body.scale.set(.82, .68, 1.35);
    const neck = addPart(horse, new THREE.CapsuleGeometry(.12, .34, 4, segments), uniform, [0, .67, .3], [-.55, 0, 0]); neck.scale.set(.9, 1, .9);
    const horseHead = addPart(horse, new THREE.SphereGeometry(.16, segments, Math.max(5, segments - 3)), uniform, [0, .87, .49]); horseHead.scale.set(.78, .9, 1.28);
    addPart(horse, new THREE.BoxGeometry(.13, .12, .25), uniform, [0, .81, .68]);
    [-.09, .09].forEach((x) => addPart(horse, new THREE.ConeGeometry(.045, .16, 6), accent, [x, 1.03, .48]));
    [-.17, .17].forEach((x) => [-.2, .2].forEach((z) => addPart(horse, new THREE.CylinderGeometry(.045, .055, .42, 7), dark, [x, .18, z])));
    addPart(horse, new THREE.TorusGeometry(.18, .022, 6, 16, Math.PI), armor, [0, .68, .47], [Math.PI / 2, 0, 0]);
  }
  if (['p', 'r', 'n'].includes(piece.type)) { const shield = addPart(leftForearm, piece.type === 'r' ? new THREE.BoxGeometry(.34, .5, .08) : new THREE.CylinderGeometry(.2, .2, .06, quality === 'low' ? 6 : piece.type === 'p' ? 12 : 8), accent, [-.04, -.1, .13], [Math.PI / 2, 0, 0]); shield.rotation.z = piece.type === 'n' ? .25 : 0; }
  const weaponLength = piece.type === 'p' || piece.type === 'b' ? .72 : piece.type === 'q' ? .5 : .42;
  addPart(rightForearm, new THREE.CylinderGeometry(.018, .024, weaponLength, 8), armor, [.03, -.18, .08], [0, 0, piece.type === 'p' ? -.18 : .2]);
  if (piece.type === 'n') addPart(head, new THREE.ConeGeometry(.045, .3, 7), accent, [0, .39, 0], [0, 0, -.2]);
  if (piece.type === 'b') addPart(rightForearm, new THREE.BoxGeometry(.22, .16, .035), accent, [.02, -.48, .07]);
  if (piece.type === 'q') { addPart(spine, new THREE.BoxGeometry(.08, .5, .025), accent, [-.2, .1, -.13], [0, 0, -.55]); addPart(spine, new THREE.BoxGeometry(.08, .5, .025), accent, [.2, .1, -.13], [0, 0, .55]); }
  if (piece.type === 'k') addPart(spine, new THREE.BoxGeometry(.5, .48, .025), accent, [0, .05, -.14]);
  const clips = [
    rigClip('idle', 1.6, [['RigSpine.rotation[z]', [0, .8, 1.6], [-.015, .015, -.015]], ['RigHead.rotation[y]', [0, .8, 1.6], [-.06, .06, -.06]]]),
    rigClip('walk', .7, [['RigLeftArm.rotation[x]', [0, .35, .7], [-.55, .55, -.55]], ['RigRightArm.rotation[x]', [0, .35, .7], [.55, -.55, .55]], ['RigLeftLeg.rotation[x]', [0, .35, .7], [.5, -.5, .5]], ['RigRightLeg.rotation[x]', [0, .35, .7], [-.5, .5, -.5]]]),
    rigClip('attack', .62, [['RigRightArm.rotation[x]', [0, .22, .62], [0, -1.9, 0]], ['RigRightForearm.rotation[z]', [0, .22, .62], [0, -.9, 0]], ['RigSpine.rotation[y]', [0, .22, .62], [0, -.45, 0]]]),
    rigClip('death', .9, [['RigHips.rotation[z]', [0, .55, .9], [0, 0, -1.45]], ['RigLeftArm.rotation[x]', [0, .55, .9], [0, -1.2, -1.2]], ['RigRightArm.rotation[x]', [0, .55, .9], [0, -.9, -.9]]]),
  ];
  const mixer = new THREE.AnimationMixer(root); root.userData.mixer = mixer; root.userData.rigActions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)])); mixer.addEventListener('finished', () => { if (root.userData.rigAction !== 'death') { root.userData.rigAction = ''; playRigAction(root, 'idle'); } }); playRigAction(root, 'idle');
  return root;
}

function pieceMesh(piece, style) {
  const colors = presets[style] ?? presets.warrior;
  const root = new THREE.Group();
  const main = new THREE.MeshPhysicalMaterial({ color: piece.color === 'w' ? colors.white : colors.black, metalness: style === 'royal' ? .48 : .12, roughness: style === 'obsidian' ? .24 : .34, clearcoat: .3, clearcoatRoughness: .42 });
  const trim = new THREE.MeshPhysicalMaterial({ color: colors.trim, metalness: .58, roughness: .24, clearcoat: .38 });
  const felt = new THREE.MeshStandardMaterial({ color: '#183126', roughness: .92, metalness: 0 });
  const add = (geometry, material, y) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.castShadow = true; root.add(mesh); };
  const turned = (points, material = main) => add(new THREE.LatheGeometry(points.map(([radius, y]) => new THREE.Vector2(radius, y)), 28), material, 0);
  turned([[0,.02],[.25,.02],[.31,.08],[.29,.15],[.21,.20],[.16,.33],[.13,.47],[.16,.53],[.11,.61],[.08,.73]], main);
  add(new THREE.CylinderGeometry(.235, .235, .016, 28), felt, .012);
  add(new THREE.TorusGeometry(.22, .025, 8, 28), trim, .18);
  if (piece.type === 'p') add(new THREE.SphereGeometry(.16, 20, 14), main, .86);
  if (piece.type === 'r') { add(new THREE.CylinderGeometry(.22,.22,.15,20), main,.82); for (let i=0;i<4;i++) { const crown = new THREE.Mesh(new THREE.BoxGeometry(.13,.14,.13), trim); crown.position.set(Math.sin(i*Math.PI/2)*.18,.93,Math.cos(i*Math.PI/2)*.18); root.add(crown); } }
  if (piece.type === 'n') { const neck = new THREE.Mesh(new THREE.SphereGeometry(.17,18,12), main); neck.position.set(0,.72,0); root.add(neck); const head = new THREE.Mesh(new THREE.CapsuleGeometry(.15,.35,8,16), main); head.position.set(-.11,.98,0); head.rotation.z=-.45; root.add(head); const ear = new THREE.Mesh(new THREE.ConeGeometry(.08,.2,4), trim); ear.position.set(-.2,1.22,0); root.add(ear); }
  if (piece.type === 'b') { add(new THREE.SphereGeometry(.19,20,14), main,.83); const finial = new THREE.Mesh(new THREE.ConeGeometry(.11,.26,20), trim); finial.position.y=1.08; finial.rotation.z=.28; root.add(finial); }
  if (piece.type === 'q') { add(new THREE.SphereGeometry(.16,18,12), trim,.84); for (let i=0;i<5;i++) { const pearl = new THREE.Mesh(new THREE.SphereGeometry(.065,12,8), trim); pearl.position.set(Math.sin(i*Math.PI*2/5)*.18,.99,Math.cos(i*Math.PI*2/5)*.18); root.add(pearl); } }
  if (piece.type === 'k') { add(new THREE.SphereGeometry(.14,18,12), trim,.84); add(new THREE.BoxGeometry(.08,.36,.08), trim,1.08); add(new THREE.BoxGeometry(.31,.08,.08), trim,1.16); }
  // Army presets keep the chess silhouettes readable, then add a distinct
  // uniform/helmet profile so each set feels like a real variation rather
  // than a recolour of Obsidian or Royal.
  if (colors.accent) {
    const accent = new THREE.MeshPhysicalMaterial({ color: colors.accent, metalness: .28, roughness: .4, clearcoat: .2 });
    if (piece.type === 'p' || piece.type === 'r') add(new THREE.BoxGeometry(.28, .08, .22), accent, piece.type === 'p' ? .56 : .72);
    if (piece.type === 'n') { const plume = new THREE.Mesh(new THREE.ConeGeometry(.07, .3, 8), accent); plume.position.set(.02, 1.25, 0); root.add(plume); }
    if (piece.type === 'b' || piece.type === 'q') { const sash = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 20), accent); sash.rotation.x = Math.PI / 2; sash.position.y = .62; root.add(sash); }
    if (piece.type === 'k') { const crest = new THREE.Mesh(new THREE.ConeGeometry(.1, .2, 6), accent); crest.position.y = 1.36; root.add(crest); }
  }
  root.scale.setScalar(.01); root.userData.spawnedAt = performance.now(); root.userData.phase = Math.random() * Math.PI * 2; root.userData.baseY = .13;
  return root;
}

export function WebThreeBoard({ fen, moves = [], lastMove = null, status = 'active', result = '', orientation = 'w', onMove, onPromote, open: controlledOpen, onOpenChange, quality = 'high', coordinates = true, view = 'isometric', characterSet = 'warrior', formationKey = 0, formationActive = false }) {
  const sectionRef = useRef(null); const host = useRef(null); const sceneState = useRef(null); const selected = useRef(null); const hovered = useRef(null);
  const [internalOpen, setInternalOpen] = useState(false); const open = controlledOpen ?? internalOpen; const style = presets[characterSet] ? characterSet : 'warrior'; const [selectedSquare, setSelectedSquare] = useState(''); const [assetStatus, setAssetStatus] = useState('Preparing character set…');
  const [fullscreen, setFullscreen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const compactPreview = compactViewport && !previewExpanded && !fullscreen;
  const toggleOpen = () => { const next = !open; if (controlledOpen === undefined) setInternalOpen(next); onOpenChange?.(next); };
  const fenRef = useRef(fen); const movesRef = useRef(moves); const lastMoveRef = useRef(lastMove); const moveRef = useRef(onMove); const promoteRef = useRef(onPromote); fenRef.current = fen; movesRef.current = moves; lastMoveRef.current = lastMove; moveRef.current = onMove; promoteRef.current = onPromote;
  useEffect(() => {
    if (!open || !host.current) return undefined;
    let disposed = false;
    const element = host.current; const width = element.clientWidth; const height = document.fullscreenElement ? Math.max(420, window.innerHeight - 150) : compactPreview ? Math.max(180, Math.min(248, width * .62)) : Math.max(340, Math.min(600, width));
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#08100c'); scene.fog = new THREE.FogExp2('#08100c', .035);
    const camera = new THREE.PerspectiveCamera(view === 'top' ? 34 : 36, width / height, .1, 100);
    const cameraPosition = view === 'top' ? [0, 15.5, .1] : view === 'side' ? [10.8, 3.4, 6.8] : view === 'cinematic' ? [9.4, 5.5, 11.2] : [7.7, 7.1, 9.4];
    camera.position.set(...cameraPosition); camera.lookAt(0, 0, 0);
    const previewQuality = compactPreview ? 'low' : quality;
    const renderer = new THREE.WebGLRenderer({ antialias: previewQuality !== 'low', powerPreference: previewQuality === 'low' ? 'default' : 'high-performance' }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, previewQuality === 'low' ? 1 : previewQuality === 'medium' ? 1.5 : 2)); renderer.setSize(width, height); renderer.shadowMap.enabled = previewQuality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; element.replaceChildren(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = !compactPreview; controls.enabled = !compactPreview; controls.dampingFactor = .07; controls.minDistance = 7.5; controls.maxDistance = 22; controls.minPolarAngle = .12; controls.maxPolarAngle = Math.PI * .48; controls.target.set(0, .2, 0); controls.autoRotate = compactPreview || view === 'cinematic'; controls.autoRotateSpeed = compactPreview ? .28 : .65; controls.update();
    scene.add(new THREE.HemisphereLight('#ffe7bb', '#07100b', 1.55)); const light = new THREE.DirectionalLight('#fff0c8', 3.4); light.position.set(5, 11, 6); light.castShadow = previewQuality !== 'low'; const shadowSize = previewQuality === 'high' ? 2048 : 1024; light.shadow.mapSize.set(shadowSize, shadowSize); light.shadow.camera.left = -7; light.shadow.camera.right = 7; light.shadow.camera.top = 7; light.shadow.camera.bottom = -7; scene.add(light);
    const rim = new THREE.DirectionalLight('#759bff', 1.2); rim.position.set(-8, 4, -7); scene.add(rim);
    const board = new THREE.Group(); const pieces = new THREE.Group(); const capturedPieces = new THREE.Group(); const arrest = new THREE.Group(); const victory = new THREE.Group(); const draw = new THREE.Group(); const legalHints = new THREE.Group(); const combatEffects = new THREE.Group(); scene.add(board, pieces, capturedPieces, arrest, victory, draw, legalHints, combatEffects);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: '#111a14', roughness: .96, metalness: .03 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.48; ground.receiveShadow = true; scene.add(ground);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.15, .5, 9.15), new THREE.MeshStandardMaterial({ color: '#28261f', roughness: .72, metalness: .08 })); plinth.position.y = -.3; plinth.receiveShadow = true; plinth.castShadow = true; board.add(plinth);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(8.55, .28, 8.55), new THREE.MeshPhysicalMaterial({ color: '#6a5134', roughness: .4, metalness: .22, clearcoat: .22 })); edge.position.y = -.03; edge.castShadow = true; edge.receiveShadow = true; board.add(edge);
    const arena = new THREE.Group(); scene.add(arena); const stone = new THREE.MeshStandardMaterial({ color: '#35372f', roughness: .92 }); const bronze = new THREE.MeshStandardMaterial({ color: '#7b5528', metalness: .72, roughness: .34 });
    [-5.2, 5.2].forEach((z) => { const bench = new THREE.Mesh(new THREE.BoxGeometry(8.5, .18, 1.2), new THREE.MeshStandardMaterial({ color: z > 0 ? '#4b4030' : '#302524', roughness: .8, metalness: .08 })); bench.position.set(0, -.19, z); bench.castShadow = true; bench.receiveShadow = true; arena.add(bench); });
    const flames = [];
    [[-5.3,-5.3],[5.3,-5.3],[-5.3,5.3],[5.3,5.3]].forEach(([x,z], index) => { const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.34,.48,.7,10), stone); pedestal.position.set(x,-.1,z); pedestal.castShadow = true; arena.add(pedestal); const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.35,.23,.18,16), bronze); bowl.position.set(x,.32,z); arena.add(bowl); const outer = new THREE.Mesh(new THREE.ConeGeometry(.16,.42,12), new THREE.MeshBasicMaterial({ color: index % 2 ? '#ff8e2f' : '#e55b24', transparent: true, opacity: .88 })); outer.position.set(x,.62,z); outer.scale.set(.8,1.15,.8); outer.userData.phase = index * 1.7; outer.userData.flameLayer = 'outer'; arena.add(outer); const inner = new THREE.Mesh(new THREE.ConeGeometry(.075,.26,10), new THREE.MeshBasicMaterial({ color: '#fff0a1', transparent: true, opacity: .95 })); inner.position.set(x,.66,z); inner.userData.phase = index * 1.7 + .7; inner.userData.flameLayer = 'inner'; arena.add(inner); flames.push(outer, inner); const glow = new THREE.PointLight('#ff9c38', 2.4, 6, 2); glow.position.set(x,.72,z); arena.add(glow); });
    const dustGeometry = new THREE.BufferGeometry(); const dustPositions = new Float32Array(previewQuality === 'low' ? 36 : previewQuality === 'medium' ? 96 : 180); for (let i=0;i<dustPositions.length;i+=3) { dustPositions[i]=(Math.random()-.5)*14; dustPositions[i+1]=Math.random()*5; dustPositions[i+2]=(Math.random()-.5)*14; } dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions,3)); const dust = new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:'#d6bd78',size:.035,transparent:true,opacity:.38,depthWrite:false})); scene.add(dust);
    const squares = [];
    const makeBoard = () => { board.clear(); board.add(plinth, edge); squares.length = 0; for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) { const square = new THREE.Mesh(new THREE.BoxGeometry(.99, .1, .99), boardSquareMaterial(style, row, col, previewQuality)); square.position.set(col - 3.5, .13, row - 3.5); square.userData.square = `${files[col]}${8 - row}`; square.receiveShadow = true; board.add(square); squares.push(square); } if (coordinates && !compactPreview) { [...files].forEach((file, index) => { board.add(coordinateLabel(file, index - 3.5, 4.36)); board.add(coordinateLabel(file, index - 3.5, -4.36)); }); for (let index = 0; index < 8; index++) { const rank = String(8 - index); board.add(coordinateLabel(rank, -4.36, index - 3.5)); board.add(coordinateLabel(rank, 4.36, index - 3.5)); } } };
    let syncVersion = 0;
    let completedCaptureTarget = '';
    const sync = () => {
      const version = ++syncVersion; pieces.clear(); capturedPieces.clear(); arrest.clear(); victory.clear(); draw.clear(); const chess = safeChess(fenRef.current); if (!chess) { setAssetStatus('3D board waiting for a valid position'); return; } const boardPieces = chess.board().flat().filter(Boolean); const captures = capturedFromMoves(movesRef.current); const capturedByWhite = captures.filter((piece) => piece.color === 'b').sort((a, b) => ({ q: 9, r: 5, b: 3, n: 3, p: 1 }[b.type] ?? 0) - ({ q: 9, r: 5, b: 3, n: 3, p: 1 }[a.type] ?? 0)); const capturedByBlack = captures.filter((piece) => piece.color === 'w').sort((a, b) => ({ q: 9, r: 5, b: 3, n: 3, p: 1 }[b.type] ?? 0) - ({ q: 9, r: 5, b: 3, n: 3, p: 1 }[a.type] ?? 0)); const totalModels = boardPieces.length + captures.length; let settled = 0; let failed = 0;
      if (riggedArmyStyles.has(style)) setAssetStatus(`${presets[style].label} · ${previewQuality === 'low' ? 'compact ' : ''}rigged characters and four motion clips ready`); else if (importedCharacterStyles.has(style) && previewQuality !== 'low') setAssetStatus(`Loading ${presets[style].label} characters · 0/${totalModels}`); else if (importedCharacterStyles.has(style)) setAssetStatus('Battery saver · lightweight character pieces active'); else setAssetStatus(`${presets[style].label} procedural set ready`);
      const addCharacter = (piece, parent, position, captured = false, square = '') => {
        const root = riggedArmyStyles.has(style) ? riggedArmyCharacter(piece, style, previewQuality) : pieceMesh(piece, style);
        root.position.set(...position);
        Object.assign(root.userData, { baseY: position[1], baseRotationY: root.rotation.y, targetScale: captured ? .56 : .86, captured, type: piece.type, color: piece.color, square });
        if (version > 1) root.userData.spawnedAt = performance.now() - 400;
        const latest = lastMoveRef.current;
        const enteringFormation = formationKey > 0 && status === 'active' && !movesRef.current.length && !captured;
        if (enteringFormation) {
          const destination = new THREE.Vector3(...position); const fileIndex = files.indexOf(square[0]); const isBackRank = piece.type !== 'p'; const edge = piece.color === 'w' ? 6.15 : -6.15;
          const origin = new THREE.Vector3(destination.x * .94, position[1], edge + (fileIndex - 3.5) * .035);
          root.position.copy(origin); root.userData.moveFrom = origin; root.userData.moveTo = destination; root.userData.moveStartedAt = performance.now() + (isBackRank ? 330 : 80) + Math.abs(fileIndex - 3.5) * 55; root.userData.moveDuration = previewQuality === 'low' ? 900 : 1280; root.userData.formation = true; root.userData.spawnedAt = performance.now() - 400;
          if (riggedArmyStyles.has(style)) root.rotation.y = piece.color === 'w' ? Math.PI : 0;
          playRigAction(root, 'walk');
        } else if (!captured && latest?.to === square && latest?.from && completedCaptureTarget !== square) {
          const origin = boardPosition(latest.from, position[1]);
          root.position.copy(origin);
          root.userData.moveFrom = origin.clone(); root.userData.moveTo = new THREE.Vector3(...position);
          root.userData.moveStartedAt = performance.now(); root.userData.spawnedAt = performance.now() - 400;
          playRigAction(root, 'walk');
        }
        // Captured pieces are displayed as an upright memorial/collection outside
        // the board. The combat victim still plays its death clip during capture,
        // but the settled off-board character must return to an idle stance.
        if (captured) { root.rotation.z = 0; playRigAction(root, 'idle'); }
        decorateCharacter(root, piece, captured);
        parent.add(root);
        if (!importedCharacterStyles.has(style) || previewQuality === 'low') return root;
        loadMedievalModel(piece).then((model) => {
          if (version !== syncVersion || root.parent !== parent) return;
          const visual = normalizeMedievalModel(model, piece, style); visual.userData.handshakeVisual = true; root.userData.handshakeVisual = visual; if (root.userData.handshakeSide) visual.rotation.y = 0; root.clear(); root.add(visual); decorateCharacter(root, piece, captured);
        }).catch(() => { failed += 1; }).finally(() => {
          settled += 1;
          if (disposed || version !== syncVersion) return;
          setAssetStatus(settled === totalModels ? failed ? `Character set ready · ${failed} fallback piece${failed === 1 ? '' : 's'}` : 'Character set ready · rank crests enabled' : `Loading characters · ${settled}/${totalModels}`);
        });
        return root;
      };
      chess.board().forEach((rank, row) => rank.forEach((piece, col) => { if (piece) { const square = `${files[col]}${8 - row}`; addCharacter(piece, pieces, [col - 3.5, .13, row - 3.5], false, square); } }));
      completedCaptureTarget = '';
      capturedByWhite.forEach((piece, index) => addCharacter(piece, capturedPieces, [-3.5 + (index % 8), .02, 4.95 + Math.floor(index / 8) * .48], true));
      capturedByBlack.forEach((piece, index) => addCharacter(piece, capturedPieces, [-3.5 + (index % 8), .02, -4.95 - Math.floor(index / 8) * .48], true));
      const kingSquare = (color) => chess.board().flatMap((rank, row) => rank.map((piece, col) => piece?.type === 'k' && piece.color === color ? `${files[col]}${8 - row}` : null)).find(Boolean);
      if (chess.isCheckmate()) { const mateSquare = kingSquare(chess.turn()); if (mateSquare) { const cage = makeArrestCage(); cage.position.copy(boardPosition(mateSquare, .13)); arrest.add(cage); } const winnerSquare = kingSquare(chess.turn() === 'w' ? 'b' : 'w'); if (winnerSquare) { const decor = makeVictoryDecor(); decor.position.copy(boardPosition(winnerSquare, .13)); victory.add(decor); } }
      else if (status === 'finished') { const leftKing = kingSquare('w'); const rightKing = kingSquare('b'); if (leftKing && rightKing) { const handshake = makeDrawHandshake(); handshake.position.set(0, .13, 0); draw.add(handshake); pieces.children.filter((piece) => piece.userData.type === 'k').forEach((king) => { const side = king.userData.color === 'w' ? -1 : 1; king.userData.moveFrom = king.position.clone(); king.userData.moveTo = new THREE.Vector3(side * .72, .13, 0); king.userData.moveStartedAt = performance.now(); king.userData.handshakeSide = side; king.userData.handshakeRotation = side === -1 ? Math.PI / 2 : -Math.PI / 2; if (king.userData.handshakeVisual) king.userData.handshakeVisual.rotation.y = 0; }); } }
    };
    const highlight = (chess, source = '') => { const legal = source ? new Set(chess.moves({ square: source, verbose: true }).map((move) => move.to)) : new Set(); squares.forEach((square) => { const active = square.userData.square === source; const target = legal.has(square.userData.square); square.material.emissive.set(active ? '#b6f45f' : target ? '#4f8d58' : '#000000'); square.material.emissiveIntensity = active ? .72 : target ? .42 : 0; }); drawMoveHints(legalHints, chess, source); };
    makeBoard(); sync(); sceneState.current = { scene, camera, renderer, board, pieces, capturedPieces, squares, sync, makeBoard, highlight };
    const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let pointerDown = null;
    const setPointer = (event) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); };
    const rootForObject = (object) => { let current = object; while (current && current.parent !== pieces) current = current.parent; return current?.parent === pieces ? current : null; };
    const hover = (event) => { setPointer(event); ray.setFromCamera(pointer, camera); const root = rootForObject(ray.intersectObjects(pieces.children, true)[0]?.object); if (hovered.current !== root) { if (hovered.current) hovered.current.userData.hovered = false; hovered.current = root; if (root) root.userData.hovered = true; renderer.domElement.style.cursor = root ? 'pointer' : 'grab'; } };
    const rememberPointer = (event) => {
      pointerDown = { x: event.clientX, y: event.clientY };
      setPointer(event); ray.setFromCamera(pointer, camera);
      const square = ray.intersectObjects(squares)[0]?.object.userData.square;
      const chess = safeChess(fenRef.current);
      if (!chess) { controls.enabled = true; return; }
      controls.enabled = !square || (!selected.current && chess.get(square)?.color !== chess.turn());
    };
    let combatBusy = false;
    let combatFrame = 0;
    const startCapture = (move, from) => {
      const attacker = pieces.children.find((piece) => piece.userData.square === from);
      const victimSquare = move.flags.includes('e') ? `${move.to[0]}${from[1]}` : move.to;
      const victim = pieces.children.find((piece) => piece.userData.square === victimSquare);
      if (!attacker || !victim) { moveRef.current?.(from, move.to); return; }
      combatBusy = true;
      const startingFen = fenRef.current;
      const origin = attacker.position.clone();
      const destination = boardPosition(move.to, .13);
      const approach = destination.clone().lerp(origin, .22);
      const slashMaterial = new THREE.MeshBasicMaterial({ color: '#ffd277', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const slashGeometry = new THREE.TorusGeometry(.43, .035, 6, previewQuality === 'low' ? 18 : 32, Math.PI * 1.3);
      const slash = new THREE.Mesh(slashGeometry, slashMaterial);
      slash.position.set(destination.x, .9, destination.z);
      slash.rotation.z = -.75;
      combatEffects.add(slash);
      playRigAction(attacker, 'walk');
      let struck = false;
      const start = performance.now();
      const tick = (now) => {
        if (disposed || fenRef.current !== startingFen) { combatEffects.remove(slash); slashGeometry.dispose(); slashMaterial.dispose(); combatBusy = false; return; }
        const progress = Math.min(1, (now - start) / 870);
        const approachProgress = Math.min(1, progress / .52);
        if (progress < .52) attacker.position.lerpVectors(origin, approach, 1 - (1 - approachProgress) ** 3);
        else attacker.position.lerpVectors(approach, destination, Math.min(1, (progress - .52) / .48));
        if (progress >= .52 && !struck) { struck = true; playRigAction(attacker, 'attack'); playRigAction(victim, 'death'); }
        if (struck) {
          const impact = Math.min(1, (progress - .52) / .4);
          attacker.rotation.z = Math.sin(impact * Math.PI) * .26;
          victim.rotation.z = -impact * 1.25;
          slashMaterial.opacity = Math.max(0, 1 - impact);
          slash.scale.setScalar(.7 + impact * .7);
        }
        if (progress < 1) combatFrame = requestAnimationFrame(tick);
        else {
          combatEffects.remove(slash); slashGeometry.dispose(); slashMaterial.dispose();
          attacker.rotation.z = 0; combatBusy = false; completedCaptureTarget = move.to;
          moveRef.current?.(from, move.to);
        }
      };
      combatFrame = requestAnimationFrame(tick);
    };
    const click = (event) => {
      if (status !== 'active' || combatBusy || pieces.children.some((piece) => piece.userData.formation && piece.userData.moveTo) || (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7)) return;
      setPointer(event); ray.setFromCamera(pointer, camera);
      const square = ray.intersectObjects(squares)[0]?.object.userData.square;
      if (!square) return;
      const chess = safeChess(fenRef.current);
      if (!chess) return;
      const move = selected.current && chess.moves({ square: selected.current, verbose: true }).find((item) => item.to === square);
      if (move) {
        const from = selected.current;
        selected.current = null; setSelectedSquare(''); highlight(chess);
        if ((move.captured || move.flags.includes('e')) && !move.flags.includes('p')) startCapture(move, from);
        else if (move.flags.includes('p')) promoteRef.current?.(from, square, chess.get(from)?.color ?? 'w');
        else { playRigAction(pieces.children.find((item) => item.userData.square === from), 'walk'); moveRef.current?.(from, square); }
        return;
      }
      const piece = chess.get(square);
      selected.current = piece?.color === chess.turn() ? square : null;
      setSelectedSquare(selected.current ?? '');
      highlight(chess, selected.current ?? '');
    };
    const releasePointer = (event) => { if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 7) click(event); pointerDown = null; controls.enabled = true; };
    const clearHover = () => { if (hovered.current) hovered.current.userData.hovered = false; hovered.current = null; pointerDown = null; controls.enabled = true; renderer.domElement.style.cursor = 'grab'; };
    if (!compactPreview) { renderer.domElement.addEventListener('pointerdown', rememberPointer); renderer.domElement.addEventListener('pointerup', releasePointer); renderer.domElement.addEventListener('pointermove', hover); renderer.domElement.addEventListener('pointerleave', clearHover); }
    let frame; const clock = new THREE.Clock(); const render = () => { const delta = Math.min(clock.getDelta(), .05); const elapsed = clock.elapsedTime; const now = performance.now(); [...pieces.children, ...capturedPieces.children].forEach((piece) => { piece.userData.mixer?.update(delta); const age = Math.min(1, (now - piece.userData.spawnedAt) / 260); const isSelected = !piece.userData.captured && piece.userData.square === selected.current; const target = (piece.userData.targetScale ?? .86) * (isSelected ? 1.12 : piece.userData.hovered ? 1.08 : 1); piece.scale.setScalar(target * (.84 + (1 - Math.pow(1 - age, 3)) * .16)); if (piece.userData.moveTo) { const duration = piece.userData.moveDuration ?? (piece.userData.type === 'n' ? 620 : 760); const progress = Math.min(1, Math.max(0, (now - piece.userData.moveStartedAt) / duration)); const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; piece.position.lerpVectors(piece.userData.moveFrom, piece.userData.moveTo, eased); piece.position.y += Math.sin(Math.PI * progress) * (piece.userData.formation ? .055 : piece.userData.type === 'n' ? .58 : .12); if (piece.userData.handshakeSide) { piece.rotation.y = piece.userData.handshakeRotation; piece.rotation.z = piece.userData.handshakeSide * Math.sin(Math.PI * eased) * .08; if (piece.userData.handshakeVisual) piece.userData.handshakeVisual.rotation.y = 0; } if (progress >= 1) { piece.position.copy(piece.userData.moveTo); delete piece.userData.moveTo; delete piece.userData.moveFrom; delete piece.userData.moveDuration; delete piece.userData.formation; playRigAction(piece, 'idle'); } } else piece.position.y = piece.userData.baseY + (piece.userData.captured ? 0 : Math.sin(elapsed * 1.25 + piece.userData.phase) * .009) + (isSelected ? .16 : piece.userData.hovered ? .11 : 0); const crest = piece.children.find((child) => child.userData.rankMarker); if (crest) crest.scale.setScalar(isSelected ? .42 : piece.userData.hovered ? .36 : .28); }); arrest.children.forEach((cage) => { const progress = Math.min(1, (now - cage.userData.spawnedAt) / 720); const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; cage.position.y = .13 + eased * .02; cage.scale.setScalar(.76 + eased * .24); cage.rotation.y = Math.sin(elapsed * 1.2) * .025; }); victory.children.forEach((decor) => { const progress = Math.min(1, (now - decor.userData.spawnedAt) / 850); decor.scale.setScalar(.35 + progress * .65); decor.position.y = .13 + Math.sin(elapsed * 2.2) * .06; decor.rotation.y = elapsed * .55; }); draw.children.forEach((handshake) => { const progress = Math.min(1, (now - handshake.userData.spawnedAt) / 700); const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2; const shake = progress < .48 ? 0 : Math.sin((progress - .48) * Math.PI * 4) * .045; const reach = THREE.MathUtils.lerp(.34, .08, eased); handshake.userData.left.position.x = -reach; handshake.userData.right.position.x = reach; handshake.userData.left.position.y = shake; handshake.userData.right.position.y = shake; handshake.scale.setScalar(.72 + progress * .28); }); flames.forEach((flame) => { const flicker = 1 + Math.sin(elapsed * 7 + flame.userData.phase) * .12; const inner = flame.userData.flameLayer === 'inner'; flame.scale.set((inner ? .88 : .8) * flicker, (inner ? 1.1 : 1.25) + Math.sin(elapsed * 9 + flame.userData.phase) * .12, (inner ? .88 : .8) * flicker); flame.rotation.z = Math.sin(elapsed * 6 + flame.userData.phase) * .1; }); dust.rotation.y = elapsed * .018; controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(render); }; render();
    const resize = () => { const nextWidth = element.clientWidth; const nextHeight = document.fullscreenElement ? Math.max(420, window.innerHeight - 150) : compactPreview ? Math.max(180, Math.min(248, nextWidth * .62)) : Math.max(340, Math.min(600, nextWidth)); camera.aspect = nextWidth / nextHeight; camera.updateProjectionMatrix(); renderer.setSize(nextWidth, nextHeight); }; window.addEventListener('resize', resize);
    return () => { disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(combatFrame); window.removeEventListener('resize', resize); if (!compactPreview) { renderer.domElement.removeEventListener('pointerdown', rememberPointer); renderer.domElement.removeEventListener('pointerup', releasePointer); renderer.domElement.removeEventListener('pointermove', hover); renderer.domElement.removeEventListener('pointerleave', clearHover); } controls.dispose(); dustGeometry.dispose(); renderer.dispose(); element.replaceChildren(); sceneState.current = null; };
  }, [open, style, view, quality, coordinates, status, formationKey, compactPreview]);
  useEffect(() => { if (sceneState.current) sceneState.current.sync(); }, [fen, moves, lastMove, style, orientation, formationKey]);
  useEffect(() => { const changed = () => { const active = Boolean(document.fullscreenElement); setFullscreen(active); window.dispatchEvent(new Event('resize')); }; document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed); }, []);
  useEffect(() => { const media = window.matchMedia('(max-width: 900px)'); const update = () => setCompactViewport(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await (sectionRef.current?.closest('.workspace') ?? sectionRef.current)?.requestFullscreen?.(); } catch { setFullscreen(false); } };
  return <section ref={sectionRef} className={`web-three ${open ? 'three-open' : ''} ${compactPreview ? 'mini-preview' : ''} ${fullscreen ? 'is-fullscreen-board' : ''}`}>
    <div className="three-heading"><div><p className="label">IMMERSIVE BOARD · CHARACTER EDITION</p><h3>3D play view</h3></div><div className="three-heading-actions">{compactViewport && !fullscreen && <button className="mini-preview-toggle" onClick={() => setPreviewExpanded((expanded) => !expanded)} aria-pressed={!compactPreview}>{compactPreview ? 'Expand 3D' : 'Minimize 3D'}</button>}<button onClick={toggleFullscreen} aria-label="Full screen board" title="Full screen board">{fullscreen ? 'Exit full screen' : '⛶'}</button><button onClick={toggleOpen} aria-label={open ? 'Hide 3D' : 'Show 3D'} title={open ? 'Hide 3D' : 'Show 3D'}>{open ? '×' : 'Open 3D'}</button></div></div>
    {open && <><div className="model-status" data-ready={assetStatus.includes('ready')}>{assetStatus}</div><div ref={host} className="three-canvas" /><p className="three-hint">{compactPreview ? 'Live mini preview · expand 3D for the full character board and controls.' : formationActive ? 'Armies entering formation...' : selectedSquare ? `Selected ${selectedSquare} - choose a legal destination.` : 'Tap to move - drag empty space to orbit - wheel or pinch to zoom.'}</p></>}
  </section>;
}
