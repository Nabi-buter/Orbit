// =============================================================================
// 무기 판정 = 무기 그림
// -----------------------------------------------------------------------------
// 약공·강공의 판정을 사각형 대신 "그려지는 무기"의 선분으로 만든다.
// 그리기와 똑같은 계산(모션 → 손 위치 IK → 무기 각도 · 그림 길이)으로 판정 프레임마다 무기 위치를 구하고,
// 빠르게 휘두를 때 사이를 건너뛰지 않도록 이전 프레임과의 사이도 2번 더 채운다.
// 결과는 정수로 반올림해 무기를 만들 때 한 번만 계산 → 시뮬레이션은 덧셈·곱셈 비교만 한다
// (브라우저마다 삼각함수 끝자리가 달라도 온라인 동기화가 깨지지 않음).
// 좌표: 공격자 기준 월드 px — x 앞 +, y 땅에서 위 +.
// =============================================================================

import { evalMotion } from './motions.js';
import { frontHandLocal } from './limbRig.js';
import { weaponSprite } from './weaponArt.js';
import { PX } from './pixel.js';

/**
 * 무기별 "닿는 부분" (아트 px, 손에서 무기 끝 방향으로 from→to, 반지름 r)
 * head: 도끼처럼 날이 자루 옆으로 붙은 경우 — 끝에서 back 만큼 안쪽에서 수직으로 len 만큼
 */
const PARTS = {
  longsword: [{ from: 2, to: 'tip', r: 1.6 }],
  greatsword: [{ from: 2, to: 'tip', r: 2.6 }],
  dagger: [{ from: 1, to: 'tip', r: 1.6 }],
  axe: [{ from: 0, to: -6, r: 1.1 }, { head: true, back: 6, len: 11, r: 3 }],
  spear: [{ from: 0, to: 'tip', r: 1.1 }, { from: -11, to: 'tip', r: 2.4 }],
  knuckle: [{ from: -1, to: 4, r: 3 }],
};

/** 무기 그림의 손잡이(pivot)에서 끝까지 길이 (아트 px) */
function weaponLength(id) {
  const s = weaponSprite(id, '#fff');
  return s.w - s.pivot[0] - 1;
}

/** 한 프레임의 무기 선분들 (월드 px, 실수) */
export function framePieces(id, def, frame) {
  const pose = evalMotion(id, def, frame);
  if (!pose) return null;
  const hand = frontHandLocal({ hand: pose.h, lean: pose.lean, crouch: pose.crouch, stride: pose.stride });
  const a = pose.a;
  const d = [Math.cos(a), -Math.sin(a)];       // 무기 방향 (아트, y 아래 +)
  const n = [Math.sin(a), Math.cos(a)];        // 무기 그림의 "아래" (도끼 날 쪽)
  const L = weaponLength(id);
  const at = (t) => [hand[0] + d[0] * t, hand[1] + d[1] * t];
  const toWorld = (p) => [p[0] * PX, -p[1] * PX];
  const out = [];
  for (const part of PARTS[id] ?? PARTS.longsword) {
    let p1, p2;
    if (part.head) {
      p1 = at(L - part.back);
      p2 = [p1[0] + n[0] * part.len, p1[1] + n[1] * part.len];
    } else {
      const from = part.from < 0 ? L + part.from : part.from;
      const to = part.to === 'tip' ? L : part.to < 0 ? L + part.to : part.to;
      p1 = at(from); p2 = at(to);
    }
    const [x1, y1] = toWorld(p1), [x2, y2] = toWorld(p2);
    out.push([x1, y1, x2, y2, part.r * PX]);
  }
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 공격 하나의 판정 선분: hits[i].segs[k] = 판정 k번째 프레임의 선분 목록 [[x1,y1,x2,y2,r], ...] (정수)
 * 모션 데이터가 없는 공격은 그대로 둔다 (사각형 판정).
 * box 는 선분 전체를 감싸는 사각형으로 바꾼다 (AI 의 사거리 계산용).
 */
export function attachWeaponSegments(id, def) {
  if (!evalMotion(id, def, 0)) return def;
  for (const hit of def.hits) {
    const segs = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let f = hit.from; f <= hit.to; f++) {
      const now = framePieces(id, def, f);
      const prev = framePieces(id, def, f - 1) ?? now;
      const list = [];
      // 이전 프레임과의 사이 1/3, 2/3 지점 + 이번 프레임 (빠른 휘두름에서 건너뛰기 방지)
      for (const t of [1 / 3, 2 / 3, 1]) {
        now.forEach((s, i) => {
          const q = prev[i];
          const seg = [0, 1, 2, 3].map((k) => Math.round(lerp(q[k], s[k], t)));
          seg.push(Math.round(s[4]));
          list.push(seg);
          x0 = Math.min(x0, seg[0] - seg[4], seg[2] - seg[4]); x1 = Math.max(x1, seg[0] + seg[4], seg[2] + seg[4]);
          y0 = Math.min(y0, seg[1] - seg[4], seg[3] - seg[4]); y1 = Math.max(y1, seg[1] + seg[4], seg[3] + seg[4]);
        });
      }
      segs.push(list);
    }
    hit.segs = segs;
    hit.box = { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.max(1, x1 - Math.max(0, x0)), h: Math.max(1, y1 - Math.max(0, y0)) };
  }
  return def;
}
