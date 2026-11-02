// =============================================================================
// 공격 판정 및 피격/가드/패링 처리
// 두 플레이어의 판정을 같은 프레임 스냅샷 기준으로 먼저 "수집"한 뒤 동시에 적용한다.
// (P1/P2 처리 순서에 따른 불공정 제거, 상쇄(트레이드) 지원)
// =============================================================================

import { BALANCE, STAGE } from '../config/balance.js';
import { S, isGuarding, hurtbox, worldBox, overlap } from './fighter.js';
import { resetCombo } from './combo.js';

const B = BALANCE;

export const RESULT = Object.freeze({
  HIT: 'hit',
  ARMORED: 'armored',       // 궁극기 시전 중 일반 공격 피격 (취소되지 않음)
  PARRY: 'parry',           // 일반 패링
  PERFECT: 'perfect',       // 완벽패링
  GUARD_BREAK: 'guardBreak',
  SPECIAL: 'special',
});

/** 현재 프레임에 활성화된 판정 목록 */
function activeHits(f) {
  if (f.state === S.PLUNGE && f.attack) {
    return [{ index: 0, hit: f.weapon.plunge.hit, kind: 'plunge' }];
  }
  if (!f.attack || (f.state !== S.ATTACK && f.state !== S.SPECIAL && f.state !== S.ULTIMATE)) return [];
  const { def, frame } = f.attack;
  const out = [];
  def.hits.forEach((hit, index) => {
    if (frame >= hit.from && frame <= hit.to) out.push({ index, hit, kind: def.kind });
  });
  return out;
}

export function collectHits(attacker, defender) {
  if (defender.state === S.KO || attacker.state === S.KO) return [];
  const hb = hurtbox(defender);
  const events = [];
  for (const h of activeHits(attacker)) {
    if (attacker.attack.hitLog.has(h.index)) continue;
    const box = worldBox(attacker, h.hit.box);
    if (overlap(box, hb)) events.push({ attacker, defender, ...h, box });
  }
  return events;
}

/** 완벽패링 판정: 가드 중 + 최근 가드 입력 + 연타 방지 조건 */
export function isPerfectTiming(defender, frame) {
  const p = defender.parry;
  return !p.resolved && frame - p.start >= 0 && frame - p.start < p.window;
}

function facesAttacker(defender, attacker) {
  const dx = attacker.x - defender.x;
  if (Math.abs(dx) < 8) return true;
  return Math.sign(dx) === defender.facing;
}

function gainUlt(f, amount) {
  if (amount > 0) f.ult = Math.min(B.fighter.maxUlt, f.ult + amount);
}

function applyPush(defender, attacker, push) {
  const dir = defender.x >= attacker.x ? 1 : -1;
  defender.pushVx = dir * push;
  defender.pushSource = attacker;
}

function interrupt(f) {
  if (f.attack && (f.attack.def.kind === 'light' || f.attack.def.kind === 'heavy')) resetCombo(f);
  f.attack = null;
  f.dash = null;
  f.slide = null;
}

function damage(f, amount) {
  f.hp = Math.max(0, f.hp - amount);
}

/**
 * 수집된 판정 결과를 적용한다.
 * @returns {Array} 이벤트 목록 (렌더/사운드/테스트용)
 */
export function applyHits(events, frame) {
  const out = [];
  // 같은 프레임 안에서 공격자가 먼저 끊겨도 이미 수집된 판정은 유효(상쇄)
  for (const ev of events) {
    const { attacker: A, defender: D, hit, kind, index } = ev;
    if (A.attack) A.attack.hitLog.add(index);
    const result = resolve(A, D, hit, kind, frame);
    out.push({
      type: result,
      attacker: A.id,
      defender: D.id,
      kind,
      x: (ev.box.x + ev.box.w / 2 + D.x) / 2,
      y: Math.min(D.y + 70, ev.box.y + ev.box.h / 2),
      frame,
    });
    D.flash = { type: result, frame };
    if (D.hp <= 0 && D.state !== S.KO) {
      D.state = S.KO;
      interrupt(D);
      out.push({ type: 'ko', defender: D.id, attacker: A.id, frame });
    }
  }
  return out;
}

