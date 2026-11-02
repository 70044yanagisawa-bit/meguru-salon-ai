/*
  シェアサロン J.A.M 仙台店 — バーチャル店舗案内（three.js）

  流れ： 外観（FV） → カーソルを動かすほど入口へ近づき、扉が開いて中へ
        → 上からフロア全体を見渡す → 部屋をクリックするとズームイン

  店内はいただいた間取り図をもとに、コードで組んだ3Dモデルです。
  間取り図の画像（1536×1024px）の座標をそのまま使っているので、
  直すときは PLAN の数字を間取り図の位置に合わせて書き換えてください。
  3Dでの単位はメートル。x：左右 / y：高さ / z：手前（＋）〜奥（−）
*/
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPOTS, STORE } from './spots.js';

/* ================================================================
   間取り（間取り図のピクセル座標）
   ================================================================ */
const PX = 0.0135; // 間取り図 1px = 1.35cm（個室Aの幅 ≒ 1.7m から逆算）
const ORIGIN = [1195, 538]; // 入口（▲）の位置を 3D の原点にする
const X = (px) => (px - ORIGIN[0]) * PX;
const Z = (py) => (py - ORIGIN[1]) * PX;
const P = (px, py, y = 0) => new THREE.Vector3(X(px), y, Z(py));

const H_CEIL = 3.6; // 天井（むき出しの躯体）
const H_ROOM = 2.7; // 個室の壁の高さ（上は天井まで抜けている）
const H_WAIN = 1.0; // 腰壁（木目）の高さ

const PLAN = {
  bounds: [105, 88, 1325, 930],
  // 外周の壁 [x1, y1, x2, y2]
  outer: [
    [105, 88, 1325, 88], [1322, 88, 1322, 538], [1250, 538, 1325, 538], [583, 538, 1140, 538],
    [717, 538, 717, 930], [105, 930, 717, 930], [105, 88, 105, 930],
  ],
  // 個室・小部屋の壁
  walls: [
    [695, 127, 695, 345], [695, 345, 768, 345, 'glass'], // B
    [833, 88, 833, 342], [833, 342, 893, 342, 'glass'], // A
    [962, 88, 962, 342], [1040, 342, 1322, 342], // R1
    [460, 212, 695, 212], [460, 212, 460, 345], [460, 345, 620, 345, 'glass'], // C
    [460, 412, 460, 420], [460, 420, 498, 420], [498, 420, 498, 605], [405, 605, 498, 605],
    [405, 605, 405, 823], [405, 823, 462, 823], [462, 823, 462, 930], // R2 の左側
    [583, 420, 645, 420], [705, 420, 762, 420], [583, 420, 583, 538], [762, 420, 762, 492], // 小部屋
    [836, 420, 938, 420], [938, 420, 938, 538], [1010, 420, 1115, 420, 'glass'], [1115, 420, 1115, 538], // D
  ],
  // 柱
  pillars: [[685, 88, 762, 127], [1258, 88, 1322, 138], [1255, 497, 1322, 538], [685, 492, 762, 538]],
  // 開き戸（蝶番の位置, 扉の先端の位置）
  doors: [[965, 342, 1040, 342], [460, 345, 460, 412], [500, 478, 575, 478]],
  // 左側の広いスペース（図にラベルがないので、暗く表示してクリック不可）
  unlabeled: [[105, 88, 460, 930], [460, 88, 695, 212]],
};

// クリックできる場所。rect：部屋の範囲 / cam・look：ズームしたときの視点（px, px, 高さm）
const LAYOUT = {
  entrance: { rect: [1115, 342, 1322, 538], cam: [1196, 640, 1.7], look: [1170, 345, 1.45], fov: 54 },
  roomR1: { rect: [962, 88, 1322, 342], cam: [1005, 330, 1.75], look: [1190, 140, 0.9], fov: 64 },
  roomA: { rect: [833, 88, 962, 342], cam: [928, 395, 2.35], look: [888, 120, 0.85], fov: 62 },
  roomB: { rect: [695, 127, 833, 345], cam: [800, 398, 2.35], look: [758, 150, 0.85], fov: 62 },
  roomC: { rect: [460, 212, 695, 345], cam: [668, 392, 2.35], look: [480, 265, 0.85], fov: 62 },
  roomR2: { rect: [462, 538, 717, 930], cam: [545, 545, 1.85], look: [600, 900, 0.95], fov: 62 },
  roomD: { rect: [938, 420, 1115, 538], cam: [972, 405, 2.0], look: [1075, 525, 0.75], fov: 64 },
  backyard: { rect: [583, 420, 762, 538], cam: [745, 432, 3.1], look: [608, 505, 0.5], fov: 64 },
};

// 外観 → ビルの入口 → J.A.M の入口 のカメラの通り道（進み具合 0〜1）
const FACADE_Z = 7.2;
const STREET_PATH = {
  pos: [[-1.2, 1.7, 26], [-0.4, 1.7, 16], [0, 1.66, 9.6], [0, 1.64, FACADE_Z - 0.6], [0, 1.65, 3.4], [0, 1.65, 0.9]],
  look: [[-3.5, 5.6, FACADE_Z], [-1.5, 4.2, FACADE_Z], [0, 2.0, 0], [0, 1.75, -1], [0, 1.6, -2.4], [0, 1.5, -3]],
};
const OVERVIEW = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
const STREET_FOV = 40;

/* ================================================================
   状態
   ================================================================ */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isSmall = () => window.innerWidth <= 760;

const state = {
  mode: 'street', // street → entering → floor ⇄ booth
  progress: 0,
  progressTarget: 0,
  rewinding: false,
  hover: null,
  active: null,
  mouse: new THREE.Vector2(0, 0),
  mouseSmooth: new THREE.Vector2(0, 0),
  panelShift: 0,
};

const $ = (s) => document.querySelector(s);
const body = document.body;

/* ================================================================
   テクスチャ（画像ファイルを使わず、その場で描く）
   ================================================================ */
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// 床：ベージュの石目調タイル（写真の床）
function travertineTex(repeat) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d6c2a8'; g.fillRect(0, 0, w, h);
    const tiles = 2, ts = w / tiles;
    for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
      g.save();
      g.beginPath(); g.rect(tx * ts, ty * ts, ts, ts); g.clip();
      g.fillStyle = `rgba(${rnd() > .5 ? '255,245,230' : '150,120,90'},${0.06 + rnd() * 0.08})`;
      g.fillRect(tx * ts, ty * ts, ts, ts);
      // 流れるような石目
      const a0 = (rnd() - 0.5) * 0.5;
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = rnd() > 0.5 ? `rgba(255,248,236,${0.12 + rnd() * 0.2})` : `rgba(140,108,78,${0.08 + rnd() * 0.14})`;
        g.lineWidth = 1 + rnd() * 6;
        g.filter = `blur(${(rnd() * 2).toFixed(1)}px)`;
        let x = tx * ts - 40, y = ty * ts + rnd() * ts;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 12; s++) { x += ts / 10; y += Math.sin(s * 0.8 + i) * 8 + a0 * 30; g.lineTo(x, y); }
        g.stroke();
      }
      g.filter = 'none';
      g.restore();
    }
    g.strokeStyle = 'rgba(120,96,70,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= tiles; i++) {
      const p = i * ts;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
  }, { repeat });
}

function marbleTex({ base, vein, veins = 26, repeat = [1, 1] }) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < veins; i++) {
      g.strokeStyle = vein.replace('A', (0.2 + rnd() * 0.35).toFixed(2));
      g.lineWidth = 0.6 + rnd() * 1.8;
      let x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 50; s++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 10; y += Math.sin(a) * 10; g.lineTo(x, y); }
      g.stroke();
    }
  }, { repeat });
}

