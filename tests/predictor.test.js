import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/core/match.js';
import { AIController } from '../src/ai/ai.js';
import { EMPTY_INPUT, S, isFree } from '../src/core/fighter.js';
import { reachOf } from '../src/core/attackDef.js';

const I = (o = {}) => ({ ...EMPTY_INPUT, ...o });

const bots = {
  lightSpam: (m, t) => { const me = m.fighters[0], op = m.fighters[1]; const d = Math.abs(op.x - me.x);
    return d > reachOf(me.weapon.light) + 10 ? I({ right: true }) : I({ light: t % 2 === 0 }); },
  heavyPoke: (m, t) => { const me = m.fighters[0], op = m.fighters[1]; const d = Math.abs(op.x - me.x);
    return d > reachOf(me.weapon.heavy) ? I({ right: true }) : I({ heavy: t % 2 === 0 }); },
  turtle: () => I({ guard: true }),
  jumper: (m, t) => { const me = m.fighters[0]; return isFree(me) ? I({ up: t % 2 === 0, right: true }) : me.state === S.JUMP && me.vy < 0 ? I({ heavy: t % 2 === 0 }) : I(); },
};

function observeStyle(bot, frames = 1500) {
  const m = new Match({ weapons: ['longsword', 'longsword'] });
  const ai = new AIController('hard', 3);
  for (let t = 0; t < frames && !m.over; t++) {
    m.fighters[0].stamina = 100; // 점프 봇이 스태미나로 막히지 않게
    m.step([bot(m, t), ai.think(m, 1)]);
  }
  return ai.model;
}

test('AI는 상대 행동을 큰 틀로 분류해 성향을 파악한다', () => {
  assert.equal(observeStyle(bots.lightSpam).style(), 'rusher');
  assert.equal(observeStyle(bots.heavyPoke).style(), 'poker');
  assert.equal(observeStyle(bots.turtle).style(), 'turtle');
  assert.equal(observeStyle(bots.jumper).style(), 'jumper');
});

test('AI는 거리별로 상대의 다음 행동을 예측한다', () => {
  const model = observeStyle(bots.heavyPoke);
  const p = model.predict(170);
  assert.ok(p.heavy >= 0.3, `강공 확률 ${p.heavy.toFixed(2)}`);
  assert.ok(p.heavy > p.light && p.heavy > p.guard && p.heavy > p.jump);
  const m2 = observeStyle(bots.lightSpam);
  assert.equal(m2.top(90).action, 'light');
});
