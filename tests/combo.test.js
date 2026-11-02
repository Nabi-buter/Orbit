import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/config/balance.js';
import { WEAPONS, WEAPON_ORDER } from '../src/config/weapons.js';
import { S } from '../src/core/fighter.js';
import { setup, run, I } from './helpers.js';

/** 상대가 가드만 하는 상태에서 key 를 계속 연타. 시작된 공격 이름 목록과 마지막 잠금 반환 */
function mash(id, keys, frames = 200, distance = 55) {
  const m = setup({ distance, weapons: [id, 'longsword'] });
  const a = m.fighters[0];
  run(m, 30, I(), I({ guard: true })); // 미리 가드 (완벽패링 방지)
  const names = [];
  let last = null, lockSeen = 0;
  for (let k = 0; k < frames; k++) {
    const key = typeof keys === 'function' ? keys(names.length) : keys;
    m.step([I({ [key]: k % 2 === 0 }), I({ guard: true })]);
    m.fighters[1].x = a.x + distance; // 거리 고정 (넉백 무시)
    if (a.attack && a.attack !== last && (a.attack.def.kind === 'light' || a.attack.def.kind === 'heavy')) names.push(a.attack.def.name);
    last = a.attack;
    if (a.combo.lock > 0 && !lockSeen) lockSeen = a.combo.lockMax;
    if (lockSeen && names.length) break;
  }
  return { names, lock: lockSeen, m };
}

test('대검 약공 연타: 좌상단 베기 → 우상단 베기 (2콤보) 후 숨 고르기', () => {
  const { names, lock } = mash('greatsword', 'light');
  assert.deepEqual(names, ['좌상단 베기', '우상단 베기']);
  assert.equal(lock, WEAPONS.greatsword.combo.fullLag);
});

test('무기별 약공 연타 상한: 대검 2, 단검 3, 너클 5 ...', () => {
  for (const id of WEAPON_ORDER) {
    const { names, lock } = mash(id, 'light', 400);
    assert.equal(names.length, WEAPONS[id].combo.lightMax, `${id}: ${names.join('→')}`);
    assert.equal(lock, WEAPONS[id].combo.fullLag, `${id} 딜레이`);
  }
  assert.equal(WEAPONS.greatsword.combo.lightMax, 2);
  assert.equal(WEAPONS.dagger.combo.lightMax, 3);
  assert.equal(WEAPONS.knuckle.combo.lightMax, 5);
});

test('강공 연타 상한과 딜레이', () => {
  for (const id of WEAPON_ORDER) {
    const { names, lock } = mash(id, 'heavy', 400);
    assert.equal(names.length, WEAPONS[id].combo.heavyMax, id);
    assert.equal(lock, WEAPONS[id].combo.fullLag);
  }
});

test('약·강을 섞으면 더 길게 이어지고 딜레이가 짧다', () => {
  for (const id of WEAPON_ORDER) {
    const c = WEAPONS[id].combo;
    // 약공을 상한-1 번, 그 뒤 강공, 다시 약공... 전체 상한까지
    const plan = (n) => (n < c.lightMax - 1 ? 'light' : n % 2 === 0 ? 'heavy' : 'light');
    const { names, lock } = mash(id, plan, 500);
    assert.ok(names.length > Math.min(c.lightMax, c.heavyMax) || names.length === c.maxTotal, `${id}: ${names.join('→')}`);
    assert.ok(names.length <= c.maxTotal);
    assert.ok(c.mixedLag < c.fullLag);
    if (names.length === c.maxTotal) assert.equal(lock, c.mixedLag, id);
  }
});

test('숨 고르기 동안 공격은 불가하지만 가드·이동·대시는 가능하다', () => {
  const { m } = mash('greatsword', 'light');
  const a = m.fighters[0];
  assert.ok(a.combo.lock > 0);
  until0(m);
  m.step([I({ light: true }), I()]);
  assert.notEqual(a.state, S.ATTACK, '공격 불가');
  m.step([I({ guard: true }), I()]);
  assert.equal(a.state, S.GUARD, '가드 가능');
  m.step([I(), I()]);
  m.step([I({ dash: true, left: true }), I()]);
  assert.equal(a.state, S.DASH, '대시 가능');
  // 딜레이 종료 후 새 콤보
  run(m, 80);
  m.step([I({ light: true }), I()]);
  assert.equal(a.state, S.ATTACK);
  assert.equal(a.attack.def.name, WEAPONS.greatsword.lights[0].name);
});
function until0(m) { const a = m.fighters[0]; for (let k = 0; k < 60 && a.state !== S.IDLE; k++) m.step([I(), I()]); }

