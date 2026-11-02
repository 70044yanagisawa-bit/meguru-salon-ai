/*
  シェアサロンJAM 仙台店 — バーチャル店舗案内（three.js）

  流れ： 外観（FV） → カーソルを動かすほど入口へ近づき、扉が開いて店内へ
        → 上からフロア全体を見渡す → ブースをクリックするとズームイン

  店内は写真ではなく、コードで組んだ3Dモデルです（実店舗の図面ではありません）。
  配置を実際に合わせるときは、下の LAYOUT と build〜 関数の数値を直してください。
  単位はメートル。x：左右（右が＋） / y：高さ / z：奥行き（店の奥がマイナス）。
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
   基本の寸法と配置
   ================================================================ */
const ROOM = { halfW: 7, depth: 22, h: 4.2, front: -0.4 }; // 店内：x −7〜7、z −0.4〜−22
const BOOTH = { w: 3.2, d: 2.8, h: 2.6 };
const BOOTH_Z = [-7.6, -11.1, -14.6];

// rotY：その場所の「正面」の向き（0＝入口側 +z を向く）
const LAYOUT = {
  reception: {
    pos: [4.6, 0, -3.1], rotY: -Math.PI / 2, anchorY: 1.9, hit: [2.8, 2, 1.6],
    cam: [0.6, 1.75, -5.0], look: [5.6, 1.15, -2.9],
  },
  booth01: { pos: [-4.2, 0, BOOTH_Z[0]], rotY: Math.PI / 2, booth: true },
  booth02: { pos: [-4.2, 0, BOOTH_Z[1]], rotY: Math.PI / 2, booth: true },
  booth03: { pos: [-4.2, 0, BOOTH_Z[2]], rotY: Math.PI / 2, booth: true },
  booth04: { pos: [4.2, 0, BOOTH_Z[0]], rotY: -Math.PI / 2, booth: true },
  booth05: { pos: [4.2, 0, BOOTH_Z[1]], rotY: -Math.PI / 2, booth: true },
  booth06: { pos: [4.2, 0, BOOTH_Z[2]], rotY: -Math.PI / 2, booth: true },
  lounge: {
    pos: [0, 0, -11.1], rotY: 0, anchorY: 1.6, hit: [4.2, 1.4, 5.2],
    cam: [0.0, 2.3, -5.6], look: [0, 0.55, -11.6],
  },
  shampoo: {
    pos: [0, 0, -19.6], rotY: 0, anchorY: 2.1, hit: [7.6, 2, 4.6],
    cam: [-2.0, 2.1, -14.6], look: [0.6, 0.85, -20.8],
  },
};

// 外観 → 入口 → 店内 のカメラの通り道（進み具合 0〜1）
const STREET_PATH = {
  pos: [[0.6, 1.75, 17], [0.2, 1.7, 9.5], [0, 1.66, 3.2], [0, 1.64, 0.2], [0, 1.66, -3.0]],
  look: [[0, 2.5, 0], [0, 2.2, 0], [0, 1.85, -2], [0, 1.7, -8], [0, 1.55, -12]],
};
const OVERVIEW = { pos: new THREE.Vector3(5.4, 13.2, 6.2), look: new THREE.Vector3(0, 0, -10.6), fov: 42 };
const OVERVIEW_LOOK_PORTRAIT = new THREE.Vector3(0, 0, -11.2);
const OVERVIEW_LOOK_WIDE = new THREE.Vector3(0.3, 0, -9.6);
const STREET_FOV = 38;
const BOOTH_FOV = 46;

/* ================================================================
   状態
   ================================================================ */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isSmall = () => window.innerWidth <= 760;

const state = {
  mode: 'street', // street → entering → floor ⇄ booth
  progress: 0, // 外観の進み具合（表示用、なめらか）
  progressTarget: 0, // 入力で増える目標値
  rewinding: false,
  hover: null,
  active: null,
  mouse: new THREE.Vector2(0, 0), // −1〜1
  mouseSmooth: new THREE.Vector2(0, 0),
  panelShift: 0, // ブース詳細を開いたとき、画面の中心を左へずらす量
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

// 乱数を固定して、毎回同じ模様にする
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function marbleTex({ base, vein, veins = 26, tiles = 2, repeat }) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // 雲のようなむら
    g.filter = 'blur(40px)';
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '120,100,80'},${0.04 + rnd() * 0.06})`;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 60 + rnd() * 200, 0, Math.PI * 2); g.fill();
    }
    // 石目
    for (let i = 0; i < veins; i++) {
      const thick = rnd() < 0.2;
      g.filter = thick ? 'blur(3px)' : 'blur(0.6px)';
      g.strokeStyle = vein.replace('A', (thick ? 0.18 : 0.25 + rnd() * 0.35).toFixed(2));
      g.lineWidth = thick ? 4 + rnd() * 8 : 0.6 + rnd() * 1.8;
      let x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 80; s++) {
        a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 14; y += Math.sin(a) * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.filter = 'none';
    // 目地
    if (tiles > 1) {
      g.strokeStyle = 'rgba(40,30,20,.35)'; g.lineWidth = 2;
      for (let i = 1; i < tiles; i++) {
        const p = (i / tiles) * w;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
      }
    }
  }, { repeat });
}

function woodTex({ base = '#3d2618', repeat = [1, 1], vertical = true }) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const p = rnd() * w;
      const l = rnd() > 0.5;
      g.strokeStyle = l ? `rgba(255,220,180,${0.03 + rnd() * 0.05})` : `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
      g.lineWidth = 0.5 + rnd() * 2.5;
      g.beginPath();
      for (let s = 0; s <= 16; s++) {
        const q = (s / 16) * h, wob = Math.sin(s * 0.7 + p) * 3;
        vertical ? (s ? g.lineTo(p + wob, q) : g.moveTo(p + wob, q)) : (s ? g.lineTo(q, p + wob) : g.moveTo(q, p + wob));
      }
      g.stroke();
    }
  }, { repeat });
}

