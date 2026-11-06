// =============================================================================
// 상대 패턴 예측 (AI 용)
// -----------------------------------------------------------------------------
// 상대 행동을 큰 틀 8가지로 나눈다:
//   light 약공 · heavy 강공 · guard 가드 · dashIn 접근(전진 대시/걸어 들어옴) · retreat 후퇴(뒤 대시/뒷걸음)
//   jump 점프 · wait 대기(가만히/걷기만) · ult 궁극기
// 거리 구간(근/중/원)별 빈도와 "직전 행동 → 다음 행동" 전이 빈도를 지수 감쇠로 학습해
// 지금 상황에서 상대가 다음에 할 행동의 확률을 추정한다.
// 상대 성향(style)도 요약한다: 돌격형 / 견제형 / 수비형 / 점프형 / 반격형 / 균형형.
// 모든 관측은 AI의 반응 지연이 적용된 "보이는 상태"로만 한다 (공정).
// =============================================================================

import { S } from '../core/fighter.js';

export const ACTIONS = ['light', 'heavy', 'guard', 'dashIn', 'retreat', 'jump', 'wait', 'ult'];
const BANDS = ['close', 'mid', 'far'];

export function bandOf(dist) { return dist <= 120 ? 'close' : dist <= 220 ? 'mid' : 'far'; }

function zeros() { return Object.fromEntries(ACTIONS.map((a) => [a, 0.3])); } // 약한 사전 분포

export class OpponentModel {
  constructor({ decay = 0.97 } = {}) {
    this.decay = decay;
    this.byBand = Object.fromEntries(BANDS.map((b) => [b, zeros()]));
    this.trans = Object.fromEntries(ACTIONS.map((a) => [a, zeros()]));
    this.total = zeros();
    this.last = 'wait';
    this.prevState = null;
    this.waitSince = 0;
    this.count = 0;
    this.acc = 0.35;      // 예측이 맞은 비율 (처음엔 낮게 보고 시작)
    this.pending = null;  // 맞는지 확인할 예측
  }

  /** 이 예측을 믿고 움직였다 → 상대의 다음 행동으로 맞았는지 확인 */
  commit(action) { this.pending = action; }

  record(action, band) {
    // 예측 적중률: 직전에 한 예측이 실제 다음 행동과 맞았는지 (지수 평균)
    if (this.pending) {
      this.acc = this.acc * 0.85 + (this.pending === action ? 0.15 : 0);
      this.pending = null;
    }
    const d = this.decay;
    for (const t of [this.byBand[band], this.trans[this.last], this.total]) {
      for (const a of ACTIONS) t[a] *= d;
      t[action] += 1;
    }
    this.last = action;
    this.count++;
  }

  /**
   * 보이는 상대 상태로 행동을 분류해 기록한다.
   * @param seen 지연된 상대 스냅샷 {state, def, x, dashDir, atk}
   * @param me 내 파이터 (거리/방향 계산)
   */
  observe(seen, me, frame) {
    const st = seen.state;
    const dist = Math.abs(seen.x - me.x);
    const band = bandOf(dist);
    const changed = st !== this.prevState || (seen.atk && seen.atk !== this.prevAtk);
    if (changed) {
      let action = null;
      if (st === S.ATTACK && seen.def) action = seen.def.kind === 'heavy' ? 'heavy' : 'light';
      else if (st === S.ULTIMATE) action = 'ult';
      else if (st === S.GUARD) action = 'guard';
      else if (st === S.JUMP) action = 'jump';
      else if (st === S.DASH) action = seen.toward ? 'dashIn' : 'retreat';
      if (action) { this.record(action, band); this.waitSince = frame; }
      this.prevState = st;
      this.prevAtk = seen.atk;
    }
    // 오래 아무것도 안 하면 '대기'로 기록 (걷기 포함), 뒷걸음은 '후퇴'
    if ((st === S.IDLE || st === S.WALK) && frame - this.waitSince > 40) {
      this.record(seen.walkingAway ? 'retreat' : seen.walkingToward ? 'dashIn' : 'wait', band);
      this.waitSince = frame;
    }
  }

  /** 현재 거리 구간에서 다음 행동 확률 */
  predict(dist) {
    const band = this.byBand[bandOf(dist)];
    const tr = this.trans[this.last];
    const p = {};
    let sum = 0;
    for (const a of ACTIONS) { p[a] = band[a] * 0.6 + tr[a] * 0.4; sum += p[a]; }
    for (const a of ACTIONS) p[a] /= sum;
    return p;
  }

  /** 가장 그럴듯한 다음 행동과 확률 */
  top(dist) {
    const p = this.predict(dist);
    let best = 'wait';
    for (const a of ACTIONS) if (p[a] > p[best]) best = a;
    return { action: best, p: p[best], probs: p };
  }

  /** 상대 성향 요약 */
  style() {
    const t = this.total;
    const sum = ACTIONS.reduce((s, a) => s + t[a], 0) || 1;
    const f = (a) => t[a] / sum;
    if (this.count < 6) return 'unknown';
    if (f('light') + f('dashIn') > 0.5) return 'rusher';     // 돌격형: 약공·돌진 위주
    if (f('heavy') > 0.3) return 'poker';                     // 견제형: 강공 위주
    if (f('guard') > 0.35) return 'turtle';                   // 수비형
    if (f('jump') > 0.2) return 'jumper';                     // 점프형
    if (f('wait') + f('retreat') > 0.45) return 'counter';    // 반격형: 기다렸다 받아침
    return 'balanced';
  }
}

