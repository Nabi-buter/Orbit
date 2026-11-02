// 밸런스 평가 공통: 난이도 교차(쉬움/보통/어려움 × 양쪽) + 시작 거리 무작위로 다양한 상황을 섞는다
import { Match } from '../src/core/match.js';
import { AIController } from '../src/ai/ai.js';
import { STAGE } from '../src/config/balance.js';

export const DIFF_PAIRS = [];
for (const a of ['easy', 'normal', 'hard']) for (const b of ['easy', 'normal', 'hard']) DIFF_PAIRS.push([a, b]);

/** 한 판: 결과 1(왼쪽 승) / 0.5 / 0 */
export function playOne(wa, wb, da, db, seed) {
  const m = new Match({ weapons: [wa, wb] });
  // 시작 거리 무작위 (240~480px)
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const dist = 240 + rnd() * 240;
  const cx = STAGE.width / 2 + (rnd() - 0.5) * 200;
  m.fighters[0].x = cx - dist / 2; m.fighters[1].x = cx + dist / 2;
  const ai = [new AIController(da, seed * 2 + 1), new AIController(db, seed * 2 + 2)];
  while (!m.over) m.step([ai[0].think(m, 0), ai[1].think(m, 1)]);
  return m.winner === 'draw' ? 0.5 : m.winner === 0 ? 1 : 0;
}

/** 무기별 승률 + 상성표. n = 조합·난이도쌍당 판수 */
export function evaluateAll(weapons, n, seedBase = 1) {
  const score = Object.fromEntries(weapons.map((w) => [w, { w: 0, n: 0 }]));
  const pair = {};
  let seed = seedBase;
  for (let i = 0; i < weapons.length; i++) for (let j = i + 1; j < weapons.length; j++) {
    const a = weapons[i], b = weapons[j];
    let aw = 0, cnt = 0;
    for (const [da, db] of DIFF_PAIRS) for (let k = 0; k < n; k++) {
      const swap = k % 2 === 1;
      const r = swap ? 1 - playOne(b, a, da, db, seed++) : playOne(a, b, da, db, seed++);
      aw += r; cnt++;
    }
    score[a].w += aw; score[a].n += cnt; score[b].w += cnt - aw; score[b].n += cnt;
    pair[`${a}|${b}`] = aw / cnt; pair[`${b}|${a}`] = 1 - aw / cnt;
  }
  return { rates: Object.fromEntries(weapons.map((w) => [w, score[w].w / score[w].n])), pair };
}