function noiseTex({ base, dots = 9000, light = 18, repeat, grid = 0 }) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < dots; i++) {
      const v = rnd() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${rnd() * light / 255})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    if (grid) {
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
      for (let i = 0; i <= grid; i++) {
        const p = (i / grid) * w;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
      }
    }
  }, { repeat });
}

function glowTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
}

function windowsTex(cols, rows, litRatio) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() > litRatio) continue;
      const warm = rnd() > 0.35;
      g.fillStyle = warm ? `rgba(255,${190 + rnd() * 40 | 0},${120 + rnd() * 40 | 0},${0.35 + rnd() * 0.5})` : `rgba(170,200,255,${0.2 + rnd() * 0.3})`;
      g.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.55);
    }
  }, { aniso: 1 });
}

function textTex(lines, { w = 1024, h = 256, color = '#ecd6a2' } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of lines) {
      g.font = l.font;
      if ('letterSpacing' in g) g.letterSpacing = l.spacing || '0px';
      g.fillText(l.text, w / 2 + (l.dx || 0), l.y);
    }
  }, { aniso: 4 });
}

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
const camera = new THREE.PerspectiveCamera(STREET_FOV, innerWidth / innerHeight, 0.05, 160);
let composer, bloom;

const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: STREET_FOV };
const spotObjects = {}; // id → { hit, glow, anchor, view }
const hitMeshes = [];
const groups = {};
const mats = {};

function std(params) { return new THREE.MeshStandardMaterial(params); }

function makeMaterials() {
  const envLow = 0.35;
  mats.floor = std({ map: marbleTex({ base: '#c4baab', vein: 'rgba(92,78,64,A)', tiles: 2, repeat: [ROOM.halfW * 2 / 2.4, ROOM.depth / 2.4] }), roughness: 0.16, metalness: 0, envMapIntensity: 0.6 });
  mats.marbleDark = std({ map: marbleTex({ base: '#17140f', vein: 'rgba(214,196,160,A)', tiles: 1, veins: 34, repeat: [1, 1] }), roughness: 0.12, envMapIntensity: 0.8 });
  mats.marbleLight = std({ map: marbleTex({ base: '#e6dfd3', vein: 'rgba(90,80,70,A)', tiles: 1, repeat: [1, 1] }), roughness: 0.14, envMapIntensity: 0.7 });
  mats.walnut = std({ map: woodTex({ base: '#3a2416', repeat: [1, 1] }), roughness: 0.52, envMapIntensity: envLow });
  mats.walnutH = std({ map: woodTex({ base: '#3a2416', repeat: [2, 1], vertical: false }), roughness: 0.5, envMapIntensity: envLow });
  mats.plaster = std({ map: noiseTex({ base: '#4a4038', light: 14, repeat: [4, 2] }), roughness: 0.95, envMapIntensity: 0.2 });
  mats.plasterDark = std({ map: noiseTex({ base: '#221d19', light: 12, repeat: [4, 2] }), roughness: 0.95, envMapIntensity: 0.2 });
  mats.ceiling = std({ color: 0x1b1714, roughness: 0.9, side: THREE.FrontSide, envMapIntensity: 0.1 });
  mats.stone = std({ map: noiseTex({ base: '#1d1c1a', light: 20, repeat: [6, 4], grid: 2 }), roughness: 0.7, envMapIntensity: 0.3 });
  mats.stoneUpper = std({ map: noiseTex({ base: '#171615', light: 16, repeat: [6, 8], grid: 2 }), roughness: 0.75, envMapIntensity: 0.25 });
  mats.brass = std({ color: 0xc9a46a, metalness: 1, roughness: 0.28, envMapIntensity: 1.1 });
  mats.brassDark = std({ color: 0x8c6c3e, metalness: 1, roughness: 0.38, envMapIntensity: 0.9 });
  mats.chrome = std({ color: 0xdedede, metalness: 1, roughness: 0.12, envMapIntensity: 1.2 });
  mats.leather = std({ color: 0x141211, roughness: 0.42, metalness: 0, envMapIntensity: 0.6 });
  mats.leatherTan = std({ color: 0x6b4a32, roughness: 0.5, envMapIntensity: 0.5 });
  mats.boucle = std({ map: noiseTex({ base: '#cfc4b3', dots: 30000, light: 40, repeat: [3, 3] }), roughness: 1, envMapIntensity: 0.3 });
  mats.mirror = std({ color: 0x6f7378, metalness: 1, roughness: 0.04, envMapIntensity: 0.75 });
  mats.glass = std({ color: 0x1c2228, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 1.6, depthWrite: false });
  mats.black = std({ color: 0x0c0b0a, roughness: 0.25, envMapIntensity: 0.6 });
  mats.ceramic = std({ color: 0x0f0f10, roughness: 0.08, envMapIntensity: 1, side: THREE.DoubleSide });
  mats.plant = std({ color: 0x2c3a22, roughness: 0.8, flatShading: true, envMapIntensity: 0.2 });
  mats.plant2 = std({ color: 0x40502c, roughness: 0.8, flatShading: true, envMapIntensity: 0.2 });
  mats.pot = std({ color: 0x2a2622, roughness: 0.6, envMapIntensity: 0.4 });
  mats.rug = std({ map: noiseTex({ base: '#3b3129', dots: 40000, light: 26, repeat: [2, 2] }), roughness: 1, envMapIntensity: 0.1 });
  mats.sidewalk = std({ map: noiseTex({ base: '#2b2a28', light: 26, repeat: [16, 10], grid: 1 }), roughness: 0.32, metalness: 0.25, envMapIntensity: 0.5 });
  mats.asphalt = std({ map: noiseTex({ base: '#121212', light: 30, repeat: [20, 10] }), roughness: 0.38, metalness: 0.3, envMapIntensity: 0.4 });
  mats.warmLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd7a0, emissiveIntensity: 2.6 });
  mats.warmSoft = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 1.3 });
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
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 32) {
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
function contactShadow(w, d, x, z, parent, o = 0.55) {
  const m = plane(w, d, mats.shadow.clone(), parent);
  m.material.opacity = o;
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z);
  m.renderOrder = 1;
  return m;
}
function plantCluster(x, z, scale, parent) {
  const g = new THREE.Group();
  cyl(0.28, 0.22, 0.62, mats.pot, 0, 0.31, 0, g);
  cyl(0.02, 0.03, 1.1, mats.walnut, 0, 1.05, 0, g, 6);
  for (let i = 0; i < 22; i++) {
    const s = 0.13 + rnd() * 0.16;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rnd() > 0.5 ? mats.plant : mats.plant2);
    const a = rnd() * Math.PI * 2, r = rnd() * 0.42;
    m.position.set(Math.cos(a) * r, 1.25 + rnd() * 0.95, Math.sin(a) * r);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(m);
  }
  contactShadow(1.1, 1.1, 0, 0, g, 0.6);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* ================================================================
   外観
   ================================================================ */
