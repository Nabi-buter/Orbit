import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/config/balance.js';
import { WEAPONS, WEAPON_ORDER } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';
import { registerUltimateType, buildUltimate } from '../src/core/ultimates.js';
import { attack } from '../src/core/attackDef.js';
import { S } from '../src/core/fighter.js';
import { setup, run, tap, until, I } from './helpers.js';

const B = BALANCE;

test('무기 7종이 존재한다', () => {
  assert.deepEqual(WEAPON_ORDER, ['longsword', 'rapier', 'greatsword', 'dagger', 'axe', 'spear', 'knuckle']);
  for (const id of WEAPON_ORDER) assert.ok(WEAPONS[id]);
});

test('모든 무기·모든 콤보 단계 조합에서 콤보 사이에 대응할 틈(≥2프레임)이 있다', () => {
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const steps = [...w.lights, ...w.heavies];
    for (const A of steps) {
      const hs = A.hits;
      for (let i = 1; i < hs.length; i++) {
        assert.ok(hs[i - 1].from + hs[i - 1].hitstun > hs[i].to, `${id} ${A.name} 다단 히트 ${i} 끊김`);
      }
      if (A.cancelFrom == null) continue;
      for (const Bd of steps) {
        const last = hs.at(-1);
        const gap = A.cancelFrom + Bd.hits[0].from - (last.to + last.hitstun);
        assert.ok(gap >= 2, `${id} ${A.name}→${Bd.name}: 틈 ${gap}`);
      }
    }
  }
});

test('특수강공 피해는 모든 무기 동일, 모션은 무기별로 다르다', () => {
  const dmg = new Set(WEAPON_ORDER.map((id) => WEAPONS[id].special.hits[0].damage));
  assert.deepEqual([...dmg], [B.special.damage]);
  const motions = new Set(WEAPON_ORDER.map((id) => WEAPONS[id].special.motion));
  assert.equal(motions.size, 6);
});

test('무기별 성능 차이: 속도·사거리·피해', () => {
  const W = WEAPONS;
  const startup = (id, k) => W[id][k].hits[0].from;
  const totalDmg = (id, k) => W[id][k].hits.reduce((s, h) => s + h.damage, 0);
  // 대검: 가장 느리고 강공 피해 최고
  for (const id of WEAPON_ORDER) {
    if (id === 'greatsword') continue;
    assert.ok(startup('greatsword', 'heavy') >= startup(id, 'heavy'));
    assert.ok(totalDmg('greatsword', 'heavy') > totalDmg(id, 'heavy'));
  }
  // 창: 가장 긴 사거리
  for (const id of WEAPON_ORDER) if (id !== 'spear') assert.ok(reachOf(W.spear.light) > reachOf(W[id].light));
  // 단검·너클: 가장 빠른 약공, 짧은 사거리
  for (const id of ['longsword', 'greatsword', 'axe', 'spear']) {
    assert.ok(startup('dagger', 'light') < startup(id, 'light'));
    assert.ok(startup('knuckle', 'light') < startup(id, 'light'));
    assert.ok(reachOf(W.knuckle.light) < reachOf(W[id].light));
  }
  // 너클 사거리 < 단검 사거리
  assert.ok(reachOf(W.knuckle.light) < reachOf(W.dagger.light));
  // 도끼: 가드 압박(가드 게이지 피해) 최고
  const gd = (id) => W[id].light.hits.reduce((s, h) => s + h.guardDamage, 0) + W[id].heavy.hits.reduce((s, h) => s + h.guardDamage, 0);
  for (const id of WEAPON_ORDER) if (id !== 'axe') assert.ok(gd('axe') > gd(id), id);
});

test('단검 vs 너클: 너클은 타수가 많고 한 타 피해가 낮다 (콤보 전체 기준)', () => {
  const hitsOf = (id) => [...WEAPONS[id].lights, ...WEAPONS[id].heavies].flatMap((d) => d.hits);
  const d = hitsOf('dagger'), k = hitsOf('knuckle');
  assert.ok(k.length > d.length, `타수 ${k.length} vs ${d.length}`);
  const avg = (a) => a.reduce((s, h) => s + h.damage, 0) / a.length;
  assert.ok(avg(d) > avg(k) * 1.4, `평균 ${avg(d)} vs ${avg(k)}`);
  assert.ok(WEAPONS.knuckle.combo.lightMax > WEAPONS.dagger.combo.lightMax);
});

test('궁극기 확장 구조: 타입 등록, 즉시 판정 강제', () => {
  for (const id of WEAPON_ORDER) {
    const u = WEAPONS[id].ultimate;
    assert.equal(u.kind, 'ultimate');
    assert.ok(u.hits[0].from <= 1);
    assert.ok(WEAPONS[id].ultimateSpec.type);
  }
  registerUltimateType('testWave', () => attack({ id: 'u', kind: 'ultimate', duration: 30, hits: [{ from: 0, to: 10, box: { x: 0, y: 0, w: 300, h: 50 }, damage: 1, guardDamage: 0, hitstun: 1, blockstun: 0, push: 0 }] }));
  assert.equal(buildUltimate('x', { type: 'testWave' }).ultimateType, 'testWave');
  registerUltimateType('slowWindup', () => attack({ id: 'u', kind: 'ultimate', duration: 30, hits: [{ from: 10, to: 12, box: { x: 0, y: 0, w: 1, h: 1 }, damage: 1, guardDamage: 0, hitstun: 1, blockstun: 0, push: 0 }] }));
  assert.throws(() => buildUltimate('x', { type: 'slowWindup' }));
});

