// =============================================================================
// 궁극기 확장 구조
// -----------------------------------------------------------------------------
// 각 무기는 { type, motion, params } 형태의 궁극기 명세만 갖고, 실제 공격 데이터는
// 여기 등록된 "궁극기 타입 빌더"가 만든다. 무기별 개성 있는 궁극기는 새 타입을
// 등록하고 무기 명세의 type 만 바꾸면 된다.
//
// 무기별 궁극기 (아래 등록): 첫 판정은 즉시(1프레임) 나오고, 무기 성격대로 이어진다.
//   장검 십자 베기 · 대검 대지 가르기 · 단검 그림자 난도 · 도끼 도약 쪼개기 · 창 관통 · 너클 폭풍 연타
//
// 공통 규칙(전투 로직에서 강제, 타입과 무관):
//   - 즉시 시전(준비 동작 없음), 발동 즉시 게이지 0%
//   - 일반 공격에 맞아도 취소되지 않음, 일반 패링 불가
//   - 완벽패링 시 끊김, 게이지 반환 없음
// =============================================================================

import { attack } from './attackDef.js';
import { BALANCE } from '../config/balance.js';

const builders = new Map();

/** 새 궁극기 타입 등록: builder(params, weapon) → AttackDef(kind: 'ultimate') */
export function registerUltimateType(type, builder) {
  builders.set(type, builder);
}

export function buildUltimate(weaponId, spec) {
  const builder = builders.get(spec.type);
  if (!builder) throw new Error(`Unknown ultimate type "${spec.type}" (${weaponId})`);
  const def = builder(spec.params ?? {}, weaponId);
  const scale = BALANCE.ultimate.damageScale ?? 1;
  def.hits = def.hits.map((h) => ({ ...h, damage: Math.round(h.damage * scale) }));
  def.kind = 'ultimate';
  def.id = 'ultimate';
  def.motion = spec.motion ?? def.motion;
  def.ultimateType = spec.type;
  if (def.hits.length === 0 || def.hits[0].from > 1) {
    throw new Error(`Ultimate "${weaponId}" must hit immediately (no wind-up)`);
  }
  return def;
}

// --- 공통 임시 궁극기: 즉시 돌진 베기 [TEMP] -----------------------------------
// 밸런스: 첫 판정 사거리 110→70, 돌진 속도 10→8 (백대시 12px/f 로 벗어날 수 있음),
//         돌진 22f→18f. 원거리 시전은 반응해서 대응 가능하고 근거리에서는 여전히 강력하다.
registerUltimateType('placeholderLunge', (p) => attack({
  id: 'ultimate',
  kind: 'ultimate',
  motion: 'ult-lunge',
  duration: p.duration ?? 56,
  moves: [{ from: 0, to: p.lungeFrames ?? 18, vx: p.lungeSpeed ?? 8 }],
  hits: [{
    from: 1, to: p.lungeFrames ?? 18,
    box: { x: 0, y: 10, w: p.reach ?? 70, h: 100 },
    damage: p.damage ?? 220, guardDamage: 0,
    hitstun: 30, blockstun: 0, push: 26, ultGainScale: 0,
  }],
}));

// =============================================================================
// 무기별 궁극기
// 판정 사이 경직(hitstun)은 다음 판정까지 이어지도록 잡아 한 번 걸리면 끝까지 들어간다.
// 첫 판정을 피하면(거리·백대시) 나머지도 빗나간다 → 읽고 피할 여지.
// =============================================================================
const H = (from, to, w, damage, hitstun, push = 2, extra = {}) => ({
  from, to, box: { x: 0, y: extra.y ?? 10, w, h: extra.h ?? 100 },
  damage, guardDamage: 0, hitstun, blockstun: 0, push, ultGainScale: 0,
});
const ult = (name, duration, moves, hits) => {
  const d = attack({ id: 'ultimate', kind: 'ultimate', duration, moves, hits });
  d.name = name;
  return d;
};

// 장검: 한 걸음 들어가며 X 자로 두 번 벤다. 균형형 — 중간 사거리, 두 번째가 강함.
registerUltimateType('crossSlash', () => ult('십자 베기', 54,
  [{ from: 0, to: 6, vx: 6 }],
  [H(1, 4, 92, 90, 22), H(14, 17, 100, 120, 30, 30)]));

// 대검: 붙잡는 짧은 일격 후, 크게 들어 올려 넓은 범위를 내려찍는다. 느리지만 가장 강하다.
registerUltimateType('earthSplitter', () => ult('대지 가르기', 72,
  [],
  [H(1, 3, 78, 40, 34), H(24, 28, 150, 230, 34, 34, { y: 0, h: 120 })]));

// 단검: 순간 파고들며 짧게 여러 번 찌르고 마지막에 깊게 벤다. 사거리는 짧지만 이동이 길다.
registerUltimateType('shadowFlurry', () => ult('그림자 난도', 48,
  [{ from: 0, to: 9, vx: 9 }],
  [H(1, 2, 58, 30, 8), H(5, 6, 58, 30, 8), H(9, 10, 58, 30, 8), H(13, 14, 58, 30, 8), H(17, 18, 58, 30, 10), H(22, 24, 66, 70, 26, 24)]));

// 도끼: 짧게 받아치고 앞으로 도약해 내려찍는다. 두 번째 일격이 매우 강하다.
registerUltimateType('leapCleave', () => ult('도약 쪼개기', 66,
  [{ from: 2, to: 15, vx: 5.5 }],
  [H(1, 3, 72, 30, 22), H(17, 21, 112, 230, 32, 30, { y: 0, h: 120 })]));

// 창: 즉시 먼 거리(150px 즉시 적중 — 다른 무기는 불가)까지 꿰뚫는 단일 찌르기. 피해는 중간.
registerUltimateType('piercingLunge', () => ult('관통', 50,
  [{ from: 0, to: 6, vx: 4 }],
  [H(1, 8, 160, 145, 30, 28, { y: 40, h: 50 })]));

// 너클: 달려들며 몰아치는 연타 후 어퍼컷으로 띄운다. 타수 최다, 한 타는 약하다.
registerUltimateType('stormRush', () => ult('폭풍 연타', 54,
  [{ from: 0, to: 12, vx: 7 }],
  [...Array.from({ length: 8 }, (_, i) => H(1 + i * 3, 2 + i * 3, 56, 19, 7)), H(29, 31, 62, 80, 30, 34, { y: 30, h: 100 })]));
