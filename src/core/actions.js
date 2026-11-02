// =============================================================================
// 입력 → 행동 전환
// 입력은 "프레임별 버튼 상태" 객체 하나로 들어온다. (키보드, AI, 네트워크 모두 동일)
// =============================================================================

import { BALANCE } from '../config/balance.js';
import { S, isFree } from './fighter.js';
import { takeComboAttack } from './combo.js';

const B = BALANCE;

function pressedEdges(prev, cur) {
  const p = {};
  for (const k of Object.keys(cur)) p[k] = !!cur[k] && !prev[k];
  return p;
}

function setBuffer(f, action, dir = 0) {
  f.buffer = { action, dir, frames: B.input.bufferFrames };
}

function consumeBuffer(f) {
  f.buffer = null;
}

function heldDir(input) {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

export function startAttack(f, def) {
  f.state = def.kind === 'special' ? S.SPECIAL : def.kind === 'ultimate' ? S.ULTIMATE : S.ATTACK;
  f.attack = { def, frame: 0, hitLog: new Set(), connected: false };
  f.dash = null;
  f.vx = 0;
}

export function dashCost(f) {
  return B.dash.cost * (f.weapon.mods?.dashCostScale ?? 1);
}

function startDash(f, dir, frame) {
  f.state = S.DASH;
  f.dash = { dir, frame: 0 };
  f.stamina -= dashCost(f);
  f.lastStaminaUse = frame;
  f.dashCooldown = B.dash.cooldown;
  f.attack = null;
}

function startJump(f, dir, frame) {
  f.state = S.JUMP;
  f.vy = B.jump.velocity;
  f.vx = dir * B.jump.airSpeed;
  f.y = 0.01;
  f.stamina -= B.jump.cost;
  f.lastStaminaUse = frame;
  f.attack = null;
}

function startPlunge(f) {
  f.state = S.PLUNGE;
  f.vx = 0;
  f.vy = -f.weapon.plunge.fallSpeed;
  f.attack = {
    def: { id: 'plunge', kind: 'plunge', motion: 'plunge', duration: Infinity, cancelFrom: null, moves: [], hits: [] },
    frame: 0, hitLog: new Set(), connected: false,
  };
}

/** 궁극기 시전 가능 여부: "원하는 순간" — 경직/공중 상태만 아니면 즉시 발동 */
function canUltimate(f) {
  if (f.ult < B.ultimate.cost || f.y > 0) return false;
  return [S.IDLE, S.WALK, S.GUARD, S.ATTACK, S.DASH, S.LANDING].includes(f.state);
}

/**
 * 콤보 연결 가능 여부.
 * - 맞히거나 막혔으면 cancelFrom 부터 연결
 * - 헛친 약공은 cancelFrom + whiffDelay 부터 연결, 헛친 강공은 연결 불가 (연타 너프)
 */
function canChain(f) {
  if (f.state !== S.ATTACK || !f.attack) return false;
  const { def, frame, connected } = f.attack;
  if (def.cancelFrom == null) return false;
  if (connected) return frame >= def.cancelFrom;
  // 헛친 강공은 이어지지 않는다 (후딜 전부 감수). 헛친 약공은 늦게 이어진다.
  if (def.kind === 'heavy') return false;
  return frame >= def.cancelFrom + B.combo.whiffDelay;
}

/**
 * 한 프레임의 입력을 처리해 상태를 전환한다.
 * @param {object} f 파이터
 * @param {object} opp 상대
 * @param {object} input 이번 프레임 버튼 상태
 * @param {number} frame 현재 프레임 번호
 */
export function processInput(f, opp, input, frame) {
  const pressed = pressedEdges(f.prevInput, input);
  f.prevInput = { ...input };
  if (f.state === S.KO) return;

  const dirHeld = heldDir(input);

  // --- 가드 입력 시각 기록 (완벽패링 판정용) ---
  if (pressed.guard) {
    f.prevGuardPress = f.guardPress;
    f.guardPress = frame;
  }

  // --- 선입력 버퍼 ---
  if (pressed.ult) setBuffer(f, 'ult');
  else if (pressed.heavy) setBuffer(f, 'heavy');
  else if (pressed.light) setBuffer(f, 'light');
  else if (pressed.dash) setBuffer(f, 'dash', dirHeld);
  else if (pressed.up) setBuffer(f, 'jump', dirHeld);

  // 방향키 두 번 입력 대시
  if (B.dash.allowDoubleTap && (pressed.left || pressed.right) && !(pressed.left && pressed.right)) {
    const d = pressed.right ? 1 : -1;
    if (f.lastTap.dir === d && frame - f.lastTap.frame <= B.dash.doubleTapWindow) {
      setBuffer(f, 'dash', d);
      f.lastTap = { dir: 0, frame: -9999 };
    } else {
      f.lastTap = { dir: d, frame };
    }
  }

  // 공격 중에 누른 다음 공격은 연결 시점까지 예약해 둔다 (콤보 입력이 씹히지 않도록)
  if (f.state === S.ATTACK) {
    if (pressed.light || pressed.heavy) f.queued = pressed.heavy ? 'heavy' : 'light';
  } else {
    f.queued = null;
  }
  let buf = f.buffer;
  if (!buf && f.queued && canChain(f)) buf = { action: f.queued, dir: 0, frames: 1 };
  const action = buf?.action;

  // --- 궁극기: 최우선, 즉시 시전 ---
  if (action === 'ult' && canUltimate(f)) {
    consumeBuffer(f);
    f.ult = 0; // 발동 즉시 0%로 초기화 (완벽패링당해도 반환 없음)
    startAttack(f, f.weapon.ultimate);
    return;
  }

  // --- 낙하 공격: 공중 하강 중에만 ---
  if (f.state === S.JUMP && f.vy < 0 && (action === 'light' || action === 'heavy')) {
    consumeBuffer(f);
    startPlunge(f);
    return;
  }

  const free = isFree(f);

  // --- 약/강공격 (자유 상태 또는 접촉 후 연결 구간) ---
  const chaining = canChain(f);
  if ((action === 'light' || action === 'heavy') && (free || chaining)) {
    const dist = Math.abs(opp.x - f.x);
    if (action === 'heavy' && opp.state === S.GUARD_BREAK && dist <= B.special.triggerRange) {
      // 특수강공은 콤보/딜레이와 무관
      consumeBuffer(f);
      f.facing = opp.x >= f.x ? 1 : -1;
      startAttack(f, f.weapon.special);
      return;
    }
    // 무기별 콤보 상한 / 숨 고르기 딜레이 확인 (불가하면 선입력은 남겨 둔다)
    const def = takeComboAttack(f, action, frame, chaining && !free);
    if (def) {
      consumeBuffer(f);
      f.queued = null;
      startAttack(f, def);
      return;
    }
  }

  if (!free) return;

  // --- 대시 ---
  if (action === 'dash' && f.dashCooldown <= 0 && f.stamina >= dashCost(f)) {
    consumeBuffer(f);
    const dir = buf.dir || dirHeld || f.facing; // 방향 입력이 없으면 상대 쪽
    startDash(f, dir, frame);
    return;
  }

  // --- 점프 ---
  if (action === 'jump' && f.stamina >= B.jump.cost) {
    consumeBuffer(f);
    startJump(f, buf.dir || dirHeld, frame);
    return;
  }

  // --- 가드 ---
  if (input.guard) {
    f.state = S.GUARD;
    f.vx = 0;
    return;
  }

  // --- 이동 ---
  if (dirHeld !== 0) {
    f.state = S.WALK;
    const forward = dirHeld === f.facing;
    const mods = f.weapon.mods ?? {};
    f.vx = dirHeld * (forward
      ? B.fighter.walkSpeed * (mods.walkScale ?? 1)
      : B.fighter.backWalkSpeed * (mods.backWalkScale ?? 1));
  } else {
    f.state = S.IDLE;
    f.vx = 0;
  }
}

export function tickBuffer(f) {
  if (f.buffer && --f.buffer.frames <= 0) f.buffer = null;
}