export const STYLE_LABEL = {
  unknown: '분석 중', rusher: '돌격형', poker: '견제형', turtle: '수비형', jumper: '점프형', counter: '반격형', balanced: '균형형',
};

// =============================================================================
// 빠른 패턴 감지 (최근 몇 초만 본다)
// -----------------------------------------------------------------------------
// OpponentModel 은 오래 쌓아 확률을 낸다. 여기서는 "사람이 바로 눈치채는" 단순한 습관을
// 최근 구간에서 즉시 잡아낸다. 습관이 바뀌면 구간이 지나며 자연히 풀린다.
//   idle       아무것도 안 함 (가만히 서 있음)
//   lightSpam  약공만 연타
//   heavySpam  강공만 연타
//   turtle     가드만 함
//   dashIn     대시로 파고들기를 반복
//   jumpIn     점프로 들어와 내려찍기를 반복
//   hitAndRun  치고 나서(또는 맞거나 막은 뒤) 바로 뒤로 대시해 빠짐
// =============================================================================
export const PATTERNS = ['idle', 'lightSpam', 'heavySpam', 'turtle', 'dashIn', 'jumpIn', 'hitAndRun'];
export const PATTERN_LABEL = {
  idle: '가만히 있음', lightSpam: '약공 연타', heavySpam: '강공 연타', turtle: '가드만 함',
  dashIn: '대시 돌진', jumpIn: '점프 공격', hitAndRun: '치고 빠지기',
};

const WINDOW = 240; // 최근 4초

export class PatternDetector {
  /** moves: 움직임 습관(대시 돌진 · 점프 공격 · 치고 빠지기)도 찾는다 (어려움) */
  constructor({ moves = true } = {}) {
    this.moves = moves;
    this.log = [];       // 프레임마다 {st, start}
    this.prevAtk = null;
    this.current = null; // 확정된 패턴
    this.since = 0;
  }

  /** 보이는 상대 상태 한 프레임 기록 */
  observe(seen, frame) {
    let start = null;
    if (seen.atk && seen.atk !== this.prevAtk && seen.state === S.ATTACK) start = seen.def?.kind === 'heavy' ? 'heavy' : 'light';
    this.prevAtk = seen.atk;
    // 대시·점프 시작, 공격·경직 직후의 뒤 대시(치고 빠지기)
    const prev = this.prevSt;
    if (prev === S.ATTACK || prev === S.HITSTUN || prev === S.BLOCKSTUN) this.lastBusy = frame;
    const newDash = seen.state === S.DASH && prev !== S.DASH;
    const move = newDash ? (seen.toward ? 'dashIn' : frame - (this.lastBusy ?? -99) < 14 ? 'run' : 'back')
      : seen.state === S.JUMP && prev !== S.JUMP ? 'jump' : null;
    this.prevSt = seen.state;
    this.log.push({ st: seen.state, start, move });
    if (this.log.length > WINDOW) this.log.shift();
    const next = this.classify();
    if (next !== this.current) { this.current = next; this.since = frame; }
  }

  /** 최근 n 프레임 통계 */
  stats(n) {
    const part = this.log.slice(-n);
    let light = 0, heavy = 0, guard = 0, idle = 0, dashIn = 0, jump = 0, run = 0;
    for (const e of part) {
      if (e.move === 'dashIn') dashIn++;
      if (e.move === 'jump') jump++;
      if (e.move === 'run') run++;
      if (e.start === 'light') light++;
      if (e.start === 'heavy') heavy++;
      if (e.st === S.GUARD || e.st === S.BLOCKSTUN) guard++;
      if (e.st === S.IDLE) idle++;
    }
    return { n: part.length, light, heavy, guard, idle, dashIn, jump, run };
  }

  classify() {
    if (this.log.length < 120) return null; // 2초는 봐야 판단
    const a = this.stats(180), b = this.stats(240), c = this.stats(150);
    // 이미 잡은 습관은 느슨한 기준으로 유지 (한두 번 다른 행동을 섞어도 바로 풀지 않음)
    const keep = {
      lightSpam: b.light >= 3 && b.light > b.heavy * 2,
      heavySpam: b.heavy >= 2 && b.heavy > b.light,
      turtle: c.guard / c.n >= 0.5 && c.light + c.heavy <= 2,
      idle: c.idle / c.n >= 0.7 && c.light + c.heavy === 0,
      dashIn: b.dashIn >= 2,
      jumpIn: b.jump >= 2,
      hitAndRun: b.run >= 2,
    };
    if (this.current && keep[this.current]) return this.current;
    // 움직임 습관이 먼저 (대시·점프로 들어와 약공을 섞는 경우 '약공 연타' 보다 들어오는 방식이 핵심)
    if (this.moves) {
      if (b.run >= 3) return 'hitAndRun';
      if (b.jump >= 3) return 'jumpIn';
      if (b.dashIn >= 3) return 'dashIn';
    }
    if (a.light >= 4 && a.heavy <= 1) return 'lightSpam';
    if (b.heavy >= 3 && b.light <= 1) return 'heavySpam';
    if (c.guard / c.n >= 0.7 && c.light + c.heavy <= 1) return 'turtle';
    if (c.idle / c.n >= 0.85 && c.light + c.heavy === 0 && c.guard === 0) return 'idle';
    return null;
  }

  /** 확정된 패턴과 그 패턴이 이어진 프레임 수 */
  get(frame) { return this.current ? { pattern: this.current, held: frame - this.since } : null; }
}
