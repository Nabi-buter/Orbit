// =============================================================================
// 무기 데이터 (7종)
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
import { attachWeaponSegments } from '../render/hitGeometry.js';
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


// =============================================================================
// ★ 무기별 밸런스 변수 (한곳에서 조정) ★  — 모두 [TEMP]
// -----------------------------------------------------------------------------
//   combo  : 콤보 횟수 {lightMax 약공 연속, heavyMax 강공 연속, maxTotal 섞을 때 최대}
//            (콤보 종료 딜레이는 BALANCE.combo.turnAdvantage 에서 자동 계산 → 공격권이 상대에게 넘어감)
//   reach  : 리치 배율 (공격 판정 폭 × reach)
//   damage : 데미지 배율 (약/강/낙하 공격 피해 × damage. 특수강공·궁극기는 제외)
//   speed  : 공격 속도 = 무게감 배율 (발생·판정·후딜·연결 시점 × speed, 클수록 느림)
//   ── 위 4개로 부족할 때 쓰는 보조 변수 ──
//   hp         : 체력 배율 (기본 체력 × hp)
//   guardTaken : 상대 공격을 막을 때 내 가드 게이지 감소량 배율 (클수록 가드가 빨리 깨짐)
// 조정 근거와 결과는 docs/BALANCE.md, 자동 탐색 도구는 scripts/tune.js.
// =============================================================================
export const KNOBS = {
  // 공격 시간(speed)은 모티브(Dueling Grounds) 무기 성격에 맞춘 약공 발동 목표에서 예측 → 테스트(scripts/tune.js, ±10% 안)로 조정
  // 새 시드 검증 승률 48~53%
  // 규칙: 모든 무기 강공 콤보 ≥ 2, 강공 콤보 < 약공 콤보
  longsword: { combo: { lightMax: 3, heavyMax: 2, maxTotal: 4 }, reach: 1.01, damage: 1.05, speed: 1.28, hp: 1.05, guardTaken: 1, windup: 1.25 },
  rapier: { combo: { lightMax: 3, heavyMax: 2, maxTotal: 4 }, reach: 1, damage: 0.82, speed: 1.4, hp: 0.98, guardTaken: 1.05 }, // 추가 시 64% → 데미지·속도 조정 50%
  greatsword: { combo: { lightMax: 3, heavyMax: 2, maxTotal: 3 }, reach: 1, damage: 0.94, speed: 1.3, hp: 1.08, guardTaken: 1, windup: 1.3 },
  dagger: { combo: { lightMax: 3, heavyMax: 2, maxTotal: 5 }, reach: 1.04, damage: 0.9, speed: 1.53, hp: 1, guardTaken: 1 },
  axe: { combo: { lightMax: 3, heavyMax: 2, maxTotal: 3 }, reach: 1.05, damage: 1.17, speed: 1.44, hp: 1.18, guardTaken: 1, windup: 1.3 },
  spear: { combo: { lightMax: 3, heavyMax: 2, maxTotal: 3 }, reach: 0.9, damage: 0.78, speed: 1.05, hp: 1.17, guardTaken: 1, windup: 1.1 },
  knuckle: { combo: { lightMax: 5, heavyMax: 3, maxTotal: 8 }, reach: 1.15, damage: 0.97, speed: 1.52, hp: 1.03, guardTaken: 0.91 },
};

