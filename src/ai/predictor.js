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
  }

  record(action, band) {
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
