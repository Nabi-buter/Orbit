import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/config/balance.js';
import { WEAPON_ORDER } from '../src/config/weapons.js';
import { contactFrame } from '../src/core/attackDef.js';
import { S } from '../src/core/fighter.js';
import { Match } from '../src/core/match.js';
import { setup, run, tap, until, I } from './helpers.js';

const B = BALANCE;

test('스태미나: 소모 후 지연 시간이 지나야 회복된다', () => {
  const m = setup({ distance: 600, p1x: 300 });
  const a = m.fighters[0];
  tap(m, 0, 'dash', { right: true });
  const after = a.stamina;
  run(m, B.stamina.regenDelay - 2);
  assert.equal(a.stamina, after, '지연 중 회복 없음');
  run(m, 60);
  assert.ok(a.stamina > after + 20, '지연 후 회복');
  run(m, 400);
  assert.equal(a.stamina, B.fighter.maxStamina);
});

test('점프 연속 사용은 스태미나로 제한된다', () => {
  const m = setup({ distance: 600, p1x: 300 });
  const a = m.fighters[0];
  let jumps = 0;
  for (let k = 0; k < 600; k++) {
    const before = a.state;
    m.step([I({ up: k % 2 === 0 }), I()]);
    if (before !== S.JUMP && a.state === S.JUMP) jumps++;
  }
  // 10초 동안: 처음 100 + 회복분 이상으로는 못 뛴다
  const maxPossible = Math.floor((B.fighter.maxStamina + B.stamina.regenPerFrame * 600) / B.jump.cost) + 1;
  assert.ok(jumps <= maxPossible, `${jumps} > ${maxPossible}`);
  assert.ok(jumps < 600 / 42, '체공 시간 기준 최대치보다 적음');
});

test('궁극기: 원거리 시전은 반응 가능한 시간(≥12f) 뒤에 닿고, 백대시가 돌진보다 빠르다', () => {
  for (const id of WEAPON_ORDER) {
    const m = new Match({ weapons: [id, id] });
    const u = m.fighters[0].weapon.ultimate;
    assert.ok(contactFrame(u, 230) >= 12, `${id}: 230px 에서 ${contactFrame(u, 230)}f`);
    assert.ok(contactFrame(u, 60) <= 1, `${id}: 근거리 즉시 적중`);
    const lunge = Math.max(...u.moves.map((mv) => mv.vx));
    assert.ok(B.dash.speed > lunge);
  }
});

test('특수강공 후 중립 거리는 모든 무기의 강공 사거리보다 멀다', async () => {
  const { reachOf } = await import('../src/core/attackDef.js');
  const { WEAPONS } = await import('../src/config/weapons.js');
  for (const id of WEAPON_ORDER) assert.ok(B.special.neutralDistance > reachOf(WEAPONS[id].heavy) + 25, id);
});

test('시뮬레이션은 결정론적이다 (같은 입력 → 같은 결과, 온라인 동기화 전제)', () => {
  const script = (k) => [I({ right: k % 50 < 30, light: k % 17 === 0, heavy: k % 41 === 0, guard: k % 90 > 70 }),
    I({ left: k % 40 < 20, light: k % 23 === 0, dash: k % 120 === 5, up: k % 200 === 9 })];
  const a = new Match({ weapons: ['axe', 'spear'] });
  const b = new Match({ weapons: ['axe', 'spear'] });
  for (let k = 0; k < 2000; k++) { a.step(script(k)); b.step(script(k)); }
  assert.deepEqual(a.fighters.map((f) => [f.x, f.hp, f.state, f.guard, f.ult]), b.fighters.map((f) => [f.x, f.hp, f.state, f.guard, f.ult]));
});

test('완벽패링 후 공격자 경직 동안 모든 무기가 약공으로 반격할 수 있다', () => {
  for (const id of WEAPON_ORDER) {
    const m = setup({ distance: 60, weapons: ['longsword', id] });
    const [a, b] = m.fighters;
    tap(m, 0, 'heavy');
    run(m, a.weapon.heavy.hits[0].from - 3);
    run(m, 6, I(), I({ guard: true }));
    assert.equal(a.state, S.PARRIED);
    m.step([I(), I({ light: true })]);
    const ev = run(m, B.guard.perfectStun - 4);
    assert.ok(ev.some((e) => e.type === 'hit' && e.attacker === 1), id);
  }
});
