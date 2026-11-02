import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/config/balance.js';
import { S } from '../src/core/fighter.js';
import { setup, run, tap, until, I } from './helpers.js';

const B = BALANCE;

test('이동: 좌우로 걸을 수 있다', () => {
  const m = setup({ distance: 400 });
  const x0 = m.fighters[0].x;
  run(m, 10, I({ right: true }));
  assert.ok(m.fighters[0].x > x0 + 30);
  run(m, 20, I({ left: true }));
  assert.ok(m.fighters[0].x < x0);
});

test('약공격 적중: 피해, 짧은 경직, 게이지 충전', () => {
  const m = setup({ distance: 90 });
  const [a, b] = m.fighters;
  tap(m, 0, 'light');
  const ev = run(m, 10);
  assert.equal(ev.filter((e) => e.type === 'hit').length, 1);
  assert.equal(b.hp, B.fighter.maxHp - a.weapon.light.hits[0].damage);
  assert.ok(a.ult > 0 && b.ult > 0, '공격/피격 양쪽 궁극기 게이지 충전');
});

test('강공격은 약공격보다 느리고 강하며 사거리가 길다', () => {
  const w = setup().fighters[0].weapon;
  const L = w.light.hits[0], H = w.heavy.hits[0];
  assert.ok(H.from > L.from);
  assert.ok(H.damage > L.damage);
  assert.ok(H.box.x + H.box.w > L.box.x + L.box.w);
});

test('중거리에서는 약공격이 헛치고 강공격이 적중한다 (빠른 공격이 항상 이기지 않음)', () => {
  const m = setup({ distance: 165 });
  const [a, b] = m.fighters;
  // P1 강공, P2 같은 프레임에 약공
  m.step([I({ heavy: true }), I({ light: true })]);
  const ev = run(m, 30);
  const hitsOnB = ev.filter((e) => e.type === 'hit' && e.defender === 1);
  const hitsOnA = ev.filter((e) => e.type === 'hit' && e.defender === 0);
  assert.equal(hitsOnA.length, 0, 'P2 약공격은 닿지 않음');
  assert.equal(hitsOnB.length, 1, 'P1 강공격 적중');
  assert.ok(b.hp < B.fighter.maxHp);
});

test('헛친 약공격은 후딜레이 중 강공격에 반격당한다', () => {
  const m = setup({ distance: 170 });
  const [a, b] = m.fighters;
  tap(m, 0, 'light'); // 닿지 않는 거리
  run(m, 6);
  // 이제 P1 이 후딜레이 중. P1 을 향해 P2 가 강공
  m.step([I(), I({ heavy: true })]);
  run(m, 20);
  assert.ok(a.hp < B.fighter.maxHp, '후딜레이를 반격당함');
});

test('약공/강공을 자유롭게 연결할 수 있다 (접촉 후 캔슬)', () => {
  for (const seq of [['light', 'heavy'], ['heavy', 'light'], ['light', 'light'], ['heavy', 'heavy']]) {
    const m = setup({ distance: 85 });
    const [a, b] = m.fighters;
    tap(m, 0, seq[0]);
    until(m, () => a.attack?.connected);
    // 연결 가능 프레임까지 다음 공격 버튼을 계속 누름(선입력)
    let started = false;
    const first = a.attack;
    for (let k = 0; k < 40 && !started; k++) {
      const i = I({ [seq[1]]: k % 2 === 0 });
      m.step([i, I()]);
      if (a.attack && a.attack !== first) started = true;
      if (!a.attack) break;
    }
    assert.ok(started, `${seq.join('→')} 연결 실패`);
  }
});

test('헛친 공격은 연결(캔슬)할 수 없다', () => {
  const m = setup({ distance: 400 });
  const a = m.fighters[0];
  tap(m, 0, 'light');
  run(m, a.weapon.light.cancelFrom);
  const def = a.attack.def;
  const f0 = a.attack.frame;
  tap(m, 0, 'heavy');
  assert.equal(a.attack.def, def);
  assert.equal(a.attack.frame, f0 + 1);
});

test('피격 시 공격/대시/이동이 즉시 끊긴다', () => {
  // 공격 중 피격
  let m = setup({ distance: 120 });
  let [a, b] = m.fighters;
  tap(m, 1, 'heavy'); // P2 느린 강공 시작
  run(m, 2);
  tap(m, 0, 'light');
  until(m, () => b.state === S.HITSTUN);
  assert.equal(b.attack, null, '공격 취소');

  // 대시 중 피격 (대시에는 무적 없음)
  m = setup({ distance: 220 });
  [a, b] = m.fighters;
  tap(m, 0, 'heavy');
  run(m, a.weapon.heavy.hits[0].from - 8); // 판정 직전에 상대가 대시로 파고듦
  m.step([I(), I({ dash: true, left: true })]);
  until(m, () => b.state !== S.DASH);
  assert.equal(b.state, S.HITSTUN);
  assert.equal(b.dash, null);
});

