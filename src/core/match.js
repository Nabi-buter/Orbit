// =============================================================================
// 대전(매치) 시뮬레이션
// - step(inputs) 한 번 = 1프레임. 입력 장치/렌더링/네트워크와 완전히 분리된 결정론적 로직.
// - 온라인 확장 시 양쪽 입력 배열만 동기화하면 같은 결과를 재현할 수 있다.
// =============================================================================

import { BALANCE, STAGE, FPS } from '../config/balance.js';
import { getWeapon, DEFAULT_WEAPON } from '../config/weapons.js';
import { createFighter, S, EMPTY_INPUT } from './fighter.js';
import { processInput, tickBuffer, tickParry } from './actions.js';
import { integrate, resolveBodies, updateFacing, advanceTimers } from './physics.js';
import { collectHits, applyHits } from './combat.js';

export class Match {
  constructor({ weapons = [DEFAULT_WEAPON, DEFAULT_WEAPON], roundSeconds = BALANCE.round.timeSeconds } = {}) {
    const cx = STAGE.width / 2;
    const half = STAGE.startDistance / 2;
    this.spawn = [
      { id: 0, x: cx - half, facing: 1, weapon: getWeapon(weapons[0]) },
      { id: 1, x: cx + half, facing: -1, weapon: getWeapon(weapons[1]) },
    ];
    this.fighters = this.spawn.map((sp) => createFighter(sp));
    this.frame = 0;
    this.roundSeconds = roundSeconds;
    this.unlimited = !(roundSeconds > 0); // 0 = 시간 제한 없음 (목숨이 다 떨어질 때까지)
    this.timeLeft = this.unlimited ? Infinity : roundSeconds * FPS;
    // 목숨: 한쪽이 쓰러지면 처음 위치에서 다시 시작. 쓰러진 쪽만 체력이 차고, 버틴 쪽은 깎인 체력 그대로.
    this.lives = [BALANCE.round.lives, BALANCE.round.lives];
    this.round = 1;
    this.roundIntro = 0;   // 라운드 사이 정지 프레임 (입력 무시)
    this.events = [];      // 이번 프레임에 발생한 이벤트
    this.over = false;
    this.winner = null;    // 0 | 1 | 'draw'
    this.endReason = null; // 'ko' | 'time'
    this.koTimer = 0;
  }

  /** @param {[object, object]} inputs 각 플레이어의 이번 프레임 버튼 상태 */
  step(inputs = [EMPTY_INPUT, EMPTY_INPUT]) {
    if (this.over) return this.events = [];
    if (this.roundIntro > 0) {
      this.roundIntro--;
      this.frame++;
      return this.events = [];
    }
    const [a, b] = this.fighters;
    const frame = this.frame;

    processInput(a, b, inputs[0] ?? EMPTY_INPUT, frame);
    processInput(b, a, inputs[1] ?? EMPTY_INPUT, frame);

    integrate(a);
    integrate(b);
    resolveBodies(a, b);
    updateFacing(a, b);
    updateFacing(b, a);

    // 동시 판정
    const hits = [...collectHits(a, b), ...collectHits(b, a)];
    const events = applyHits(hits, frame);

    for (const f of this.fighters) {
      advanceTimers(f, frame);
      tickParry(f, frame);
      tickBuffer(f);
    }

    this.events = events;
    this.frame++;
    this.checkEnd();
    return events;
  }

  checkEnd() {
    const [a, b] = this.fighters;
    const koed = a.state === S.KO || b.state === S.KO;
    if (koed) {
      if (this.koTimer === 0) {
        this.endReason = 'ko';
        this.winner = a.state === S.KO && b.state === S.KO ? 'draw' : a.state === S.KO ? 1 : 0;
      }
      if (++this.koTimer >= BALANCE.round.koDelay) {
        this.fighters.forEach((f, i) => { if (f.state === S.KO) this.lives[i] = Math.max(0, this.lives[i] - 1); });
        if (this.lives[0] > 0 && this.lives[1] > 0) this.nextRound();
        else {
          this.winner = this.lives[0] === this.lives[1] ? 'draw' : this.lives[0] > 0 ? 0 : 1;
          this.over = true;
        }
      }
      return;
    }
    if (this.unlimited) return;
    if (--this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endReason = 'time';
      // 시간 종료: 남은 목숨 → 남은 체력 비율 순으로 판정 (무기별 체력이 다를 수 있음)
      const ra = this.lives[0] + a.hp / a.maxHp, rb = this.lives[1] + b.hp / b.maxHp;
      this.winner = ra === rb ? 'draw' : ra > rb ? 0 : 1;
      this.over = true;
    }
  }

  /** 다음 라운드: 처음 위치로. 쓰러진 쪽은 체력 회복, 버틴 쪽은 체력 유지. 궁극기 게이지와 기록은 이어진다. */
  nextRound() {
    this.fighters.forEach((f, i) => {
      const fresh = createFighter(this.spawn[i]);
      const keep = { hp: f.state === S.KO ? fresh.hp : f.hp, ult: f.ult, stats: f.stats };
      for (const k of Object.keys(f)) delete f[k];
      Object.assign(f, fresh, keep);
    });
    this.round++;
    this.koTimer = 0;
    this.winner = null;
    this.endReason = null;
    this.timeLeft = this.unlimited ? Infinity : this.roundSeconds * FPS;
    this.roundIntro = BALANCE.round.introFrames;
    this.events.push({ type: 'round', round: this.round, lives: [...this.lives] });
  }
}
