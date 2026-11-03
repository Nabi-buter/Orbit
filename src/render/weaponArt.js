// =============================================================================
// 무기 픽셀 스프라이트 (참고 도안 형태 기반, 회색 단색 금속 톤)
// 스프라이트 좌표: +x = 칼끝 방향, 위쪽(row 감소) = 칼등. pivot = 손이 쥐는 지점.
// 외곽선은 outlined() 가 자동으로 붙인다.
// =============================================================================

import { makeSprite, sset, outlined, blit } from './pixel.js';

export const PAL = {
  outline: '#16121f',
  white: '#fbfbff',
  light: '#e1e2ec',
  mid: '#a6a8bb',
  dark: '#5b5d73',
  grip: '#3b3b4e',
  gripLo: '#2a2a38',
};
const { white: W, light: L, mid: M, dark: D, grip: G, gripLo: GL } = PAL;

/** 둥근 폼멜 (자루 끝 구슬) */
function pommel(s, x, mid, accent) {
  sset(s, x, mid - 1, L); sset(s, x + 1, mid - 1, M);
  sset(s, x, mid, M); sset(s, x + 1, mid, M);
  sset(s, x, mid + 1, D); sset(s, x + 1, mid + 1, D);
  if (accent) sset(s, x + 1, mid, accent);
}

/** 칼날 한 열: 반폭 hw, 위 가장자리 밝게 / 아래 어둡게 (fuller=true 면 가운데 어두운 홈) */
function bladeColumn(s, x, mid, hw, fuller = false) {
  for (let r = -hw; r <= hw; r++) {
    let c = M;
    if (r === -hw) c = hw === 0 ? W : W;
    else if (r < 0) c = L;
    else if (r === hw) c = D;
    if (fuller && hw >= 2 && (r === 0 || r === 1)) c = D;
    if (hw === 0) c = L;
    sset(s, x, mid + r, c);
  }
}

function longsword(accent) {
  const H = 9, mid = 4;
  const s = makeSprite(33, H, [7, mid]);
  pommel(s, 0, mid, accent);
  // 감은 손잡이 (밝고 어두운 줄이 번갈아)
  for (let x = 2; x <= 7; x++) { sset(s, x, mid, x % 2 ? G : GL); if (x % 2) sset(s, x, mid - 1, GL); }
  // 코등이: 양 끝이 살짝 굽은 십자
  for (let y = mid - 3; y <= mid + 3; y++) { sset(s, 8, y, y === mid + 3 ? D : L); sset(s, 9, y, y === mid + 3 ? D : M); }
  sset(s, 7, mid - 3, M); sset(s, 7, mid + 3, D);
  // 칼날: 가운데 홈(풀러)이 칼끝 근처까지
  for (let x = 10; x <= 31; x++) {
    const hw = x >= 31 ? 0 : x >= 29 ? 1 : 1;
    bladeColumn(s, x, mid, hw);
    if (x >= 11 && x <= 25) sset(s, x, mid, x % 6 === 0 ? M : D);
  }
  sset(s, 32, mid, L);
  return s;
}

function greatsword(accent) {
  const H = 13, mid = 6;
  const s = makeSprite(44, H, [8, mid]);
  pommel(s, 0, mid, accent); sset(s, 2, mid, M);
  for (let x = 3; x <= 8; x++) { sset(s, x, mid, x % 2 ? G : GL); }
  sset(s, 4, mid - 1, L); // 자루 띠
  for (let y = mid - 4; y <= mid + 4; y++) { sset(s, 9, y, Math.abs(y - mid) === 4 ? M : D); sset(s, 10, y, Math.abs(y - mid) === 4 ? L : M); }
  for (let x = 11; x <= 42; x++) {
    const fromTip = 42 - x;
    const hw = fromTip >= 8 ? 3 : Math.floor(fromTip / 2.5);
    bladeColumn(s, x, mid, hw, true);
  }
  return s;
}

function dagger(accent) {
  const H = 9, mid = 4;
  const s = makeSprite(21, H, [4, mid]);
  pommel(s, 0, mid, accent);
  for (let x = 2; x <= 4; x++) sset(s, x, mid, x % 2 ? G : GL);
  for (let y = mid - 3; y <= mid + 3; y++) { sset(s, 5, y, y === mid + 3 ? D : L); sset(s, 6, y, y === mid + 3 ? D : M); }
  const leaf = [1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0]; // 잎사귀형: 넓어졌다 가늘어짐
  leaf.forEach((hw, i) => bladeColumn(s, 7 + i, mid, hw));
  return s;
}

