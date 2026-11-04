// =============================================================================
// 픽셀 아트 렌더링 기초 도구
// 모든 화면은 저해상도(PW×PH) 캔버스에 정수 좌표로 그린 뒤 최근접 보간으로 확대한다.
// 월드 좌표(1280×720) 1 픽셀 = 아트 1/PX 픽셀.
// =============================================================================

export const PX = 3;
export const PW = 427;
export const PH = 240;

export function createArtCanvas(w = PW, h = PH) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

export function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); }
export function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

/** 두께 w 의 픽셀 선 (브레젠험) */
export function line(ctx, x0, y0, x1, y1, c, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor((w - 1) / 2);
  for (;;) {
    ctx.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 채운 원 */
export function disc(ctx, cx, cy, r, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  ctx.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
    ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
  }
}

/** 원 테두리 (중점 원 알고리즘) */
export function ring(ctx, cx, cy, r, c, w = 1) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  ctx.fillStyle = c;
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) ctx.fillRect(cx + a, cy + b, w, w);
    y++;
    if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
  }
}

/** 테두리 있는 픽셀 패널 (모서리 1픽셀 깎음) */
export function panel(ctx, x, y, w, h, { fill = '#1a1530', border = '#f2e6c9', shadow = '#0a0812', inner = null } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(ctx, x + 1, y + h, w, 1, shadow);
  rect(ctx, x + w, y + 1, 1, h, shadow);
  rect(ctx, x + 1, y, w - 2, 1, border);
  rect(ctx, x + 1, y + h - 1, w - 2, 1, border);
  rect(ctx, x, y + 1, 1, h - 2, border);
  rect(ctx, x + w - 1, y + 1, 1, h - 2, border);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  if (inner) { rect(ctx, x + 2, y + 2, w - 4, 1, inner); }
}

// -----------------------------------------------------------------------------
// 스프라이트: {w, h, px: (색|null)[], pivot:[x,y]}
// -----------------------------------------------------------------------------
export function makeSprite(w, h, pivot) {
  return { w, h, px: new Array(w * h).fill(null), pivot };
}
export function sset(s, x, y, c) { if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.px[y * s.w + x] = c; }
export function sget(s, x, y) { return x >= 0 && y >= 0 && x < s.w && y < s.h ? s.px[y * s.w + x] : null; }

/** 스프라이트 바깥에 1픽셀 외곽선 추가 */
export function outlined(s, color) {
  const o = makeSprite(s.w + 2, s.h + 2, [s.pivot[0] + 1, s.pivot[1] + 1]);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    if (!sget(s, x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!sget(s, x + dx, y + dy)) sset(o, x + 1 + dx, y + 1 + dy, color);
  }
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const c = sget(s, x, y); if (c) sset(o, x + 1, y + 1, c); }
  return o;
}

/** 문자열 그림 → 스프라이트. palette: {문자: 색} */
export function spriteFrom(rows, palette, pivot = [0, 0]) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const s = makeSprite(w, h, pivot);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (palette[ch]) sset(s, x, y, palette[ch]); }));
  return s;
}

/**
 * 회전 + 좌우반전 블릿 (최근접 샘플링 → 픽셀이 뭉개지지 않음)
 * angle: 화면 기준 라디안(시계 방향 +), flipY: 스프라이트 상하 반전
 */
export function blit(ctx, s, x, y, angle = 0, flipY = false) {
  x = Math.round(x); y = Math.round(y);
  const [pxv, pyv] = s.pivot;
  if (angle === 0 && !flipY) {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const c = s.px[j * s.w + i];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x + i - pxv, y + j - pyv, 1, 1); }
    }
    return;
  }
  const r = rotated(s, angle, flipY);
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const c = r.px[j * r.w + i];
    if (c) { ctx.fillStyle = c; ctx.fillRect(x + i - r.pivot[0], y + j - r.pivot[1], 1, 1); }
  }
}

// -----------------------------------------------------------------------------
// RotSprite 방식 회전: Scale2x 를 세 번(8배) 적용해 대각선을 매끄럽게 만든 뒤 회전·샘플링.
// 단순 최근접 회전보다 칼날·팔 윤곽이 덜 깨진다. 각도는 5° 단위로 캐시.
// -----------------------------------------------------------------------------
const ROT_STEPS = 72;
const rotCache = new WeakMap();
const upCache = new WeakMap();

function scale2x(src) {
  const w = src.w * 2, h = src.h * 2;
  const o = { w, h, px: new Array(w * h).fill(null) };
  const g = (x, y) => (x >= 0 && y >= 0 && x < src.w && y < src.h ? src.px[y * src.w + x] : null);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const P = g(x, y), A = g(x, y - 1), B = g(x + 1, y), C = g(x - 1, y), D = g(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    o.px[(2 * y) * w + 2 * x] = e0; o.px[(2 * y) * w + 2 * x + 1] = e1;
    o.px[(2 * y + 1) * w + 2 * x] = e2; o.px[(2 * y + 1) * w + 2 * x + 1] = e3;
  }
  return o;
}

function upscaled(s) {
  let u = upCache.get(s);
  if (!u) { u = scale2x(scale2x(scale2x(s))); upCache.set(s, u); }
  return u;
}