test('짧은 경직: 연결 공격 사이에 피격자가 가드/대시로 대응할 수 있다', () => {
  const w = setup().fighters[0].weapon;
  for (const first of ['light', 'heavy']) {
    for (const second of ['light', 'heavy']) {
      const h1 = w[first].hits.at(-1);
      const freeAt = h1.to + h1.hitstun;                 // 가장 늦은 적중 기준 피격자 행동 가능 시점
      const nextHit = w[first].cancelFrom + w[second].hits[0].from; // 가장 빠른 다음 판정
      assert.ok(nextHit - freeAt >= 2, `${first}→${second} 틈 부족 (${nextHit - freeAt})`);
    }
  }
  // 실제 시뮬레이션: 약→약 연결 사이에 가드 입력 → 두 번째 공격 패링
  const m = setup({ distance: 60 });
  const [a, b] = m.fighters;
  tap(m, 0, 'light');
  until(m, () => b.state === S.HITSTUN);
  let gotGuard = false;
  for (let k = 0; k < 30; k++) {
    const ev = m.step([I({ light: k % 2 === 0 }), I({ guard: true })]);
    if (ev.some((e) => e.type === 'parry' || e.type === 'perfect')) { gotGuard = true; break; }
  }
  assert.ok(gotGuard, '연결 사이에 가드 성공');
});

test('대시: 스태미나 소모, 재사용 제한, 스태미나 부족 시 불가', () => {
  const m = setup({ distance: 600, p1x: 300 });
  const a = m.fighters[0];
  const x0 = a.x;
  tap(m, 0, 'dash', { right: true });
  assert.equal(a.state, S.DASH);
  assert.equal(a.stamina, B.fighter.maxStamina - B.dash.cost);
  run(m, B.dash.duration);
  assert.ok(a.x - x0 > 100);
  // 쿨다운 중 재대시 불가
  tap(m, 0, 'dash', { left: true });
  assert.notEqual(a.state, S.DASH);
  // 연속 대시로 스태미나 고갈
  let dashes = 0;
  for (let k = 0; k < 400; k++) {
    const before = a.state;
    m.step([I({ dash: k % 2 === 0, left: k % 60 < 30, right: k % 60 >= 30 }), I()]);
    if (before !== S.DASH && a.state === S.DASH) dashes++;
    a.lastStaminaUse = m.frame; // 회복 차단
  }
  assert.ok(dashes <= Math.floor(B.fighter.maxStamina / B.dash.cost));
  assert.ok(a.stamina < B.dash.cost);
});

test('방향키 두 번 입력으로 대시', () => {
  const m = setup({ distance: 600, p1x: 300 });
  const a = m.fighters[0];
  m.step([I({ right: true }), I()]);
  m.step([I(), I()]);
  m.step([I({ right: true }), I()]);
  assert.equal(a.state, S.DASH);
  assert.equal(a.dash.dir, 1);
});

test('점프: 스태미나 소모, 지상 공격 회피', () => {
  const m = setup({ distance: 90 });
  const [a, b] = m.fighters;
  tap(m, 1, 'up');
  assert.equal(b.stamina, B.fighter.maxStamina - B.jump.cost);
  run(m, 10); // 상승
  tap(m, 0, 'light');
  const ev = run(m, 8);
  assert.equal(ev.filter((e) => e.defender === 1).length, 0, '공중에서 지상 약공 회피');
});

test('낙하 공격: 하강 중에만 사용, 적중, 착지 후딜레이', () => {
  const m = setup({ distance: 60 });
  const [a, b] = m.fighters;
  tap(m, 0, 'up');
  tap(m, 0, 'light'); // 상승 중 → 낙하 공격 불가
  assert.equal(a.state, S.JUMP);
  until(m, () => a.vy < 0);
  const ev = tap(m, 0, 'heavy');
  assert.equal(a.state, S.PLUNGE);
  ev.push(...until(m, () => a.state === S.LANDING));
  assert.ok(ev.some((e) => e.type === 'hit' && e.attacker === 0));
  assert.ok(a.timer >= a.weapon.plunge.landingLag - 1);
});

