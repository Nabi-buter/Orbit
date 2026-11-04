// =============================================================================
// 무기 픽셀 스프라이트 — 실제 무기의 비례와 재질
// 스프라이트 좌표: +x = 칼끝(머리) 방향, 위쪽(row 감소) = 칼등. pivot = 앞손이 쥐는 지점.
// 재질: 강철(칼날 · 날 쪽이 밝게 빛남) · 가죽 감은 손잡이 · 놋쇠/철 장식 · 나무 자루
// 외곽선은 outlined() 가 자동으로 붙인다.
// =============================================================================

import { makeSprite, sset, outlined, blit } from './pixel.js';

export const PAL = {
  outline: '#16121f',
  // 강철
  white: '#fbfbff', light: '#dfe2ec', mid: '#a9adbf', dark: '#6a6e85', deep: '#474a5e',
  // 가죽 손잡이
  leather: '#6b4a34', leatherLo: '#47301f',
  // 놋쇠 (코등이 · 폼멜)
  brass: '#d6a94f', brassLo: '#9b7330', brassHi: '#f2d58e',
  // 나무 자루
  wood: '#a87443', woodLo: '#74492a', woodHi: '#c99460',
  // 철 장식 (소켓 · 고리)
  iron: '#555a6c', ironLo: '#3a3d4c',
};
const P = PAL;

const box = (s, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sset(s, x, y, c); };

/** 가죽을 사선으로 감은 손잡이 (rows: 위·아래 행) */
function wrappedGrip(s, x0, x1, top, bot) {
  for (let x = x0; x <= x1; x++) for (let y = top; y <= bot; y++) {
    const band = (x + y) % 2 === 0;
    sset(s, x, y, y === top ? (band ? P.leather : P.brassLo) : band ? P.leather : P.leatherLo);
  }
}

/** 둥근(바퀴형) 폼멜 */
function wheelPommel(s, x, mid, r = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dx = 0; dx <= r * 2; dx++) {
    if (Math.abs(dy) === r && (dx === 0 || dx === r * 2)) continue; // 모서리 깎기
    sset(s, x + dx, mid + dy, dy < 0 ? P.brassHi : dy > 0 ? P.brassLo : P.brass);
  }
}

/**
 * 양날 칼날 한 열. 위 날은 빛을 받아 흰색, 가운데 홈(풀러)은 어둡게, 아래 날은 밝은 회색.
 * hw = 반폭(0 이면 칼끝 한 줄)
 */
function blade(s, x, mid, hw, { fuller = false, ridge = false } = {}) {
  if (hw <= 0) { sset(s, x, mid, P.light); return; }
  for (let r = -hw; r <= hw; r++) {
    let c = P.mid;
    if (r === -hw) c = P.white;                 // 위 날
    else if (r === hw) c = P.light;              // 아래 날
    else if (r < 0) c = P.light;
    if (fuller && r === 0) c = P.dark;           // 홈
    if (ridge && r === 0) c = P.mid;             // 가운데 능선
    if (ridge && r > 0 && r < hw) c = P.dark;   // 능선 아래 그늘
    sset(s, x, mid + r, c);
  }
}

/** 장검: 곧은 양날, 칼끝까지 이어지는 홈, 일자 코등이, 감은 손잡이(한손 반), 바퀴형 폼멜 */
function longsword() {
  const H = 9, mid = 4;
  const s = makeSprite(36, H, [7, mid]);
  wheelPommel(s, 0, mid);
  wrappedGrip(s, 3, 8, mid - 1, mid);
  // 코등이: 가는 일자, 끝이 칼끝 쪽으로 살짝 휨
  box(s, 9, mid - 3, 9, mid + 3, P.brassLo); box(s, 10, mid - 3, 10, mid + 3, P.brass);
  sset(s, 10, mid - 3, P.brassHi); sset(s, 11, mid - 4, P.brass); sset(s, 11, mid + 4, P.brassLo);
  // 칼날 (리카소 2칸은 홈 없음) → 점점 가늘어지다 칼끝
  for (let x = 11; x <= 34; x++) {
    const hw = x >= 34 ? 0 : x >= 31 ? 1 : 1;
    blade(s, x, mid, hw, { fuller: x >= 13 && x <= 28 });
  }
  sset(s, 33, mid + 1, null); sset(s, 32, mid + 1, P.mid);
  return s;
}

/**
 * 레이피어: 가늘고 긴 찌르기용 칼날, 감싸는 손잡이(스웹트 힐트) —
 * 칼끝 쪽으로 말린 코등이, 손을 감싸 폼멜까지 이어지는 손가락 보호대(너클 보우), 칼날 밑동의 고리,
 * 철사를 감은 손잡이, 배 모양 폼멜. 칼날은 밑동에서만 조금 두껍고 곧 한 줄로 가늘어진다.
 */
