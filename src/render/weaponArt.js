// =============================================================================
// 무기 픽셀 스프라이트 (절차적 생성)
// 스프라이트 좌표: +x = 칼끝 방향, 위쪽(row 감소) = 칼등. pivot = 손이 쥐는 지점.
// =============================================================================

import { makeSprite, sset, outlined, blit } from './pixel.js';

export const PAL = {
  outline: '#1b1424',
  steelHi: '#f4f1e8',
  steel: '#b9c2cc',
  steelLo: '#6c7486',
  wood: '#9a6233',
  woodLo: '#5f3a1c',
  grip: '#4b2a36',
  gold: '#e3a83b',
  goldLo: '#a86a20',
  iron: '#4d4f5e',
};

function blade({ grip, guardH, len, thick, accent, fuller = false, pommel = true }) {
  const h = Math.max(guardH, thick) + 2;
  const mid = Math.floor(h / 2);
  const w = grip + 1 + len;
  const s = makeSprite(w, h, [grip - 1, mid]);
  for (let x = 0; x < grip; x++) { sset(s, x, mid, PAL.grip); if (thick >= 4) sset(s, x, mid - 1, PAL.grip); }
  if (pommel) { sset(s, 0, mid, accent); sset(s, 0, mid - 1, accent); }
  const g0 = mid - Math.floor(guardH / 2);
  for (let y = 0; y < guardH; y++) sset(s, grip, g0 + y, y === 0 ? PAL.gold : accent);
  const top = mid - Math.floor((thick - 1) / 2);
  for (let x = 0; x < len; x++) {
    const bx = grip + 1 + x;
    const taper = len - x <= 2 ? (len - x === 1 ? thick - 1 : Math.ceil(thick / 2) - 1) : 0;
    for (let y = 0; y < thick - taper; y++) {
      const yy = top + y + (len - x <= 2 ? Math.floor(taper / 2) : 0);
      let c = PAL.steel;
      if (y === 0) c = PAL.steelHi;
      else if (y === thick - taper - 1) c = PAL.steelLo;
      if (fuller && y === Math.floor(thick / 2) && x > 2 && x < len - 6) c = PAL.steelLo;
      sset(s, bx, yy, c);
    }
  }
  return s;
}

function axe(accent) {
  const s = makeSprite(34, 15, [9, 10]);
  for (let x = 0; x < 32; x++) { sset(s, x, 10, PAL.wood); sset(s, x, 11, PAL.woodLo); }
  sset(s, 0, 10, accent); sset(s, 0, 11, accent);
  // 도끼 머리 (칼등 쪽으로 넓은 초승달)
  const head = [
    '   ####',
    '  ######',
    ' #######',
    '########',
    '#######',
    '####',
    '###',
    '##',
    '##',
    '#',
  ];
  head.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    const x = 23 + i, y = 1 + j;
    sset(s, x, y, i >= row.length - 1 ? PAL.steelHi : j < 2 ? PAL.steel : PAL.steel);
  }));
  for (let j = 0; j < 10; j++) sset(s, 23, 1 + j + 1 > 11 ? 11 : 1 + j, PAL.steelLo);
  sset(s, 30, 3, accent); sset(s, 30, 4, accent);
  return s;
}

function spear(accent) {
  const s = makeSprite(56, 7, [17, 3]);
  for (let x = 0; x < 46; x++) sset(s, x, 3, x % 9 === 0 ? PAL.woodLo : PAL.wood);
  sset(s, 0, 3, PAL.iron);
  for (let x = 43; x < 46; x++) { sset(s, x, 2, accent); sset(s, x, 3, accent); sset(s, x, 4, accent); }
  const tip = ['  ##', '#######', '##########', '#######', '  ##'];
  tip.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') sset(s, 46 + i, 1 + j, j === 1 ? PAL.steelHi : j === 3 ? PAL.steelLo : PAL.steel);
  }));
  return s;
}

function fist(accent) {
  const rows = [
    ' ### ',
    '#####',
    '#####',
    '#####',
    ' ### ',
  ];
  const s = makeSprite(7, 5, [2, 2]);
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') sset(s, i, j, j === 1 ? PAL.steel : PAL.iron); }));
  for (let j = 0; j < 5; j += 2) sset(s, 5, j, accent);
  sset(s, 6, 2, accent);
  return s;
}

const cache = new Map();

/** 무기 스프라이트 (외곽선 포함) */
export function weaponSprite(id, accent) {
  const key = id + accent;
  if (cache.has(key)) return cache.get(key);
  let s;
  switch (id) {
    case 'longsword': s = blade({ grip: 5, guardH: 5, len: 24, thick: 3, accent }); break;
    case 'greatsword': s = blade({ grip: 7, guardH: 9, len: 33, thick: 5, accent, fuller: true }); break;
    case 'dagger': s = blade({ grip: 3, guardH: 3, len: 11, thick: 3, accent }); break;
    case 'axe': s = axe(accent); break;
    case 'spear': s = spear(accent); break;
    case 'knuckle': s = fist(accent); break;
    default: s = blade({ grip: 4, guardH: 4, len: 20, thick: 3, accent });
  }
  s = outlined(s, PAL.outline);
  cache.set(key, s);
  return s;
}

/** 무기를 화면에 그린다. angleLocal: 캐릭터 로컬(위쪽 +) 각도, facing: ±1 */
export function drawWeapon(ctx, id, accent, x, y, angleLocal, facing) {
  const s = weaponSprite(id, accent);
  const theta = Math.atan2(-Math.sin(angleLocal), facing * Math.cos(angleLocal));
  blit(ctx, s, x, y, theta, facing < 0);
}

export function drawFist(ctx, accent, x, y, facing) {
  blit(ctx, weaponSprite('knuckle', accent), x, y, facing > 0 ? 0 : Math.PI, facing < 0);
}

/** UI 아이콘: 중심 (cx, cy) 에 비스듬히 */
export function drawWeaponIcon(ctx, id, accent, cx, cy) {
  if (id === 'knuckle') {
    const s = weaponSprite('knuckle', accent);
    blit(ctx, s, cx - 5, cy + 1, 0);
    blit(ctx, s, cx + 4, cy - 2, 0);
    return;
  }
  const s = weaponSprite(id, accent);
  const ang = -0.6;
  // 스프라이트 중심이 (cx, cy) 에 오도록 손잡이 위치 계산
  const half = s.w / 2 - s.pivot[0];
  blit(ctx, s, cx - Math.cos(ang) * half, cy - Math.sin(ang) * half, ang);
}
