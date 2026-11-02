// =============================================================================
// 무기별 콤보 상한 / 콤보 종료 딜레이
// -----------------------------------------------------------------------------
// - 무기마다 약공 최대 연속 횟수(lightMax), 강공 최대 연속 횟수(heavyMax),
//   약·강 혼합 시 전체 최대 횟수(maxTotal)를 가진다.
// - 약공을 누를 때마다 무기의 약공 콤보 순서(lights[0], lights[1], ...)가 진행된다.
//   (예: 대검 약공 = 좌상단 베기 → 우상단 베기, 2콤보)
// - 한 종류를 끝까지 쓰거나(전체 상한 포함) 콤보가 끝나면 "숨 고르기" 딜레이가 생긴다.
//     · 한 종류만 연타했다면 fullLag (길다)
//     · 약·강을 섞었다면 mixedLag (짧다)
//   딜레이 동안 약/강공격은 불가(가드·이동·대시·점프·궁극기·특수강공은 가능).
// - 콤보가 끝난 뒤 window 프레임 안에 다시 공격하면 같은 콤보로 계속 센다.
//   → "콤보 → 잠깐 빠졌다 → 다시 콤보" 식의 무한 연타 압박이 불가능하다.
// - 피격/완벽패링 등으로 공격이 끊기면 콤보 카운트는 초기화된다 (딜레이 없음).
// =============================================================================

import { BALANCE } from '../config/balance.js';

export function createComboState() {
  return { light: 0, heavy: 0, total: 0, lastEnd: -9999, lock: 0, lockMax: 0, lastType: null };
}

function spec(f) { return f.weapon.combo; }

function continuing(f, frame, chaining) {
  const c = f.combo;
  return chaining || (c.total > 0 && frame - c.lastEnd <= BALANCE.combo.window);
}

/** 해당 종류의 공격을 지금 시작할 수 있는지 (상태 변경 없음, AI 판단에도 사용) */
export function comboAllows(f, type, frame, chaining = false) {
  const c = f.combo;
  if (c.lock > 0) return false;
  if (!continuing(f, frame, chaining)) return true;
  const s = spec(f);
  const max = type === 'light' ? s.lightMax : s.heavyMax;
  return c[type] < max && c.total < s.maxTotal;
}

/** 콤보 카운트를 진행하고 이번에 사용할 공격 정의를 돌려준다 (불가하면 null) */
export function takeComboAttack(f, type, frame, chaining = false) {
  if (!comboAllows(f, type, frame, chaining)) return null;
  const c = f.combo;
  if (!continuing(f, frame, chaining)) { c.light = 0; c.heavy = 0; c.total = 0; }
  const list = type === 'light' ? f.weapon.lights : f.weapon.heavies;
  const def = list[Math.min(c[type], list.length - 1)];
  c[type]++;
  c.total++;
  c.lastType = type;
  return def;
}

/** 콤보가 이어질 수 없는 상태인가 (마지막 종류 상한 또는 전체 상한 도달) */
export function comboFinished(f) {
  const c = f.combo;
  const s = spec(f);
  if (c.total >= s.maxTotal) return true;
  if (c.lastType === 'light' && c.light >= s.lightMax) return true;
  if (c.lastType === 'heavy' && c.heavy >= s.heavyMax) return true;
  return false;
}

/** 약/강공격이 연결 없이 끝났을 때 */
export function onAttackEnd(f, frame) {
  const c = f.combo;
  c.lastEnd = frame;
  if (comboFinished(f)) {
    const s = spec(f);
    const mixed = c.light > 0 && c.heavy > 0;
    c.lock = c.lockMax = mixed ? s.mixedLag : s.fullLag;
    c.light = 0; c.heavy = 0; c.total = 0; c.lastType = null;
  }
}

/** 피격 등으로 끊김: 카운트만 초기화 */
export function resetCombo(f) {
  const c = f.combo;
  c.light = 0; c.heavy = 0; c.total = 0; c.lastType = null;
}

export function tickCombo(f, frame, attacking) {
  const c = f.combo;
  if (c.lock > 0) c.lock--;
  if (!attacking && c.total > 0 && frame - c.lastEnd > BALANCE.combo.window) resetCombo(f);
}