test('콤보 후 잠깐 빠졌다 다시 몰아쳐도 같은 콤보로 계산된다 (빠졌다-몰아치기 연타 불가)', () => {
  const m = setup({ distance: 400, weapons: ['dagger', 'longsword'] });
  const a = m.fighters[0];
  const w = WEAPONS.dagger;
  let attacks = 0;
  let last = null;
  // 약공 1번 → 끝나면 바로 다시 (헛치는 거리라 연결 아님), window 안에서 반복
  for (let k = 0; k < 300 && a.combo.lock === 0; k++) {
    m.step([I({ light: a.state === S.IDLE }), I()]);
    if (a.attack && a.attack !== last) attacks++;
    last = a.attack;
  }
  assert.equal(attacks, w.combo.lightMax);
  assert.ok(a.combo.lock > 0, '상한 도달 → 딜레이');
});

test('window 보다 오래 쉬면 콤보가 초기화된다 (딜레이 없음)', () => {
  const m = setup({ distance: 400, weapons: ['greatsword', 'longsword'] });
  const a = m.fighters[0];
  m.step([I({ light: true }), I()]);
  run(m, a.weapon.light.duration + BALANCE.combo.window + 2);
  assert.equal(a.combo.total, 0);
  assert.equal(a.combo.lock, 0);
  m.step([I({ light: true }), I()]);
  assert.equal(a.attack.def.name, '좌상단 베기');
});

test('피격되면 콤보 카운트가 초기화된다', () => {
  const m = setup({ distance: 90, weapons: ['greatsword', 'dagger'] });
  const [a, b] = m.fighters;
  m.step([I({ light: true }), I()]);
  run(m, 2);
  m.step([I(), I({ light: true })]); // 단검 약공이 먼저 맞음
  run(m, 6);
  assert.equal(a.state, S.HITSTUN);
  assert.equal(a.combo.total, 0);
  assert.equal(a.combo.lock, 0);
});

test('특수강공과 궁극기는 숨 고르기 중에도 사용 가능', () => {
  const { m } = mash('greatsword', 'light');
  const [a, b] = m.fighters;
  until0(m);
  assert.ok(a.combo.lock > 0);
  a.ult = 100;
  m.step([I({ ult: true }), I()]);
  assert.equal(a.state, S.ULTIMATE);
});

test('공격 중 미리 누른 다음 공격은 예약되어 연결 시점에 나간다 (한 번만 눌러도)', () => {
  for (const id of WEAPON_ORDER) {
    const m = setup({ distance: 55, weapons: [id, 'longsword'] });
    const a = m.fighters[0];
    run(m, 30, I(), I({ guard: true }));
    m.step([I({ light: true }), I({ guard: true })]);
    const first = a.attack;
    run(m, 2, I(), I({ guard: true }));
    m.step([I({ light: true }), I({ guard: true })]); // 연결 시점보다 훨씬 이른 1회 입력
    let chained = false;
    for (let k = 0; k < 80 && a.attack; k++) {
      m.step([I(), I({ guard: true })]);
      if (a.attack && a.attack !== first) { chained = true; break; }
    }
    assert.ok(chained, `${id}: 예약 입력으로 2단계 연결`);
    assert.equal(a.attack.def.name, WEAPONS[id].lights[1].name);
  }
});

test('헛쳐도 콤보 문자열은 이어지지만 맞혔을 때보다 늦다', () => {
  const m = setup({ distance: 500, weapons: ['longsword', 'longsword'] });
  const a = m.fighters[0];
  m.step([I({ light: true }), I()]);
  const first = a.attack;
  let chainedAt = null;
  for (let k = 0; k < 60; k++) {
    m.step([I({ light: k % 2 === 0 }), I()]);
    if (a.attack && a.attack !== first) { chainedAt = first.frame; break; }
  }
  assert.ok(chainedAt != null, '헛친 뒤 2단계 연결');
  assert.ok(chainedAt >= first.def.cancelFrom + BALANCE.combo.whiffDelay - 1, `연결 시점 ${chainedAt}`);
  assert.equal(a.attack.def.name, WEAPONS.longsword.lights[1].name);
});