// 木目（腰壁は細かい縦の木目）
function woodTex({ base, repeat = [1, 1], vertical = true, lines = 320 }) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < lines; i++) {
      const p = rnd() * w, l = rnd() > 0.5;
      g.strokeStyle = l ? `rgba(255,220,180,${0.03 + rnd() * 0.05})` : `rgba(0,0,0,${0.06 + rnd() * 0.12})`;
      g.lineWidth = 0.5 + rnd() * 2;
      g.beginPath();
      for (let s = 0; s <= 16; s++) {
        const q = (s / 16) * h, wob = Math.sin(s * 0.5 + p) * 1.5;
        vertical ? (s ? g.lineTo(p + wob, q) : g.moveTo(p + wob, q)) : (s ? g.lineTo(q, p + wob) : g.moveTo(q, p + wob));
      }
      g.stroke();
    }
  }, { repeat });
}

function noiseTex({ base, dots = 9000, light = 18, repeat = [1, 1], grid = null }) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < dots; i++) {
      const v = rnd() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${rnd() * light / 255})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
    if (grid) {
      const [cols, rows, col] = grid;
      g.strokeStyle = col || 'rgba(0,0,0,.45)'; g.lineWidth = 2.5;
      for (let i = 0; i <= cols; i++) { const p = (i / cols) * w; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); }
      for (let i = 0; i <= rows; i++) { const p = (i / rows) * h; g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
    }
  }, { repeat });
}

// ビル1階の黒い丸模様のパネル
function circlePanelTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#0d0d0e'; g.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = x * s + s / 2, cy = y * s + s / 2;
      const gr = g.createRadialGradient(cx - s * 0.12, cy - s * 0.12, s * 0.05, cx, cy, s * 0.46);
      gr.addColorStop(0, 'rgba(90,90,96,.55)'); gr.addColorStop(0.7, 'rgba(25,25,28,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, s * 0.46, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(140,140,150,.25)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, s * 0.4, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeRect(x * s, y * s, s, s);
    }
  }, { repeat });
}

// ガラスブロック
function glassBlockTex(repeat) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b9c4c6'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(0.5, 'rgba(160,175,178,.2)'); gr.addColorStop(1, 'rgba(255,255,255,.5)');
    g.fillStyle = gr; g.fillRect(6, 6, w - 12, h - 12);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(14 + i * 28, 14); g.bezierCurveTo(30 + i * 24, 50, 4 + i * 30, 80, 20 + i * 28, h - 14); g.stroke(); }
    g.strokeStyle = 'rgba(230,230,225,1)'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
  }, { repeat, aniso: 4 });
}

// 2階の窓の奥に見える照明（写真のライン照明）
function lineLightTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#20262b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const y = 18 + i * 26;
      g.fillStyle = 'rgba(235,245,255,.95)';
      g.fillRect(30 + (i % 2) * 20, y, w - 80, 3);
    }
    g.fillStyle = 'rgba(200,215,225,.15)'; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
}

function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
}

// ミラーの裏から漏れる光（リング状）
function haloTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.25, 'rgba(255,200,130,.55)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
}

function textTex(lines, { w = 1024, h = 256, color = '#ecd6a2', bg = null } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of lines) {
      g.font = l.font;
      if ('letterSpacing' in g) g.letterSpacing = l.spacing || '0px';
      g.fillText(l.text, w / 2 + (l.dx || 0), l.y);
    }
  }, { aniso: 4 });
}
const LOGO_LINES = [
  { text: 'J.A.M', font: '500 150px "Cormorant Garamond", serif', y: 100, spacing: '18px', dx: 9 },
  { text: 'Share salon', font: '400 40px "Cormorant Garamond", serif', y: 205, spacing: '14px', dx: 7 },
];

/* ================================================================
   three.js の準備
   ================================================================ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

const stage = $('#stage');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(STREET_FOV, innerWidth / innerHeight, 0.05, 200);
let composer, bloom;

const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: STREET_FOV };
const spotObjects = {};
const hitMeshes = [];
const groups = {};
const mats = {};

function std(params) { return new THREE.MeshStandardMaterial(params); }

function makeMaterials() {
  const [x0, y0, x1, y1] = PLAN.bounds;
  const fw = (x1 - x0) * PX, fd = (y1 - y0) * PX;
  mats.floor = std({ map: travertineTex([fw / 1.8, fd / 1.8]), roughness: 0.48, envMapIntensity: 0.4 });
  mats.wain = std({ map: woodTex({ base: '#4a3324', repeat: [3, 1] }), roughness: 0.55, envMapIntensity: 0.3 });
  mats.cream = std({ map: noiseTex({ base: '#e9e1d2', light: 10, repeat: [3, 2] }), roughness: 0.92, envMapIntensity: 0.25 });
  mats.ceiling = std({ color: 0xdcd6cc, roughness: 0.9, envMapIntensity: 0.15 });
  mats.beam = std({ color: 0xd2ccc1, roughness: 0.9, envMapIntensity: 0.15 });
  mats.pillar = std({ color: 0xece6db, roughness: 0.85, envMapIntensity: 0.2 });
  mats.glassBlock = std({ map: glassBlockTex([1, 1]), color: 0xd4dcdd, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.7, envMapIntensity: 0.6 });
  mats.steel = std({ color: 0xc9cbcc, metalness: 1, roughness: 0.32, envMapIntensity: 1 });
  mats.chrome = std({ color: 0xe2e2e2, metalness: 1, roughness: 0.12, envMapIntensity: 1.2 });
  mats.gold = std({ color: 0xc9a46a, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
  mats.doorWood = std({ map: woodTex({ base: '#6a4b35', repeat: [1, 1] }), roughness: 0.5, envMapIntensity: 0.35 });
  mats.leather = std({ color: 0x111111, roughness: 0.42, envMapIntensity: 0.6 });
  mats.black = std({ color: 0x141414, roughness: 0.5, envMapIntensity: 0.4 });
  mats.lockerGray = std({ color: 0xc9c5bd, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.4 });
  mats.porcelain = std({ color: 0xc4c1bb, roughness: 0.22, envMapIntensity: 0.3 });
  mats.basin = std({ color: 0xbfbcb7, roughness: 0.2, envMapIntensity: 0.6 });
  mats.mirror = std({ color: 0x7c8084, metalness: 1, roughness: 0.04, envMapIntensity: 0.8 });
  mats.velvet = std({ color: 0xd8ccb6, roughness: 1, envMapIntensity: 0.2 });
  mats.burgundy = std({ color: 0x3e1f22, roughness: 0.45, envMapIntensity: 0.4 });
  mats.marbleTop = std({ map: marbleTex({ base: '#d9d9d6', vein: 'rgba(120,120,125,A)' }), roughness: 0.25, envMapIntensity: 0.4 });
  mats.whiteMetal = std({ color: 0xcfcfcb, roughness: 0.4, metalness: 0.2, envMapIntensity: 0.4 });
  mats.brownWagon = std({ color: 0x3a221a, roughness: 0.35, metalness: 0.3 });
  mats.basket = std({ color: 0xb59c7a, roughness: 0.9 });
  mats.plant = std({ color: 0x2c3d24, roughness: 0.85, flatShading: true, envMapIntensity: 0.2 });
  mats.plant2 = std({ color: 0x46592f, roughness: 0.85, flatShading: true, envMapIntensity: 0.2 });
  mats.concrete = std({ map: noiseTex({ base: '#9b9993', light: 30, repeat: [3, 1] }), roughness: 0.9, envMapIntensity: 0.2 });
  mats.granite = std({ map: noiseTex({ base: '#4f4d4a', dots: 26000, light: 46, repeat: [5, 4], grid: [4, 8, 'rgba(30,30,30,.55)'] }), roughness: 0.75, envMapIntensity: 0.3 });
  mats.frosted = std({ color: 0x5f6b68, roughness: 0.6, metalness: 0.2, emissive: 0x4d5c58, emissiveIntensity: 0.05, envMapIntensity: 0.2 });
  mats.circlePanel = std({ map: circlePanelTex([3, 3]), roughness: 0.4, metalness: 0.5, envMapIntensity: 0.6 });
  mats.curtain = std({ color: 0x16202a, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.25, envMapIntensity: 1.6, depthWrite: false });
  mats.mullion = std({ color: 0x8e9194, metalness: 0.8, roughness: 0.35, envMapIntensity: 0.45 });
  mats.lobbyFloor = std({ map: noiseTex({ base: '#8f8b84', light: 24, repeat: [6, 4], grid: [2, 2, 'rgba(60,60,60,.4)'] }), roughness: 0.3, envMapIntensity: 0.5 });
  mats.sidewalk = std({ map: noiseTex({ base: '#5d5b57', light: 26, repeat: [16, 4], grid: [1, 1] }), roughness: 0.4, metalness: 0.15, envMapIntensity: 0.4 });
  mats.asphalt = std({ map: noiseTex({ base: '#1a1a1a', light: 30, repeat: [20, 10] }), roughness: 0.4, metalness: 0.25, envMapIntensity: 0.4 });
  mats.warmLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd7a0, emissiveIntensity: 2.6 });
  mats.coolLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xeef4ff, emissiveIntensity: 2.2 });
  mats.halo = new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd9a8 });
  mats.shadow = new THREE.MeshBasicMaterial({ map: glowTex('rgba(0,0,0,.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
  mats.hit = new THREE.MeshBasicMaterial({ visible: false });
}

/* 小さな道具 */
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent && parent.add(m);
  return m;
}
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  parent && parent.add(m);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  parent && parent.add(m);
  return m;
}
function plane(w, h, mat, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  parent && parent.add(m);
  return m;
}
function contactShadow(w, d, x, z, parent, o = 0.5) {
  const m = plane(w, d, mats.shadow.clone(), parent);
  m.material.opacity = o;
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z);
  m.renderOrder = 1;
  return m;
}
// 家具を置くためのグループ（ローカルの +z が正面）
function place(parent, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  parent.add(g);
  return g;
}
function shrubs(parent, x, z, w, d, h, n) {
  for (let i = 0; i < n; i++) {
    const s = 0.14 + rnd() * 0.22;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rnd() > 0.5 ? mats.plant : mats.plant2);
    m.position.set(x + (rnd() - 0.5) * w, h * (0.3 + rnd() * 0.7), z + (rnd() - 0.5) * d);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    parent.add(m);
  }
}
function tree(parent, x, z, h) {
  cyl(0.06, 0.09, h * 0.6, std({ color: 0x3b3025, roughness: 0.9 }), x, h * 0.3 + 0.7, z, parent, 8);
  for (let i = 0; i < 26; i++) {
    const s = 0.3 + rnd() * 0.4;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rnd() > 0.4 ? mats.plant : mats.plant2);
    const a = rnd() * Math.PI * 2, r = rnd() * 1.3;
    m.position.set(x + Math.cos(a) * r, 0.7 + h * (0.55 + rnd() * 0.45), z + Math.sin(a) * r);
    parent.add(m);
  }
}