function buildStreet() {
  const street = new THREE.Group(); // 店の外まわり（フロア表示では隠す）
  const front = new THREE.Group(); // 店の正面（ガラス・扉・看板。フロア表示でも残す）
  groups.street = street; groups.front = front;
  scene.add(street, front);

  // 歩道と車道
  const walk = plane(60, 9, mats.sidewalk, street);
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0, 4.5);
  const road = plane(120, 60, mats.asphalt, street);
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.12, 39);
  box(60, 0.12, 0.25, mats.stone, 0, -0.06, 9.0, street); // 縁石
  // 横断歩道風の白線
  for (let i = 0; i < 8; i++) box(0.5, 0.01, 4, std({ color: 0x8a8a86, roughness: 0.5 }), -14 + i * 1.1, -0.115, 15, street);

  // 正面の壁（入口まわり、高さ ROOM.h まで）
  const t = 0.4, zc = -t / 2;
  box(5, ROOM.h, t, mats.stone, -6.5, ROOM.h / 2, zc, front);
  box(5, ROOM.h, t, mats.stone, 6.5, ROOM.h / 2, zc, front);
  box(8, ROOM.h - 3.3, t, mats.stone, 0, 3.3 + (ROOM.h - 3.3) / 2, zc, front);
  // 真鍮の枠
  box(8.2, 0.08, 0.12, mats.brass, 0, 3.3, 0.02, front);
  box(0.08, 3.3, 0.12, mats.brass, -4.04, 1.65, 0.02, front);
  box(0.08, 3.3, 0.12, mats.brass, 4.04, 1.65, 0.02, front);
  box(8.2, 0.06, 0.5, mats.brass, 0, 0.03, 0.05, front); // 敷居

  // 看板
  const sign = textTex([
    { text: 'JAM', font: '500 150px "Cormorant Garamond", serif', y: 104, spacing: '60px', dx: 30 },
    { text: 'SHARE SALON  —  SENDAI', font: '400 30px "Cormorant Garamond", serif', y: 210, spacing: '14px', dx: 7 },
  ]);
  const signMat = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 1.5, transparent: true, color: 0x000000, depthWrite: false });
  const signMesh = plane(3.6, 0.9, signMat, front);
  signMesh.position.set(0, 3.76, 0.012);

  // ガラスと扉
  const glassH = 3.24;
  const fixL = plane(2.8, glassH, mats.glass, front); fixL.position.set(-2.6, glassH / 2 + 0.03, -0.22);
  const fixR = plane(2.8, glassH, mats.glass, front); fixR.position.set(2.6, glassH / 2 + 0.03, -0.22);
  const transom = plane(2.4, 0.5, mats.glass, front); transom.position.set(0, 3.03, -0.22);
  box(2.4, 0.06, 0.1, mats.brass, 0, 2.76, -0.2, front);
  for (const x of [-1.2, 1.2]) box(0.06, 3.26, 0.1, mats.brass, x, 1.63, -0.2, front);

  const doors = [];
  for (const side of [-1, 1]) {
    const d = new THREE.Group();
    const g = plane(1.18, 2.7, mats.glass, d); g.position.set(0, 1.38, 0);
    box(1.2, 0.05, 0.06, mats.brass, 0, 0.05, 0, d);
    box(1.2, 0.05, 0.06, mats.brass, 0, 2.72, 0, d);
    box(0.05, 2.7, 0.06, mats.brass, -0.58, 1.38, 0, d);
    box(0.05, 2.7, 0.06, mats.brass, 0.58, 1.38, 0, d);
    // 取っ手
    const hx = -side * 0.42;
    cyl(0.018, 0.018, 1.3, mats.brass, hx, 1.2, 0.09, d, 12);
    box(0.02, 0.02, 0.09, mats.brass, hx, 1.75, 0.045, d);
    box(0.02, 0.02, 0.09, mats.brass, hx, 0.65, 0.045, d);
    d.position.set(side * 0.6, 0, -0.1);
    d.userData.home = side * 0.6;
    d.userData.side = side;
    front.add(d);
    doors.push(d);
  }
  groups.doors = doors;

  // 外壁の照明（縦のライン）
  for (const x of [-6.6, 6.6]) {
    box(0.06, 1.0, 0.06, mats.warmLight, x, 2.3, 0.04, front);
    box(0.16, 1.1, 0.04, mats.brassDark, x, 2.3, 0.01, front);
  }
  // 入口マット
  box(2.6, 0.02, 1.2, std({ color: 0x141210, roughness: 1 }), 0, 0.01, 0.75, street);
  box(2.66, 0.022, 0.03, mats.brass, 0, 0.011, 0.15, street);
  box(2.66, 0.022, 0.03, mats.brass, 0, 0.011, 1.35, street);

  plantCluster(-5.2, 1.1, 1.25, street);
  plantCluster(5.2, 1.1, 1.25, street);

  // 上の階
  const upper = new THREE.Group();
  street.add(upper);
  box(18, 10, 22.4, mats.stoneUpper, 0, ROOM.h + 5, -11.2, upper);
  box(18.4, 0.14, 0.5, mats.brass, 0, ROOM.h + 0.07, 0.05, upper);
  box(18.4, 0.5, 0.6, mats.stone, 0, ROOM.h + 0.35, 0.0, upper);
  const win = windowsTex(6, 6, 0.38);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.8, roughness: 0.15, emissiveMap: win, emissive: 0xffffff, emissiveIntensity: 0.9, envMapIntensity: 1 });
  const upWin = plane(16, 9, winMat, upper); upWin.position.set(0, ROOM.h + 5.3, 0.01);
  for (let i = 0; i < 7; i++) box(0.12, 9.2, 0.3, mats.stone, -8 + i * (16 / 6), ROOM.h + 5.2, 0.12, upper);

  // 隣のビル
  const nb = [[-15.5, 12, -1.0], [-25, 17, -2.5], [15.5, 9, -0.8], [25, 15, -2]];
  for (const [x, h, z] of nb) {
    box(12.6, h, 20, std({ color: 0x0f0f11, roughness: 0.8 }), x, h / 2, z - 10, street);
    const wt = windowsTex(5, Math.round(h / 1.6), 0.28);
    const m = new THREE.MeshStandardMaterial({ color: 0x050506, emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.6 });
    const p = plane(11, h - 1.5, m, street); p.position.set(x, h / 2 + 0.6, z + 0.01);
  }

  // 街灯
  const pole = new THREE.Group();
  cyl(0.06, 0.08, 5.2, mats.black, 0, 2.6, 0, pole, 12);
  box(0.9, 0.06, 0.12, mats.black, -0.4, 5.2, 0, pole);
  box(0.5, 0.05, 0.24, mats.warmLight, -0.7, 5.15, 0, pole);
  pole.position.set(9.6, 0, 7.8);
  street.add(pole);
  const lamp = new THREE.PointLight(0xffc98a, 40, 18, 2);
  lamp.position.set(9, 5, 7.8);
  street.add(lamp);

  // 入口を照らす光
  const doorLight = new THREE.SpotLight(0xffd6a6, 60, 12, Math.PI / 4.5, 0.7, 2);
  doorLight.position.set(0, 4.8, 2.6);
  doorLight.target.position.set(0, 0, 1.0);
  street.add(doorLight, doorLight.target);
  const signLight = new THREE.PointLight(0xffd4a0, 4, 4, 2);
  signLight.position.set(0, 3.0, 1.0);
  front.add(signLight);

  // 月明かり
  const moon = new THREE.DirectionalLight(0x9db0d8, 0.5);
  moon.position.set(-6, 14, 12);
  street.add(moon);
}

