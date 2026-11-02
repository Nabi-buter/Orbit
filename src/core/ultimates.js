// =============================================================================
// 궁극기 확장 구조
// -----------------------------------------------------------------------------
// 각 무기는 { type, motion, params } 형태의 궁극기 명세만 갖고, 실제 공격 데이터는
// 여기 등록된 "궁극기 타입 빌더"가 만든다. 무기별 개성 있는 궁극기는 새 타입을
// 등록하고 무기 명세의 type 만 바꾸면 된다.
//
// ⚠ 무기별 궁극기의 세부 공격 방식과 수치는 아직 확정하지 않았다.
//   현재는 모든 무기가 공통 임시 타입 'placeholderLunge' 를 사용한다. [TEMP]
//
// 공통 규칙(전투 로직에서 강제, 타입과 무관):
//   - 즉시 시전(준비 동작 없음), 발동 즉시 게이지 0%
//   - 일반 공격에 맞아도 취소되지 않음, 일반 패링 불가
//   - 완벽패링 시 끊김, 게이지 반환 없음
// =============================================================================

import { attack } from './attackDef.js';

const builders = new Map();

/** 새 궁극기 타입 등록: builder(params, weapon) → AttackDef(kind: 'ultimate') */
export function registerUltimateType(type, builder) {
  builders.set(type, builder);
}

export function buildUltimate(weaponId, spec) {
  const builder = builders.get(spec.type);
  if (!builder) throw new Error(`Unknown ultimate type "${spec.type}" (${weaponId})`);
  const def = builder(spec.params ?? {}, weaponId);
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