/* ================================================================
   外観（いただいたビルの写真がモチーフ。他テナントの看板は入れない）
   ================================================================ */
function buildStreet() {
  const street = new THREE.Group();
  groups.street = street;
  scene.add(street);
  const F = FACADE_Z;

  // 歩道・車道
  const walk = plane(80, 8, mats.sidewalk, street);
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0, F + 4);
  const road = plane(140, 60, mats.asphalt, street);
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.12, F + 38);
  box(80, 0.12, 0.25, mats.concrete, 0, -0.06, F + 8, street);

  // ビル本体（石張りの外壁）
  const bx0 = -18, bx1 = 6, top = 17;
  const bw = bx1 - bx0, bcx = (bx0 + bx1) / 2;
  box(bw, top - 7.6, 0.6, mats.granite, bcx, 7.6 + (top - 7.6) / 2, F - 0.3, street);
  // すりガラスの帯（写真の横のライン）
  box(bw + 0.02, 0.9, 0.62, mats.frosted, bcx, 11.8, F - 0.3, street);
  box(bw + 0.4, 0.3, 0.9, mats.granite, bcx, top + 0.15, F - 0.3, street);
  // 1階：丸模様の黒いパネル（左） / ガラスのカーテンウォール（中央） / 石張り（右）
  box(-5 - bx0, 7.6, 0.6, mats.circlePanel, (bx0 - 5) / 2, 3.8, F - 0.3, street);
  box(bx1 - 5, 7.6, 0.6, mats.granite, (bx1 + 5) / 2, 3.8, F - 0.3, street);
  const curtain = plane(10, 7.6, mats.curtain, street);
  curtain.position.set(0, 3.8, F);
  for (let i = 0; i <= 7; i++) box(0.09, 7.6, 0.16, mats.mullion, -5 + i * (10 / 7), 3.8, F, street);
  box(10, 0.12, 0.18, mats.mullion, 0, 3.6, F, street);
  box(10, 0.14, 0.18, mats.mullion, 0, 7.55, F, street);
  // 2階の奥の明かり
  const ll = plane(10, 3.8, new THREE.MeshStandardMaterial({ color: 0x000000, emissiveMap: lineLightTex(), emissive: 0xffffff, emissiveIntensity: 0.32 }), street);
  ll.position.set(0, 5.6, F - 1.2);
  box(10, 0.2, 1.2, mats.granite, 0, 3.66, F - 0.6, street);

  // 入口の自動ドア
  const doors = [];
  for (const side of [-1, 1]) {
    const d = new THREE.Group();
    const g = plane(1.18, 2.6, mats.curtain, d); g.position.set(0, 1.32, 0);
    box(1.2, 0.05, 0.06, mats.mullion, 0, 0.04, 0, d);
    box(1.2, 0.05, 0.06, mats.mullion, 0, 2.62, 0, d);
    box(0.05, 2.6, 0.06, mats.mullion, -0.58, 1.32, 0, d);
    box(0.05, 2.6, 0.06, mats.mullion, 0.58, 1.32, 0, d);
    d.position.set(side * 0.6, 0, F + 0.12);
    d.userData.home = side * 0.6; d.userData.side = side;
    street.add(d); doors.push(d);
  }
  groups.doors = doors;

  // J.A.M の案内サイン（入口の横）
  const sign = textTex(LOGO_LINES);
  const stand = new THREE.Group();
  box(0.9, 1.5, 0.08, mats.black, 0, 0.95, 0, stand);
  const sm = plane(0.8, 0.2, new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 1.4, transparent: true, color: 0x000000, depthWrite: false }), stand);
  sm.position.set(0, 1.42, 0.045);
  box(0.6, 0.02, 0.02, mats.gold, 0, 1.24, 0.045, stand);
  stand.position.set(2.0, 0, F + 1.0);
  stand.rotation.y = -0.25;
  street.add(stand);

  // コンクリートのプランターと植栽（写真の植え込み）
  for (const [x0, x1] of [[-13, -2.2], [2.2, 5.6]]) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    box(w, 0.75, 1.6, mats.concrete, cx, 0.375, F + 2.2, street);
    shrubs(street, cx, F + 2.2, w - 0.3, 1.3, 1.4, Math.round(w * 9));
  }
  tree(street, -9.5, F + 2.2, 4.2);
  tree(street, -4.0, F + 2.1, 3.6);
  tree(street, 4.2, F + 2.3, 3.8);

  // 隣のビル
  for (const [x, h, z] of [[-28, 12, F - 1.5], [16, 14, F - 1.2], [27, 9, F - 2.5]]) {
    box(10, h, 18, std({ color: 0x1a1b1e, roughness: 0.8 }), x, h / 2, z - 9, street);
  }

  // ビルのロビー（ビルの入口から J.A.M の入口まで）
  const lobby = plane(12, F, mats.lobbyFloor, street);
  lobby.rotation.x = -Math.PI / 2; lobby.position.set(-1, 0.001, F / 2);
  box(0.2, H_CEIL, F, mats.pillar, 5, H_CEIL / 2, F / 2, street);
  box(5 - X(1325), H_CEIL, 0.2, mats.pillar, (5 + X(1325)) / 2, H_CEIL / 2, -0.1, street); // ロビー奥（J.A.M の右）
  box(0.2, H_CEIL, F - Z(930), mats.pillar, -7, H_CEIL / 2, (F + Z(930)) / 2, street); // ロビー左
  const lc = plane(12, F, mats.ceiling, street);
  lc.rotation.x = Math.PI / 2; lc.position.set(-1, H_CEIL, F / 2);
  for (let z = 1.5; z < F; z += 1.6) box(2.4, 0.03, 0.05, mats.warmLight, 0, H_CEIL - 0.02, z, street);

  // 光
  const lamp = new THREE.PointLight(0xfff0dd, 9, 12, 2); lamp.position.set(0, 3.2, F - 2.5); street.add(lamp);
  const out = new THREE.SpotLight(0xffe2bf, 18, 14, Math.PI / 5, 0.8, 2);
  out.position.set(0, 6.8, F + 3); out.target.position.set(0, 0, F + 1.5);
  street.add(out, out.target);
  const moon = new THREE.DirectionalLight(0xa9b8d8, 0.55); moon.position.set(-8, 16, 20); street.add(moon);
}