test('모든 무기: 적중·연결·일반 패링·완벽패링·가드 브레이크·특수강공 규칙 유지', () => {
  for (const id of WEAPON_ORDER) {
    // 적중 + 연결
    let m = setup({ distance: 60, weapons: [id, 'longsword'] });
    let [a, b] = m.fighters;
    tap(m, 0, 'light');
    until(m, () => a.attack?.connected);
    assert.ok(b.hp < b.maxHp, `${id} 약공 적중`);
    const first = a.attack;
    let chained = false;
    for (let k = 0; k < 40 && a.attack; k++) {
      m.step([I({ heavy: k % 2 === 0 }), I()]);
      if (a.attack && a.attack !== first) { chained = true; break; }
    }
    assert.ok(chained, `${id} 약→강 연결`);

    // 일반 패링
    m = setup({ distance: 60, weapons: [id, 'longsword'] });
    [a, b] = m.fighters;
    run(m, 30, I(), I({ guard: true }));
    m.step([I({ heavy: true }), I({ guard: true })]);
    const ev = run(m, WEAPONS[id].heavy.duration + 5, I(), I({ guard: true }));
    const parry = ev.find((e) => e.type === 'parry');
    assert.ok(parry, `${id} 일반 패링`);
    const firstHit = WEAPONS[id].heavy.hits[0];
    assert.equal(ev.filter((e) => e.type === 'parry').length, WEAPONS[id].heavy.hits.length);
    assert.ok(b.maxHp - b.hp <= WEAPONS[id].heavy.hits.reduce((s, h) => s + Math.round(h.damage / 2), 0));

    // 완벽패링 (강공 첫 판정 직전 가드)
    m = setup({ distance: 60, weapons: [id, 'longsword'] });
    [a, b] = m.fighters;
    tap(m, 0, 'heavy');
    run(m, firstHit.from - 3);
    const ev2 = run(m, 6, I(), I({ guard: true }));
    assert.ok(ev2.some((e) => e.type === 'perfect'), `${id} 완벽패링`);
    assert.equal(a.state, S.PARRIED);

    // 가드 브레이크 → 특수강공
    m = setup({ distance: 60, weapons: [id, 'longsword'] });
    [a, b] = m.fighters;
    run(m, 30, I(), I({ guard: true }));
    b.guard = 1; b.lastGuardUse = m.frame;
    m.step([I({ light: true }), I({ guard: true })]);
    until(m, () => b.state === S.GUARD_BREAK, I(), I({ guard: true }));
    assert.equal(b.state, S.GUARD_BREAK, `${id} 가드 브레이크`);
    until(m, () => a.state === S.IDLE);
    const hp0 = b.hp;
    tap(m, 0, 'heavy');
    assert.equal(a.state, S.SPECIAL, `${id} 특수강공 발동`);
    until(m, () => b.state === S.KNOCKBACK);
    assert.equal(hp0 - b.hp, B.special.damage, `${id} 특수강공 피해 동일`);
  }
});

test('막기만 해도 약공 콤보 하나로는 가득 찬 가드가 무너지지 않는다', () => {
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const total = w.lights.reduce((s, d) => s + d.hits.reduce((t, h) => t + h.guardDamage, 0), 0);
    assert.ok(total < BALANCE.fighter.maxGuard, `${id}: 약공 콤보 가드 피해 ${total} ≥ ${BALANCE.fighter.maxGuard}`);
  }
});

test('궁극기는 무기마다 다르다: 타입·이름·판정 수, 창이 가장 멀리 즉시 닿음', async () => {
  const { contactFrame } = await import('../src/core/attackDef.js');
  const types = new Set(WEAPON_ORDER.map((id) => WEAPONS[id].ultimate.ultimateType));
  assert.equal(types.size, WEAPON_ORDER.length);
  for (const id of WEAPON_ORDER) assert.ok(WEAPONS[id].ultimate.name, id);
  // 타수: 너클 > 단검 > 나머지
  const n = (id) => WEAPONS[id].ultimate.hits.length;
  assert.ok(n('knuckle') > n('dagger') && n('dagger') > n('longsword'));
  // 150px 에서 즉시 닿는 것은 창뿐
  for (const id of WEAPON_ORDER) assert.equal(contactFrame(WEAPONS[id].ultimate, 150) <= 2, id === 'spear', id);
  // 한 번 걸리면 끝까지: 판정 사이 경직이 다음 판정까지 이어진다
  for (const id of WEAPON_ORDER) {
    const hs = WEAPONS[id].ultimate.hits;
    for (let i = 1; i < hs.length; i++) assert.ok(hs[i - 1].from + hs[i - 1].hitstun >= hs[i].from, `${id} ${i}`);
  }
});