/* ================================================================
   店内
   ================================================================ */
function buildInterior() {
  const room = new THREE.Group();
  const ceiling = new THREE.Group();
  groups.room = room; groups.ceiling = ceiling;
  scene.add(room, ceiling);
  const W = ROOM.halfW, D = ROOM.depth, H = ROOM.h;

  // 床
  const floor = plane(W * 2, D, mats.floor, room);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -D / 2);

  // 壁
  box(0.3, H, D, mats.plaster, -W - 0.15, H / 2, -D / 2, room);
  box(0.3, H, D, mats.plaster, W + 0.15, H / 2, -D / 2, room);
  box(W * 2 + 0.6, H, 0.3, mats.plasterDark, 0, H / 2, -D - 0.15, room);
  // 幅木（真鍮）
  box(0.02, 0.06, D, mats.brassDark, -W + 0.01, 0.03, -D / 2, room);
  box(0.02, 0.06, D, mats.brassDark, W - 0.01, 0.03, -D / 2, room);

  // 天井（下向きの面だけなので、上から見ると透けて見える）
  const ceil = plane(W * 2, D, mats.ceiling, ceiling);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -D / 2);
  // ライン照明
  for (const x of [-2.6, 2.6]) {
    box(0.05, 0.03, D - 3, mats.warmLight, x, H - 0.02, -D / 2 - 0.5, ceiling);
  }
  // 天井の照明
  const lightSpots = [
    [-5.6, BOOTH_Z[0]], [-5.6, BOOTH_Z[1]], [-5.6, BOOTH_Z[2]],
    [5.6, BOOTH_Z[0]], [5.6, BOOTH_Z[1]], [5.6, BOOTH_Z[2]],
    [0, -3.2], [0, -11.1], [0, -19.6],
  ];
  for (const [x, z] of lightSpots) {
    const l = new THREE.PointLight(0xffcf98, x === 0 ? 10 : 8, 0, 2);
    l.position.set(x, H - 0.5, z);
    room.add(l);
    cyl(0.09, 0.09, 0.02, mats.warmLight, x, H - 0.01, z, ceiling, 20);
  }
  room.add(new THREE.HemisphereLight(0xfff0dc, 0x2a2018, 0.45));

  buildReception(room);
  buildRetail(room);
  for (const id of ['booth01', 'booth02', 'booth03', 'booth04', 'booth05', 'booth06']) buildBooth(id, room);
  buildLounge(room);
  buildShampoo(room);

  plantCluster(-6.3, -17.6, 1.3, room);
  plantCluster(6.3, -17.6, 1.3, room);
  plantCluster(-2.6, -1.2, 1.05, room);
}

