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
//   dashScale                 : 대시 이동 거리 배율 (무적 없음 규칙은 동일)
//
// 콤보(combo) — src/core/combo.js 참고:
//   lightMax / heavyMax : 약공 / 강공 최대 연속 횟수 (약공 연타 시 lightSteps 순서로 진행)
//   maxTotal            : 약·강 혼합 시 전체 최대 횟수
//   fullLag / mixedLag  : 콤보 종료 후 공격 불가 딜레이 (한 종류만 연타 / 섞음)
// lightSteps / heavySteps : 2단계 이후의 변형 (1단계는 light / heavy 그대로)
//
// tempo (무게감): 아래 프레임 수치는 "기준 템포" 이고, 실제 공격은 무기별 tempo 배로 느려진다.
//   실제 무기를 휘두르는 느낌을 주기 위해 무거울수록 크다. (src/core/attackDef.js tempo())
//   낙하 공격 착지 후딜에도 같은 배율을 적용한다.
// =============================================================================

import { BALANCE } from './balance.js';
import { attack, singleHit, variant, tempo } from '../core/attackDef.js';
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
    tempo: 1.25,                                                                 // [TEMP] 무게감 배율
    combo: { lightMax: 3, heavyMax: 2, maxTotal: 4, fullLag: 52, mixedLag: 24 },   // [TEMP]
    lightSteps: [
      { name: '되베기', motion: 'slash-rev', startup: 1 },
      { name: '찔러 마무리', motion: 'thrust', dmg: 1.3, push: 8, recovery: 6 },
    ],
    heavySteps: [
      { name: '올려베기', motion: 'rising', dmg: 1.15, startup: 2, recovery: 4 },
    ],
    light: attack({
      id: 'light', kind: 'light', motion: 'slash', cancelFrom: 12,
      hits: [singleHit({
        startup: 5, active: 3, recovery: 14,              // 밸런스: 후딜 12→14 (헛친 약공 반격 가능)
        box: { x: 10, y: 35, w: 85, h: 60 },
        damage: 40, guardDamage: 10, hitstun: 8, blockstun: 8, push: 10,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'overhead', cancelFrom: 26,
      moves: [{ from: 6, to: 14, vx: 3 }],
      hits: [singleHit({
        startup: 14, active: 4, recovery: 24,             // 밸런스: 후딜 20→24 (최대 사거리 강공 남발 억제)
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
    mods: { walkScale: 0.85, backWalkScale: 0.85, dashCostScale: 1.1 },
    tempo: 1.35,                                                                 // [TEMP] 무게감 배율
    combo: { lightMax: 2, heavyMax: 1, maxTotal: 3, fullLag: 62, mixedLag: 32 },   // [TEMP]
    lightSteps: [
      { name: '우상단 베기', motion: 'slash-rev', dmg: 1.1, push: 6, recovery: 6 },
    ],
    heavySteps: [],
    light: attack({
      id: 'light', kind: 'light', motion: 'slash-wide', cancelFrom: 17,
      hits: [singleHit({
        startup: 9, active: 4, recovery: 20,
        box: { x: 5, y: 25, w: 110, h: 80 },
        damage: 60, guardDamage: 16, hitstun: 10, blockstun: 10, push: 12,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'overhead-big', cancelFrom: 36,
      moves: [{ from: 8, to: 20, vx: 2.5 }],
      hits: [singleHit({
        startup: 22, active: 6, recovery: 30,
        box: { x: -10, y: 0, w: 168, h: 140 },   // 넓은 호(머리 위~발밑)
        damage: 165, guardDamage: 36, hitstun: 14, blockstun: 14, push: 26, ultGainScale: 1.8,
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
    mods: { walkScale: 1.15, backWalkScale: 1.08, dashCostScale: 0.8, dashScale: 1.2 },
    tempo: 1.15,                                                                 // [TEMP] 무게감 배율
    combo: { lightMax: 3, heavyMax: 2, maxTotal: 4, fullLag: 42, mixedLag: 20 },   // [TEMP]
    lightSteps: [
      { name: '가르기', motion: 'slash' },
      { name: '깊게 찌르기', motion: 'stab', dmg: 1.25, push: 6, recovery: 5 },
    ],
    heavySteps: [
      { name: '돌려 베기', motion: 'slash-wide', dmg: 1.1, startup: 2, recovery: 4 },
    ],
    light: attack({
      id: 'light', kind: 'light', motion: 'stab', cancelFrom: 9,
      hits: [singleHit({
        startup: 3, active: 2, recovery: 12,
        box: { x: 10, y: 45, w: 66, h: 45 },
        damage: 39, guardDamage: 9, hitstun: 6, blockstun: 6, push: 8,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'double-stab', cancelFrom: 23,
      moves: [{ from: 3, to: 10, vx: 5.5 }],     // 순간 파고들기
      duration: 35,
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
    tempo: 1.4,                                                                 // [TEMP] 무게감 배율
    combo: { lightMax: 2, heavyMax: 2, maxTotal: 3, fullLag: 56, mixedLag: 28 },   // [TEMP]
    lightSteps: [
      { name: '옆치기', motion: 'slash-rev', dmg: 1.15, guard: 1.25, recovery: 6 },
    ],
    heavySteps: [
      { name: '휘둘러 찍기', motion: 'sweep', dmg: 1.1, startup: 2, recovery: 4 },
    ],
    light: attack({
      id: 'light', kind: 'light', motion: 'chop', cancelFrom: 15,
      hits: [singleHit({
        startup: 6, active: 3, recovery: 17,             // 밸런스: 발생 7→6 (근접 견제력 보강)
        box: { x: 10, y: 30, w: 92, h: 70 },
        damage: 50, guardDamage: 22, hitstun: 9, blockstun: 11, push: 7,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'overhead-chop', cancelFrom: 30,
      moves: [{ from: 6, to: 16, vx: 2.5 }],
      hits: [singleHit({
        startup: 18, active: 4, recovery: 26,
        box: { x: 5, y: 10, w: 128, h: 120 },
        damage: 120, guardDamage: 44, hitstun: 13, blockstun: 15, push: 14, ultGainScale: 1.7,
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
    mods: { walkScale: 0.9, backWalkScale: 1.0, dashCostScale: 1.1 },
    tempo: 1.25,                                                                 // [TEMP] 무게감 배율
    combo: { lightMax: 3, heavyMax: 2, maxTotal: 3, fullLag: 52, mixedLag: 26 },   // [TEMP]
    lightSteps: [
      { name: '재찌르기', motion: 'thrust', startup: 1 },
      { name: '밀어 찌르기', motion: 'thrust', dmg: 1.3, push: 10, recovery: 6 },
    ],
    heavySteps: [
      { name: '회전 베기', motion: 'slash-wide', dmg: 1.1, startup: 2, recovery: 4 },
    ],
    light: attack({
      id: 'light', kind: 'light', motion: 'thrust', cancelFrom: 15,
      hits: [singleHit({
        startup: 9, active: 3, recovery: 21,             // 밸런스: 사거리 175→152, 발생 7→9, 후딜 16→21
        box: { x: 40, y: 55, w: 112, h: 30 },    // 가늘고 긴 찌르기 → 점프에 약함
        damage: 28, guardDamage: 9, hitstun: 8, blockstun: 8, push: 14,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'sweep', cancelFrom: 28,
      moves: [{ from: 4, to: 12, vx: 1.5 }],
      hits: [singleHit({
        startup: 17, active: 5, recovery: 31,
        box: { x: 25, y: 20, w: 160, h: 85 },
        damage: 78, guardDamage: 22, hitstun: 12, blockstun: 12, push: 22, ultGainScale: 1.5,
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
    mods: { walkScale: 1.25, backWalkScale: 1.05, dashCostScale: 0.7, dashScale: 1.35 },
    tempo: 1.15,                                                                 // [TEMP] 무게감 배율
    combo: { lightMax: 5, heavyMax: 3, maxTotal: 7, fullLag: 40, mixedLag: 18 },   // [TEMP]
    lightSteps: [
      { name: '잽', motion: 'jab' },
      { name: '훅', motion: 'hook', dmg: 1.15 },
      { name: '바디 블로', motion: 'body', dmg: 1.15, startup: 1 },
      { name: '어퍼컷', motion: 'uppercut', dmg: 1.6, push: 10, recovery: 6 },
    ],
    heavySteps: [
      { name: '러시', motion: 'rush', startup: 1 },
      { name: '스트레이트', motion: 'straight', dmg: 1.2, push: 8, recovery: 6 },
    ],
    light: attack({
      id: 'light', kind: 'light', motion: 'jab', cancelFrom: 9,
      hits: [singleHit({
        startup: 3, active: 1, recovery: 13,
        box: { x: 10, y: 55, w: 56, h: 35 },
        damage: 25, guardDamage: 7, hitstun: 6, blockstun: 6, push: 4, ultGainScale: 0.7,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'rush', cancelFrom: 24, duration: 35,
      moves: [{ from: 2, to: 14, vx: 4 }],        // 밸런스: 돌진 거리 32→52px (사거리 열세 보완)
      hits: [
        { from: 6, to: 6, box: { x: 10, y: 45, w: 55, h: 45 }, damage: 19, guardDamage: 7, hitstun: 6, blockstun: 6, push: 1, ultGainScale: 0.6 },
        { from: 10, to: 10, box: { x: 10, y: 45, w: 55, h: 45 }, damage: 19, guardDamage: 7, hitstun: 7, blockstun: 6, push: 1, ultGainScale: 0.6 },
        { from: 15, to: 16, box: { x: 10, y: 50, w: 62, h: 60 }, damage: 31, guardDamage: 12, hitstun: 9, blockstun: 9, push: 14, ultGainScale: 0.8 },
      ],
    }),
    plunge: plunge({ damage: 50, guardDamage: 14, landingLag: 16, fallSpeed: 18, w: 60 }),
    special: specialAttack('special-uppercut'),
    ultimate: { type: 'placeholderLunge', motion: 'ult-knuckle' },
  },
};

export const WEAPON_ORDER = ['longsword', 'greatsword', 'dagger', 'axe', 'spear', 'knuckle'];

/** 콤보 단계별 공격 목록: [1단계(기본), ...변형] */
function buildSteps(base, steps, firstName) {
  return [{ ...base, name: firstName }, ...steps.map((st) => variant(base, st))];
}

const FIRST_NAMES = {
  longsword: ['베기', '내려베기'], greatsword: ['좌상단 베기', '대검 내려찍기'], dagger: ['찌르기', '이연 찌르기'],
  axe: ['내려찍기', '도끼 찍기'], spear: ['찌르기', '휘두르기'], knuckle: ['잽', '돌진 연타'],
};

export const WEAPONS = Object.fromEntries(
  Object.entries(DEFS).map(([id, w]) => {
    const k = w.tempo ?? 1;
    const lights = buildSteps(w.light, w.lightSteps ?? [], FIRST_NAMES[id][0]).map((d) => tempo(d, k));
    const heavies = buildSteps(w.heavy, w.heavySteps ?? [], FIRST_NAMES[id][1]).map((d) => tempo(d, k));
    const plungeDef = { ...w.plunge, landingLag: Math.round(w.plunge.landingLag * k) };
    if (lights.length !== w.combo.lightMax || heavies.length !== w.combo.heavyMax) {
      throw new Error(`${id}: 콤보 단계 수와 lightMax/heavyMax 불일치`);
    }
    return [id, {
      id, ...w, light: lights[0], heavy: heavies[0], lights, heavies, plunge: plungeDef,
      ultimateSpec: w.ultimate, ultimate: buildUltimate(id, w.ultimate),
    }];
  }),
);

export const DEFAULT_WEAPON = 'longsword';

export function getWeapon(id) {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
