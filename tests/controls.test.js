import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROLS, DEFAULT_CONTROLS, ACTIONS, assignKey, resetControls, findKey, isDefaultControls, keyLabel } from '../src/config/controls.js';

test('키 바인딩: 지정 · 이미 쓰는 키는 서로 바꿈 · 메뉴 키 금지 · 기본값', () => {
  resetControls();
  assert.ok(isDefaultControls());
  // 빈 키 지정
  assert.ok(assignKey(0, 'light', 'KeyU').ok);
  assert.deepEqual(CONTROLS[0].light, ['KeyU']);
  // P1 강공(K)으로 바꾸면 강공은 내 이전 키(U)를 받음
  const r = assignKey(0, 'light', 'KeyK');
  assert.deepEqual(r.swapped, [0, 'heavy']);
  assert.deepEqual(CONTROLS[0].light, ['KeyK']);
  assert.deepEqual(CONTROLS[0].heavy, ['KeyU']);
  // 다른 플레이어의 대체키를 가져오면 그쪽 대표키는 남는다
  assignKey(0, 'dash', 'Comma');
  assert.deepEqual(CONTROLS[1].light, ['Numpad1']);
  // 메뉴용 키는 지정 불가
  assert.equal(assignKey(0, 'ult', 'Escape').ok, false);
  // 어떤 키도 두 동작에 겹치지 않는다
  const all = [0, 1].flatMap((p) => ACTIONS.flatMap((a) => CONTROLS[p][a]));
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(findKey('KeyK'), [0, 'light']);
  assert.ok(!isDefaultControls());
  resetControls();
  assert.ok(isDefaultControls());
  assert.deepEqual(CONTROLS[0].light, [...DEFAULT_CONTROLS[0].light]);
});

test('키 이름 표시', () => {
  assert.equal(keyLabel('KeyQ'), 'Q');
  assert.equal(keyLabel('Digit7'), '7');
  assert.equal(keyLabel('Numpad3'), 'Num3');
  assert.equal(keyLabel('ArrowLeft'), 'LEFT');
  assert.equal(keyLabel('ShiftLeft'), 'SHIFT');
});
