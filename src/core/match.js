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
    this.overtime = false;  // 라운드 시간이 다 된 뒤 (양쪽 체력이 계속 줄어듦)
    this.overtimeFrames = 0;
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
    // 라운드 시간: 다 되면 경기를 끝내지 않고 연장전 (온라인에서 갑자기 끝나 흐름이 끊기지 않게)
    if (this.timeLeft > 0) {
      if (--this.timeLeft === 0) {
        this.overtime = true;
        this.events.push({ type: 'overtime', frame: this.frame });
      }
      return;
    }
    this.overtimeTick();
  }

  /** 연장전: 0.1초마다 양쪽 모두 최대 체력 비율만큼 피해 (정수, 결정론적). 쓰러지면 평소처럼 다음 라운드 */
  overtimeTick() {
    if (++this.overtimeFrames % 6 !== 0) return;
    this.fighters.forEach((f, i) => {
      if (f.state === S.KO) return;
      f.hp = Math.max(0, f.hp - Math.ceil((f.maxHp * BALANCE.round.overtimeRate) / 10));
      if (f.hp <= 0) {
        f.state = S.KO;
        f.attack = null; f.dash = null; f.slide = null;
        this.events.push({ type: 'ko', defender: i, attacker: 1 - i, frame: this.frame, overtime: true });
      }
    });
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
    this.overtime = false;
    this.overtimeFrames = 0;
    this.roundIntro = BALANCE.round.introFrames;
    this.events.push({ type: 'round', round: this.round, lives: [...this.lives] });
  }
}