function rotated(s, angle, flipY) {
  const step = (Math.PI * 2) / ROT_STEPS;
  const idx = ((Math.round(angle / step) % ROT_STEPS) + ROT_STEPS) % ROT_STEPS;
  let m = rotCache.get(s);
  if (!m) { m = new Map(); rotCache.set(s, m); }
  const key = idx * 2 + (flipY ? 1 : 0);
  let r = m.get(key);
  if (r) return r;
  const a = idx * step;
  const [pxv, pyv] = s.pivot;
  const R = Math.ceil(Math.hypot(Math.max(pxv, s.w - pxv), Math.max(pyv, s.h - pyv))) + 1;
  const u = upscaled(s), K = 8;
  const cos = Math.cos(a), sin = Math.sin(a);
  r = { w: 2 * R + 1, h: 2 * R + 1, px: new Array((2 * R + 1) ** 2).fill(null), pivot: [R, R] };
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    // 목적 픽셀 중심을 역회전 → 원본(8배) 좌표
    const lx = dx * cos + dy * sin;
    let ly = -dx * sin + dy * cos;
    if (flipY) ly = -ly;
    const ux = Math.floor((lx + pxv + 0.5) * K), uy = Math.floor((ly + pyv + 0.5) * K);
    if (ux < 0 || uy < 0 || ux >= u.w || uy >= u.h) continue;
    const c = u.px[uy * u.w + ux];
    if (c) r.px[(dy + R) * r.w + dx + R] = c;
  }
  m.set(key, r);
  return r;
}

// -----------------------------------------------------------------------------
// 5×7 비트맵 폰트 (영문 대문자·숫자·기호)
// -----------------------------------------------------------------------------
const FONT = {
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '#': ['01010', '11111', '01010', '01010', '01010', '11111', '01010'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function isBitmapText(str) { return [...str].every((ch) => FONT[ch.toUpperCase()]); }

/** 비트맵 폰트 텍스트 (scale 정수 배) */
export function bitText(ctx, str, x, y, color, scale = 1, align = 'left') {
  str = String(str).toUpperCase();
  const w = textWidth(str, scale);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  ctx.fillStyle = color;
  for (const ch of str) {
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '1') ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
    cx += 6 * scale;
  }
  return w;
}
function textWidth(str, scale) { return Math.max(0, str.length * 6 - 1) * scale; }

// -----------------------------------------------------------------------------
// 한글 등 일반 텍스트: 시스템 폰트를 작은 크기로 그린 뒤 알파를 이진화해 도트처럼 만든다
// -----------------------------------------------------------------------------
export const FONT_STACK = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';

// -----------------------------------------------------------------------------
// 고해상도 글자 층: 한글 등은 저해상도 아트 캔버스에 찍지 않고 기록만 해 두었다가,
// 아트를 화면 크기로 확대한 뒤 화면 해상도 그대로 그린다 (Renderer.flushLayer).
// → 획이 뭉개지지 않고 정확한 한글. 영문·숫자 비트맵 폰트(도트 글자)는 그대로 아트에 그린다.
// -----------------------------------------------------------------------------
let hiText = null; // { art: 아트 캔버스 ctx, list: [...] }
/** 이 아트 캔버스에 그리는 한글은 고해상도 층으로 보낸다 */
export function useHiResText(artCtx) { hiText = { art: artCtx, list: [] }; }
/** 지금까지 기록된 글자를 꺼낸다 (층마다) */
export function takeTextQueue() { if (!hiText) return []; const l = hiText.list; hiText.list = []; return l; }
const cache = new Map();

function rasterize(str, size, color, weight) {
  const key = `${str}|${size}|${color}|${weight}`;
  let s = cache.get(key);
  if (s) return s;
  const { canvas, ctx } = createArtCanvas(Math.ceil(str.length * size * 1.2) + 4, size + 6);
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
  ctx.fillText(str, 1, 1);
  const w = Math.min(canvas.width, Math.ceil(ctx.measureText(str).width) + 2);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const sp = makeSprite(w, canvas.height, [0, 0]);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < w; x++) {
    if (img[(y * canvas.width + x) * 4 + 3] >= 110) sset(sp, x, y, color);
  }
  s = sp;
  if (cache.size > 600) cache.clear();
  cache.set(key, s);
  return s;
}

/**
 * 픽셀 텍스트. 영문/숫자만이면 비트맵 폰트, 한글이 섞이면 이진화 폰트.
 * opts: {size(한글 픽셀 크기, 기본 11), scale(비트맵 배율), align, shadow(그림자 색), weight}
 * @returns 너비
 */
export function text(ctx, str, x, y, color, opts = {}) {
  str = String(str);
  const align = opts.align ?? 'left';
  if (isBitmapText(str) && !opts.forceRaster) {
    const scale = opts.scale ?? 1;
    if (opts.shadow) bitText(ctx, str, x + scale, y + scale, opts.shadow, scale, align);
    return bitText(ctx, str, x, y, color, scale, align);
  }
  const size = Math.max(11, opts.size ?? 11); // 한글은 11px 미만이면 뭉개진다
  const sp = rasterize(str, size, color, opts.weight ?? 700);
  const ox = align === 'center' ? -Math.floor(sp.w / 2) : align === 'right' ? -sp.w : 0;
  if (hiText && ctx === hiText.art) {
    // 고해상도 층에 기록: 지금 좌표 변환(카메라·흔들림)과 투명도까지 같이
    const t = ctx.getTransform();
    hiText.list.push({ str, x: x + ox + t.e, y: y + t.f, color, size, weight: opts.weight ?? 700, shadow: opts.shadow, alpha: ctx.globalAlpha });
    return sp.w;
  }
  if (opts.shadow) blit(ctx, rasterize(str, size, opts.shadow, opts.weight ?? 700), x + ox + 1, y + 1 - 1);
  blit(ctx, sp, x + ox, y - 1);
  return sp.w;
}

export function textW(str, opts = {}) {
  str = String(str);
  if (isBitmapText(str) && !opts.forceRaster) return textWidth(str.toUpperCase(), opts.scale ?? 1);
  return rasterize(str, Math.max(11, opts.size ?? 11), '#000', opts.weight ?? 700).w;
}