/* ================================================================
   店内（間取り図から）
   ================================================================ */
// 2色の壁（下：木目の腰壁 / 上：アイボリー）
function wall(parent, x1, y1, x2, y2, h, opts = {}) {
  const a = P(x1, y1), b = P(x2, y2);
  const len = a.distanceTo(b);
  if (len < 0.01) return;
  const t = opts.t || 0.1;
  const g = new THREE.Group();
  g.position.copy(a).lerp(b, 0.5);
  g.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  box(len + t, H_WAIN, t + 0.006, mats.wain, 0, H_WAIN / 2, 0, g);
  box(len + t, h - H_WAIN, t, mats.cream, 0, H_WAIN + (h - H_WAIN) / 2, 0, g);
  parent.add(g);
  // 写真のように、部屋の入口の端にガラスブロックの柱
  if (opts.glass) {
    const gb = box(0.2, h, 0.2, mats.glassBlock, 0, h / 2, 0, parent);
    gb.position.set(b.x, h / 2, b.z);
    gb.material = mats.glassBlock.clone();
    gb.material.map = mats.glassBlock.map.clone();
    gb.material.map.repeat.set(1, h / 0.2);
    gb.material.map.needsUpdate = true;
  }
}

function buildInterior() {
  const room = new THREE.Group();
  const ceiling = new THREE.Group();
  groups.room = room; groups.ceiling = ceiling;
  scene.add(room, ceiling);
  const [bx0, by0, bx1, by1] = PLAN.bounds;

  // 床（外周の形どおりに切り出す）
  const shape = new THREE.Shape();
  const outline = [[105, 88], [1325, 88], [1325, 538], [717, 538], [717, 930], [105, 930]];
  outline.forEach(([px, py], i) => (i ? shape.lineTo(X(px), -Z(py)) : shape.moveTo(X(px), -Z(py))));
  const fg = new THREE.ShapeGeometry(shape);
  // UV をメートル基準にしてタイルの大きさをそろえる
  const uv = fg.attributes.uv, pos = fg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 1.8, pos.getY(i) / 1.8);
  mats.floor.map.repeat.set(1, 1);
  const floor = new THREE.Mesh(fg, mats.floor);
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  // 図にラベルのない場所は暗く
  for (const [x0, y0, x1, y1] of PLAN.unlabeled) {
    const m = plane((x1 - x0) * PX, (y1 - y0) * PX, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }), room);
    m.rotation.x = -Math.PI / 2;
    m.position.set(X((x0 + x1) / 2), 0.008, Z((y0 + y1) / 2));
  }

  // 壁
  // 外周の壁は、見下ろすときだけ低くして中を見せる
  const outerG = new THREE.Group(); room.add(outerG); groups.outer = outerG;
  for (const w of PLAN.outer) wall(outerG, w[0], w[1], w[2], w[3], H_CEIL, { t: 0.18 });
  for (const w of PLAN.walls) wall(room, w[0], w[1], w[2], w[3], H_ROOM, { glass: w[4] === 'glass' });
  for (const [x0, y0, x1, y1] of PLAN.pillars) {
    box((x1 - x0) * PX, H_CEIL, (y1 - y0) * PX, mats.pillar, X((x0 + x1) / 2), H_CEIL / 2, Z((y0 + y1) / 2), room);
  }
  // 開き戸（開いた状態）
  for (const [hx, hy, ex, ey] of PLAN.doors) {
    const a = P(hx, hy), b = P(ex, ey);
    const len = a.distanceTo(b);
    const g = new THREE.Group();
    g.position.copy(a);
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    g.rotation.y = -ang - Math.PI / 2 * 0.92; // ほぼ90°開いた扉
    box(len, 2.15, 0.04, mats.doorWood, len / 2, 1.075, 0, g);
    box(0.02, 2.15, 0.05, mats.steel, len - 0.01, 1.075, 0, g);
    box(0.03, 0.14, 0.06, mats.steel, len - 0.1, 1.0, 0, g);
    room.add(g);
    // 枠
    box(0.06, 2.2, 0.14, mats.steel, a.x, 1.1, a.z, room);
    box(0.06, 2.2, 0.14, mats.steel, a.x + (b.x - a.x), 1.1, a.z + (b.z - a.z), room);
  }

  // むき出しの天井（梁とライティングレール）
  const [cx0, cz0, cx1, cz1] = [X(bx0), Z(by0), X(bx1), Z(by1)];
  const ceil = plane(cx1 - cx0, cz1 - cz0, mats.ceiling, ceiling);
  ceil.rotation.x = Math.PI / 2; ceil.position.set((cx0 + cx1) / 2, H_CEIL, (cz0 + cz1) / 2);
  for (let x = cx0 + 0.6; x < cx1; x += 1.2) box(0.12, 0.35, cz1 - cz0, mats.beam, x, H_CEIL - 0.18, (cz0 + cz1) / 2, ceiling);
  for (const z of [Z(382), Z(250)]) {
    box(cx1 - cx0 - 6, 0.04, 0.04, mats.black, (cx0 + cx1) / 2 + 3, H_CEIL - 0.5, z, ceiling);
    for (let x = cx0 + 6.5; x < cx1 - 0.5; x += 1.6) {
      cyl(0.04, 0.05, 0.16, mats.black, x, H_CEIL - 0.6, z, ceiling, 10);
      cyl(0.035, 0.035, 0.01, mats.warmLight, x, H_CEIL - 0.685, z, ceiling, 10);
    }
  }

  // 照明
  room.add(new THREE.HemisphereLight(0xfff3e4, 0x3a2e24, 0.6));
  for (const [px, py, i] of [[1200, 450, 7], [900, 382, 6], [620, 382, 6], [250, 500, 2]]) {
    const l = new THREE.PointLight(0xffe0b8, i, 0, 2);
    l.position.set(X(px), H_CEIL - 0.7, Z(py)); room.add(l);
  }

  // エントランスのロゴ（R1 の壁）
  const logo = textTex(LOGO_LINES, { color: '#b38a4e' });
  const lm = plane(1.7, 0.42, new THREE.MeshStandardMaterial({ map: logo, transparent: true, metalness: 0.7, roughness: 0.3, color: 0xffffff, emissiveMap: logo, emissive: 0xffcc88, emissiveIntensity: 0.25, depthWrite: false }), room);
  lm.position.set(X(1180), 1.75, Z(342) + 0.06);
  box(1.9, 0.02, 0.03, mats.gold, X(1180), 1.46, Z(342) + 0.06, room);

  buildRooms(room);
}

