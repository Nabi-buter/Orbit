import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/config/balance.js';
import { S } from '../src/core/fighter.js';
import { setup, run, I } from './helpers.js';

const P = BALANCE.guard.parry;

/** 실제로 닿는 프레임 (판정이 무기 모양이라 판정 첫 프레임보다 늦을 수 있다) */
function contactAt() {
  const m = setup({ distance: 60, weapons: ['longsword', 'longsword'] }); // 공격자 무기 속도와 무관하게 연속 시도 간격(chainFrames) 안에 들도록 빠른 강공
  m.step([I({ heavy: true }), I()]);
  for (let k = 1; k < 120; k++) if (m.step([I(), I()]).some((e) => e.type === 'hit')) return k;
  throw new Error('강공이 닿지 않음');
}

/** 공격이 닿기 n 프레임 전에 가드를 눌렀을 때 결과 */
function parryAt(lead, { presses = [], hold = true } = {}) {
  const hitAt = contactAt();
  const m = setup({ distance: 60, weapons: ['longsword', 'longsword'] }); // 공격자 무기 속도와 무관하게 연속 시도 간격(chainFrames) 안에 들도록 빠른 강공
  const [a, b] = m.fighters;
  // 이전 시도들 (연속 시도 단계 올리기): 각각 짧게 눌렀다 뗌
  for (const gap of presses) { m.step([I(), I({ guard: true })]); run(m, gap); }
  m.step([I({ heavy: true }), I()]);
  let ev = [];
  for (let k = 1; k <= hitAt + 2; k++) {
    const g = k >= hitAt - lead && (hold || k === hitAt - lead);
    ev = ev.concat(m.step([I(), I({ guard: g })]));
  }
  return { ev, a, b, m };
}

test('첫 패링: 판정 14프레임', () => {
  assert.ok(parryAt(P.window[0] - 1).ev.some((e) => e.type === 'perfect'), '13프레임 전 입력 → 완벽패링');
  assert.ok(!parryAt(P.window[0] + 2).ev.some((e) => e.type === 'perfect'), '16프레임 전 입력 → 일반 막기');
});

test('연속 시도할수록 판정이 짧아진다 (14 → 10 → 8)', () => {
  // 직전 두 번 시도(헛패링 경직이 끝난 뒤) → 3단계: 판정 8
  const pre = [P.recovery[0] + 2, P.recovery[1] + 2];
  assert.ok(parryAt(P.window[2] - 2, { presses: pre }).ev.some((e) => e.type === 'perfect'), '3단계 판정 안');
  assert.ok(!parryAt(P.window[2] + 2, { presses: pre }).ev.some((e) => e.type === 'perfect'), '3단계 판정 밖');
});

test('헛패링(버튼을 떼면): 단계별 경직 6 → 12 → 18 동안 가드·공격 불가', () => {
  const m = setup({ distance: 400 });
  const b = m.fighters[1];
  for (const expect of P.recovery) {
    m.step([I(), I({ guard: true })]);
    run(m, P.window[Math.min(P.recovery.indexOf(expect), 2)] + 1);
    assert.equal(b.parry.lockMax, expect);
    // 경직 중에는 가드도 공격도 안 됨
    m.step([I(), I({ guard: true, light: true })]);
    assert.notEqual(b.state, S.GUARD);
    assert.notEqual(b.state, S.ATTACK);
    b.buffer = null; // 경직 중 눌렀던 약공 선입력은 지움 (풀린 뒤 나가는 것은 정상 동작)
    run(m, expect);
  }
});

test('버튼을 계속 누르면 패널티 없이 막기로 넘어간다', () => {
  const m = setup({ distance: 400 });
  const b = m.fighters[1];
  run(m, 40, I(), I({ guard: true }));
  assert.equal(b.parry.lock, 0);
  assert.equal(b.state, S.GUARD);
});

test('완벽패링 성공: 공격자 자세(가드) 게이지 감소, 단계 초기화', () => {
  const { a, b } = parryAt(5);
  assert.ok(a.guard <= BALANCE.fighter.maxGuard - BALANCE.guard.parryPostureDamage + 0.01);
  assert.equal(b.parry.tier, -1);
});

test('자세 게이지가 바닥인 공격자를 완벽패링하면 가드 브레이크', () => {
  const m = setup({ distance: 60, weapons: ['longsword', 'longsword'] }); // 공격자 무기 속도와 무관하게 연속 시도 간격(chainFrames) 안에 들도록 빠른 강공
  const [a] = m.fighters;
  m.step([I({ heavy: true }), I()]);
  a.guard = 5; a.lastGuardUse = m.frame;
  const hitAt = contactAt();
  for (let k = 1; k <= hitAt + 1; k++) m.step([I(), I({ guard: k >= hitAt - 4 })]);
  assert.equal(a.state, S.GUARD_BREAK);
});