// スポット（クリックできる場所）の共通部分
function registerSpot(id, group, { hit = [BOOTH.w, BOOTH.h, BOOTH.d], hitCenter, anchorY = BOOTH.h + 0.5, glowSize } = {}) {
  const L = LAYOUT[id];
  group.position.set(...L.pos);
  group.rotation.y = L.rotY;

  const hc = hitCenter || [0, hit[1] / 2, -hit[2] / 2];
  const hb = box(hit[0], hit[1], hit[2], mats.hit, hc[0], hc[1], hc[2], group);
  hb.userData.spot = id;
  hitMeshes.push(hb);

  const gs = glowSize || [hit[0] + 0.8, hit[2] + 0.8];
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex('rgba(236,200,140,.9)', 'rgba(236,200,140,0)'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = plane(gs[0], gs[1], glowMat, group);
  glow.rotation.x = -Math.PI / 2; glow.position.set(hc[0], 0.02, hc[2]);
  glow.renderOrder = 2;

  const anchor = new THREE.Object3D();
  anchor.position.set(hc[0], anchorY, hc[2]);
  group.add(anchor);

  // ズームしたときのカメラ位置（向きから自動で計算。LAYOUTに cam / look があればそちらを優先）
  const n = new THREE.Vector3(Math.sin(L.rotY), 0, Math.cos(L.rotY));
  const o = new THREE.Vector3(...L.pos);
  const view = {
    pos: L.cam ? new THREE.Vector3(...L.cam) : o.clone().addScaledVector(n, 2.25).add(new THREE.Vector3(0, 1.62, 0)),
    look: L.look ? new THREE.Vector3(...L.look) : o.clone().addScaledVector(n, -1.7).add(new THREE.Vector3(0, 1.2, 0)),
  };
  spotObjects[id] = { group, glow, anchor, view, level: 0 };
}

function buildBooth(id, parent) {
  const g = new THREE.Group();
  parent.add(g);
  const { w, d, h } = BOOTH;
  const no = id.slice(-2);

  // 床（木）
  const fl = plane(w - 0.1, d, mats.walnutH, g);
  fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.006, -d / 2);
  // 仕切り
  for (const s of [-1, 1]) {
    box(0.08, h, d, mats.walnut, s * (w / 2), h / 2, -d / 2, g);
    box(0.1, 0.03, d + 0.02, mats.brass, s * (w / 2), h + 0.015, -d / 2, g);
    box(0.1, h + 0.03, 0.03, mats.brass, s * (w / 2), (h + 0.03) / 2, 0.0, g); // 先端の真鍮
  }
  // 奥の壁
  box(w - 0.08, h, 0.06, mats.plasterDark, 0, h / 2, -d + 0.03, g);
  // 鏡（裏から光る）
  box(1.12, 1.82, 0.02, mats.warmSoft, 0, 1.52, -d + 0.075, g);
  const mirror = plane(1.0, 1.7, mats.mirror, g);
  mirror.position.set(0, 1.52, -d + 0.1);
  // 番号
  const num = textTex([{ text: no, font: '400 150px "Cormorant Garamond", serif', y: 128 }], { w: 256, h: 256 });
  const numMesh = plane(0.32, 0.32, new THREE.MeshStandardMaterial({ map: num, transparent: true, color: 0xd4b47a, metalness: 0.6, roughness: 0.35, emissiveMap: num, emissive: 0xffd8a0, emissiveIntensity: 0.25 }), g);
  numMesh.position.set(0, 2.62, -d + 0.07);
  // カウンター
  box(1.9, 0.05, 0.42, mats.marbleDark, 0, 0.86, -d + 0.27, g);
  box(1.9, 0.02, 0.43, mats.brass, 0, 0.83, -d + 0.27, g);
  box(1.86, 0.32, 0.38, mats.walnutH, 0, 0.66, -d + 0.27, g);
  // 棚
  box(0.5, 0.03, 0.2, mats.brass, 1.15, 1.7, -d + 0.16, g);
  for (let i = 0; i < 3; i++) cyl(0.03, 0.03, 0.16 + i * 0.03, [mats.black, mats.marbleLight, mats.brassDark][i], 1.0 + i * 0.13, 1.79 + i * 0.015, -d + 0.16, g, 16);

  // セット椅子
  const chair = new THREE.Group();
  cyl(0.32, 0.34, 0.04, mats.chrome, 0, 0.02, 0, chair, 40);
  cyl(0.06, 0.07, 0.42, mats.chrome, 0, 0.24, 0, chair, 20);
  rbox(0.62, 0.16, 0.6, 0.06, mats.leather, 0, 0.5, 0, chair);
  const back = rbox(0.56, 0.62, 0.12, 0.05, mats.leather, 0, 0.88, 0.3, chair);
  back.rotation.x = 0.12;
  for (const s of [-1, 1]) {
    rbox(0.08, 0.06, 0.5, 0.03, mats.leather, s * 0.34, 0.7, 0.02, chair);
    box(0.03, 0.14, 0.03, mats.chrome, s * 0.34, 0.62, 0.18, chair);
  }
  box(0.36, 0.03, 0.18, mats.chrome, 0, 0.18, -0.42, chair); // 足置き
  chair.position.set(0, 0, -d + 1.2); // 座ると鏡の方（−z）を向く
  g.add(chair);
  contactShadow(1.0, 1.0, 0, -d + 1.2, g, 0.6);

  // ワゴン
  const wagon = new THREE.Group();
  rbox(0.42, 0.72, 0.36, 0.02, mats.black, 0, 0.42, 0, wagon);
  for (let i = 0; i < 3; i++) box(0.3, 0.012, 0.01, mats.brass, 0, 0.22 + i * 0.22, 0.185, wagon);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.03, 0.03, 0.05, mats.chrome, sx * 0.16, 0.03, sz * 0.13, wagon, 10);
  wagon.position.set(-1.05, 0, -d + 1.05);
  g.add(wagon);
  contactShadow(0.7, 0.6, -1.05, -d + 1.05, g, 0.5);

  registerSpot(id, g, { anchorY: h + 0.55 });
}

