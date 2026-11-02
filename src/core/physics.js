// =============================================================================
// 이동 / 중력 / 충돌 / 상태 타이머
// =============================================================================

import { BALANCE, STAGE } from '../config/balance.js';
import { S, isFree } from './fighter.js';
import { onAttackEnd, tickCombo } from './combo.js';

const B = BALANCE;

function attackVx(f) {
  const a = f.attack;
  if (!a) return 0;
  for (const m of a.def.moves) {
    if (a.frame >= m.from && a.frame <= m.to) return m.vx * f.facing;
  }
  return 0;
}

/** 위치/속도 갱신 (상태 전환 중 착지만 여기서 처리) */
export function integrate(f) {
  switch (f.state) {
    case S.DASH:
      f.vx = f.dash.dir * B.dash.speed * (f.weapon.mods?.dashScale ?? 1);
      break;
    case S.ATTACK:
    case S.SPECIAL:
    case S.ULTIMATE:
      f.vx = attackVx(f);
      break;
    case S.JUMP:
    case S.PLUNGE:
      break; // 수평 속도 유지
    case S.IDLE:
    case S.WALK:
      break; // actions 에서 설정
    default:
      f.vx = 0;
  }

  if (f.slide) {
    const s = f.slide;
    s.t++;
    const k = Math.min(1, s.t / s.frames);
    const ease = 1 - (1 - k) * (1 - k);
    f.x = s.fromX + (s.toX - s.fromX) * ease;
    if (k >= 1) f.slide = null;
  } else {
    f.x += f.vx + f.pushVx;
  }
  f.pushVx *= B.hit.pushFriction;
  if (Math.abs(f.pushVx) < 0.05) { f.pushVx = 0; f.pushSource = null; }

  // 중력
  if (f.y > 0 || f.vy > 0) {
    if (f.state !== S.PLUNGE) f.vy -= B.jump.gravity;
    f.y += f.vy;
    if (f.y <= 0) land(f);
  }
}

function land(f) {
  f.y = 0;
  f.vy = 0;
  if (f.state === S.JUMP) {
    f.state = S.LANDING;
    f.timer = B.jump.landingLag;
    f.vx = 0;
  } else if (f.state === S.PLUNGE) {
    f.state = S.LANDING;
    f.timer = f.weapon.plunge.landingLag; // 낙하 공격 후딜레이
    f.attack = null;
    f.vx = 0;
  } else {
    f.vx = 0;
  }
}

/** 벽 / 캐릭터 간 밀어내기 */
export function resolveBodies(a, b) {
  for (const f of [a, b]) clampWall(f);

  const W = B.fighter.width;
  const H = B.fighter.height;
  const dx = b.x - a.x;
  const vertical = a.y < b.y + H && b.y < a.y + H;
  if (vertical && Math.abs(dx) < W) {
    const dir = dx !== 0 ? Math.sign(dx) : a.facing;
    const overlapPx = W - Math.abs(dx);
    let pa = overlapPx / 2;
    let pb = overlapPx / 2;
    if (atWall(a, -dir)) { pa = 0; pb = overlapPx; }
    if (atWall(b, dir)) { pb = 0; pa = overlapPx; }
    a.x -= dir * pa;
    b.x += dir * pb;
    clampWall(a);
    clampWall(b);
  }
}

function atWall(f, dir) {
  return dir < 0 ? f.x <= STAGE.leftWall + 0.5 : f.x >= STAGE.rightWall - 0.5;
}

function clampWall(f) {
  const before = f.x;
  f.x = Math.max(STAGE.leftWall, Math.min(STAGE.rightWall, f.x));
  if (f.x !== before && f.pushVx !== 0 && f.pushSource) {
    // 벽에 막힌 넉백은 공격자 쪽으로 넘긴다 (벽 무한 압박 방지)
    f.pushSource.pushVx += -f.pushVx;
    f.pushVx = 0;
  }
}

export function updateFacing(f, opp) {
  if (isFree(f) || f.state === S.LANDING) {
    if (Math.abs(opp.x - f.x) > 2) f.facing = opp.x > f.x ? 1 : -1;
  }
}

/** 프레임 끝: 공격 진행, 경직 해제, 게이지 회복 */
export function advanceTimers(f, frame) {
  switch (f.state) {
    case S.ATTACK:
    case S.SPECIAL:
    case S.ULTIMATE:
      f.attack.frame++;
      if (f.attack.frame >= f.attack.def.duration) {
        const kind = f.attack.def.kind;
        f.state = S.IDLE;
        f.attack = null;
        if (kind === 'light' || kind === 'heavy') onAttackEnd(f, frame);
      }
      break;
    case S.PLUNGE:
      f.attack.frame++;
      break;
    case S.DASH:
      f.dash.frame++;
      if (f.dash.frame >= B.dash.duration) {
        f.state = S.IDLE;
        f.dash = null;
      }
      break;
    case S.HITSTUN:
    case S.BLOCKSTUN:
    case S.PARRIED:
    case S.GUARD_BREAK:
    case S.KNOCKBACK:
    case S.LANDING:
      if (f.timer > 0) f.timer--;
      if (f.timer <= 0 && f.y <= 0) endStun(f);
      break;
    default:
      break;
  }

  if (f.dashCooldown > 0) f.dashCooldown--;
  tickCombo(f, frame, f.state === S.ATTACK);

  // 스태미나 회복
  if (f.state !== S.DASH && frame - f.lastStaminaUse >= B.stamina.regenDelay) {
    f.stamina = Math.min(B.fighter.maxStamina, f.stamina + B.stamina.regenPerFrame);
  }

  // 가드 게이지 회복: 가드 버튼 유지 여부와 무관하게 "마지막 패링 이후 시간"만 본다
  if (f.state !== S.GUARD_BREAK && f.state !== S.KNOCKBACK && f.state !== S.KO &&
      frame - f.lastGuardUse >= B.guard.regenDelay) {
    f.guard = Math.min(B.fighter.maxGuard, f.guard + B.guard.regenPerFrame);
  }
}

function endStun(f) {
  const prev = f.state;
  f.timer = 0;
  if (prev === S.GUARD_BREAK || prev === S.KNOCKBACK) {
    f.guard = B.fighter.maxGuard; // 가드 브레이크 종료 시 완전 회복
  }
  if (prev === S.BLOCKSTUN && f.prevInput.guard) {
    f.state = S.GUARD;
  } else {
    f.state = S.IDLE;
  }
  f.attack = null;
}