function rapier() {
  const H = 11, mid = 4;
  const s = makeSprite(37, H, [4, mid]);
  // 배 모양 폼멜
  sset(s, 0, mid, P.brassLo); sset(s, 1, mid - 1, P.brassHi); sset(s, 1, mid, P.brass); sset(s, 1, mid + 1, P.brassLo); sset(s, 2, mid, P.brass);
  // 철사 감은 손잡이 (놋쇠 줄 사이로 어두운 홈)
  for (let x = 3; x <= 6; x++) { sset(s, x, mid - 1, x % 2 ? P.brassHi : P.ironLo); sset(s, x, mid, x % 2 ? P.ironLo : P.brass); }
  // 코등이(퀼론): 세로 막대, 위 끝은 칼끝 쪽으로, 아래 끝은 손 쪽으로 말림
  for (let y = mid - 4; y <= mid + 2; y++) sset(s, 7, y, y === mid - 4 ? P.brassHi : P.brass);
  sset(s, 8, mid - 5, P.brass); sset(s, 9, mid - 5, P.brassLo);
  // 손가락 보호대: 코등이 아래에서 손을 감싸 돌아 폼멜로
  sset(s, 7, mid + 3, P.brassLo); sset(s, 6, mid + 4, P.brass); for (let x = 3; x <= 5; x++) sset(s, x, mid + 5, x === 4 ? P.brassHi : P.brass);
  sset(s, 2, mid + 4, P.brass); sset(s, 1, mid + 3, P.brassLo); sset(s, 1, mid + 2, P.brassLo);
  // 칼날 밑동의 고리 (파스 다네) — 칼날을 둥글게 감쌈
  sset(s, 8, mid - 2, P.brass); sset(s, 9, mid - 2, P.brassHi); sset(s, 10, mid - 1, P.brass);
  sset(s, 8, mid + 2, P.brassLo); sset(s, 9, mid + 2, P.brass); sset(s, 10, mid + 1, P.brassLo);
  // 리카소(날 없는 밑동): 조금 두꺼움
  for (let x = 8; x <= 11; x++) { sset(s, x, mid, P.light); sset(s, x, mid + 1, P.mid); }
  // 칼날: 두 줄(위 빛 · 아래 그늘)로 가다 칼끝 1/3 은 한 줄로
  for (let x = 12; x <= 35; x++) {
    if (x <= 26) { sset(s, x, mid, x % 5 === 0 ? P.white : P.light); sset(s, x, mid + 1, P.dark); }
    else sset(s, x, mid, x >= 34 ? P.white : P.light);
  }
  return s;
}

/** 대검(츠바이핸더): 긴 손잡이, 넓은 코등이, 날 세우지 않은 리카소와 받침 돌기, 넓고 긴 칼날 */
function greatsword() {
  const H = 13, mid = 6;
  const s = makeSprite(52, H, [10, mid]);
  wheelPommel(s, 0, mid);
  wrappedGrip(s, 3, 9, mid - 1, mid + 1);
  // 코등이: 넓고 끝이 둥글게 말림
  box(s, 10, mid - 5, 10, mid + 5, P.ironLo); box(s, 11, mid - 5, 11, mid + 5, P.iron);
  sset(s, 11, mid - 5, P.mid); sset(s, 12, mid - 5, P.iron); sset(s, 12, mid + 5, P.ironLo);
  // 리카소 (가죽 덮개, 날 없음) + 받침 돌기
  box(s, 12, mid - 1, 16, mid + 1, P.mid); box(s, 12, mid - 1, 16, mid - 1, P.light);
  for (let x = 13; x <= 15; x++) sset(s, x, mid, x % 2 ? P.leather : P.leatherLo);
  sset(s, 17, mid - 3, P.mid); sset(s, 17, mid - 2, P.dark); sset(s, 17, mid + 3, P.dark); sset(s, 17, mid + 2, P.dark);
  // 칼날: 반폭 2, 마지막 8칸에서 칼끝으로
  for (let x = 17; x <= 50; x++) {
    const fromTip = 50 - x;
    const hw = fromTip >= 7 ? 2 : fromTip >= 4 ? 1 : fromTip >= 1 ? 1 : 0;
    blade(s, x, mid, hw, { fuller: x >= 18 && x <= 40 });
    if (hw === 2 && x >= 18 && x <= 40) sset(s, x, mid + 1, P.mid);
  }
  return s;
}

/** 단검: 마름모 단면(가운데 능선)의 짧은 양날, 작은 놋쇠 코등이, 가죽 손잡이, 둥근 폼멜 */
function dagger() {
  const H = 9, mid = 4;
  const s = makeSprite(22, H, [4, mid]);
  sset(s, 0, mid, P.brass); sset(s, 1, mid - 1, P.brassHi); sset(s, 1, mid, P.brass); sset(s, 1, mid + 1, P.brassLo);
  wrappedGrip(s, 2, 4, mid - 1, mid);
  box(s, 5, mid - 2, 5, mid + 2, P.brassLo); box(s, 6, mid - 2, 6, mid + 2, P.brass); sset(s, 6, mid - 2, P.brassHi);
  // 넓게 시작해 곧게 가늘어지는 삼각 칼날
  const hw = [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0];
  hw.forEach((h, i) => blade(s, 7 + i, mid, h, { ridge: h >= 2 }));
  return s;
}

