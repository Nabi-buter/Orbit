// =============================================================================
// 무기가 바닥을 뚫지 않게
// -----------------------------------------------------------------------------
// 내려찍기·따라가기에서 무기 끝(도끼는 날 아래 끝)이 땅 아래로 내려가면, 무기를 들어 올려
// 땅에 닿은 채 멈춘 것처럼 각도를 고친다. 그리기(limbRig)와 판정(hitGeometry)이 같은 함수를 쓴다.
// 좌표: 로컬 아트 px (발밑 기준, y 아래 +, 땅 = 0). 각도 a: 위쪽 + (무기 방향 [cos a, -sin a]).
// =============================================================================

import { weaponSprite } from './weaponArt.js';

const FLOOR = -1;  // 무기가 내려갈 수 있는 가장 낮은 곳 (땅 바로 위)
/** 무기 끝 말고도 낮게 내려가는 부분: 도끼 날의 아래 끝 (끝에서 back 만큼 안쪽, 날 쪽으로 len) */
const EXTRA = { axe: { back: 6, len: 11 } };
const lengthCache = new Map();
function lengthOf(id) {
  if (!lengthCache.has(id)) { const s = weaponSprite(id, '#fff'); lengthCache.set(id, s.w - s.pivot[0] - 1); }
  return lengthCache.get(id);
}

/** 각도 a 일 때 무기의 가장 낮은 점 y */
function lowest(id, hand, a) {
  const L = lengthOf(id);
  let y = hand[1] - Math.sin(a) * L;
  const e = EXTRA[id];
  if (e) y = Math.max(y, hand[1] - Math.sin(a) * (L - e.back) + Math.cos(a) * e.len);
  return y;
}

/** 땅에 걸리지 않는 각도 (걸리지 않으면 그대로) */
export function clampToGround(id, hand, a) {
  if (id === 'knuckle' || lowest(id, hand, a) <= FLOOR) return a;
  // 앞을 향하면 위(+)로, 뒤를 향하면 반대로 돌려 땅 위로 올린다
  const step = Math.cos(a) >= 0 ? 0.04 : -0.04;
  let b = a;
  for (let i = 0; i < 60 && lowest(id, hand, b) > FLOOR; i++) b += step;
  return b;
}
