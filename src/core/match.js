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
    this.fighters = [
      createFighter({ id: 0, x: cx - half, facing: 1, weapon: getWeapon(weapons[0]) }),
      createFighter({ id: 1, x: cx + half, facing: -1, weapon: getWeapon(weapons[1]) }),
    ];
    this.frame = 0;
    this.timeLeft = roundSeconds * FPS;
    this.events = [];      // 이번 프레임에 발생한 이벤트
    this.over = false;
    this.winner = null;    // 0 | 1 | 'draw'
    this.endReason = null; // 'ko' | 'time'
    this.koTimer = 0;
  }

  /** @param {[object, object]} inputs 각 플레이어의 이번 프레임 버튼 상태 */
  step(inputs = [EMPTY_INPUT, EMPTY_INPUT]) {
    if (this.over) return this.events = [];
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
      if (++this.koTimer >= BALANCE.round.koDelay) this.over = true;
      return;
    }
    if (--this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endReason = 'time';
      // 시간 종료: 남은 체력 비율로 판정 (무기별 체력이 다를 수 있음)
      const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
      this.winner = ra === rb ? 'draw' : ra > rb ? 0 : 1;
      this.over = true;
    }
  }
}
