// =============================================================================
// PvE 컴퓨터 AI
// -----------------------------------------------------------------------------
// - 사람과 같은 "프레임 입력"만 만들어 낸다 (전투 로직을 우회하지 않음).
// - 공정성: 상대 상태를 reaction 프레임 "지연된 스냅샷"으로만 인지한다.
//   → 반응 시간보다 빠른 공격(예: 단검 약공)은 미리 가드하지 않으면 막을 수 없다.
// - 완벽패링은 예측 타이밍에 무작위 오차를 더해 시도하므로 항상 성공하지 않는다.
// - 난이도는 아래 DIFFICULTY 수치로 조절한다. [TEMP]
// =============================================================================

import { BALANCE } from '../config/balance.js';
import { reachOf } from '../core/attackDef.js';
import { S, EMPTY_INPUT, isFree } from '../core/fighter.js';
import { dashCost } from '../core/actions.js';

export const DIFFICULTY = {
  easy: {
    label: '쉬움',
    reaction: 24,        // 인지 지연(프레임)
    thinkEvery: 14,      // 판단 주기
    aggression: 0.35,    // 공격 선택 경향
    guardChance: 0.35,   // 위협 인지 시 가드 선택 확률
    perfectChance: 0.08, // 가드 대신 완벽패링 타이밍을 노릴 확률
    perfectError: 7,     // 완벽패링 타이밍 오차(±프레임)
    comboChance: 0.3,    // 적중 후 연결 확률
    punishChance: 0.3,   // 빈틈 반격 확률
    evadeChance: 0.1,    // 대시/점프 회피 확률
    preGuard: 0.08,      // 근거리에서 미리 가드할 확률
  },
  normal: {
    label: '보통',
    reaction: 16,
    thinkEvery: 9,
    aggression: 0.5,
    guardChance: 0.55,
    perfectChance: 0.25,
    perfectError: 4,
    comboChance: 0.55,
    punishChance: 0.6,
    evadeChance: 0.18,
    preGuard: 0.18,
  },
  hard: {
    label: '어려움',
    reaction: 11,
    thinkEvery: 6,
    aggression: 0.6,
    guardChance: 0.7,
    perfectChance: 0.45,
    perfectError: 3,
    comboChance: 0.75,
    punishChance: 0.85,
    evadeChance: 0.22,
    preGuard: 0.25,
  },
};

const STUNNED_OPP = new Set([S.PARRIED, S.LANDING, S.GUARD_BREAK]);