/* ---------- 家具 ---------- */
// シャンプー一体型チェア（写真の黒いチェア＋白いボウル）。ローカル −z が鏡の方向
function salonChair(parent, x, z, rotY) {
  const g = place(parent, x, z, rotY);
  rbox(0.66, 0.42, 0.95, 0.03, mats.leather, 0, 0.21, 0, g); // 本体
  rbox(0.5, 0.12, 0.55, 0.05, mats.leather, 0, 0.48, -0.05, g); // 座面
  for (const s of [-1, 1]) rbox(0.14, 0.3, 0.86, 0.05, mats.leather, s * 0.33, 0.57, 0, g); // ひじ掛け
  const back = rbox(0.52, 0.5, 0.16, 0.05, mats.leather, 0, 0.8, 0.3, g);
  back.rotation.x = 0.1;
  rbox(0.34, 0.15, 0.12, 0.05, mats.leather, 0, 1.12, 0.34, g); // ヘッドレスト
  box(0.16, 0.06, 0.03, mats.chrome, 0, 1.1, 0.41, g);
  // シャンプーボウル（背中側）
  box(0.6, 0.62, 0.42, mats.black, 0, 0.31, 0.75, g);
  rbox(0.66, 0.24, 0.52, 0.06, mats.porcelain, 0, 0.74, 0.76, g);
  const basin = plane(0.5, 0.34, mats.basin, g);
  basin.rotation.x = -Math.PI / 2; basin.position.set(0, 0.865, 0.78);
  cyl(0.012, 0.012, 0.2, mats.black, 0.22, 0.95, 0.92, g, 8);
  contactShadow(1.0, 1.7, 0, 0.3, g, 0.6);
  return g;
}
// 楕円の LED ミラー（裏から光る）。ローカル +z が鏡の正面
function ovalMirror(parent, x, y, z, rotY, w = 0.85, h = 1.05) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = rotY;
  const halo = plane(w * 1.6, h * 1.6, mats.halo, g); halo.position.z = 0.008;
  const geo = new THREE.CircleGeometry(0.5, 64);
  const m = new THREE.Mesh(geo, mats.mirror); m.scale.set(w, h, 1); m.position.z = 0.02;
  g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.49, 0.505, 64), mats.warmLight);
  ring.scale.set(w, h, 1); ring.position.z = 0.012;
  g.add(ring);
  parent.add(g);
  return g;
}
function locker(parent, x, z, rotY, mat = mats.black, h = 1.85) {
  const g = place(parent, x, z, rotY);
  box(0.45, h, 0.5, mat, 0, h / 2, 0, g);
  box(0.43, 0.006, 0.01, mats.black, 0, h * 0.62, 0.252, g);
  box(0.03, 0.08, 0.01, mats.steel, 0.16, h * 0.75, 0.255, g);
  box(0.03, 0.08, 0.01, mats.steel, 0.16, h * 0.4, 0.255, g);
  contactShadow(0.8, 0.8, 0, 0, g, 0.4);
  return g;
}
function stool(parent, x, z) {
  const g = place(parent, x, z);
  cyl(0.17, 0.17, 0.07, mats.leather, 0, 0.6, 0, g, 24);
  cyl(0.022, 0.022, 0.42, mats.chrome, 0, 0.36, 0, g, 10);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = box(0.26, 0.03, 0.04, mats.black, Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13, g); leg.rotation.y = -a; }
  contactShadow(0.6, 0.6, 0, 0, g, 0.35);
  return g;
}
function salonRoom(parent, chair, mirror, lockerAt, lightAt, stoolAt) {
  salonChair(parent, ...chair);
  if (stoolAt) stool(parent, ...stoolAt);
  ovalMirror(parent, ...mirror);
  locker(parent, ...lockerAt);
  const l = new THREE.PointLight(0xffd6a6, 2.4, 0, 2);
  l.position.copy(lightAt); parent.add(l);
}