test('일반 패링: 피해 50%, 가드 게이지 소모, 공격권 유지', () => {
  const m = setup({ distance: 85 });
  const [a, b] = m.fighters;
  m.step([I(), I({ guard: true })]);
  run(m, 30, I(), I({ guard: true })); // 미리 오래 누르고 있음 → 완벽 타이밍 아님
  const guard0 = b.guard;
  m.step([I({ light: true }), I({ guard: true })]);
  const ev = run(m, 10, I(), I({ guard: true }));
  assert.ok(ev.some((e) => e.type === 'parry'));
  const L = a.weapon.light.hits[0];
  assert.equal(b.hp, B.fighter.maxHp - Math.round(L.damage * 0.5));
  assert.equal(b.guard, guard0 - L.guardDamage);
  assert.equal(a.attack.connected, true, '공격자는 연결 가능 (공격권 유지)');
  assert.notEqual(a.state, S.PARRIED);
});

test('가드 버튼 유지만으로는 가드 게이지가 줄지 않는다', () => {
  const m = setup({ distance: 300 });
  const b = m.fighters[1];
  run(m, 200, I(), I({ guard: true }));
  assert.equal(b.guard, B.fighter.maxGuard);
});

test('완벽패링: 극소 피해, 공격 끊김, 반격 기회', () => {
  const m = setup({ distance: 85 });
  const [a, b] = m.fighters;
  tap(m, 0, 'heavy');
  const H = a.weapon.heavy.hits[0];
  // 판정 직전에 가드 입력
  run(m, H.from - 3);
  const ev = run(m, 6, I(), I({ guard: true }));
  assert.ok(ev.some((e) => e.type === 'perfect'));
  assert.equal(b.hp, B.fighter.maxHp - Math.round(B.fighter.maxHp / 50));
  assert.equal(a.state, S.PARRIED);
  assert.equal(a.attack, null);
  assert.ok(b.guard < B.fighter.maxGuard, '가드 게이지 소모');
  // 반격: 약공격이 공격자 경직 중에 적중
  m.step([I(), I({ light: true })]);
  const ev2 = run(m, 10);
  assert.ok(ev2.some((e) => e.type === 'hit' && e.attacker === 1));
});

test('완벽패링 연타 방지: 가드를 계속 연타하면 완벽패링이 되지 않는다', () => {
  const m = setup({ distance: 85 });
  const [a] = m.fighters;
  tap(m, 0, 'heavy');
  const evs = [];
  for (let k = 0; k < 25; k++) evs.push(...m.step([I(), I({ guard: k % 4 < 2 })]));
  assert.ok(!evs.some((e) => e.type === 'perfect'));
});

test('가드 브레이크 → 특수강공 → 중립 거리 재대치, 가드 게이지 완전 회복', () => {
  const m = setup({ distance: 85 });
  const [a, b] = m.fighters;
  m.step([I(), I({ guard: true })]);
  run(m, 30, I(), I({ guard: true }));
  b.guard = 5;
  b.lastGuardUse = m.frame; // 회복 지연
  m.step([I({ heavy: true }), I({ guard: true })]);
  until(m, () => b.state === S.GUARD_BREAK, I(), I({ guard: true }));
  assert.equal(b.state, S.GUARD_BREAK);
  // 기절 중에는 모든 행동 불가
  m.step([I(), I({ light: true, dash: true, left: true })]);
  assert.equal(b.state, S.GUARD_BREAK);
  run(m, 2);
  until(m, () => a.state !== S.ATTACK);
  // 강공 버튼 → 특수강공
  tap(m, 0, 'heavy');
  assert.equal(a.state, S.SPECIAL);
  const ev = until(m, () => b.state === S.KNOCKBACK);
  assert.ok(ev.some((e) => e.type === 'special'));
  const hpAfter = b.hp;
  until(m, () => b.state === S.IDLE && !b.slide && !a.slide && a.state !== S.SPECIAL);
  assert.ok(Math.abs(Math.abs(b.x - a.x) - B.special.neutralDistance) < 2, '중립 거리');
  assert.equal(b.guard, B.fighter.maxGuard);
  assert.ok(B.fighter.maxHp - hpAfter >= B.special.damage);
});

test('특수강공 피해는 고정값이며 벽 근처에서도 중립 거리를 만든다', () => {
  const m = setup({ distance: 85, p1x: 1050 });
  const [a, b] = m.fighters;
  m.step([I(), I({ guard: true })]);
  run(m, 25, I(), I({ guard: true }));
  b.guard = 1;
  b.lastGuardUse = m.frame;
  m.step([I({ light: true }), I({ guard: true })]);
  until(m, () => b.state === S.GUARD_BREAK, I(), I({ guard: true }));
  until(m, () => a.state === S.IDLE);
  const hp0 = b.hp;
  tap(m, 0, 'heavy');
  until(m, () => b.state === S.KNOCKBACK);
  assert.equal(hp0 - b.hp, B.special.damage);
  until(m, () => b.state === S.IDLE && !a.slide && a.state === S.IDLE);
  assert.ok(Math.abs(Math.abs(b.x - a.x) - B.special.neutralDistance) < 2);
});