const DEFS = {
  // ---------------------------------------------------------------------------
  // 장검: 균형형 기본 무기
  // ---------------------------------------------------------------------------
  longsword: {
    name: '장검',
    desc: '어느 거리에서도 무난하다. 패링하고 바로 받아치기 좋다.',
    color: '#9fd3ff',
    mods: { walkScale: 1, backWalkScale: 1, dashCostScale: 1 },
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
    ultimate: { type: 'crossSlash', motion: 'ult-longsword' },
  },

  // ---------------------------------------------------------------------------
  // 레이피어: 가늘고 긴 찌르기. 한 점으로 멀리 닿지만 판정이 얇고, 막는 상대의 자세는 잘 못 무너뜨린다
  // ---------------------------------------------------------------------------
  rapier: {
    name: '레이피어',
    desc: '가늘고 길다. 거리를 재다 한 점을 꿰뚫는다.',
    color: '#8ff0d8',
    mods: { walkScale: 1.08, backWalkScale: 1.12, dashCostScale: 0.9 },   // 펜싱 발놀림: 물러서기 빠름
    lightSteps: [
      { name: '재찌르기', motion: 'thrust', startup: 1 },
      { name: '런지', motion: 'thrust', dmg: 1.35, push: 10, recovery: 7 },
    ],
    heavySteps: [
      { name: '베어 올리기', motion: 'rising', dmg: 1.05, startup: 2, recovery: 4 },
    ],
    light: attack({
      id: 'light', kind: 'light', motion: 'thrust', cancelFrom: 11,
      hits: [singleHit({
        startup: 5, active: 2, recovery: 15,
        box: { x: 20, y: 50, w: 100, h: 30 },
        damage: 34, guardDamage: 7, hitstun: 7, blockstun: 7, push: 8,
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy', motion: 'thrust', cancelFrom: 27,
      moves: [{ from: 4, to: 12, vx: 3.5 }],   // 플레시: 달려들며 찌름
      hits: [singleHit({
        startup: 14, active: 4, recovery: 26,
        box: { x: 20, y: 45, w: 130, h: 35 },
        damage: 82, guardDamage: 15, hitstun: 12, blockstun: 11, push: 18, ultGainScale: 1.5,
      })],
    }),
    plunge: plunge({ damage: 58, guardDamage: 14, landingLag: 18, w: 56 }),
    special: specialAttack('special-thrust'),
    ultimate: { type: 'flashThrusts', motion: 'ult-rapier' },
  },

  // ---------------------------------------------------------------------------
  // 대검: 느리지만 강하고 넓다
  // ---------------------------------------------------------------------------
  greatsword: {
    name: '대검',
    desc: '휘두르기 전에 다 보이지만 맞으면 크게 아프다.',
    color: '#ffb36b',
    mods: { walkScale: 0.85, backWalkScale: 0.85, dashCostScale: 1.1 },
    lightSteps: [
      { name: '횡베기', motion: 'slash-wide', dmg: 1.0, startup: 1 },
      { name: '우상단 베기', motion: 'slash-rev', dmg: 1.1, push: 6, recovery: 6 },
    ],
    heavySteps: [
      { name: '대검 올려베기', motion: 'rising', dmg: 1.15, startup: 3, recovery: 6, push: 6 },
    ],
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
    ultimate: { type: 'earthSplitter', motion: 'ult-greatsword' },
  },

  // ---------------------------------------------------------------------------
  // 단검: 빠르고 짧다. 파고들기. (너클보다 타수 적고, 한 타 피해 높음)
  // ---------------------------------------------------------------------------
  dagger: {
    name: '단검',
    desc: '짧고 빠르다. 붙어서 틈을 찌른다.',
    color: '#b8ffb0',
    mods: { walkScale: 1.15, backWalkScale: 1.08, dashCostScale: 0.8, dashScale: 1.2 },
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
    ultimate: { type: 'shadowFlurry', motion: 'ult-dagger' },
  },

  // ---------------------------------------------------------------------------
  // 도끼: 강타와 가드 압박
  // ---------------------------------------------------------------------------
  axe: {
    name: '도끼',
    desc: '막는 상대의 자세를 무너뜨린다. 가드만 하면 깨진다.',
    color: '#ff8b8b',
    mods: { walkScale: 0.95, backWalkScale: 0.9, dashCostScale: 1 },
    lightSteps: [
      { name: '올려치기', motion: 'rising', dmg: 1.0, startup: 1 },
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
        damage: 50, guardDamage: 19, hitstun: 9, blockstun: 11, push: 7,   // 가드 70 기준: 약공 콤보만으로는 가드 브레이크 안 됨 (22→19)
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
    ultimate: { type: 'leapCleave', motion: 'ult-axe' },
  },

  // ---------------------------------------------------------------------------
  // 창: 긴 사거리, 거리 유지
  // ---------------------------------------------------------------------------
  spear: {
    name: '창',
    desc: '가장 멀리서 찌른다. 품으로 파고들면 곤란하다.',
    color: '#d6a8ff',
    mods: { walkScale: 0.9, backWalkScale: 1.0, dashCostScale: 1.1 },
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
    ultimate: { type: 'piercingLunge', motion: 'ult-spear' },
  },

  // ---------------------------------------------------------------------------
  // 너클: 매우 짧은 사거리, 다단 히트 연속 콤보 (단검보다 타수 많고 한 타 피해 낮음)
  // ---------------------------------------------------------------------------
  knuckle: {
    name: '너클',
    desc: '한 대는 가볍지만 쉬지 않고 이어진다. 붙어야 산다.',
    color: '#ffe36b',
    mods: { walkScale: 1.25, backWalkScale: 1.05, dashCostScale: 0.7, dashScale: 1.35 },
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
    ultimate: { type: 'stormRush', motion: 'ult-knuckle' },
  },
};

export const WEAPON_ORDER = ['longsword', 'rapier', 'greatsword', 'dagger', 'axe', 'spear', 'knuckle'];

/**
 * 콤보 단계 목록을 정확히 n 개로 만든다.
 * 정의된 단계보다 많으면 중간 단계를 반복하고, 마무리(마지막 단계)는 항상 끝에 둔다.
 */
function buildSteps(base, steps, firstName, n) {
  const all = [{ ...base, name: firstName }, ...steps.map((st) => variant(base, st))];
  if (n <= 1) return [all[0]];
  const finisher = all[all.length - 1];
  const body = all.slice(0, Math.max(1, all.length - 1));
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push(body[i % body.length]);
  out.push(all.length > 1 ? finisher : all[0]);
  return out;
}

/** 리치/데미지 배율 적용 */
function scaleDef(def, { reach = 1, damage = 1 }) {
  if (reach === 1 && damage === 1) return def;
  return {
    ...def,
    hits: def.hits.map((h) => ({ ...h, damage: Math.round(h.damage * damage), box: { ...h.box, w: Math.round(h.box.w * reach) } })),
  };
}

const FIRST_NAMES = {
  longsword: ['베기', '내려베기'], rapier: ['찌르기', '플레시'], greatsword: ['좌상단 베기', '대검 내려찍기'], dagger: ['찌르기', '이연 찌르기'],
  axe: ['내려찍기', '도끼 찍기'], spear: ['찌르기', '휘두르기'], knuckle: ['잽', '돌진 연타'],
};

/**
 * 콤보 단계 사이 최소 틈 보장: 어떤 단계가 가장 늦게 맞아도, 가장 빠른 다음 단계 판정보다
 * 피격자가 BALANCE.combo.minGap 프레임 먼저 움직일 수 있도록 연결 시점(cancelFrom)을 늦춘다.
 */
function enforceGaps(steps) {
  const minStart = Math.min(...steps.map((d) => d.hits[0].from));
  for (const d of steps) {
    if (d.cancelFrom == null) continue;
    const last = d.hits.at(-1);
    const need = last.to + last.hitstun + BALANCE.combo.minGap - minStart;
    if (d.cancelFrom < need) {
      d.cancelFrom = need;
      d.duration = Math.max(d.duration, need + 2);
    }
    // 반대로 틈이 너무 크면(느린 무기) 피격자가 콤보 중간에 자유롭게 역공한다 →
    // 피격/가드 경직을 늘려 틈을 정확히 minGap 으로 맞춘다 (가드·대시는 가능, 약공 역공은 불가)
    const stun = d.cancelFrom + minStart - last.to - BALANCE.combo.minGap;
    if (last.hitstun < stun) last.hitstun = stun;
    if (last.blockstun < stun) last.blockstun = stun;
  }
}

/**
 * 콤보 후 공격권 이전: 콤보가 끝난 뒤(상한 도달) 상대가 "가장 느린 약공"으로도 먼저 공격할 수 있도록
 * 콤보 종료 딜레이를 계산한다. 마지막 단계가 무엇이든(최악의 경우) 목표 여유 프레임을 보장.
 */
export function finalizeTiming() {
  const maxLight = Math.max(...Object.values(WEAPONS).map((w) => w.light.hits[0].from));
  for (const w of Object.values(WEAPONS)) {
    const steps = [...w.lights, ...w.heavies];
    const startA = Math.min(...steps.map((d) => d.hits[0].from));
    let need = 0;
    for (const d of steps) {
      const last = d.hits.at(-1);
      const defFree = last.to + Math.max(last.hitstun, last.blockstun);
      need = Math.max(need, defFree + maxLight - (d.duration + startA));
    }
    const T = BALANCE.combo.turnAdvantage;
    w.combo = { ...w.knobs.combo, mixedLag: Math.max(0, need + T.mixed), fullLag: Math.max(0, need + T.full) };
  }
}

/** 변수 표(knobs)로 무기 하나를 만든다 */
export function buildWeapon(id, kn = KNOBS[id]) {
  const w = DEFS[id];
  const k = kn.speed ?? 1;
  // windup: 무기별 예비 동작 배율 (실제 무게감 — 무거운 무기는 들어 올리는 데 시간이 걸린다)
  const tune = (d) => tempo(scaleDef(d, kn), k, { ...BALANCE.timing, windup: BALANCE.timing.windup * (kn.windup ?? 1) });
  // 약공 연결 단계는 예비 동작 길이를 첫 타와 같게 맞춘다 (차이는 후딜로) →
  // 연결 타격이 항상 같은 박자에 들어가 콤보 중간 역공이 끼어들지 못한다
  const flat = (w.lightSteps ?? []).map((st) => ({ ...st, startup: 0, recovery: (st.recovery ?? 0) + (st.startup ?? 0) }));
  const lights = buildSteps(w.light, flat, FIRST_NAMES[id][0], kn.combo.lightMax).map(tune);
  const heavies = buildSteps(w.heavy, w.heavySteps ?? [], FIRST_NAMES[id][1], kn.combo.heavyMax).map(tune);
  enforceGaps([...lights, ...heavies]);
  // 판정 = 그려지는 무기 모양 (프레임마다 무기 선분). 경직·타이밍이 정해진 뒤에 계산
  for (const d of [...lights, ...heavies]) attachWeaponSegments(id, d);
  const plungeDef = {
    ...w.plunge,
    landingLag: Math.round(w.plunge.landingLag * k),
    hit: { ...w.plunge.hit, damage: Math.round(w.plunge.hit.damage * (kn.damage ?? 1)) },
  };
  return {
    id, ...w, combo: kn.combo, tempo: k, knobs: kn,
    hpScale: kn.hp ?? 1, guardTaken: kn.guardTaken ?? 1,
    light: lights[0], heavy: heavies[0], lights, heavies, plunge: plungeDef,
    ultimateSpec: w.ultimate, ultimate: buildUltimate(id, w.ultimate),
  };
}

export const WEAPONS = Object.fromEntries(Object.keys(DEFS).map((id) => [id, buildWeapon(id)]));
finalizeTiming();

/** 밸런스 탐색용: 변수를 바꿔 무기를 다시 만든다 (기존 객체를 갱신) */
export function applyKnobs(id, kn) {
  KNOBS[id] = kn;
  const fresh = buildWeapon(id, kn);
  for (const key of Object.keys(WEAPONS[id])) delete WEAPONS[id][key];
  Object.assign(WEAPONS[id], fresh);
  finalizeTiming();
}

export const DEFAULT_WEAPON = 'longsword';

export function getWeapon(id) {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