function buildRooms(room) {
  const W = 0.06; // 壁の内側へのオフセット

  // 個室 B（写真：シャンプー一体型チェア・楕円ミラー・ロッカー・スツール）
  salonRoom(room,
    [X(758), Z(127) + 1.3, 0],
    [X(758), 1.55, Z(127) + 0.06 + W, 0],
    [X(690) + 0.3, Z(127) + 0.35, 0],
    P(760, 220, 2.6), [X(810), Z(127) + 1.7]);
  // 個室 C（鏡は左の壁）
  salonRoom(room,
    [X(460) + 1.3, Z(285), Math.PI / 2],
    [X(460) + 0.06 + W, 1.55, Z(285), Math.PI / 2],
    [X(680) - 0.3, Z(212) + 0.33, 0],
    P(560, 280, 2.6), [X(460) + 1.6, Z(232)]);

  // R1・R2：写真がまだないので、家具を置かず空の部屋にしている
  for (const [px, py] of [[1140, 215], [590, 760]]) {
    const l = new THREE.PointLight(0xfff1dc, 2.4, 0, 2); l.position.copy(P(px, py, 2.6)); room.add(l);
  }

  // 個室 A（写真：施術ベッド・シンク・デスク・丸い椅子・棚・ロッカー）
  {
    const L0 = X(833) + 0.05; // 左の壁の内側
    const bed = place(room, L0 + 0.37, Z(88) + 2.15, 0);
    rbox(0.62, 0.16, 1.85, 0.05, mats.burgundy, 0, 0.66, 0, bed);
    box(0.6, 0.02, 0.01, mats.black, 0, 0.66, -0.3, bed);
    const hole = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 24), mats.burgundy);
    hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.75, -0.75); bed.add(hole);
    box(0.5, 0.42, 1.6, mats.burgundy, 0, 0.37, 0, bed);
    for (const sz of [-0.7, 0.7]) box(0.08, 0.2, 0.08, mats.black, 0, 0.1, sz, bed);
    contactShadow(1.0, 2.4, 0, 0, bed, 0.55);
    // 奥の壁：シンク・デスク・棚
    const d = place(room, L0 + 0.85, Z(88) + 0.3, 0);
    box(0.6, 0.04, 0.5, mats.black, 0, 0.76, 0, d);
    box(0.6, 0.72, 0.04, mats.black, 0, 0.38, -0.22, d);
    box(0.45, 0.25, 0.42, mats.steel, -0.55, 0.75, 0, d);
    cyl(0.01, 0.01, 0.3, mats.chrome, -0.55, 1.0, -0.15, d, 8);
    box(1.1, 0.03, 0.26, mats.black, -0.25, 1.45, -0.12, d);
    for (const bx of [-0.6, -0.3]) box(0.26, 0.16, 0.22, mats.basket, bx, 1.55, -0.12, d);
    box(0.3, 0.2, 0.24, mats.black, 0.05, 1.565, -0.12, d);
    const ch = place(room, L0 + 0.85, Z(88) + 0.85, Math.PI);
    const seat = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.velvet);
    seat.scale.set(1, 0.6, 1); seat.position.y = 0.58; ch.add(seat);
    const backC = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.38, 24, 1, true, Math.PI * 0.75, Math.PI * 1.5), mats.velvet.clone());
    backC.material.side = THREE.DoubleSide; backC.position.y = 0.75; ch.add(backC);
    for (const [sx, sz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) cyl(0.012, 0.008, 0.43, mats.gold, sx, 0.21, sz, ch, 6);
    locker(room, X(962) - 0.29, Z(88) + 0.3, 0, mats.black);
    const l = new THREE.PointLight(0xfff1dc, 2.4, 0, 2); l.position.copy(P(897, 215, 2.6)); room.add(l);
  }

  // 個室 D（写真：ネイルテーブル・ライト・チェア・グレーのロッカー・ワゴン）
  {
    const t = place(room, X(1075), Z(538) - 0.4, Math.PI);
    box(0.9, 0.03, 0.45, mats.marbleTop, 0, 0.72, 0, t);
    for (const [sx, sz] of [[-0.42, -0.2], [0.42, -0.2], [-0.42, 0.2], [0.42, 0.2]]) box(0.02, 0.72, 0.02, mats.whiteMetal, sx, 0.36, sz, t);
    box(0.86, 0.02, 0.4, mats.whiteMetal, 0, 0.2, 0, t);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 8, 40, Math.PI), mats.whiteMetal);
    arc.position.set(-0.05, 0.74, 0.05); t.add(arc);
    rbox(0.32, 0.08, 0.16, 0.04, mats.porcelain, -0.05, 0.78, 0.0, t);
    contactShadow(1.2, 0.8, 0, 0, t, 0.45);
    const ch = place(room, X(1075), Z(538) - 0.95, 0);
    const seat = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.velvet);
    seat.scale.set(1, 0.55, 1); seat.position.y = 0.5; ch.add(seat);
    const backC = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.36, 24, 1, true, Math.PI * 0.75, Math.PI * 1.5), mats.velvet.clone());
    backC.material.side = THREE.DoubleSide; backC.position.y = 0.68; ch.add(backC);
    for (const [sx, sz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) cyl(0.01, 0.007, 0.4, mats.gold, sx, 0.2, sz, ch, 6);
    locker(room, X(1115) - 0.3, Z(420) + 0.35, -Math.PI / 2, mats.lockerGray, 1.8);
    const wg = place(room, X(940) + 0.32, Z(538) - 0.4, Math.PI / 2);
    for (const y of [0.25, 0.5, 0.78]) box(0.6, 0.02, 0.38, mats.brownWagon, 0, y, 0, wg);
    for (const [sx, sz] of [[-0.29, -0.18], [0.29, -0.18], [-0.29, 0.18], [0.29, 0.18]]) box(0.015, 0.8, 0.015, mats.brownWagon, sx, 0.4, sz, wg);
    const l = new THREE.PointLight(0xfff1dc, 1.4, 0, 2); l.position.copy(P(1025, 480, 2.5)); room.add(l);
  }

  // 共用バックヤード（写真：ロッカー・カウンター・冷蔵庫・電子レンジ・スツール）
  {
    const lk = place(room, X(617), Z(538) - 0.3, Math.PI);
    for (const sx of [-0.23, 0.23]) {
      box(0.44, 1.9, 0.5, mats.black, sx, 0.95, 0, lk);
      for (let i = 1; i < 5; i++) box(0.42, 0.008, 0.01, mats.leather, sx, i * 0.38, 0.252, lk);
    }
    contactShadow(1.2, 0.9, 0, 0, lk, 0.45);
    const ct = place(room, X(613), Z(420) + 0.3, 0);
    box(0.8, 0.04, 0.5, mats.black, 0, 0.76, 0, ct);
    const fr = place(room, X(667), Z(538) - 0.3, Math.PI);
    box(0.48, 0.85, 0.5, mats.black, 0, 0.425, 0, fr);
    box(0.44, 0.26, 0.34, mats.black, 0, 0.98, 0, fr);
    stool(room, X(625), Z(470));
    const l = new THREE.PointLight(0xfff4e6, 2, 0, 2); l.position.copy(P(660, 480, 2.5)); room.add(l);
  }

  // スポット登録
  for (const id of Object.keys(LAYOUT)) registerSpot(id, room);
}

// スポット（クリックできる場所）
function registerSpot(id, parent) {
  const L = LAYOUT[id];
  const [x0, y0, x1, y1] = L.rect;
  const w = (x1 - x0) * PX, d = (y1 - y0) * PX;
  const c = P((x0 + x1) / 2, (y0 + y1) / 2);
  const hb = box(w, H_ROOM, d, mats.hit, c.x, H_ROOM / 2, c.z, parent);
  hb.userData.spot = id;
  hitMeshes.push(hb);

  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex('rgba(236,200,140,.9)', 'rgba(236,200,140,0)'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = plane(w + 0.6, d + 0.6, glowMat, parent);
  glow.rotation.x = -Math.PI / 2; glow.position.set(c.x, 0.02, c.z);
  glow.renderOrder = 2;

  const anchor = new THREE.Object3D();
  anchor.position.set(c.x, H_ROOM + 0.5, c.z);
  parent.add(anchor);

  const view = { pos: P(L.cam[0], L.cam[1], L.cam[2]), look: P(L.look[0], L.look[1], L.look[2]), fov: L.fov || 60 };
  spotObjects[id] = { glow, anchor, view, level: 0 };
}

/* ================================================================
   カメラの動き
   ================================================================ */
const pathPos = new THREE.CatmullRomCurve3(STREET_PATH.pos.map((p) => new THREE.Vector3(...p)));
const pathLook = new THREE.CatmullRomCurve3(STREET_PATH.look.map((p) => new THREE.Vector3(...p)));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let tween = null;
function flyTo(pos, look, fov, dur, done) {
  const from = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov };
  const mid = from.pos.clone().lerp(pos, 0.5);
  mid.y = Math.max(from.pos.y, pos.y) + Math.min(3, from.pos.distanceTo(pos) * 0.2);
  tween = { from, to: { pos: pos.clone(), look: look.clone(), fov }, mid, t: 0, dur: reduceMotion ? 0.001 : dur, done };
}
function updateTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = ease(tween.t);
  const { from, to, mid } = tween;
  const a = from.pos.clone().lerp(mid, k), b = mid.clone().lerp(to.pos, k);
  cam.pos.copy(a.lerp(b, k));
  cam.look.copy(from.look).lerp(to.look, k);
  cam.fov = from.fov + (to.fov - from.fov) * k;
  if (tween.t >= 1) { const d = tween.done; tween = null; d && d(); }
}

/* ================================================================
   画面の切り替え
   ================================================================ */
function setMode(m) {
  state.mode = m;
  body.classList.toggle('is-street', m === 'street' || m === 'entering');
  body.classList.toggle('is-floor', m === 'floor');
  body.classList.toggle('is-booth', m === 'booth');
  $('#panel').setAttribute('aria-hidden', m === 'booth' ? 'false' : 'true');
}

function enterFloor() {
  if (state.mode !== 'street') return;
  state.mode = 'entering';
  state.progress = state.progressTarget = 1;
  if (!renderer) { setMode('floor'); return; }
  flyTo(OVERVIEW.pos, OVERVIEW.look, OVERVIEW.fov, 3.2, () => setMode('floor'));
}

function showFloor() {
  if (state.mode === 'street' || state.mode === 'entering') { enterFloor(); return; }
  state.active = null;
  setMode('floor');
  if (renderer) flyTo(OVERVIEW.pos, OVERVIEW.look, OVERVIEW.fov, 2.0);
}

