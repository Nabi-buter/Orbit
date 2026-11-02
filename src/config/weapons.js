// =============================================================================
// 무기 데이터 (6종)
// -----------------------------------------------------------------------------
// 공격 정의 형식은 src/core/attackDef.js 참고. 모든 프레임 단위 = 1/60초.
// 이 파일의 무기별 수치는 전부 [TEMP] 임시값이다.
//
// 설계 기준 (짧은 경직 규칙):
//   어떤 공격이 가장 늦게(마지막 판정의 마지막 프레임에) 적중해도, 그 피격 경직이 끝나는 시점이
//   "연결 가능한 다음 공격의 가장 빠른 판정"보다 최소 2프레임 앞서야 한다.
//   → 콤보 사이에 피격자가 가드/대시/빠른 공격으로 대응할 틈이 항상 있다.
//   (tests/weapons.test.js 에서 모든 무기 조합을 자동 검증)
//
// 무기 수준 보정(mods):
//   walkScale / backWalkScale : 걷기 속도 배율
//   dashCostScale             : 대시 스태미나 소모 배율
// =============================================================================

import { BALANCE } from './balance.js';
import { attack, singleHit } from '../core/attackDef.js';
import { buildUltimate } from '../core/ultimates.js';

/** 특수강공: 무기마다 모션은 다르지만 피해량·판정은 모두 동일 (규칙) */
function specialAttack(motion) {
  return attack({
    id: 'special',
    kind: 'special',
    motion,
    duration: 50,
    hits: [{
      from: 8, to: 13,
      box: { x: -10, y: 0, w: 250, h: 140 },
      damage: BALANCE.special.damage,
      guardDamage: 0, hitstun: 0, blockstun: 0, push: 0, ultGainScale: 1.5,
    }],
  });
}

function plunge({ damage, guardDamage, landingLag, fallSpeed = 16, w = 80 }) {
  return {
    fallSpeed,
    landingLag,
    hit: {
      box: { x: -w / 2, y: -25, w, h: 55 },
      damage, guardDamage, hitstun: 12, blockstun: 12, push: 14, ultGainScale: 1.2,
    },
  };
}

