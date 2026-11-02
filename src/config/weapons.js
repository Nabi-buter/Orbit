// =============================================================================
// 무기 / 공격 데이터
// -----------------------------------------------------------------------------
// 공격 정의(AttackDef) 형식
//   duration   : 전체 프레임 수 (마지막 판정 이후가 후딜레이)
//   cancelFrom : 공격이 "접촉"(적중 또는 가드됨)했을 때 이 프레임부터 다음 공격으로
//                자유롭게 연결 가능. 헛치면 연결 불가 → 후딜레이를 모두 감수.
//   moves      : [{from, to, vx}] 해당 구간 동안 바라보는 방향으로 이동
//   hits       : [{from, to, box, damage, guardDamage, hitstun, blockstun, push, ultGainScale}]
//                box 는 캐릭터 발밑 중심 기준 {x(전방 오프셋), y(지면 위 높이), w, h}
// 모든 [TEMP] 수치는 임시값이다.
// =============================================================================

import { BALANCE } from './balance.js';

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

/** 모든 무기가 공유하는 특수강공 피해 (규칙: 무기와 관계없이 동일) */
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

// -----------------------------------------------------------------------------
// 1단계: 기본 무기 (장검 기반). 2단계에서 무기 6종으로 확장한다.
// -----------------------------------------------------------------------------
export const WEAPONS = {
  longsword: {
    id: 'longsword',
    name: '장검',
    light: attack({
      id: 'light', kind: 'light',
      cancelFrom: 11,                                         // [TEMP]
      hits: [singleHit({
        startup: 5, active: 3, recovery: 12,                  // [TEMP] 빠름
        box: { x: 10, y: 35, w: 85, h: 60 },                  // [TEMP] 짧은 사거리
        damage: 40, guardDamage: 10,                          // [TEMP]
        hitstun: 8, blockstun: 8, push: 10,                   // [TEMP]
      })],
    }),
    heavy: attack({
      id: 'heavy', kind: 'heavy',
      cancelFrom: 24,                                         // [TEMP]
      moves: [{ from: 6, to: 14, vx: 3 }],                    // [TEMP] 내딛기
      hits: [singleHit({
        startup: 14, active: 4, recovery: 20,                 // [TEMP] 느림
        box: { x: 10, y: 25, w: 135, h: 85 },                 // [TEMP] 긴 사거리
        damage: 95, guardDamage: 26,                          // [TEMP]
        hitstun: 12, blockstun: 12, push: 20, ultGainScale: 1.6,
      })],
    }),
    plunge: {
      fallSpeed: 16,                                          // [TEMP]
      landingLag: 22,                                         // [TEMP] 낙하 공격 후딜레이
      hit: {
        box: { x: -40, y: -25, w: 80, h: 55 },
        damage: 70, guardDamage: 20,                          // [TEMP]
        hitstun: 12, blockstun: 12, push: 14, ultGainScale: 1.2,
      },
    },
    special: specialAttack('special-thrust'),
    ultimate: attack({
      id: 'ultimate', kind: 'ultimate', motion: 'ult-lunge',
      duration: 56,                                           // [TEMP]
      moves: [{ from: 0, to: 22, vx: 10 }],                   // [TEMP] 돌진
      hits: [{
        from: 1, to: 22,                                      // 즉시 판정 (준비 동작 없음)
        box: { x: 0, y: 10, w: 110, h: 100 },
        damage: 220, guardDamage: 0,                          // [TEMP]
        hitstun: 30, blockstun: 0, push: 26, ultGainScale: 0,
      }],
    }),
  },
};

export const DEFAULT_WEAPON = 'longsword';

export function getWeapon(id) {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
