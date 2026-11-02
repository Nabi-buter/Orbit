// =============================================================================
// 플레이어(파이터) 상태
// 순수 데이터 + 상태 판별 헬퍼만 둔다. 렌더링/입력 장치와 무관하다.
// =============================================================================

import { BALANCE } from '../config/balance.js';
import { createComboState } from './combo.js';

export const S = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  JUMP: 'jump',            // 공중 (점프)
  DASH: 'dash',
  ATTACK: 'attack',        // 약/강공격
  PLUNGE: 'plunge',        // 낙하 공격(하강 중)
  LANDING: 'landing',      // 착지 경직 / 낙하 공격 후딜레이
  GUARD: 'guard',
  BLOCKSTUN: 'blockstun',  // 일반 패링 후 짧은 가드 경직
  HITSTUN: 'hitstun',      // 짧은 피격 경직
  PARRIED: 'parried',      // 완벽패링당해 공격이 끊긴 상태
  GUARD_BREAK: 'guardBreak',
  KNOCKBACK: 'knockback',  // 특수강공에 맞아 밀려나는 중
  SPECIAL: 'special',      // 특수강공 시전 중
  ULTIMATE: 'ultimate',
  KO: 'ko',
});

export const EMPTY_INPUT = Object.freeze({
  left: false, right: false, up: false, guard: false,
  light: false, heavy: false, dash: false, ult: false,
});

export function createFighter({ id, x, facing, weapon }) {
  const F = BALANCE.fighter;
  return {
    id,
    weapon,
    x, y: 0,          // y: 지면으로부터의 높이(위쪽이 +)
    vx: 0, vy: 0,
    pushVx: 0,        // 피격/가드 넉백 (감쇠)
    pushSource: null, // 벽에 막히면 넉백을 넘겨줄 상대
    slide: null,      // 특수강공 후 위치 보간 {fromX, toX, t, frames}
    facing,

    hp: F.maxHp,
    stamina: F.maxStamina,
    guard: F.maxGuard,
    ult: 0,

    state: S.IDLE,
    timer: 0,         // 경직류 상태의 남은 프레임
    attack: null,     // {def, frame, hitLog:Set, connected}
    dash: null,       // {dir, frame}
    dashCooldown: 0,
    lastStaminaUse: -9999,
    lastGuardUse: -9999,

    guardPress: -9999,      // 최근 가드 입력 프레임
    prevGuardPress: -9999,  // 그 이전 가드 입력 프레임 (연타 방지)

    prevInput: { ...EMPTY_INPUT },
    buffer: null,           // 선입력 {action, dir, frames}
    queued: null,           // 공격 중 예약된 다음 공격 ('light'|'heavy')
    lastTap: { dir: 0, frame: -9999 },

    // 렌더/디버그용 정보
    flash: null,            // 최근 결과 {type, frame}
    combo: createComboState(),
    stats: { hitsLanded: 0, parries: 0, perfects: 0, damageDealt: 0 },
  };
}

export const isAirborne = (f) => f.y > 0 || f.state === S.JUMP || f.state === S.PLUNGE;

/** 이동/공격/가드 등을 자유롭게 시작할 수 있는 지상 상태 */
export const isFree = (f) =>
  (f.state === S.IDLE || f.state === S.WALK || f.state === S.GUARD) && f.y <= 0;

export const isGuarding = (f) => f.state === S.GUARD || f.state === S.BLOCKSTUN;

export const isStunned = (f) =>
  f.state === S.HITSTUN || f.state === S.BLOCKSTUN || f.state === S.PARRIED ||
  f.state === S.GUARD_BREAK || f.state === S.KNOCKBACK || f.state === S.KO;

export function hurtbox(f) {
  const F = BALANCE.fighter;
  const h = f.state === S.GUARD_BREAK || f.state === S.KO ? F.height * 0.8 : F.height;
  return { x: f.x - F.width / 2, y: f.y, w: F.width, h };
}

/** 로컬 판정 박스를 월드 좌표로 변환 (y 는 지면 위 높이, 위가 +) */
export function worldBox(f, box) {
  const x = f.facing > 0 ? f.x + box.x : f.x - box.x - box.w;
  return { x, y: f.y + box.y, w: box.w, h: box.h };
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
