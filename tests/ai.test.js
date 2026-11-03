import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/core/match.js';
import { AIController, DIFFICULTY } from '../src/ai/ai.js';
import { EMPTY_INPUT } from '../src/core/fighter.js';
import { WEAPON_ORDER } from '../src/config/weapons.js';
import { I } from './helpers.js';

function play(w1, w2, d = 'normal', seed = 1, p1 = null) {
  const m = new Match({ weapons: [w1, w2] });
  const ai = new AIController(d, seed);
  const ai1 = p1 ? new AIController(p1, seed + 99) : null;
  const evs = [];
  const used = { guard: 0, dash: 0, up: 0, light: 0, heavy: 0, move: 0 };
  let prev = { ...EMPTY_INPUT };
  for (let k = 0; k < 60 * 60 && !m.over; k++) {
    const i2 = ai.think(m, 1);
    for (const key of ['guard', 'dash', 'up', 'light', 'heavy']) if (i2[key] && !prev[key]) used[key]++;
    if (i2.left || i2.right) used.move++;
    prev = i2;
    evs.push(...m.step([ai1 ? ai1.think(m, 0) : EMPTY_INPUT, i2]));
  }
  return { m, evs, used };
}

test('AI는 공격만 반복하지 않고 이동·가드·대시·공격을 섞어 쓴다', () => {
  const { used } = play('longsword', 'longsword', 'normal', 7, 'normal');
  for (const k of ['guard', 'dash', 'light', 'heavy', 'move']) assert.ok(used[k] > 0, `${k} 미사용`);
});

test('AI는 패링/완벽패링을 하지만 모든 공격을 막지는 않는다 (공정성)', () => {
  let parries = 0, perfects = 0, hitsTaken = 0;
  for (let s = 1; s <= 6; s++) {
    const { evs } = play('longsword', 'longsword', 'hard', s, 'hard');
    for (const e of evs) {
      if (e.defender !== 1) continue;
      if (e.type === 'parry') parries++;
      if (e.type === 'perfect') perfects++;
      if (e.type === 'hit') hitsTaken++;
    }
  }
  assert.ok(parries > 0, '일반 패링');
  assert.ok(perfects > 0, '완벽패링');
  assert.ok(hitsTaken > perfects, '완벽패링이 모든 공격을 막지 않음');
});

test('반응보다 빠른 공격은 미리 대비하지 않으면 완벽패링할 수 없다', () => {
  for (const d of Object.keys(DIFFICULTY)) {
    assert.ok(DIFFICULTY[d].reaction > 3, `${d}: 단검 약공 발생(3f)보다 반응이 느려야 함`);
  }
});

test('모든 무기 조합에서 AI 대전이 오류 없이 끝난다', () => {
  for (const a of WEAPON_ORDER) for (const b of WEAPON_ORDER) {
    const { m } = play(a, b, 'normal', a.length * 31 + b.length, 'easy');
    assert.ok(m.frame > 0);
    for (const f of m.fighters) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.hp));
  }
});

test('난이도가 높을수록 강하다 (어려움 vs 쉬움)', () => {
  let hardWins = 0;
  const N = 16;
  for (let s = 0; s < N; s++) {
    const m = new Match({ weapons: ['longsword', 'longsword'] });
    const easy = new AIController('easy', 100 + s), hard = new AIController('hard', 200 + s);
    const flip = s % 2 === 1;
    while (!m.over) m.step(flip ? [hard.think(m, 0), easy.think(m, 1)] : [easy.think(m, 0), hard.think(m, 1)]);
    if (m.winner === (flip ? 0 : 1)) hardWins++;
  }
  assert.ok(hardWins >= N * 0.6, `어려움 승리 ${hardWins}/${N}`);
});

test('AI 는 단순한 습관(가만히 / 약공 연타 / 강공 연타 / 가드만)을 몇 초 안에 알아챈다', async () => {
  const { PatternDetector } = await import('../src/ai/predictor.js');
  const feed = (fn, frames = 200) => {
    const d = new PatternDetector();
    let atk = null;
    for (let f = 0; f < frames; f++) {
      const s = fn(f);
      if (s.start) atk = { id: f };
      d.observe({ state: s.state, atk: s.state === 'attack' ? atk : null, def: s.state === 'attack' ? { kind: s.kind } : null }, f);
    }
    return d.get(frames)?.pattern ?? null;
  };
  assert.equal(feed(() => ({ state: 'idle' })), 'idle');
  assert.equal(feed(() => ({ state: 'guard' })), 'turtle');
  assert.equal(feed((f) => ({ state: f % 30 < 20 ? 'attack' : 'idle', kind: 'light', start: f % 30 === 0 })), 'lightSpam');
  assert.equal(feed((f) => ({ state: f % 60 < 50 ? 'attack' : 'idle', kind: 'heavy', start: f % 60 === 0 }), 240), 'heavySpam');
  // 섞어서 플레이하면 습관으로 보지 않는다
  assert.equal(feed((f) => ({ state: f % 40 < 15 ? 'attack' : f % 40 < 30 ? 'guard' : 'walk', kind: f % 80 < 40 ? 'light' : 'heavy', start: f % 40 === 0 })), null);
});

test('습관 공략: 어려움 AI 는 가만히·가드만 하는 상대를 피해 없이 이기고, 강공 연타를 완벽패링으로 받아친다', () => {
  for (const [name, bot] of [['idle', () => I()], ['turtle', () => I({ guard: true })]]) {
    const m = new Match({ weapons: ['longsword', 'axe'] });
    const ai = new AIController('hard', 3);
    while (!m.over && m.frame < 60 * 90) m.step([bot(), ai.think(m, 1)]);
    assert.equal(m.winner, 1, name);
    assert.equal(m.fighters[1].hp, m.fighters[1].maxHp, `${name}: AI 무피해`);
  }
  const m = new Match({ weapons: ['greatsword', 'longsword'] });
  const ai = new AIController('hard', 5);
  let perfects = 0, k = 0;
  while (!m.over && m.frame < 60 * 90) {
    const [b, a] = m.fighters;
    const toward = a.x > b.x ? 'right' : 'left';
    const ev = m.step([I({ heavy: k++ % 6 === 0, [toward]: Math.abs(a.x - b.x) > 150 }), ai.think(m, 1)]);
    perfects += ev.filter((e) => e.type === 'perfect' && e.defender === 1).length;
  }
  assert.ok(ai.activePattern(m.frame) === 'heavySpam' || perfects > 0);
  assert.ok(perfects >= 3, `완벽패링 ${perfects}`);
});