function buildReception(parent) {
  const g = new THREE.Group();
  parent.add(g);
  // 正面が −x（通路側）を向く。ローカルでは +z が正面。
  rbox(2.6, 1.04, 0.62, 0.04, mats.walnut, 0, 0.52, -0.7, g);
  for (let i = 0; i < 9; i++) box(0.012, 0.9, 0.01, mats.brass, -1.12 + i * 0.28, 0.5, -0.385, g);
  box(2.76, 0.06, 0.78, mats.marbleDark, 0, 1.07, -0.72, g);
  box(2.78, 0.012, 0.8, mats.brass, 0, 1.035, -0.72, g);
  // 花
  cyl(0.08, 0.06, 0.3, mats.ceramic, 0.9, 1.25, -0.75, g, 20);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06 + rnd() * 0.04, 10, 8), std({ color: rnd() > 0.5 ? 0xe8e0d0 : 0xb89a7a, roughness: 0.8 }));
    m.position.set(0.9 + (rnd() - 0.5) * 0.24, 1.46 + rnd() * 0.18, -0.75 + (rnd() - 0.5) * 0.24);
    g.add(m);
  }
  // 背面のロゴ壁
  box(3.4, 3.2, 0.08, mats.walnut, 0, 1.6, -2.36, g);
  box(3.0, 0.02, 0.02, mats.warmLight, 0, 3.15, -2.3, g);
  const logo = textTex([
    { text: 'JAM', font: '500 150px "Cormorant Garamond", serif', y: 104, spacing: '60px', dx: 30 },
    { text: 'SHARE SALON  —  SENDAI', font: '400 30px "Cormorant Garamond", serif', y: 210, spacing: '14px', dx: 7 },
  ]);
  const lm = plane(2.2, 0.55, new THREE.MeshStandardMaterial({ map: logo, emissiveMap: logo, emissive: 0xffffff, emissiveIntensity: 1.1, transparent: true, color: 0x000000, depthWrite: false }), g);
  lm.position.set(0, 2.1, -2.31);
  contactShadow(3.4, 1.4, 0, -0.7, g, 0.5);
  registerSpot('reception', g, { hit: LAYOUT.reception.hit, hitCenter: [0, 1, -1.0], anchorY: LAYOUT.reception.anchorY + 0.4 });
}

function buildRetail(parent) {
  // 入口左手の商品棚（スポットではない飾り）
  const g = new THREE.Group();
  box(0.06, 2.6, 2.6, mats.walnut, -0.15, 1.3, 0, g);
  for (let r = 0; r < 4; r++) {
    box(0.32, 0.025, 2.4, mats.brass, 0.02, 0.5 + r * 0.55, 0, g);
    for (let i = 0; i < 9; i++) {
      const hgt = 0.12 + rnd() * 0.12;
      cyl(0.035, 0.035, hgt, [mats.black, mats.marbleLight, mats.brassDark, mats.leatherTan][(i + r) % 4], 0.04, 0.52 + r * 0.55 + hgt / 2, -1.0 + i * 0.25, g, 14);
    }
  }
  g.position.set(-6.8, 0, -3.1);
  parent.add(g);
  // ベンチ
  rbox(1.6, 0.42, 0.5, 0.06, mats.leatherTan, -5.6, 0.21, -3.1, parent).rotation.y = Math.PI / 2;
  contactShadow(1.0, 2.0, -5.6, -3.1, parent, 0.45);
}

function buildLounge(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), mats.rug);
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.008;
  g.add(rug);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.26, 2.3, 64), mats.brass);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
  g.add(ring);
  // ソファ（向かい合わせ）
  for (const s of [-1, 1]) {
    const so = new THREE.Group();
    rbox(2.2, 0.42, 0.9, 0.12, mats.boucle, 0, 0.26, 0, so);
    rbox(2.2, 0.55, 0.26, 0.12, mats.boucle, 0, 0.62, -0.36, so);
    for (const a of [-1, 1]) rbox(0.24, 0.6, 0.9, 0.1, mats.boucle, a * 1.12, 0.32, 0, so);
    box(2.0, 0.04, 0.8, mats.brassDark, 0, 0.03, 0, so);
    so.position.z = s * 1.45;
    so.rotation.y = s > 0 ? Math.PI : 0;
    // ↑ 正面を中央のテーブルへ向ける
    g.add(so);
    contactShadow(2.8, 1.4, 0, s * 1.45, g, 0.55);
  }
  // テーブル
  cyl(0.62, 0.62, 0.05, mats.marbleDark, 0, 0.42, 0, g, 64);
  cyl(0.22, 0.3, 0.4, mats.brass, 0, 0.2, 0, g, 32);
  cyl(0.06, 0.05, 0.28, mats.ceramic, 0.18, 0.58, 0.1, g, 16);
  contactShadow(1.6, 1.6, 0, 0, g, 0.5);
  // ペンダント照明（天井側）
  const pend = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 12, 80), mats.brass);
  pend.rotation.x = Math.PI / 2; pend.position.y = 3.0;
  g.add(pend);
  const pendL = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.012, 8, 80), mats.warmLight);
  pendL.rotation.x = Math.PI / 2; pendL.position.y = 2.975;
  g.add(pendL);
  for (const a of [0, 2.09, 4.19]) cyl(0.004, 0.004, ROOM.h - 3.0, mats.brass, Math.cos(a) * 0.9, 3.0 + (ROOM.h - 3.0) / 2, Math.sin(a) * 0.9, g, 4);

  registerSpot('lounge', g, { hit: LAYOUT.lounge.hit, hitCenter: [0, 0.7, 0], anchorY: LAYOUT.lounge.anchorY, glowSize: [5.2, 5.2] });
}