const DEFS = {
  // ---------------------------------------------------------------------------
  // 장검: 균형형 기본 무기
  // ---------------------------------------------------------------------------
  longsword: {
    name: '장검',
    desc: '속도·위력·사거리가 균형 잡힌 기본 무기. 처음 시작하기 좋다.',
    color: '#9fd3ff',
    mods: { walkScale: 1, backWalkScale: 1, dashCostScale: 1 },
    light: attack({
      id: 'light', kind: 'light', motion: 'slash', cancelFrom: 12,
      hits: [singleHit({
        startup: 5, active: 3, recovery: 12,
        box: { x: 10, y: 35, w: 85, h: 60 },
        damage: 40, guardDamage: 10, hitstun: 8, blockstun: 8, push: 10,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'overhead', cancelFrom: 26,
      moves: [{ from: 6, to: 14, vx: 3 }],
      hits: [singleHit({
        startup: 14, active: 4, recovery: 20,
        box: { x: 10, y: 25, w: 135, h: 85 },
        damage: 95, guardDamage: 26, hitstun: 12, blockstun: 12, push: 20, ultGainScale: 1.6,
      })],
    }),
    plunge: plunge({ damage: 70, guardDamage: 20, landingLag: 22 }),
    special: specialAttack('special-thrust'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-longsword' },
  },

  // ---------------------------------------------------------------------------
  // 대검: 느리지만 강하고 넓다
  // ---------------------------------------------------------------------------
  greatsword: {
    name: '대검',
    desc: '느리지만 한 방이 무겁다. 넓은 범위의 강공격으로 거리를 지배한다.',
    color: '#ffb36b',
    mods: { walkScale: 0.88, backWalkScale: 0.88, dashCostScale: 1.1 },
    light: attack({
      id: 'light', kind: 'light', motion: 'slash-wide', cancelFrom: 17,
      hits: [singleHit({
        startup: 8, active: 4, recovery: 16,
        box: { x: 5, y: 25, w: 120, h: 80 },
        damage: 58, guardDamage: 16, hitstun: 10, blockstun: 10, push: 12,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'overhead-big', cancelFrom: 36,
      moves: [{ from: 8, to: 20, vx: 2.5 }],
      hits: [singleHit({
        startup: 22, active: 6, recovery: 26,
        box: { x: -10, y: 0, w: 185, h: 140 },   // 넓은 호(머리 위~발밑)
        damage: 150, guardDamage: 36, hitstun: 14, blockstun: 14, push: 26, ultGainScale: 1.8,
      })],
    }),
    plunge: plunge({ damage: 95, guardDamage: 28, landingLag: 28, w: 110 }),
    special: specialAttack('special-cleave'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-greatsword' },
  },

  // ---------------------------------------------------------------------------
  // 단검: 빠르고 짧다. 파고들기. (너클보다 타수 적고, 한 타 피해 높음)
  // ---------------------------------------------------------------------------
  dagger: {
    name: '단검',
    desc: '매우 빠른 찌르기로 빈틈을 파고든다. 사거리가 짧다.',
    color: '#b8ffb0',
    mods: { walkScale: 1.12, backWalkScale: 1.08, dashCostScale: 0.85 },
    light: attack({
      id: 'light', kind: 'light', motion: 'stab', cancelFrom: 9,
      hits: [singleHit({
        startup: 3, active: 2, recovery: 11,
        box: { x: 10, y: 45, w: 62, h: 45 },
        damage: 34, guardDamage: 8, hitstun: 6, blockstun: 6, push: 8,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'double-stab', cancelFrom: 23,
      moves: [{ from: 3, to: 10, vx: 5.5 }],     // 순간 파고들기
      duration: 32,
      hits: [
        { from: 8, to: 9, box: { x: 10, y: 40, w: 70, h: 50 }, damage: 32, guardDamage: 9, hitstun: 10, blockstun: 9, push: 4, ultGainScale: 0.8 },
        { from: 14, to: 15, box: { x: 10, y: 40, w: 75, h: 50 }, damage: 40, guardDamage: 11, hitstun: 9, blockstun: 9, push: 14, ultGainScale: 0.8 },
      ],
    }),
    plunge: plunge({ damage: 55, guardDamage: 14, landingLag: 16, fallSpeed: 18, w: 60 }),
    special: specialAttack('special-flurry'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-dagger' },
  },

  // ---------------------------------------------------------------------------
  // 도끼: 강타와 가드 압박
  // ---------------------------------------------------------------------------
  axe: {
    name: '도끼',
    desc: '가드 게이지를 크게 깎는 강타로 방어를 무너뜨린다.',
    color: '#ff8b8b',
    mods: { walkScale: 0.95, backWalkScale: 0.9, dashCostScale: 1 },
    light: attack({
      id: 'light', kind: 'light', motion: 'chop', cancelFrom: 15,
      hits: [singleHit({
        startup: 7, active: 3, recovery: 15,
        box: { x: 10, y: 30, w: 92, h: 70 },
        damage: 48, guardDamage: 22, hitstun: 9, blockstun: 11, push: 7,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'overhead-chop', cancelFrom: 29,
      moves: [{ from: 6, to: 16, vx: 2.5 }],
      hits: [singleHit({
        startup: 18, active: 4, recovery: 24,
        box: { x: 5, y: 10, w: 128, h: 120 },
        damage: 115, guardDamage: 44, hitstun: 13, blockstun: 15, push: 14, ultGainScale: 1.7,
      })],
    }),
    plunge: plunge({ damage: 85, guardDamage: 34, landingLag: 24, w: 90 }),
    special: specialAttack('special-crush'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-axe' },
  },

  // ---------------------------------------------------------------------------
  // 창: 긴 사거리, 거리 유지
  // ---------------------------------------------------------------------------
  spear: {
    name: '창',
    desc: '가장 긴 사거리. 거리를 유지하며 찌르기로 견제한다. 품에 파고들면 약하다.',
    color: '#d6a8ff',
    mods: { walkScale: 0.95, backWalkScale: 1.15, dashCostScale: 1 },
    light: attack({
      id: 'light', kind: 'light', motion: 'thrust', cancelFrom: 15,
      hits: [singleHit({
        startup: 7, active: 3, recovery: 16,
        box: { x: 40, y: 55, w: 135, h: 30 },    // 가늘고 긴 찌르기 → 점프에 약함
        damage: 36, guardDamage: 9, hitstun: 8, blockstun: 8, push: 14,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'sweep', cancelFrom: 28,
      moves: [{ from: 4, to: 12, vx: 1.5 }],
      hits: [singleHit({
        startup: 16, active: 5, recovery: 25,
        box: { x: 25, y: 20, w: 170, h: 85 },
        damage: 85, guardDamage: 22, hitstun: 12, blockstun: 12, push: 22, ultGainScale: 1.5,
      })],
    }),
    plunge: plunge({ damage: 65, guardDamage: 18, landingLag: 24, w: 70 }),
    special: specialAttack('special-pierce'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-spear' },
  },

  // ---------------------------------------------------------------------------
  // 너클: 매우 짧은 사거리, 다단 히트 연속 콤보 (단검보다 타수 많고 한 타 피해 낮음)
  // ---------------------------------------------------------------------------
  knuckle: {
    name: '너클',
    desc: '초근접 연타. 한 대는 약하지만 끊임없이 몰아친다.',
    color: '#ffe36b',
    mods: { walkScale: 1.15, backWalkScale: 1.05, dashCostScale: 0.8 },
    light: attack({
      id: 'light', kind: 'light', motion: 'jab-jab', cancelFrom: 12, duration: 19,
      hits: [
        { from: 3, to: 3, box: { x: 10, y: 55, w: 48, h: 35 }, damage: 15, guardDamage: 5, hitstun: 6, blockstun: 6, push: 2, ultGainScale: 0.6 },
        { from: 7, to: 7, box: { x: 10, y: 55, w: 50, h: 35 }, damage: 17, guardDamage: 5, hitstun: 6, blockstun: 6, push: 6, ultGainScale: 0.6 },
      ],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'rush', cancelFrom: 24, duration: 32,
      moves: [{ from: 2, to: 14, vx: 2.5 }],
      hits: [
        { from: 6, to: 6, box: { x: 10, y: 45, w: 55, h: 45 }, damage: 16, guardDamage: 7, hitstun: 6, blockstun: 6, push: 1, ultGainScale: 0.6 },
        { from: 10, to: 10, box: { x: 10, y: 45, w: 55, h: 45 }, damage: 16, guardDamage: 7, hitstun: 7, blockstun: 6, push: 1, ultGainScale: 0.6 },
        { from: 15, to: 16, box: { x: 10, y: 50, w: 62, h: 60 }, damage: 28, guardDamage: 11, hitstun: 9, blockstun: 9, push: 14, ultGainScale: 0.8 },
      ],
    }),
    plunge: plunge({ damage: 50, guardDamage: 14, landingLag: 16, fallSpeed: 18, w: 60 }),
    special: specialAttack('special-uppercut'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-knuckle' },
  },
};

export const WEAPON_ORDER = ['longsword', 'greatsword', 'dagger', 'axe', 'spear', 'knuckle'];

export const WEAPONS = Object.fromEntries(
  Object.entries(DEFS).map(([id, w]) => [id, { id, ...w, ultimateSpec: w.ultimate, ultimate: buildUltimate(id, w.ultimate) }]),
);

export const DEFAULT_WEAPON = 'longsword';

export function getWeapon(id) {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