function backToStreet() {
  if (state.mode === 'street') return;
  closeDrawer();
  state.active = null;
  setMode('entering');
  if (!renderer) { setMode('street'); return; }
  flyTo(pathPos.getPoint(1), pathLook.getPoint(1), STREET_FOV + 10, 2.2, () => {
    state.rewinding = true;
    state.progressTarget = 0;
    setMode('street');
  });
}

function focusSpot(id) {
  const i = SPOTS.findIndex((s) => s.id === id);
  if (i < 0) return;
  state.active = id;
  fillPanel(SPOTS[i], i);
  setMode('booth');
  if (renderer) {
    const v = spotObjects[id].view;
    // 縦長の画面では少し広く映す
    const fov = innerHeight > innerWidth ? Math.min(78, v.fov + 12) : v.fov;
    flyTo(v.pos, v.look, fov, 2.2);
  }
}

function stepSpot(dir) {
  const i = SPOTS.findIndex((s) => s.id === state.active);
  focusSpot(SPOTS[(i + dir + SPOTS.length) % SPOTS.length].id);
}

/* ================================================================
   HTML側（パネル・一覧・マーカー・アクセス）
   ================================================================ */
const pad2 = (n) => String(n).padStart(2, '0');

function fillPanel(s, i) {
  $('#pNum').textContent = pad2(i + 1);
  $('#pTotal').textContent = pad2(SPOTS.length);
  $('#pEn').textContent = s.en;
  $('#pJa').textContent = s.ja;
  $('#pCatch').textContent = s.catch;
  $('#pBody').textContent = s.body;
  const ph = $('#pPhoto');
  if (s.photo) { ph.src = s.photo; ph.alt = s.ja; ph.hidden = false; } else { ph.hidden = true; ph.removeAttribute('src'); }
  const dl = $('#pSpecs');
  dl.replaceChildren();
  for (const [k, v] of s.specs || []) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  $('#panel').scrollTop = 0;
}

const markerEls = {};
const guideEls = {};
function buildUI() {
  const markers = $('#markers');
  const list = $('#guideList');
  SPOTS.forEach((s) => {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'marker';
    m.innerHTML = '<span class="marker__dot"></span><span class="marker__label"></span>';
    m.querySelector('.marker__dot').textContent = s.code;
    m.querySelector('.marker__label').textContent = s.en;
    m.setAttribute('aria-label', `${s.ja}を見る`);
    m.addEventListener('click', () => focusSpot(s.id));
    m.addEventListener('pointerenter', () => setHover(s.id));
    m.addEventListener('pointerleave', () => setHover(null));
    markers.append(m);
    markerEls[s.id] = m;

    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'guide__item';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = s.code;
    b.querySelector('span').textContent = s.en;
    b.setAttribute('aria-label', s.ja);
    b.addEventListener('click', () => focusSpot(s.id));
    b.addEventListener('pointerenter', () => setHover(s.id));
    b.addEventListener('pointerleave', () => setHover(null));
    b.addEventListener('focus', () => setHover(s.id));
    b.addEventListener('blur', () => setHover(null));
    li.append(b); list.append(li);
    guideEls[s.id] = b;
  });

  $('#drawerTitle').textContent = STORE.name;
  const info = $('#storeInfo');
  for (const [k, v] of [['住所', STORE.address], ['アクセス', STORE.access], ['営業時間', STORE.hours], ['定休日', STORE.holiday], ['電話', STORE.tel]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    info.append(dt, dd);
  }
  const setLink = (el, url) => { if (url) el.href = url; else el.hidden = true; };
  setLink($('#mapLink'), STORE.mapUrl);
  setLink($('#igLink'), STORE.instagramUrl);
  document.querySelectorAll('[data-reserve]').forEach((a) => {
    if (STORE.reserveUrl) { a.href = STORE.reserveUrl; a.target = '_blank'; a.rel = 'noopener'; }
    else { a.removeAttribute('href'); a.classList.add('is-disabled'); a.setAttribute('aria-disabled', 'true'); a.title = '準備中'; }
  });
  const rh = $('#reserveHead');
  if (!STORE.reserveUrl) { rh.classList.remove('is-disabled'); rh.removeAttribute('aria-disabled'); rh.href = '#'; rh.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); }); }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'enter') enterFloor();
    else if (act === 'floor') { closeDrawer(); showFloor(); }
    else if (act === 'street') backToStreet();
    else if (act === 'prev') stepSpot(-1);
    else if (act === 'next') stepSpot(1);
    else if (act === 'access') openDrawer();
    else if (act === 'close') closeDrawer();
  });
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') closeDrawer(); });
}

let lastFocus = null;
function openDrawer() {
  lastFocus = document.activeElement;
  const d = $('#drawer');
  d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false');
  d.querySelector('.drawer__close').focus();
}
function closeDrawer() {
  const d = $('#drawer');
  if (!d.classList.contains('is-open')) return;
  d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true');
  lastFocus && lastFocus.focus && lastFocus.focus();
}

function setHover(id) {
  if (state.hover === id) return;
  if (state.hover) { markerEls[state.hover]?.classList.remove('is-hover'); guideEls[state.hover]?.classList.remove('is-hover'); }
  state.hover = id;
  if (id) { markerEls[id]?.classList.add('is-hover'); guideEls[id]?.classList.add('is-hover'); }
  stage.style.cursor = id && state.mode === 'floor' ? 'pointer' : '';
  cursorLabel(id && state.mode === 'floor' ? 'View' : '');
}

/* ================================================================
   入力
   ================================================================ */
const cursorEl = $('#cursor');
const cursorRing = $('#cursorRing');
const cursorPos = { x: innerWidth / 2, y: innerHeight / 2, sx: innerWidth / 2, sy: innerHeight / 2 };
function cursorLabel(t) {
  $('#cursorLabel').textContent = t;
  cursorEl.classList.toggle('is-label', !!t);
  cursorEl.classList.toggle('is-active', !!t);
}

const ENTER_DISTANCE = 2600; // カーソルをこれだけ動かすと中に着く（px）
let last = null;
let down = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function addProgress(v) {
  if (state.mode !== 'street' || state.rewinding) return;
  state.progressTarget = Math.min(1, Math.max(0, state.progressTarget + v));
}

function pick(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  return hit ? hit.object.userData.spot : null;
}

function onPointerMove(e) {
  state.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  cursorPos.x = e.clientX; cursorPos.y = e.clientY;
  if (e.pointerType === 'mouse' && finePointer) body.classList.add('has-cursor');
  if (last) {
    const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    addProgress(dist / (e.pointerType === 'mouse' ? ENTER_DISTANCE : ENTER_DISTANCE * 0.6));
  }
  last = { x: e.clientX, y: e.clientY };

  if (state.mode === 'floor' && renderer) {
    if (e.target.closest('#stage')) setHover(pick(e));
    else if (!e.target.closest('.marker, .guide__item')) setHover(null);
  }
}

function initInput() {
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; last = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') last = null;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    if (!e.target.closest('#stage')) return;
    if (state.mode === 'floor' && renderer) {
      const id = pick(e);
      if (id) focusSpot(id);
    }
  });
  document.addEventListener('pointerleave', () => { body.classList.remove('has-cursor'); last = null; });
  addEventListener('wheel', (e) => { addProgress(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) / 1400); }, { passive: true });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#drawer').classList.contains('is-open')) closeDrawer();
      else if (state.mode === 'booth') showFloor();
    }
    if (state.mode === 'street' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) addProgress(e.key === 'ArrowUp' ? 0.08 : -0.08);
    if (state.mode === 'booth' && e.key === 'ArrowRight') stepSpot(1);
    if (state.mode === 'booth' && e.key === 'ArrowLeft') stepSpot(-1);
  });
}