function buildShampoo(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const backZ = -(ROOM.depth + LAYOUT.shampoo.pos[2]) + 0.0; // 店の奥の壁までの距離（ローカル）
  // 奥のアクセント壁
  box(9, ROOM.h, 0.08, mats.walnut, 0, ROOM.h / 2, backZ + 0.05, g);
  for (let i = 0; i < 15; i++) box(0.02, ROOM.h - 0.4, 0.02, mats.brass, -4.2 + i * 0.6, ROOM.h / 2, backZ + 0.1, g);
  box(9, 0.03, 0.06, mats.warmLight, 0, 0.08, backZ + 0.12, g);
  box(9, 0.03, 0.06, mats.warmLight, 0, ROOM.h - 0.15, backZ + 0.12, g);
  // 3台
  for (const x of [-2.5, 0, 2.5]) {
    const u = new THREE.Group();
    // ボウル
    cyl(0.14, 0.18, 0.78, mats.ceramic, 0, 0.39, -0.1, u, 24);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.ceramic);
    bowl.position.set(0, 0.98, -0.1); bowl.scale.set(1, 0.6, 0.9);
    u.add(bowl);
    cyl(0.012, 0.012, 0.32, mats.chrome, 0, 1.12, -0.38, u, 10);
    // 椅子（ボウル側へ倒れた背もたれ）
    rbox(0.66, 0.42, 0.7, 0.06, mats.black, 0, 0.21, 0.7, u);
    rbox(0.62, 0.14, 0.62, 0.06, mats.leather, 0, 0.5, 0.72, u);
    const bk = rbox(0.6, 0.12, 0.72, 0.06, mats.leather, 0, 0.7, 0.2, u);
    bk.rotation.x = 0.55;
    rbox(0.58, 0.1, 0.55, 0.05, mats.leather, 0, 0.44, 1.32, u).rotation.x = -0.25; // 足元
    // 仕切り
    box(0.05, 1.5, 1.9, mats.walnut, 1.25, 0.75, 0.55, u);
    box(0.07, 0.025, 1.92, mats.brass, 1.25, 1.51, 0.55, u);
    contactShadow(1.2, 2.2, 0, 0.55, u, 0.55);
    u.position.set(x, 0, backZ + 0.75);
    g.add(u);
  }
  box(0.05, 1.5, 1.9, mats.walnut, -3.75, 0.75, backZ + 1.3, g);
  box(0.07, 0.025, 1.92, mats.brass, -3.75, 1.51, backZ + 1.3, g);
  registerSpot('shampoo', g, { hit: LAYOUT.shampoo.hit, hitCenter: [0, 1, backZ + 1.6], anchorY: LAYOUT.shampoo.anchorY + 0.6, glowSize: [8.6, 4.2] });
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
  // 弧を描いて移動（上から降りてくる／隣のブースへ回り込む）
  const mid = from.pos.clone().lerp(pos, 0.5);
  mid.y = Math.max(from.pos.y, pos.y) + Math.min(2.5, from.pos.distanceTo(pos) * 0.18);
  tween = { from, to: { pos: pos.clone(), look: look.clone(), fov }, mid, t: 0, dur: reduceMotion ? 0.001 : dur, done };
}
function updateTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = ease(tween.t);
  const { from, to, mid } = tween;
  // 2次ベジェ
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
  const p = pathPos.getPoint(1), l = pathLook.getPoint(1);
  flyTo(p, l, STREET_FOV, 2.2, () => {
    state.rewinding = true;
    state.progressTarget = 0;
    setMode('street');
  });
}

function focusSpot(id) {
  const i = SPOTS.findIndex((s) => s.id === id);
  if (i < 0) return;
  const s = SPOTS[i];
  state.active = id;
  fillPanel(s, i);
  setMode('booth');
  if (renderer) {
    const v = spotObjects[id].view;
    flyTo(v.pos, v.look, BOOTH_FOV, 2.2);
  }
}

function stepSpot(dir) {
  const i = SPOTS.findIndex((s) => s.id === state.active);
  const n = SPOTS[(i + dir + SPOTS.length) % SPOTS.length];
  focusSpot(n.id);
}

/* ================================================================
   HTML側（パネル・一覧・マーカー・アクセス）
   ================================================================ */
const pad2 = (n) => String(n).padStart(2, '0');
// マーカーの表示：ブースは番号（店内の番号プレートと同じ）、それ以外は頭文字
const code = (s) => (s.id.startsWith('booth') ? s.id.slice(-2) : s.en[0]);

function fillPanel(s, i) {
  $('#pNum').textContent = pad2(i + 1);
  $('#pTotal').textContent = pad2(SPOTS.length);
  $('#pEn').textContent = s.en;
  $('#pJa').textContent = s.ja;
  $('#pCatch').textContent = s.catch;
  $('#pBody').textContent = s.body;
  const dl = $('#pSpecs');
  dl.replaceChildren();
  for (const [k, v] of s.specs || []) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
}

