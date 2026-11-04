import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/config/balance.js';
import { KNOBS, WEAPONS, WEAPON_ORDER, buildWeapon } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';
import { setup, run, I } from './helpers.js';

test('밸런스 변수 표가 7종 모두에 있고 범위 안이다', () => {
  for (const id of WEAPON_ORDER) {
    const k = KNOBS[id];
    for (const key of ['reach', 'damage', 'speed', 'hp', 'guardTaken']) assert.ok(k[key] > 0.7 && k[key] < 1.7, `${id}.${key}=${k[key]}`);
    assert.equal(WEAPONS[id].lights.length, k.combo.lightMax);
    assert.equal(WEAPONS[id].heavies.length, k.combo.heavyMax);
  }
});

test('리치·데미지·공격속도 배율이 공격 데이터에 반영된다', () => {
  const base = { ...KNOBS.longsword, reach: 1, damage: 1, speed: 1 };
  const a = buildWeapon('longsword', base);
  const b = buildWeapon('longsword', { ...base, reach: 1.1, damage: 1.2, speed: 1.3 });
  // 리치 배율은 이제 약공·강공에 쓰지 않는다 — 판정이 그려지는 무기 모양이라 무기 그림·모션이 사거리를 정함
  assert.equal(reachOf(b.light), reachOf(a.light));
  assert.equal(b.light.hits[0].damage, Math.round(a.light.hits[0].damage * 1.2));
  assert.ok(b.light.duration > a.light.duration && b.light.hits[0].from >= a.light.hits[0].from);
});

test('콤보 횟수 변수: 단계 수가 늘거나 줄어도 마무리 동작은 항상 마지막', () => {
  const k = KNOBS.greatsword;
  const more = buildWeapon('greatsword', { ...k, combo: { ...k.combo, lightMax: 4 } });
  assert.equal(more.lights.length, 4);
  assert.equal(more.lights.at(-1).name, WEAPONS.greatsword.lights.at(-1).name);
  const less = buildWeapon('dagger', { ...KNOBS.dagger, combo: { ...KNOBS.dagger.combo, lightMax: 2 } });
  assert.deepEqual(less.lights.map((d) => d.name), [WEAPONS.dagger.lights[0].name, WEAPONS.dagger.lights.at(-1).name]);
});

test('체력 배율: 무기별 최대 체력', () => {
  const m = setup({ weapons: ['knuckle', 'longsword'] });
  assert.equal(m.fighters[0].maxHp, Math.round(BALANCE.fighter.maxHp * KNOBS.knuckle.hp));
  assert.equal(m.fighters[0].hp, m.fighters[0].maxHp);
  assert.equal(m.fighters[1].maxHp, Math.round(BALANCE.fighter.maxHp * KNOBS.longsword.hp));
});

test('가드 감소량 배율: 같은 공격을 막아도 무기에 따라 가드 게이지가 다르게 준다', () => {
  const loss = (def) => {
    const m = setup({ distance: 60, weapons: ['axe', def] });
    const b = m.fighters[1];
    run(m, 30, I(), I({ guard: true }));
    const g0 = b.guard;
    m.step([I({ light: true }), I({ guard: true })]);
    run(m, 20, I(), I({ guard: true }));
    return g0 - b.guard;
  };
  const base = WEAPONS.axe.light.hits[0].guardDamage;
  assert.ok(Math.abs(loss('longsword') - base * KNOBS.longsword.guardTaken) < 0.01);
  assert.ok(Math.abs(loss('knuckle') - base * KNOBS.knuckle.guardTaken) < 0.01);
});

test('시간 종료 판정은 남은 체력 비율로 한다', () => {
  const m = setup({ distance: 400, weapons: ['knuckle', 'longsword'] });
  const [a, b] = m.fighters;
  a.hp = a.maxHp * 0.5 + 10; // 절대값은 더 많지만
  b.hp = b.maxHp * 0.6;      // 비율은 b 가 높음
  m.timeLeft = 2;
  run(m, 5);
  assert.equal(m.winner, 1);
});