/** 도끼(데인 도끼): 나무 자루, 철 소켓, 아래로 길게 내려온 수염형 날 (날은 휘두르는 쪽 = 아래) */
function axe() {
  const H = 19, mid = 5;
  const s = makeSprite(40, H, [10, mid]);
  // 자루: 두 줄 나무 + 결 + 끝 철 마개
  for (let x = 1; x <= 33; x++) {
    sset(s, x, mid, x % 9 === 4 ? P.wood : P.woodHi);
    sset(s, x, mid + 1, x % 7 === 2 ? P.woodLo : P.wood);
  }
  box(s, 0, mid, 0, mid + 1, P.ironLo);
  for (let x = 6; x <= 13; x++) sset(s, x, mid + 1, x % 2 ? P.leatherLo : P.leather); // 손잡이 감개
  // 소켓(머리가 자루를 감싸는 부분) + 뒤쪽 망치머리
  box(s, 28, mid - 2, 32, mid + 3, P.iron); box(s, 28, mid - 2, 32, mid - 2, P.mid); box(s, 28, mid + 3, 32, mid + 3, P.ironLo);
  box(s, 29, mid - 3, 31, mid - 3, P.iron);
  // 수염형 날: 행마다 [시작, 끝] (위 = 목, 아래로 갈수록 뒤로 휘며 길어짐)
  const rows = { 4: [30, 34], 5: [30, 35], 6: [30, 36], 7: [29, 37], 8: [28, 37], 9: [27, 38], 10: [26, 38], 11: [26, 38], 12: [27, 37], 13: [29, 36] };
  for (const [ry, [x0, x1]] of Object.entries(rows)) {
    const y = mid + Number(ry);
    for (let x = x0; x <= x1; x++) {
      let c = x <= x0 ? P.ironLo : P.dark;
      if (x >= x1 - 2) c = P.light;          // 갈아 낸 날 면
      if (x === x1) c = P.white;             // 날 끝 반짝임
      if (x === x0 + 1 && ry < 9) c = P.iron;
      sset(s, x, y, c);
    }
  }
  return s;
}

/** 창: 긴 나무 자루, 끝 철 마개, 묶은 고리와 소켓, 잎 모양 창날 (가운데 능선) */
function spear() {
  const H = 9, mid = 4;
  const s = makeSprite(60, H, [20, mid]);
  box(s, 0, mid, 1, mid + 1, P.ironLo); sset(s, 0, mid, P.iron);
  for (let x = 2; x <= 44; x++) {
    sset(s, x, mid, x % 11 === 3 ? P.wood : P.woodHi);
    sset(s, x, mid + 1, x % 8 === 5 ? P.woodLo : P.wood);
  }
  // 손이 닿는 곳 감개
  for (let x = 16; x <= 23; x++) sset(s, x, mid + 1, x % 2 ? P.leatherLo : P.leather);
  // 묶음 고리 + 원뿔 소켓
  box(s, 44, mid - 1, 45, mid + 2, P.ironLo); sset(s, 44, mid - 1, P.iron);
  box(s, 46, mid - 1, 47, mid + 2, P.iron); box(s, 46, mid - 1, 47, mid - 1, P.mid);
  box(s, 48, mid, 48, mid + 1, P.iron);
  // 잎 모양 날: 반폭 (가운데 줄 = mid 와 mid+1 사이)
  const hw = [1, 2, 2, 3, 3, 3, 2, 2, 1, 1, 0];
  hw.forEach((h, i) => {
    const x = 49 + i;
    for (let r = -h; r <= h + 1; r++) {
      const y = mid + r;
      let c = r < 0 ? P.light : r === 0 ? P.mid : P.dark;
      if (r === -h) c = P.white;
      if (r === h + 1) c = P.mid;
      if (h === 0) c = r <= 0 ? P.light : P.mid;
      sset(s, x, y, c);
    }
  });
  return s;
}

/** 너클(놋쇠 너클): 손가락 고리 넷 + 손바닥 받침 */
function knuckle() {
  const rows = [
    '.HbbH',
    'Bb.bB',
    'Bbbbb',
    'Bb.bB',
    'Bbbbb',
    'Bb.bB',
    '.BBB.',
  ];
  const pal = { H: P.brassHi, b: P.brass, B: P.brassLo };
  const s = makeSprite(5, rows.length, [1, 3]);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) sset(s, x, y, pal[ch]); }));
  return s;
}

const cache = new Map();

/** 무기 스프라이트 (외곽선 포함) */
export function weaponSprite(id, accent) {
  const key = id + accent;
  if (cache.has(key)) return cache.get(key);
  const make = { longsword, rapier, greatsword, dagger, axe, spear, knuckle }[id] ?? longsword;
  const s = outlined(make(), PAL.outline);
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