/* ================================================================
   毎フレーム
   ================================================================ */
const tmpV = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const clock = new THREE.Clock();
const RING_LEN = 163.4;
const enterBar = $('#enterBar');

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  cursorPos.sx += (cursorPos.x - cursorPos.sx) * Math.min(1, dt * 14);
  cursorPos.sy += (cursorPos.y - cursorPos.sy) * Math.min(1, dt * 14);
  cursorEl.style.transform = `translate3d(${cursorPos.sx}px, ${cursorPos.sy}px, 0)`;

  if (state.mode === 'street') {
    if (state.rewinding && state.progress < 0.02) state.rewinding = false;
    const k = reduceMotion ? 1 : Math.min(1, dt * (state.rewinding ? 1.6 : 2.4));
    state.progress += (state.progressTarget - state.progress) * k;
    if (state.progressTarget >= 1 && state.progress > 0.985) enterFloor();
  }
  const p = state.progress;
  document.documentElement.style.setProperty('--hero-o', (1 - smooth(0.04, 0.4, p)).toFixed(3));
  enterBar.style.width = `${(state.progressTarget * 100).toFixed(1)}%`;
  cursorRing.style.strokeDashoffset = (RING_LEN * (1 - state.progressTarget)).toFixed(1);

  if (!renderer) { requestAnimationFrame(frame); return; }

  if (state.mode === 'street') {
    pathPos.getPoint(p, cam.pos);
    pathLook.getPoint(p, cam.look);
    cam.fov = (innerHeight > innerWidth ? 54 : STREET_FOV) + p * 10;
  }
  updateTween(dt);

  // ビルの自動ドア：近づくと左右に開く
  const open = state.mode === 'street' ? smooth(0.3, 0.58, p) : 1;
  for (const d of groups.doors) d.position.x = d.userData.home + d.userData.side * 1.16 * open;

  // 外観は、フロア表示では消す（上から見下ろすため）
  groups.street.visible = state.mode === 'street' || (state.mode === 'entering' && cam.pos.y < 5);
  groups.ceiling.visible = cam.pos.y < H_CEIL - 0.05;
  const os = cam.pos.y > H_CEIL ? 0.62 : 1;
  groups.outer.scale.y += (os - groups.outer.scale.y) * Math.min(1, dt * 3);

  for (const id in spotObjects) {
    const o = spotObjects[id];
    const target = id === state.hover && state.mode === 'floor' ? 1 : id === state.active && state.mode === 'booth' ? 0.3 : 0;
    o.level += (target - o.level) * Math.min(1, dt * 6);
    o.glow.material.opacity = o.level * (0.75 + Math.sin(t * 3) * 0.08);
  }

  state.mouseSmooth.lerp(state.mouse, Math.min(1, dt * 3));
  const amp = state.mode === 'street' ? [0.9, 0.35] : state.mode === 'booth' ? [0.12, 0.06] : [1.4, 0.7];
  camera.position.copy(cam.pos);
  tmpV.subVectors(cam.look, cam.pos).normalize();
  right.crossVectors(tmpV, camera.up).normalize();
  up.crossVectors(right, tmpV).normalize();
  camera.position.addScaledVector(right, state.mouseSmooth.x * amp[0]).addScaledVector(up, state.mouseSmooth.y * amp[1]);
  if (!reduceMotion) camera.position.y += Math.sin(t * 0.6) * 0.02;
  camera.lookAt(cam.look);
  if (Math.abs(camera.fov - cam.fov) > 0.001) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

  // 詳細パネルが出ているときは、3Dの見える範囲をパネルの外に寄せる
  // （PC：右にパネル → 左へ / スマホ：下にパネル → 上へ）
  state.panelShift += ((state.mode === 'booth' ? 1 : 0) - state.panelShift) * Math.min(1, dt * 2.5);
  applyViewOffset();

  composer.render();
  updateMarkers();
  requestAnimationFrame(frame);
}

function applyViewOffset() {
  const w = innerWidth, h = innerHeight;
  const s = state.panelShift;
  const ox = isSmall() ? 0 : s * Math.min(230, w * 0.16);
  const oy = isSmall() ? s * h * 0.24 : 0;
  if (ox < 0.5 && oy < 0.5) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
  camera.setViewOffset(w, h, ox, oy, w, h);
}

function updateMarkers() {
  if (state.mode !== 'floor' && state.mode !== 'booth') return;
  const w = innerWidth, h = innerHeight;
  for (const id in spotObjects) {
    const el = markerEls[id];
    spotObjects[id].anchor.getWorldPosition(tmpV);
    tmpV.project(camera);
    el.classList.toggle('is-hidden', tmpV.z > 1);
    el.style.transform = `translate3d(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px, 0)`;
  }
}

// 見下ろし視点：横長の画面は手前斜めから、縦長の画面は右（入口側）から見て間取りを縦に収める
function setOverview() {
  const portrait = innerHeight > innerWidth;
  const c = P(715, 509); // 間取りの中心
  if (portrait) {
    OVERVIEW.pos.set(c.x + 11, 22.5, c.z + 0.6);
    OVERVIEW.look.set(c.x - 0.6, 0, c.z);
    OVERVIEW.fov = 50;
  } else {
    OVERVIEW.pos.set(c.x + 2.6, 15.5, c.z + 10.5);
    OVERVIEW.look.set(c.x, 0, c.z - 0.2);
    OVERVIEW.fov = 44;
  }
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  setOverview();
  if (state.mode === 'floor' && !tween) { cam.pos.copy(OVERVIEW.pos); cam.look.copy(OVERVIEW.look); cam.fov = OVERVIEW.fov; }
}

/* ================================================================
   起動
   ================================================================ */
function loaderProgress(v) {
  $('#loaderBar').style.width = `${v}%`;
  $('#loaderNum').textContent = String(Math.round(v)).padStart(3, '0');
}

async function start() {
  buildUI();
  setMode('street');
  loaderProgress(12);

  if (!renderer) {
    body.classList.add('no-webgl');
    $('#nogl').hidden = false;
    body.classList.remove('is-loading');
    setMode('floor');
    initInput();
    requestAnimationFrame(frame);
    return;
  }

  await Promise.race([
    Promise.all([
      document.fonts.load('500 150px "Cormorant Garamond"'),
      document.fonts.load('400 40px "Cormorant Garamond"'),
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  loaderProgress(36);

  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  // 夕暮れの空（写真の空の色）
  scene.background = canvasTex(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0a0e1a'); gr.addColorStop(0.45, '#1d2438'); gr.addColorStop(0.72, '#4a3b45'); gr.addColorStop(0.86, '#8a5f4c'); gr.addColorStop(1, '#2a2420');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
  scene.background.wrapS = scene.background.wrapT = THREE.ClampToEdgeWrapping;
  scene.fog = new THREE.FogExp2(0x0d0f16, 0.014);

  makeMaterials();
  loaderProgress(52);
  buildStreet();
  buildInterior();
  loaderProgress(78);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener('resize', onResize);
  onResize();
  initInput();

  pathPos.getPoint(0, cam.pos);
  pathLook.getPoint(0, cam.look);
  renderer.compile(scene, camera);
  loaderProgress(100);

  requestAnimationFrame(frame);
  setTimeout(() => body.classList.remove('is-loading'), 450);
}

start();

// 動作確認用（URLに ?debug を付けたときだけ）
if (location.search.includes('debug')) window.__jam = { state, focusSpot, showFloor, enterFloor, isIdle: () => !tween };