test('가드 게이지 자동 회복: 마지막 패링 후 일정 시간 뒤 (가드 유지 여부 무관)', () => {
  for (const hold of [true, false]) {
    const m = setup({ distance: 85 });
    const [a, b] = m.fighters;
    m.step([I(), I({ guard: true })]);
    run(m, 30, I(), I({ guard: true }));
    m.step([I({ heavy: true }), I({ guard: true })]);
    until(m, () => b.state === S.BLOCKSTUN, I(), I({ guard: true }));
    const g = b.guard;
    run(m, B.guard.regenDelay - 5, I(), I({ guard: hold }));
    assert.equal(b.guard, g, '지연 시간 동안 회복 없음');
    run(m, 40, I(), I({ guard: hold }));
    assert.ok(b.guard > g, '지연 후 회복');
  }
});

test('궁극기: 100%에서만 발동, 즉시 0% 초기화, 일반 공격에 취소되지 않음', () => {
  const m = setup({ distance: 200 });
  const [a, b] = m.fighters;
  tap(m, 0, 'ult');
  assert.notEqual(a.state, S.ULTIMATE, '게이지 부족');
  run(m, 10);
  a.ult = 100;
  b.x = a.x + 110;
  tap(m, 1, 'light');
  run(m, b.weapon.light.hits[0].from - 1);
  const ev = tap(m, 0, 'ult'); // P2 약공 판정 프레임에 궁극기 시전
  assert.equal(a.state, S.ULTIMATE, '즉시 시전');
  assert.equal(a.ult, B.ultGain.takeHit, '0%로 초기화 후 같은 프레임 피격분만 충전');
  ev.push(...run(m, 20));
  assert.ok(ev.some((e) => e.type === 'armored' && e.defender === 0), '맞아도 피해만');
  assert.ok(ev.some((e) => e.type === 'hit' && e.attacker === 0 && e.kind === 'ultimate'));
});

test('궁극기는 일반 패링으로 막을 수 없다', () => {
  const m = setup({ distance: 150 });
  const [a, b] = m.fighters;
  m.step([I(), I({ guard: true })]);
  run(m, 30, I(), I({ guard: true }));
  a.ult = 100;
  m.step([I({ ult: true }), I({ guard: true })]);
  const ev = run(m, 25, I(), I({ guard: true }));
  assert.ok(ev.some((e) => e.type === 'hit' && e.kind === 'ultimate'));
  assert.equal(b.hp, B.fighter.maxHp - a.weapon.ultimate.hits[0].damage);
});

test('궁극기 완벽패링: 궁극기 끊김, 극소 피해, 게이지 반환 없음', () => {
  const m = setup({ distance: 150 });
  const [a, b] = m.fighters;
  a.ult = 100;
  m.step([I({ ult: true }), I({ guard: true })]); // 같은 순간 가드 입력
  const ev = run(m, 10, I(), I({ guard: true }));
  assert.ok(ev.some((e) => e.type === 'perfect' && e.kind === 'ultimate'));
  assert.equal(a.state, S.PARRIED);
  assert.equal(b.hp, B.fighter.maxHp - Math.round(B.fighter.maxHp / 50));
  assert.equal(a.ult, B.ultGain.perfectParried);
});

test('가드/패링 시에도 궁극기 게이지가 충전된다', () => {
  const m = setup({ distance: 85 });
  const [a, b] = m.fighters;
  m.step([I(), I({ guard: true })]);
  run(m, 30, I(), I({ guard: true }));
  m.step([I({ light: true }), I({ guard: true })]);
  run(m, 10, I(), I({ guard: true }));
  assert.ok(b.ult > 0);
});

test('동시 공격은 상쇄(양쪽 피격)된다 – 처리 순서 불공정 없음', () => {
  const m = setup({ distance: 90 });
  const [a, b] = m.fighters;
  m.step([I({ light: true }), I({ light: true })]);
  run(m, 10);
  assert.equal(a.hp, b.hp);
  assert.ok(a.hp < B.fighter.maxHp);
});

test('KO 및 시간 종료 판정', () => {
  let m = setup({ distance: 85 });
  m.fighters[1].hp = 10;
  tap(m, 0, 'light');
  run(m, 120);
  assert.equal(m.over, true);
  assert.equal(m.winner, 0);
  assert.equal(m.endReason, 'ko');

  m = setup({ distance: 400 });
  m.timeLeft = 5;
  m.fighters[0].hp = 500;
  run(m, 10);
  assert.equal(m.over, true);
  assert.equal(m.winner, 1);
  assert.equal(m.endReason, 'time');
});