function resolve(A, D, hit, kind, frame) {
  const G = B.guard;
  // 경직은 판정이 끝나는 시점 기준: 판정 초반에 닿든 끝에 닿든 콤보 틈이 같도록 남은 판정 프레임만큼 더한다
  const late = kind !== 'plunge' && A.attack && hit.to != null ? Math.max(0, hit.to - A.attack.frame) : 0;
  const maxHp = D.maxHp ?? B.fighter.maxHp;
  const gTaken = D.weapon.guardTaken ?? 1; // 무기별 가드 게이지 감소량 배율
  const scale = hit.ultGainScale ?? 1;
  const isUlt = kind === 'ultimate';

  // --- 특수강공: 가드 브레이크 상태의 상대에게 적중 ---
  if (kind === 'special' && D.state === S.GUARD_BREAK) {
    damage(D, hit.damage);
    applySpecialKnockback(A, D);
    A.attack.connected = true;
    gainUlt(A, B.ultGain.dealHit * scale);
    gainUlt(D, B.ultGain.takeHit);
    A.stats.hitsLanded++; A.stats.damageDealt += hit.damage;
    return RESULT.SPECIAL;
  }

  const guarding = isGuarding(D) && facesAttacker(D, A);

  // --- 완벽패링 (궁극기 포함 모든 공격) ---
  if (guarding && isPerfectTiming(D, frame)) {
    const chip = Math.max(1, Math.round(maxHp * G.perfectDamageRatio));
    damage(D, chip);
    D.guard -= G.perfectGuardCost * gTaken;
    D.lastGuardUse = frame;
    // 피격자 쪽은 경직 없음 → 즉시 반격 가능
    D.state = S.GUARD;
    D.timer = 0;
    // 공격자는 공격이 끊기고 잠시 행동 불가
    D.parry.resolved = true;
    D.parry.tier = -1; // 성공하면 연속 시도 단계 초기화
    interrupt(A);
    if (A.y > 0) { A.vy = Math.min(A.vy, 0); }
    A.state = S.PARRIED;
    A.timer = G.perfectStun;
    A.vx = 0;
    // 공격자의 자세(가드) 게이지 감소 → 무너지면 가드 브레이크 (피니셔 허용)
    A.guard -= G.parryPostureDamage;
    A.lastGuardUse = frame;
    if (A.guard <= 0) triggerGuardBreak(A);
    gainUlt(D, B.ultGain.perfectParry);
    gainUlt(A, B.ultGain.perfectParried);
    D.stats.perfects++;
    if (D.guard <= 0) { triggerGuardBreak(D); return RESULT.GUARD_BREAK; }
    return RESULT.PERFECT;
  }

  // --- 일반 패링 (궁극기는 일반 패링 불가 → 아래 피격 처리로) ---
  if (guarding && !isUlt) {
    const dmg = Math.round(hit.damage * G.normalParryDamageRate);
    damage(D, dmg);
    D.guard -= hit.guardDamage * gTaken;
    D.lastGuardUse = frame;
    D.state = S.BLOCKSTUN;
    D.timer = hit.blockstun + late;
    applyPush(D, A, hit.push * 0.8);
    if (A.attack) A.attack.connected = true; // 공격권 유지: 연결 가능
    gainUlt(A, B.ultGain.dealGuarded * scale);
    gainUlt(D, B.ultGain.guard);
    D.stats.parries++;
    A.stats.damageDealt += dmg;
    if (D.guard <= 0) { triggerGuardBreak(D); return RESULT.GUARD_BREAK; }
    return RESULT.PARRY;
  }

  // --- 피격 ---
  damage(D, hit.damage);
  if (A.attack) A.attack.connected = true;
  if (!isUlt) gainUlt(A, B.ultGain.dealHit * scale);
  gainUlt(D, B.ultGain.takeHit * scale);
  A.stats.hitsLanded++; A.stats.damageDealt += hit.damage;

  // 궁극기 시전 중에는 일반 공격으로 끊기지 않는다 (피해만 받음)
  if (D.state === S.ULTIMATE && !isUlt) return RESULT.ARMORED;
  // 가드 브레이크 중에는 기절 시간이 유지된다 (일반 공격도 맞힐 수 있음)
  if (D.state === S.GUARD_BREAK || D.state === S.KNOCKBACK) return RESULT.HIT;

  interrupt(D); // 피격 시 공격/이동/대시 즉시 취소
  D.state = S.HITSTUN;
  D.timer = hit.hitstun + late + (D.y > 0 ? B.hit.airHitstunBonus : 0);
  if (D.y > 0) D.vy = Math.min(D.vy, 2);
  D.vx = 0;
  applyPush(D, A, hit.push);
  return RESULT.HIT;
}

export function triggerGuardBreak(D) {
  interrupt(D);
  D.guard = 0;
  D.state = S.GUARD_BREAK;
  D.timer = B.guardBreak.stun;
  D.vx = 0;
}

/** 특수강공 후 두 플레이어를 중립 거리로 재배치 (밀려나는 연출 포함) */
function applySpecialKnockback(A, D) {
  const dir = D.x >= A.x ? 1 : -1;
  const N = B.special.neutralDistance;
  let dTo = A.x + dir * N;
  let aTo = A.x;
  const minX = STAGE.leftWall;
  const maxX = STAGE.rightWall;
  if (dTo < minX || dTo > maxX) {
    // 벽에 막히면 공격자가 대신 물러난다
    dTo = Math.max(minX, Math.min(maxX, dTo));
    aTo = Math.max(minX, Math.min(maxX, dTo - dir * N));
  }
  const frames = B.special.knockbackFrames;
  interrupt(D);
  D.state = S.KNOCKBACK;
  D.timer = frames;
  D.pushVx = 0;
  D.slide = { fromX: D.x, toX: dTo, t: 0, frames };
  if (aTo !== A.x) A.slide = { fromX: A.x, toX: aTo, t: 0, frames };
}