/** 결정론적 의사 난수 (재현 가능한 테스트용) */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export class AIController {
  constructor(difficulty = 'normal', seed = (Math.random() * 1e9) | 0) {
    this.p = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    this.random = rng(seed);
    this.history = [];      // 상대 상태 스냅샷
    this.hold = {};         // 유지 입력: key → 종료 프레임
    this.taps = [];         // 예약된 단발 입력 [{frame, key, extra}]
    this.nextThink = 0;
    this.lastTap = {};      // key → 마지막 누른 프레임 (엣지 생성용)
    this.watchedAttack = null;
  }

  chance(p) { return this.random() < p; }

  snapshot(o) {
    return {
      state: o.state, x: o.x, y: o.y, vy: o.vy,
      def: o.attack?.def ?? null, aframe: o.attack?.frame ?? 0, atk: o.attack,
      timer: o.timer, guard: o.guard, ult: o.ult,
    };
  }

  /** 지연된 인지 */
  perceive(frame) {
    const idx = Math.max(0, this.history.length - 1 - this.p.reaction);
    return this.history[idx];
  }

  tapAt(frame, key, extra = {}, thenHold = 0) { this.taps.push({ frame, key, extra, thenHold }); }
  holdFor(key, frame, n) { this.hold[key] = Math.max(this.hold[key] ?? 0, frame + n); }
  release(key) { delete this.hold[key]; }

  /**
   * @param {Match} match
   * @param {number} index 이 AI가 조종하는 플레이어 번호
   * @returns 버튼 상태 객체
   */
  think(match, index) {
    const me = match.fighters[index];
    const opp = match.fighters[1 - index];
    const frame = match.frame;
    this.history.push(this.snapshot(opp));
    if (this.history.length > 90) this.history.shift();
    const seen = this.perceive(frame);

    this.react(me, opp, seen, frame);
    if (frame >= this.nextThink) {
      this.decide(me, opp, seen, frame);
      this.nextThink = frame + this.p.thinkEvery + Math.floor(this.random() * 4);
    }
    return this.compose(frame, me);
  }

  /** 매 프레임: 위협 대응 / 연결 / 반격 (지연 인지 기반) */
  react(me, opp, seen, frame) {
    const P = this.p;
    const dist = Math.abs(opp.x - me.x);

    // 1) 상대 공격 인지 → 가드/완벽패링/회피 (공격 하나당 한 번만 결정)
    const attacking = seen.def && (seen.state === S.ATTACK || seen.state === S.ULTIMATE || seen.state === S.SPECIAL);
    const plunging = seen.state === S.PLUNGE;
    if ((attacking || plunging) && this.watchedAttack !== seen.atk) {
      this.watchedAttack = seen.atk;
      const reach = plunging ? 140 : reachOf(seen.def) + 40;
      if (dist <= reach && (isFree(me) || me.state === S.ATTACK)) this.respondToThreat(me, seen, frame, plunging);
    }

    // 2) 내 공격이 접촉 → 연결 (자기 상태는 지연 없이 안다)
    if (me.state === S.ATTACK && me.attack?.connected && me.attack.def.cancelFrom != null &&
        me.attack.frame >= me.attack.def.cancelFrom - 2 && this.chainDecidedFor !== me.attack) {
      this.chainDecidedFor = me.attack;
      if (this.chance(P.comboChance)) {
        const key = this.chance(0.55) ? 'light' : 'heavy';
        if (dist <= reachOf(me.weapon[key]) + 10) this.tapAt(frame + 1, key);
      }
    }

    // 3) 상대 빈틈(완벽패링당함/착지/가드 브레이크) 반격
    if (STUNNED_OPP.has(seen.state) && isFree(me) && !this.punishing) {
      this.punishing = true;
      if (this.chance(P.punishChance)) {
        this.release('guard');
        if (seen.state === S.GUARD_BREAK) {
          if (dist <= BALANCE.special.triggerRange) this.tapAt(frame, 'heavy');
          else this.holdFor(me.facing > 0 ? 'right' : 'left', frame, 10);
        } else {
          const lightReach = reachOf(me.weapon.light) + 20;
          const heavyReach = reachOf(me.weapon.heavy) + 20;
          if (dist <= lightReach) this.tapAt(frame, 'light');
          else if (dist <= heavyReach) this.tapAt(frame, 'heavy');
        }
      }
    }
    if (!STUNNED_OPP.has(seen.state)) this.punishing = false;

    // 4) 피격 경직 중이면 이어지는 공격에 대비 (가드 유지 또는 탈출 대시)
    if (me.state === S.HITSTUN && me.timer === 2 && !this.escapeDecided) {
      this.escapeDecided = true;
      if (this.chance(P.guardChance * 0.8)) this.holdFor('guard', frame, 18);
      else if (this.chance(P.evadeChance * 1.5) && me.stamina >= dashCost(me)) this.tapAt(frame + 2, 'dash', { [me.facing > 0 ? 'left' : 'right']: true });
    }
    if (me.state !== S.HITSTUN) this.escapeDecided = false;

    // 5) 궁극기 맞대응: 궁극기 인지 시 완벽패링 시도 확률↑
  }

  respondToThreat(me, seen, frame, plunging) {
    const P = this.p;
    // 판정까지 남은 실제 프레임 추정
    let until = 6;
    if (!plunging) {
      const next = seen.def.hits.find((h) => h.to >= seen.aframe);
      if (!next) return;
      until = next.from - seen.aframe - P.reaction;
    }
    const isUlt = seen.def?.kind === 'ultimate';
    const r = this.random();
    const perfectP = isUlt ? Math.min(0.9, P.perfectChance * 1.6) : P.perfectChance;

    if (until >= 1 && r < perfectP) {
      // 완벽패링 시도: 가드를 떼었다가 예상 판정 직전에 다시 누른다 (오차 포함)
      this.release('guard');
      const err = Math.round((this.random() * 2 - 1) * P.perfectError);
      const pressAt = frame + Math.max(0, until - 3 + err);
      this.tapAt(pressAt, 'guard', {}, 20);
      return;
    }
    if (isUlt || r < perfectP + P.guardChance) {
      // 궁극기는 일반 가드로 막을 수 없으므로 회피를 우선 고려
      if (isUlt && this.chance(0.5)) { this.evade(me, frame); return; }
      this.holdFor('guard', frame, Math.max(12, until + 14));
      return;
    }
    if (this.chance(P.evadeChance / (1 - perfectP - P.guardChance + 1e-6))) this.evade(me, frame);
  }

  evade(me, frame) {
    const back = me.facing > 0 ? 'left' : 'right';
    if (me.stamina >= dashCost(me) && me.dashCooldown <= 0) {
      this.tapAt(frame, 'dash', { [back]: true });
    } else if (me.stamina >= BALANCE.jump.cost && this.chance(0.4)) {
      this.tapAt(frame, 'up');
    }
  }

  /** 주기적 판단: 거리 조절과 공격 선택 */
  decide(me, opp, seen, frame) {
    const P = this.p;
    if (!isFree(me) && me.state !== S.JUMP) return;
    const dist = Math.abs(seen.x - me.x);
    const fwd = me.facing > 0 ? 'right' : 'left';
    const back = me.facing > 0 ? 'left' : 'right';
    const lightReach = reachOf(me.weapon.light);
    const heavyReach = reachOf(me.weapon.heavy);
    const oppReach = reachOf(opp.weapon.heavy);

    // 공중: 하강 중이면 낙하 공격
    if (me.state === S.JUMP) {
      if (me.vy < 0 && dist < 90 && this.chance(0.7)) this.tapAt(frame, 'heavy');
      return;
    }

    // 가드는 위협이 없으면 풀어 준다
    if (this.hold.guard && this.hold.guard <= frame + 2) this.release('guard');

    // 궁극기
    if (me.ult >= BALANCE.ultimate.cost && dist <= 150) {
      const oppVulnerable = STUNNED_OPP.has(seen.state) || seen.state === S.ATTACK;
      if (this.chance(oppVulnerable ? 0.8 : 0.12)) { this.release('guard'); this.tapAt(frame, 'ult'); return; }
    }

    // 상대가 가드 중이면 강공(도끼 등)으로 압박하거나 잠시 물러남
    const oppGuarding = seen.state === S.GUARD || seen.state === S.BLOCKSTUN;

    if (dist > heavyReach + 30) {
      // 접근: 걷기 또는 대시
      if (this.chance(0.18) && me.stamina > dashCost(me) + 30 && dist > heavyReach + 120) {
        this.tapAt(frame, 'dash', { [fwd]: true });
      } else {
        this.holdFor(fwd, frame, P.thinkEvery + 2);
      }
      return;
    }

    const r = this.random();
    if (dist <= lightReach + 15) {
      // 근거리
      if (r < P.aggression) {
        this.release('guard');
        this.tapAt(frame, oppGuarding && this.chance(0.5) ? 'heavy' : this.chance(0.65) ? 'light' : 'heavy');
      } else if (r < P.aggression + P.preGuard) {
        this.holdFor('guard', frame, 14 + Math.floor(this.random() * 16));
      } else if (r < P.aggression + P.preGuard + 0.15) {
        this.holdFor(back, frame, 12);
      } else if (this.chance(P.evadeChance) && me.stamina > dashCost(me) + 20) {
        this.tapAt(frame, 'dash', { [back]: true });
      } else if (this.chance(0.08) && me.stamina > 50) {
        this.tapAt(frame, 'up', { [fwd]: true });
      } else {
        this.holdFor(fwd, frame, 6);
      }
    } else {
      // 중거리: 강공 견제 / 간격 조절 / 접근
      if (r < P.aggression * 0.55) {
        this.release('guard');
        this.tapAt(frame, 'heavy');
      } else if (r < P.aggression * 0.55 + 0.25) {
        this.holdFor(fwd, frame, 8 + Math.floor(this.random() * 10));
      } else if (r < P.aggression * 0.55 + 0.4 && dist < oppReach + 20) {
        this.holdFor(back, frame, 10);
      } else if (this.chance(P.preGuard)) {
        this.holdFor('guard', frame, 16);
      } else {
        this.holdFor(fwd, frame, 6);
      }
    }
  }

  compose(frame, me) {
    const input = { ...EMPTY_INPUT };
    for (const [k, until] of Object.entries(this.hold)) {
      if (until > frame) input[k] = true; else delete this.hold[k];
    }
    // 이동 홀드는 하나만
    if (input.left && input.right) input.left = false;
    // 가드 중에는 이동하지 않음
    if (input.guard) { input.left = false; input.right = false; }

    const due = this.taps.filter((t) => t.frame <= frame);
    this.taps = this.taps.filter((t) => t.frame > frame);
    for (const t of due) {
      // 같은 버튼 연속 입력은 한 프레임 떼었다가 누른다 (엣지 입력 보장)
      if (this.lastTap[t.key] === frame - 1 || (t.key === 'guard' && me.prevInput.guard)) {
        this.taps.push({ ...t, frame: frame + 1 });
        input[t.key] = false;
        continue;
      }
      input[t.key] = true;
      Object.assign(input, t.extra);
      this.lastTap[t.key] = frame;
      if (t.thenHold) this.holdFor(t.key, frame, t.thenHold);
    }
    return input;
  }
}
