import { Match } from '../src/core/match.js';
import { EMPTY_INPUT } from '../src/core/fighter.js';

export const I = (o = {}) => ({ ...EMPTY_INPUT, ...o });

/** 두 플레이어를 지정 거리로 배치한 매치 */
export function setup({ distance = 100, weapons, p1x = 600 } = {}) {
  const m = new Match({ weapons });
  const [a, b] = m.fighters;
  a.x = p1x; b.x = p1x + distance;
  a.facing = 1; b.facing = -1;
  return m;
}

/** n 프레임 동안 같은 입력 유지. 이벤트 누적 반환 */
export function run(m, n, i1 = I(), i2 = I()) {
  const ev = [];
  for (let k = 0; k < n; k++) ev.push(...m.step([i1, i2]));
  return ev;
}

/** 한 프레임 눌렀다 떼기 */
export function tap(m, p, key, extra = {}) {
  const i = I({ ...extra, [key]: true });
  return m.step(p === 0 ? [i, I()] : [I(), i]);
}

/** 조건이 참이 될 때까지 진행 (최대 max 프레임) */
export function until(m, cond, i1 = I(), i2 = I(), max = 300) {
  const ev = [];
  for (let k = 0; k < max && !cond(m); k++) ev.push(...m.step([i1, i2]));
  return ev;
}