function axe(accent) {
  const H = 17, mid = 5;
  const s = makeSprite(37, H, [10, mid]);
  pommel(s, 0, mid, accent);
  for (let x = 2; x <= 32; x++) { sset(s, x, mid, G); sset(s, x, mid + 1, GL); }
  // 날 고정부 + 위쪽 돌기
  for (let x = 26; x <= 29; x++) for (let y = mid - 2; y <= mid + 3; y++) sset(s, x, y, D);
  for (let x = 27; x <= 29; x++) { sset(s, x, mid - 3, M); }
  sset(s, 28, mid - 4, M); sset(s, 27, mid - 4, L);
  // 초승달 날 (휘두르는 방향 = 아래쪽)
  const cols = { 23: [3, 5], 24: [3, 7], 25: [4, 8], 26: [4, 9], 27: [4, 10], 28: [4, 10], 29: [4, 11], 30: [3, 11], 31: [2, 11], 32: [1, 10], 33: [1, 9], 34: [2, 7] };
  for (const [xs, [t, b]] of Object.entries(cols)) {
    const x = Number(xs);
    for (let r = t; r <= b; r++) {
      const edge = r === b || x >= 33;
      const nearEdge = r === b - 1 || (x === 32 && r >= b - 2);
      // 날 쪽은 밝은 베벨 두 줄, 몸통은 어두운 쇠 + 가운데 한 줄 반사
      const glint = x === 29 && r > t + 1 && r < b - 2;
      sset(s, x, mid + r, edge ? W : nearEdge ? L : glint ? M : r <= t + 1 ? GL : D);
    }
  }
  return s;
}

function spear(accent) {
  const H = 9, mid = 4;
  const s = makeSprite(58, H, [19, mid]);
  pommel(s, 0, mid, accent);
  for (let x = 2; x <= 44; x++) sset(s, x, mid, x % 9 === 0 ? GL : G);
  // 고리
  for (let x = 44; x <= 46; x++) for (let y = mid - 1; y <= mid + 1; y++) sset(s, x, y, y === mid - 1 ? L : y === mid + 1 ? D : M);
  // 마름모형 창날
  const head = [1, 2, 3, 3, 2, 2, 1, 1, 1, 0, 0];
  head.forEach((hw, i) => bladeColumn(s, 47 + i, mid, hw));
  return s;
}

function knuckle(accent) {
  // 세로 방향: 손가락 고리 4개(오른쪽) + 손바닥 쪽 바(왼쪽)
  const rows = [
    ' LLL ',
    'DL.LD',
    'DLLLD',
    'DL.LD',
    'DLLLD',
    'DL.LD',
    ' DDD ',
  ];
  const pal = { L, M, D };
  const s = makeSprite(5, rows.length, [1, 3]);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) sset(s, x, y, pal[ch]); }));
  return s;
}

const cache = new Map();

/** 무기 스프라이트 (외곽선 포함) */
export function weaponSprite(id, accent) {
  const key = id + accent;
  if (cache.has(key)) return cache.get(key);
  const make = { longsword, greatsword, dagger, axe, spear, knuckle }[id] ?? longsword;
  const s = outlined(make(null), PAL.outline);
  cache.set(key, s);
  return s;
}

/** 무기를 화면에 그린다. angleLocal: 캐릭터 로컬(위쪽 +) 각도, facing: ±1 */
export function drawWeapon(ctx, id, accent, x, y, angleLocal, facing) {
  const s = weaponSprite(id, accent);
  const theta = Math.atan2(-Math.sin(angleLocal), facing * Math.cos(angleLocal));
  blit(ctx, s, x, y, theta, facing < 0);
}

/** 너클 장착 주먹 */
export function drawFist(ctx, accent, x, y, facing) {
  blit(ctx, weaponSprite('knuckle', accent), x, y, facing > 0 ? 0 : Math.PI, facing < 0);
}

/** 정수 배 확대 스프라이트 (아이콘용) */
const scaledCache = new Map();
function scaled(src, k) {
  const key = src;
  if (scaledCache.has(key)) return scaledCache.get(key);
  const o = makeSprite(src.w * k, src.h * k, [src.pivot[0] * k, src.pivot[1] * k]);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) sset(o, x, y, src.px[Math.floor(y / k) * src.w + Math.floor(x / k)]);
  scaledCache.set(key, o);
  return o;
}

/** UI 아이콘: 중심 (cx, cy) 에 참고 도안처럼 비스듬히 */
export function drawWeaponIcon(ctx, id, accent, cx, cy) {
  const s = weaponSprite(id, accent);
  if (id === 'knuckle') {
    blit(ctx, scaled(s, 2), cx, cy + 1, -Math.PI / 2); // 작으므로 2배, 고리가 위로 오게 가로로
    return;
  }
  const ang = -0.75;
  const half = s.w / 2 - s.pivot[0];
  blit(ctx, s, cx - Math.cos(ang) * half, cy - Math.sin(ang) * half, ang);
}
