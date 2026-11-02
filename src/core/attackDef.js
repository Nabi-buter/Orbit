// =============================================================================
// 공격 정의(AttackDef) 생성 헬퍼
// -----------------------------------------------------------------------------
//   duration   : 전체 프레임 수 (마지막 판정 이후가 후딜레이)
//   cancelFrom : 공격이 "접촉"(적중 또는 가드됨)했을 때 이 프레임부터 다음 공격으로
//                자유롭게 연결 가능. 헛치면 연결 불가 → 후딜레이를 모두 감수.
//   moves      : [{from, to, vx}] 해당 구간 동안 바라보는 방향으로 이동
//   hits       : [{from, to, box, damage, guardDamage, hitstun, blockstun, push, ultGainScale}]
//                box 는 캐릭터 발밑 중심 기준 {x(전방 오프셋), y(지면 위 높이), w, h}
// =============================================================================

/** 단일 판정 공격을 간단히 정의하기 위한 헬퍼 */
export function singleHit({ startup, active, recovery, ...rest }) {
  return { from: startup, to: startup + active - 1, ...rest, _duration: startup + active + recovery };
}

export function attack({ id, kind, motion, cancelFrom = null, moves = [], hits, duration }) {
  const dur = duration ?? Math.max(...hits.map((h) => h._duration ?? h.to + 1));
  return {
    id,
    kind,
    motion: motion ?? id,
    duration: dur,
    cancelFrom,
    moves,
    hits: hits.map(({ _duration, ...h }) => ({ ultGainScale: 1, ...h })),
  };
}

/** 공격의 최대 전방 사거리 (판정 끝 + 내딛기 이동) */
export function reachOf(def) {
  const lunge = def.moves.reduce((s, m) => s + Math.max(0, m.vx) * (m.to - m.from + 1), 0);
  return Math.max(...def.hits.map((h) => h.box.x + h.box.w)) + lunge;
}

/**
 * 시작 시 거리 dist 인 정지 상대에게 판정이 처음 닿는 프레임 (닿지 않으면 null).
 * 상대 허트박스 반폭(halfWidth)을 포함한다. AI 의 타이밍 추정용.
 */
export function contactFrame(def, dist, halfWidth = 25) {
  let pos = 0;
  for (let f = 0; f < def.duration; f++) {
    for (const m of def.moves) if (f >= m.from && f <= m.to) pos += Math.max(0, m.vx);
    for (const h of def.hits) {
      if (f >= h.from && f <= h.to && pos + h.box.x + h.box.w + halfWidth >= dist && pos + h.box.x - halfWidth <= dist) return f;
    }
  }
  return null;
}