const markerEls = {};
const guideEls = {};
function buildUI() {
  const markers = $('#markers');
  const list = $('#guideList');
  SPOTS.forEach((s, i) => {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'marker';
    m.innerHTML = `<span class="marker__dot">${code(s)}</span><span class="marker__label"></span>`;
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
    b.innerHTML = `<b>${code(s)}</b><span></span>`;
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

  // 店舗情報
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
  // ヘッダーの Reserve は準備中でも押せる見た目のままアクセスを開く
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

const ENTER_DISTANCE = 2600; // カーソルをこれだけ動かすと店内に着く（px）
let last = null;
let down = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function addProgress(v) {
  if (state.mode !== 'street' || state.rewinding) return;
  state.progressTarget = Math.min(1, Math.max(0, state.progressTarget + v));
}

function onPointerMove(e) {
  state.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  cursorPos.x = e.clientX; cursorPos.y = e.clientY;
  if (e.pointerType === 'mouse' && finePointer) body.classList.add('has-cursor');
  if (last) {
    const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    // タッチは指でなぞった分だけ（少し多めに）進む
    addProgress(dist / (e.pointerType === 'mouse' ? ENTER_DISTANCE : ENTER_DISTANCE * 0.6));
  }
  last = { x: e.clientX, y: e.clientY };

  if (state.mode === 'floor' && renderer && e.target.closest('#stage')) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitMeshes, false)[0];
    setHover(hit ? hit.object.userData.spot : null);
  } else if (state.mode === 'floor' && e.target.closest('#stage') === null && !e.target.closest('.marker, .guide__item')) {
    setHover(null);
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
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(hitMeshes, false)[0];
      if (hit) focusSpot(hit.object.userData.spot);
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

  // カーソル（少し遅れてついてくる）
  cursorPos.sx += (cursorPos.x - cursorPos.sx) * Math.min(1, dt * 14);
  cursorPos.sy += (cursorPos.y - cursorPos.sy) * Math.min(1, dt * 14);
  cursorEl.style.transform = `translate3d(${cursorPos.sx}px, ${cursorPos.sy}px, 0)`;

  // 外観の進み具合
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
    cam.fov = STREET_FOV + p * 10;
  }
  updateTween(dt);

  // 扉：入口に近づくと左右に開く
  const open = state.mode === 'street' ? smooth(0.32, 0.66, p) : 1;
  for (const d of groups.doors) d.position.x = d.userData.home + d.userData.side * 1.16 * open;

  // 店の外は、フロア表示では消す（上から見下ろすため）
  groups.street.visible = state.mode === 'street' || (state.mode === 'entering' && cam.pos.y < 6);
  groups.ceiling.visible = cam.pos.y < ROOM.h - 0.05;

  // 光るハイライト
  for (const id in spotObjects) {
    const o = spotObjects[id];
    const target = id === state.hover && state.mode === 'floor' ? 1 : id === state.active && state.mode === 'booth' ? 0.35 : 0;
    o.level += (target - o.level) * Math.min(1, dt * 6);
    o.glow.material.opacity = o.level * (0.75 + Math.sin(t * 3) * 0.08);
  }

  // マウスで少しだけ視点が揺れる（奥行きを感じさせる）
  state.mouseSmooth.lerp(state.mouse, Math.min(1, dt * 3));
  const amp = state.mode === 'street' ? [0.9, 0.35] : state.mode === 'booth' ? [0.22, 0.1] : [1.6, 0.8];
  camera.position.copy(cam.pos);
  tmpV.subVectors(cam.look, cam.pos).normalize();
  right.crossVectors(tmpV, camera.up).normalize();
  up.crossVectors(right, tmpV).normalize();
  camera.position.addScaledVector(right, state.mouseSmooth.x * amp[0]).addScaledVector(up, state.mouseSmooth.y * amp[1]);
  // ゆっくり呼吸するような揺れ
  if (!reduceMotion) camera.position.y += Math.sin(t * 0.6) * 0.03;
  camera.lookAt(cam.look);
  if (Math.abs(camera.fov - cam.fov) > 0.001) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

  // 詳細パネルが出ているときは、画面の中心を左へずらしてブースを見せる
  const wantShift = state.mode === 'booth' && !isSmall() ? 1 : 0;
  state.panelShift += (wantShift - state.panelShift) * Math.min(1, dt * 2.5);
  applyViewOffset();

  composer.render();
  updateMarkers();
  requestAnimationFrame(frame);
}

function applyViewOffset() {
  const w = innerWidth, h = innerHeight;
  const shift = state.panelShift * Math.min(230, w * 0.16);
  if (shift < 0.5) { if (camera.view && camera.view.enabled) { camera.clearViewOffset(); } return; }
  camera.setViewOffset(w, h, shift, 0, w, h);
}

function updateMarkers() {
  if (state.mode !== 'floor' && state.mode !== 'booth') return;
  const w = innerWidth, h = innerHeight;
  for (const id in spotObjects) {
    const el = markerEls[id];
    spotObjects[id].anchor.getWorldPosition(tmpV);
    tmpV.project(camera);
    const behind = tmpV.z > 1;
    el.classList.toggle('is-hidden', behind);
    el.style.transform = `translate3d(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * h}px, 0)`;
  }
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  // 縦長の画面ではフロア全体が入るように少し引く
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  const portrait = h > w;
  OVERVIEW.pos.set(portrait ? 2.4 : 5.6, portrait ? 19 : 14.2, portrait ? 7 : 8.2);
  OVERVIEW.look.copy(portrait ? OVERVIEW_LOOK_PORTRAIT : OVERVIEW_LOOK_WIDE);
  OVERVIEW.fov = portrait ? 50 : 42;
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
    // 3Dが使えない環境：一覧と詳細だけで案内する
    body.classList.add('no-webgl');
    $('#nogl').hidden = false;
    body.classList.remove('is-loading');
    setMode('floor');
    initInput();
    requestAnimationFrame(frame);
    return;
  }

  // 看板の文字にフォントを使うので、読み込みを待つ（最大2.5秒）
  await Promise.race([
    Promise.all([
      document.fonts.load('500 150px "Cormorant Garamond"'),
      document.fonts.load('400 30px "Cormorant Garamond"'),
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  loaderProgress(36);

  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.background = canvasTex(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#030407'); gr.addColorStop(0.55, '#0b0d14'); gr.addColorStop(0.8, '#1a1714'); gr.addColorStop(1, '#0b0a09');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
  scene.background.wrapS = scene.background.wrapT = THREE.ClampToEdgeWrapping;
  scene.fog = new THREE.FogExp2(0x07080b, 0.022);

  makeMaterials();
  loaderProgress(52);
  buildStreet();
  buildInterior();
  loaderProgress(78);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 0.92);
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
