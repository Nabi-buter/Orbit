// =============================================================================
// PvE 컴퓨터 AI
// -----------------------------------------------------------------------------
// - 사람과 같은 "프레임 입력"만 만들어 낸다 (전투 로직을 우회하지 않음).
// - 공정성: 상대 상태를 reaction 프레임 "지연된 스냅샷"으로만 인지한다.
//   → 반응 시간보다 빠른 공격(예: 단검 약공)은 미리 가드하지 않으면 막을 수 없다.
// - 완벽패링은 예측 타이밍에 무작위 오차를 더해 시도하므로 항상 성공하지 않는다.
// - 난이도는 아래 DIFFICULTY 수치로 조절한다. [TEMP]
// =============================================================================

import { BALANCE, STAGE } from '../config/balance.js';
import { reachOf, contactFrame } from '../core/attackDef.js';
import { S, EMPTY_INPUT, isFree } from '../core/fighter.js';
import { dashCost } from '../core/actions.js';
import { comboAllows } from '../core/combo.js';
import { OpponentModel, PatternDetector } from './predictor.js';

export const DIFFICULTY = {
  easy: {
    label: '쉬움',
    name: 'EASY',        // 대전 화면에 보이는 AI 이름
    reaction: 24,        // 인지 지연(프레임)
    reactionJitter: 6,   // 반응 속도 흔들림(±프레임)
    thinkEvery: 14,      // 판단 주기
    aggression: 0.35,    // 공격 선택 경향
    guardChance: 0.35,   // 위협 인지 시 가드 선택 확률
    perfectChance: 0.08, // 가드 대신 완벽패링 타이밍을 노릴 확률
    perfectError: 7,     // 완벽패링 타이밍 오차(±프레임)
    comboChance: 0.3,    // 적중 후 연결 확률
    punishChance: 0.3,   // 빈틈 반격 확률
    evadeChance: 0.1,    // 대시/점프 회피 확률
    preGuard: 0.08,      // 근거리에서 미리 가드할 확률
    adapt: 0.25,         // 상대 패턴 예측을 행동에 반영하는 정도
    exploitDelay: 90,    // 습관을 확인한 뒤 공략을 시작하기까지(프레임)
    comboPlan: false,    // 콤보를 끝까지 계획해서 잇기 (약공으로 길게 → 강공 마무리)
    moveHabits: false,   // 움직임 습관(대시 돌진 · 점프 공격 · 치고 빠지기)까지 읽기
    predictMin: 0.32,    // 예측 확률이 이 이상일 때만 예측대로 대응
  },
  normal: {
    label: '보통',
    name: 'NORMAL',
    reaction: 16,
    reactionJitter: 4,
    thinkEvery: 9,
    aggression: 0.5,
    guardChance: 0.55,
    perfectChance: 0.25,
    perfectError: 4,
    comboChance: 0.55,
    punishChance: 0.6,
    evadeChance: 0.18,
    preGuard: 0.18,
    adapt: 0.55,
    exploitDelay: 20,
    comboPlan: false,
    moveHabits: false,
    predictMin: 0.28,
  },
  hard: {
    label: '어려움',
    name: 'HARD',
    reaction: 11,
    reactionJitter: 3,
    thinkEvery: 6,
    aggression: 0.6,
    guardChance: 0.7,
    perfectChance: 0.45,
    perfectError: 3,
    // 어려움: 완벽패링(perfectChance · perfectError)은 그대로 두고, 콤보와 상대 파악을 더 잘 한다
    comboChance: 0.95,
    punishChance: 0.92,
    evadeChance: 0.22,
    preGuard: 0.25,
    adapt: 0.65,       // 예측 대응 빈도는 낮추고 적중률로 거른다 (자주 반응할수록 틀린 예측에 속음: 측정 63% → 85%)
    exploitDelay: 0,
    comboPlan: true,
    moveHabits: true,
    trustAccuracy: true, // 예측 적중률만큼만 예측대로 움직임
    predictMin: 0.28,
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

/** AI 앞 대시 빈도 제한 (프레임) */
const AI_DASH_IN = { opening: 120, gap: 150, jitter: 90 };

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
    this.model = new OpponentModel();
    this.patterns = new PatternDetector({ moves: !!this.p.moveHabits }); // 최근 몇 초의 단순한 습관 (가만히 / 약공 연타 / 강공 연타 / 가드만)
    this.oppAttackStarts = []; // 인지한 상대 공격 시작 시각 (연타 리듬 학습)
    this.rhythmPlanned = -1;
  }

  chance(p) { return this.random() < p; }

  snapshot(o, me) {
    const toMe = Math.sign(me.x - o.x) || 1;
    return {
      state: o.state, x: o.x, y: o.y, vy: o.vy,
      toward: !!o.dash && o.dash.dir === toMe,
      walkingAway: o.state === S.WALK && Math.sign(o.vx) === -toMe,
      walkingToward: o.state === S.WALK && Math.sign(o.vx) === toMe,
      def: o.attack?.def ?? null, aframe: o.attack?.frame ?? 0, atk: o.attack,
      timer: o.timer, guard: o.guard, ult: o.ult, lock: o.combo.lock,
    };
  }

  /** 지연된 인지 */
  perceive(frame) {
    const idx = Math.max(0, this.history.length - 1 - this.reactNow);
    return this.history[idx];
  }

  tapAt(frame, key, extra = {}, thenHold = 0) { this.taps.push({ frame, key, extra, thenHold }); }
  /**
   * 앞 대시(파고들기)는 사람처럼 가끔만: 개시 직후에는 쓰지 않고, 한 번 쓰면 한동안 걸어서 간격을 잰다.
   * (연속 대시로 플레이어 공간을 순식간에 지우는 것 방지)
   */
  canDashIn(frame) {
    return frame >= (this.dashInAt ?? AI_DASH_IN.opening);
  }
  dashIn(frame, fwd) {
    this.dashInAt = frame + AI_DASH_IN.gap + Math.floor(this.random() * AI_DASH_IN.jitter);
    this.tapAt(frame, 'dash', { [fwd]: true });
  }
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
    // 사람처럼 흔들리는 반응 속도와 공격 성향 (기계적인 패턴 고착 방지)
    if (frame >= (this.nextMood ?? 0)) {
      this.nextMood = frame + 40 + Math.floor(this.random() * 80);
      this.reactNow = Math.max(6, this.p.reaction + Math.round((this.random() * 2 - 1) * this.p.reactionJitter));
      this.aggr = Math.max(0.05, Math.min(0.95, this.p.aggression * (0.75 + this.random() * 0.5)));
    }
    this.history.push(this.snapshot(opp, me));
    if (this.history.length > 90) this.history.shift();
    const seen = this.perceive(frame);
    this.lastDist = Math.abs(opp.x - me.x);
    this.model.observe(seen, me, frame); // 상대 패턴 학습 (보이는 정보만)
    this.patterns.observe(seen, frame);

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
      this.oppAttackStarts.push(frame - seen.aframe);
      if (!plunging) this.lastOppDef = seen.def;
      if (this.oppAttackStarts.length > 8) this.oppAttackStarts.shift();
      const reach = plunging ? 140 : reachOf(seen.def) + 40;
      const canRespond = isFree(me) || me.state === S.ATTACK || me.state === S.BLOCKSTUN || me.state === S.HITSTUN;
      if (!plunging && dist > reachOf(seen.def) + 35 && isFree(me)) this.planWhiffPunish(me, seen, frame, dist);
      else if (dist <= reach && canRespond) this.respondToThreat(me, seen, frame, plunging, dist);
    }

    // 1-b) 연타 압박 학습: 상대가 짧은 간격으로 계속 공격하면 리듬에 맞춰 완벽패링을 노린다
    this.rhythmParry(me, frame, dist, opp);

    // 2) 내 공격이 접촉 → 연결 (자기 상태는 지연 없이 안다)
    if (me.state === S.ATTACK && me.attack?.connected && me.attack.def.cancelFrom != null &&
        me.attack.frame >= me.attack.def.cancelFrom - 2 && this.chainDecidedFor !== me.attack) {
      this.chainDecidedFor = me.attack;
      if (this.chance(P.comboChance)) {
        // 콤보 상한을 고려: 가능한 종류만, 섞어서 길게 잇는 것을 선호
        // 강공 연결은 예비 동작이 길어 틈이 생긴다: 상대가 가장 빨리 낼 수 있는 공격보다 먼저 닿을 때만
        // (상대가 강공만 쓰는 습관이면 상대 강공 속도 기준)
        const oppFast = this.activePattern(frame) === 'heavySpam' ? opp.weapon.heavy.hits[0].from : opp.weapon.light.hits[0].from;
        const heavyGap = me.weapon.heavy.hits[0].from - me.weapon.light.hits[0].from;
        const heavySafe = heavyGap + BALANCE.combo.minGap < oppFast;
        const opts = ['light', 'heavy'].filter((k) => comboAllows(me, k, frame, true) && dist <= reachOf(me.weapon[k]) + 10 && (k === 'light' || heavySafe));
        const other = opts.find((k) => k !== me.combo.lastType);
        const key = P.comboPlan ? this.planComboKey(me, opts, frame)
          : other && this.chance(0.6) ? other : opts[Math.floor(this.random() * opts.length)];
        if (key) this.tapAt(frame + 1, key);
      }
    }

    // 2-b) 상대가 콤보 사이에 가드를 끼워 넣는지 기억 (내 연결 공격이 막힘)
    if (me.state === S.ATTACK && me.combo.total >= 2 && me.attack && this.gapSeenFor !== me.attack && opp.state === S.BLOCKSTUN) {
      this.gapSeenFor = me.attack;
      this.gapGuards = Math.min(5, (this.gapGuards ?? 0) + 1);
    }
    if (frame % 600 === 0 && this.gapGuards) this.gapGuards--; // 오래되면 잊음

    // 3) 상대 빈틈(완벽패링당함/착지/가드 브레이크) 반격
    if (STUNNED_OPP.has(seen.state) && isFree(me) && !this.punishing) {
      this.punishing = true;
      const bonus = seen.state === S.LANDING && frame < (this.antiAirUntil ?? 0) ? 0.3 : 0;
      if (this.chance(Math.min(1, P.punishChance + bonus))) {
        this.release('guard');
        if (seen.state === S.GUARD_BREAK) {
          if (dist <= BALANCE.special.triggerRange) this.tapAt(frame, 'heavy');
          else this.holdFor(me.facing > 0 ? 'right' : 'left', frame, 10);
        } else {
          const lightReach = reachOf(me.weapon.light) + 20;
          const heavyReach = reachOf(me.weapon.heavy) + 20;
          // 남은 빈틈이 충분하면 강공으로 크게 반격
          const left = (seen.timer ?? 0) - this.reactNow;
          const heavyFits = left > me.weapon.heavy.hits[0].from + 3;
          if (dist <= heavyReach && heavyFits) this.tapAt(frame, 'heavy');
          else if (dist <= lightReach) this.tapAt(frame, 'light');
          else if (dist <= heavyReach) this.tapAt(frame, 'heavy');
        }
      }
    }
    if (!STUNNED_OPP.has(seen.state)) this.punishing = false;

    // 3-b) 가드 경직이 풀린 순간: 상대가 느린 공격으로 이어 올 것을 읽고 끼어들기 (심리전)
    // (피격 경직 후에는 밀려난 거리를 상대가 다시 좁히는 동안 빠른 공격이 먼저 닿는다)
    const fromStun = this.prevMyState === S.BLOCKSTUN || this.prevMyState === S.HITSTUN;
    if (fromStun && me.state !== this.prevMyState && isFree(me)) {
      const lightReach = reachOf(me.weapon.light) + 30;
      const oppSlow = (this.lastOppDef?.hits[0].from ?? 0) >= 12;
      const wasHit = this.prevMyState === S.HITSTUN;
      if (dist <= lightReach && this.chance(oppSlow || wasHit ? this.aggr + 0.25 : this.aggr * 0.5)) {
        this.release('guard');
        this.tapAt(frame, 'light');
      } else if (oppSlow && this.chance(P.evadeChance * 2) && me.stamina >= dashCost(me) && me.dashCooldown <= 0) {
        this.release('guard');
        this.retreat(me, frame, 12, true);
      }
    }
    this.prevMyState = me.state;

    // 3-c) 상대가 숨 고르기(공격 불가) 중 → 파고들어 반격 (화면에 보이는 정보)
    const lockLeft = (seen.lock ?? 0) - this.reactNow;
    if (lockLeft > 8 && isFree(me) && me.combo.lock === 0 && this.lockPunishFor !== seen.atk && frame >= (this.lockPunishAt ?? 0)) {
      this.lockPunishAt = frame + 20;
      if (this.chance(P.punishChance)) {
        const fwd = me.facing > 0 ? 'right' : 'left';
        const lr = reachOf(me.weapon.light) + 15, hr = reachOf(me.weapon.heavy) + 10;
        this.release('guard');
        if (dist <= lr) this.tapAt(frame, 'light');
        else if (dist <= hr && lockLeft > me.weapon.heavy.hits[0].from) this.tapAt(frame, 'heavy');
        else if (me.stamina >= dashCost(me) && me.dashCooldown <= 0 && this.canDashIn(frame) && lockLeft > BALANCE.dash.duration + 4) {
          this.dashIn(frame, fwd);
          this.tapAt(frame + BALANCE.dash.duration - 2, 'light');
        } else this.holdFor(fwd, frame, 8);
      }
    }

    // 4) 피격 경직 중이면 이어지는 공격에 대비 (가드 유지 또는 탈출 대시)
    if (me.state === S.HITSTUN && me.timer === 2 && !this.escapeDecided) {
      this.escapeDecided = true;
      if (this.chance(P.guardChance * 0.8)) this.holdFor('guard', frame, 18);
      else if (this.chance(P.evadeChance * 1.5) && me.stamina >= dashCost(me)) this.retreat(me, frame, 12, true);
    }
    if (me.state !== S.HITSTUN) this.escapeDecided = false;

    // 5) 궁극기 맞대응: 궁극기 인지 시 완벽패링 시도 확률↑
  }

  /**
   * 콤보 계획 (어려움): 상한까지 최대한 길게 잇고, 마지막은 강한 공격으로.
   *   - 약공을 상한까지 이어 타수를 채운다 (약공이 빠르고 연결이 확실함)
   *   - 약공 상한에 닿았거나 남은 타수가 1이면 강공으로 마무리 (섞어서 끝내면 콤보 뒤 딜레이도 짧다)
   *   - 상대가 콤보 사이에 가드를 끼워 넣는 습관이면 강공(가드 게이지 피해)을 섞는다
   */
  planComboKey(me, opts, frame) {
    if (opts.length <= 1) return opts[0];
    const s = me.weapon.combo, c = me.combo;
    const left = s.maxTotal - c.total;
    if (c.light + 1 >= s.lightMax || left <= 1) return 'heavy';
    if ((this.gapGuards ?? 0) >= 2 && this.chance(0.5)) return 'heavy';
    return 'light';
  }

  /** 최근 상대 공격 간격으로 연타 리듬 추정 */
  pressureRhythm(frame) {
    const st = this.oppAttackStarts.filter((t) => frame - t < 150);
    if (st.length < 3) return null;
    const gaps = [];
    for (let i = 1; i < st.length; i++) gaps.push(st[i] - st[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const dev = Math.max(...gaps.map((g) => Math.abs(g - avg)));
    if (avg > 45 || dev > 8) return null;
    return { period: avg, last: st.at(-1) };
  }

  rhythmParry(me, frame, dist, opp) {
    const P = this.p;
    const r = this.pressureRhythm(frame);
    if (!r || dist > reachOf(opp.weapon.heavy) + 40) return;
    const nextStart = r.last + r.period * Math.ceil((frame - r.last + 1) / r.period);
    if (this.rhythmPlanned >= nextStart - 2) return;
    this.rhythmPlanned = nextStart;
    // 최근 관찰한 공격의 판정 시점을 기준으로 가드 재입력 (학습 정확도 = 난이도)
    const hitAt = nextStart + (this.lastOppDef ?? opp.weapon.light).hits[0].from;
    if (!this.chance(P.perfectChance + 0.25)) {
      this.holdFor('guard', frame, Math.max(10, hitAt - frame + 10));
      return;
    }
    const err = Math.round((this.random() * 2 - 1) * P.perfectError);
    const pressAt = hitAt - 3 + err;
    if (pressAt <= frame) return;
    this.release('guard');
    this.tapAt(pressAt, 'guard', {}, 16);
  }

  /** 상대 공격이 닿지 않는 거리 → 후딜레이를 노려 반격 */
  planWhiffPunish(me, seen, frame, dist) {
    const P = this.p;
    if (!this.chance(P.punishChance)) return;
    const remaining = seen.def.duration - seen.aframe - this.reactNow; // 실제 남은 후딜레이(추정)
    // 상대 판정이 끝나기 전에 도착하면 헛치게 한 공격에 오히려 맞는다 → 판정이 끝난 뒤에 닿도록
    const activeEnd = (seen.def.hits.at(-1)?.to ?? 0) - seen.aframe - this.reactNow + 2;
    const lightReach = reachOf(me.weapon.light) + 20;
    const heavyReach = reachOf(me.weapon.heavy) + 20;
    const lightSu = me.weapon.light.hits[0].from;
    const heavySu = me.weapon.heavy.hits[0].from;
    const fwd = me.facing > 0 ? 'right' : 'left';
    if (dist <= heavyReach && remaining > heavySu + 1 && heavySu > activeEnd) { this.release('guard'); this.tapAt(frame, 'heavy'); return; }
    const dashDist = BALANCE.dash.speed * BALANCE.dash.duration;
    // 대시가 끝나 상대 앞에 도착하는 시점이 판정 종료 뒤여야 한다
    const delay = Math.max(0, activeEnd + 2 - BALANCE.dash.duration);
    if (dist - dashDist <= lightReach && remaining > delay + BALANCE.dash.duration + lightSu + 1 &&
        me.stamina >= dashCost(me) && me.dashCooldown <= 0 && this.canDashIn(frame + delay)) {
      this.release('guard');
      this.dashIn(frame + delay, fwd);
      this.tapAt(frame + delay + BALANCE.dash.duration - 2, 'light');
    }
  }

  respondToThreat(me, seen, frame, plunging, dist) {
    const P = this.p;
    // 판정까지 남은 실제 프레임 추정 (돌진 공격은 거리까지 고려)
    let until = 6;
    if (!plunging) {
      const next = seen.def.hits.find((h) => h.to >= seen.aframe);
      if (!next) return;
      const startDist = dist + this.travelSince(seen);
      const contact = contactFrame(seen.def, startDist) ?? next.from;
      until = Math.max(next.from, contact) - seen.aframe - this.reactNow;
    }
    const isUlt = seen.def?.kind === 'ultimate';
    const pat = this.activePattern(frame);
    // 느린 공격(강공 등)이고 사거리 끝이면: 뒤로 빠져 헛치게 한 뒤 후딜을 노린다
    const vsHeavyMash = pat === 'heavySpam' && !plunging && seen.def?.kind === 'heavy';
    if (!vsHeavyMash && !plunging && !isUlt && until >= 3 && dist > reachOf(seen.def) - 45 && this.roomBehind(me) > 70 && this.chance(P.adapt)) {
      const back = me.facing > 0 ? 'left' : 'right';
      this.release('guard');
      if (me.stamina >= dashCost(me) && me.dashCooldown <= 0 && until < 10) this.retreat(me, frame, 12, true);
      else this.retreat(me, frame, until + 6);
      return;
    }
    const r = this.random();
    // 상대가 강공 위주(견제형)면 느린 강공에 완벽패링을 더 노린다 (반응 가능한 속도라 공정)
    const slowHit = !plunging && seen.def?.kind === 'heavy' && until >= 2;
    const vsPoker = slowHit && this.model.style() === 'poker' ? P.adapt * 0.6 : 0;
    // 약공 연타 상대: 박자가 일정하므로 완벽패링을 더 노린다
    const vsMasher = pat === 'lightSpam' ? P.adapt * 0.45 : 0;
    // 강공 연타: 보고 반응할 수 있는 느린 공격이므로 거의 매번 완벽패링을 노린다
    const perfectP = isUlt ? Math.min(0.9, P.perfectChance * 1.6)
      : vsHeavyMash && until >= 2 ? Math.min(0.92, 0.45 + P.adapt * 0.55)
      : Math.min(0.85, P.perfectChance + vsPoker + vsMasher);

    if (until >= 1 && r < perfectP) {
      // 완벽패링 시도: 가드를 떼었다가 예상 판정 직전에 다시 누른다 (오차 포함)
      this.release('guard');
      const err = Math.round((this.random() * 2 - 1) * P.perfectError);
      const pressAt = frame + Math.max(0, until - 3 + err);
      this.tapAt(pressAt, 'guard', {}, 20);
      return;
    }
    // 습관을 알고 있으면 운에 맡기지 않는다: 완벽패링을 안 노릴 때는 무조건 막는다
    if (vsHeavyMash || (pat === 'lightSpam' && seen.def?.kind === 'light')) {
      // 판정이 확실히 끝날 때까지 (지연 추정 없이, 보이는 진행 프레임 기준으로 넉넉히)
      const lastTo = seen.def.hits.at(-1)?.to ?? 0;
      this.holdFor('guard', frame, Math.max(12, until + 14, lastTo - seen.aframe + 4));
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

  /** 인지 시점 이후 상대가 공격 이동으로 다가온 거리 (근사) */
  travelSince(seen) {
    let pos = 0;
    for (let f = 0; f < seen.aframe; f++) for (const m of seen.def.moves) if (f >= m.from && f <= m.to) pos += Math.max(0, m.vx);
    return pos;
  }

  /** 등 뒤 벽까지 남은 거리 */
  roomBehind(me) {
    const wall = me.facing > 0 ? me.x - STAGE.leftWall : STAGE.rightWall - me.x;
    // 화면 끝(두 캐릭터 최대 거리)도 벽처럼 막힌다
    return Math.min(wall, STAGE.maxSeparation - (this.lastDist ?? 0));
  }

  /**
   * 뒤로 빠지기. 벽에 몰렸으면 빠질 수 없으므로 상대 머리 위로 점프해 빠져나가거나 가드한다.
   */
  retreat(me, frame, n, dash = false) {
    const back = me.facing > 0 ? 'left' : 'right';
    const fwd = me.facing > 0 ? 'right' : 'left';
    if (this.roomBehind(me) > 70) {
      if (dash && me.stamina >= dashCost(me) && me.dashCooldown <= 0) this.tapAt(frame, 'dash', { [back]: true });
      else this.holdFor(back, frame, n);
      return;
    }
    this.release(back);
    if (me.stamina >= BALANCE.jump.cost + 5 && this.chance(0.45)) this.tapAt(frame, 'up', { [fwd]: true });
    else this.holdFor('guard', frame, n + 6);
  }

  evade(me, frame) {
    const back = me.facing > 0 ? 'left' : 'right';
    if (me.stamina >= dashCost(me) && me.dashCooldown <= 0) {
      this.retreat(me, frame, 12, true);
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

    // 숨 고르기(공격 불가) 중: 물러나거나 가드
    if (me.combo.lock > 0) {
      if (dist < reachOf(opp.weapon.heavy) + 20) {
        if (this.chance(0.5)) this.retreat(me, frame, 10); else this.holdFor('guard', frame, 12);
      }
      return;
    }

    // 단순한 습관을 발견하면 바로 그 습관을 공략 (가만히 / 약공 연타 / 강공 연타 / 가드만)
    if (this.exploit(me, opp, seen, frame, dist)) return;

    // 상대 패턴 예측에 따른 대응 (예측 반영 정도 = 난이도)
    if (this.model.count >= 6 && this.chance(P.adapt) && this.counterPlan(me, opp, seen, frame, dist)) return;

    // 가드는 위협이 없으면 풀어 준다
    if (this.hold.guard && this.hold.guard <= frame + 2) this.release('guard');

    // 궁극기
    // 무기마다 궁극기 사거리가 다르다: 첫 판정이 바로(4프레임 안) 닿는 거리에서만 쓴다
    const ultContact = me.ult >= BALANCE.ultimate.cost ? contactFrame(me.weapon.ultimate, dist) : null;
    if (ultContact !== null && ultContact <= 4) {
      const oppVulnerable = STUNNED_OPP.has(seen.state) || seen.state === S.ATTACK;
      if (this.chance(oppVulnerable ? 0.8 : 0.12)) { this.release('guard'); this.tapAt(frame, 'ult'); return; }
    }

    // 상대 공격이 이미 진행 중이고 닿는 거리면 맞받아치지 않는다 (먼저 시작한 쪽이 이김)
    const incoming = seen.def && (seen.state === S.ATTACK || seen.state === S.SPECIAL) &&
      dist <= reachOf(seen.def) + 40 && seen.aframe < (seen.def.hits.at(-1)?.to ?? 0);
    if (incoming) {
      if (this.chance(P.guardChance + 0.15)) this.holdFor('guard', frame, 14);
      else if (this.chance(P.evadeChance * 2)) this.evade(me, frame);
      return;
    }

    // 상대가 가드 중이면 강공(도끼 등)으로 압박하거나 잠시 물러남
    const oppGuarding = seen.state === S.GUARD || seen.state === S.BLOCKSTUN;

    // 상대 사거리가 더 긴데 그 안쪽(내 사거리 밖)에 서 있으면: 파고들기 / 물러나 헛치기 유도 / 가드
    if (dist > lightReach + 15 && dist <= oppReach + 25 && oppReach > heavyReach) {
      const r0 = this.random();
      const oppSwinging = seen.state === S.ATTACK && seen.def && seen.aframe <= (seen.def.hits.at(-1)?.to ?? 0) + 2;
      if (r0 < 0.3 && !oppSwinging && me.stamina > dashCost(me) + 10 && me.dashCooldown <= 0 && this.canDashIn(frame)) {
        // 파고들기: 대시 직후 빠른 공격
        this.dashIn(frame, fwd);
        this.tapAt(frame + BALANCE.dash.duration - 3, this.chance(0.7) ? 'light' : 'heavy');
      }
      else if (r0 < 0.7) this.retreat(me, frame, 10);
      else this.holdFor('guard', frame, 12);
      return;
    }

    if (dist > heavyReach + 30) {
      // 접근: 걷기 또는 대시
      if (this.chance(0.1) && me.stamina > dashCost(me) + 30 && dist > heavyReach + 160 && this.canDashIn(frame)) {
        this.dashIn(frame, fwd);
      } else {
        this.holdFor(fwd, frame, P.thinkEvery + 2);
      }
      return;
    }

    const r = this.random();
    if (dist <= lightReach + 15) {
      // 근거리
      if (r < this.aggr) {
        this.release('guard');
        this.tapAt(frame, oppGuarding && this.chance(0.5) ? 'heavy' : this.chance(0.65) ? 'light' : 'heavy');
      } else if (r < this.aggr + P.preGuard) {
        this.holdFor('guard', frame, 14 + Math.floor(this.random() * 16));
      } else if (r < this.aggr + P.preGuard + 0.15) {
        this.retreat(me, frame, 12);
      } else if (this.chance(P.evadeChance) && me.stamina > dashCost(me) + 20) {
        this.retreat(me, frame, 12, true);
      } else if (this.chance(0.08) && me.stamina > 50) {
        this.tapAt(frame, 'up', { [fwd]: true });
      } else {
        this.holdFor(fwd, frame, 6);
      }
    } else {
      // 중거리: 강공 견제 / 간격 조절 / 접근
      if (r < this.aggr * 0.55) {
        this.release('guard');
        this.tapAt(frame, 'heavy');
      } else if (r < this.aggr * 0.55 + 0.25) {
        this.holdFor(fwd, frame, 8 + Math.floor(this.random() * 10));
      } else if (r < this.aggr * 0.55 + 0.4 && dist < oppReach + 20) {
        this.retreat(me, frame, 10);
      } else if (this.chance(P.preGuard)) {
        this.holdFor('guard', frame, 16);
      } else {
        this.holdFor(fwd, frame, 6);
      }
    }
  }

  /** 지금 공략 중인 습관 (난이도별로 확인 후 반응까지 시간이 다름) */
  activePattern(frame) {
    const g = this.patterns.get(frame);
    if (!g || g.held < (this.p.exploitDelay ?? 0)) return null;
    return g.pattern; // 쉬움·보통은 움직임 습관을 찾지 않는다 (PatternDetector moves)
  }

  /**
   * 습관 공략. 실제 사람이 하는 대처:
   *   가만히   → 다가가 가장 아픈 공격(강공·궁극기)부터
   *   약공 연타 → 전부 막고 박자에 맞춰 완벽패링, 콤보가 끝나 숨 고를 때 반격
   *   강공 연타 → 섣불리 들어가지 않고 느린 강공을 보고 완벽패링 → 경직·후딜에 들어가는 공격으로 반격
   *   가드만   → 가드 게이지를 깎는 강공으로 압박 → 무너지면 특수강공 (react 3)
   * 공략했으면 true.
   */
  exploit(me, opp, seen, frame, dist) {
    const pat = this.activePattern(frame);
    if (!pat) return false; // 확인된 습관은 항상 공략 (난이도 차이는 알아채는 속도·실행 정확도)
    this.lastExploit = pat;
    const fwd = me.facing > 0 ? 'right' : 'left';
    const myLight = reachOf(me.weapon.light), myHeavy = reachOf(me.weapon.heavy);
    const can = (k) => comboAllows(me, k, frame, false);
    const ultHere = me.ult >= BALANCE.ultimate.cost && (contactFrame(me.weapon.ultimate, dist) ?? 99) <= 4;
    // 공격할 때만 가드를 푼다 (이미 잡아 둔 가드·완벽패링 타이밍을 지우지 않도록)
    const hit = (key) => { this.release('guard'); this.tapAt(frame, key); return true; };
    const guarding = this.hold.guard && this.hold.guard > frame;
    switch (pat) {
      case 'idle':
        if (ultHere) { return hit('ult'); }
        if (dist > myHeavy - 12) { if (!guarding) this.holdFor(fwd, frame, 6); return true; }
        if (can('heavy')) return hit('heavy');
        return false;
      case 'turtle':
        if (dist > myHeavy - 12) { if (!guarding) this.holdFor(fwd, frame, 6); return true; }
        if (can('heavy')) return hit('heavy');
        if (can('light')) return hit('light');
        return false;
      case 'lightSpam':
        // 간격 싸움보다 확실한 대처: 약공은 전부 막고(respondToThreat), 일정한 박자에 완벽패링을 노리고,
        // 콤보가 끝나 숨 고르는 순간 반격(react 3-c). 위치 선정은 평소대로 둔다.
        // (habit-check: 간격 유지 공략보다 AI 피해 48→38%, 승률 92→100%)
        return false;
      case 'heavySpam': {
        // 강공은 느려서 보고 완벽패링할 수 있다: 섣불리 들어가지 않고 기다렸다가
        // (respondToThreat 가 완벽패링 확률을 크게 올림) 상대 후딜·패링 경직에 강공으로 크게 반격
        const inRecovery = seen.state === S.ATTACK && seen.def && seen.aframe > (seen.def.hits.at(-1)?.to ?? 0);
        // 남은 후딜 안에 들어가는 공격만 (늦으면 상대의 다음 강공과 부딪힌다)
        const left = inRecovery ? seen.def.duration - seen.aframe - this.reactNow : 0;
        const stunned = STUNNED_OPP.has(seen.state);
        if ((inRecovery || stunned) && dist <= myHeavy && can('heavy') && (stunned || left > me.weapon.heavy.hits[0].from + 2)) return hit('heavy');
        if (inRecovery && dist <= myLight + 8 && can('light') && left > me.weapon.light.hits[0].from + 1) return hit('light');
        return true; // 제자리에서 다음 강공을 기다렸다가 완벽패링 (가드 유지)
      }
      case 'dashIn': {
        // 대시로 파고드는 상대: 먼저 다가가지 않고 기다렸다가, 들어오는 길목에 공격을 미리 내민다
        const dashing = seen.state === S.DASH && seen.toward;
        if (dashing) {
          // 대시가 남은 만큼 더 들어온다고 보고, 내 공격이 닿을 때 상대가 그 안에 있으면 지금 낸다
          const travel = BALANCE.dash.speed * Math.max(0, BALANCE.dash.duration - this.reactNow / 2);
          const key = dist - travel <= myLight + 10 && can('light') ? 'light' : dist - travel <= myHeavy && can('heavy') ? 'heavy' : null;
          if (key) return hit(key);
          return true;
        }
        if (dist <= myLight + 10) return false;    // 이미 붙었으면 평소대로
        if (!guarding) this.release(fwd);          // 걸어 들어가지 않고 제자리에서 기다림
        return true;
      }
      case 'jumpIn': {
        // 점프로 들어오는 상대: 내려찍기 사거리 밖으로 물러나 헛치게 하고 착지를 노린다
        if (seen.state === S.JUMP || seen.state === S.PLUNGE) {
          this.antiAirUntil = frame + 70;
          if (dist < 150 && me.stamina >= dashCost(me) && me.dashCooldown <= 0 && isFree(me)) { this.retreat(me, frame, 12, true); return true; }
          if (dist < 110) { this.retreat(me, frame, 10); return true; }
          return true;
        }
        if (seen.state === S.LANDING && dist <= myHeavy && can('heavy')) return hit('heavy');
        return false;
      }
      case 'hitAndRun': {
        // 치고 빠지는 상대: 뒤로 빠지는 대시를 따라 들어가 도착하자마자 친다
        const fleeing = seen.state === S.DASH && !seen.toward;
        if (fleeing && isFree(me) && me.stamina >= dashCost(me) && me.dashCooldown <= 0) {
          this.release('guard');
          this.dashIn(frame, fwd);
          this.tapAt(frame + BALANCE.dash.duration - 2, 'light');
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * 예측한 상대 행동에 맞춘 대응. 대응했으면 true.
   * 큰 틀: 강공 예측 → 사거리 밖으로 빠져 헛치게 하거나 빠른 공격으로 먼저 / 약공 연타 예측 → 미리 가드(완벽패링 노림) 또는 빠지기
   *        돌진 예측 → 들어오는 길목에 견제 / 가드 예측 → 가드 압박(강공) / 점프 예측 → 착지 노리기
   *        대기·후퇴 예측 → 무리하지 않고 미끼 걸음 / 궁극기 예측 → 거리 벌리기
   */
  counterPlan(me, opp, seen, frame, dist) {
    const { action, p } = this.model.top(dist);
    this.lastPrediction = { action, p };
    if (p < (this.p.predictMin ?? 0.28)) return false;
    // 어려움: 예측이 실제로 맞아 온 만큼만 믿는다 (틀린 예측으로 헛걸음하지 않게, 상대가 바뀌면 바로 덜 믿음)
    if (this.p.trustAccuracy) {
      this.model.commit(action);
      if (!this.chance(Math.min(1, this.model.acc / 0.45))) return false;
    }
    const fwd = me.facing > 0 ? 'right' : 'left';
    const back = me.facing > 0 ? 'left' : 'right';
    const myLight = reachOf(me.weapon.light), myHeavy = reachOf(me.weapon.heavy);
    const opLight = reachOf(opp.weapon.light), opHeavy = reachOf(opp.weapon.heavy);
    const myLightSu = me.weapon.light.hits[0].from, opHeavySu = opp.weapon.heavy.hits[0].from;
    switch (action) {
      case 'heavy':
        if (dist > opHeavy + 60) return false;
        // 사거리 경계 바깥: 들어가지 않고 기다린다 (상대가 걸어 들어오며 강공 → 헛치게 해서 반격)
        if (dist > opHeavy + 8) { this.release('guard'); return true; }
        // 품 안: 내 약공이 상대 강공보다 확실히 빠르면 먼저 친다
        if (dist <= myLight + 10 && myLightSu + 4 < opHeavySu) { this.release('guard'); this.tapAt(frame, 'light'); return true; }
        // 그 외: 사거리 밖으로 빠진다 (가드로 받으면 상대 공격권이 이어지므로)
        if (me.stamina >= dashCost(me) + 5 && me.dashCooldown <= 0) this.retreat(me, frame, 12, true);
        else this.retreat(me, frame, 14);
        return true;
      case 'light':
        if (dist > opLight + 50) {
          if (myHeavy > opLight + 20 && dist <= myHeavy) { this.release('guard'); this.tapAt(frame, 'heavy'); return true; } // 사거리로 이기기
          return false;
        }
        if (me.stamina >= dashCost(me) + 10 && me.dashCooldown <= 0 && this.chance(0.35)) { this.retreat(me, frame, 12, true); return true; }
        this.holdFor('guard', frame, 18 + Math.floor(this.random() * 10)); return true;
      case 'dashIn':
        if (dist > myHeavy + 160) return false;
        if (dist <= myHeavy + 40) { this.release('guard'); this.tapAt(frame, dist <= myLight + 30 ? 'light' : 'heavy'); return true; }
        return true; // 그 자리에서 기다림 (들어오면 견제)
      case 'guard':
        if (dist <= myHeavy) { this.release('guard'); this.tapAt(frame, 'heavy'); return true; }
        this.holdFor(fwd, frame, 10); return true;
      case 'jump':
        if (dist < 160 && me.weapon.heavy.hits[0].box.h >= 100 && dist <= myHeavy) { this.tapAt(frame, 'heavy'); return true; } // 대공
        this.antiAirUntil = frame + 60; // 착지 반격 확률 상승
        if (dist < 70) this.retreat(me, frame, 10);
        return true;
      case 'wait':
      case 'retreat':
        if (dist > myHeavy + 60) { this.holdFor(fwd, frame, 10); return true; }
        // 기다리는 상대에게는 미끼 걸음 (들어갔다 빠지기)
        if (this.chance(0.5)) { this.holdFor(fwd, frame, 6); this.taps.push({ frame: frame + 7, key: back, extra: {}, thenHold: 8 }); }
        else this.holdFor('guard', frame, 12);
        return true;
      case 'ult':
        if (opp.ult >= BALANCE.ultimate.cost && dist < 260) { this.retreat(me, frame, 14); return true; }
        return false;
      default:
        return false;
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
