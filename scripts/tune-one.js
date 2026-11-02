// 무기 하나의 후보 변수 세트를 큰 표본으로 비교: node scripts/tune-one.js <무기> <판수> '<JSON 후보 배열>'
import { Match } from '../src/core/match.js';
import { AIController } from '../src/ai/ai.js';
import { WEAPON_ORDER, WEAPONS, KNOBS, applyKnobs } from '../src/config/weapons.js';

const id = process.argv[2];
const N = Number(process.argv[3] || 40);
const cands = JSON.parse(process.argv[4] || '[{}]');
const base = JSON.parse(JSON.stringify(KNOBS[id]));
for (const c of cands) {
  const kn = { ...base, ...c, combo: { ...base.combo, ...(c.combo ?? {}) } };
  applyKnobs(id, kn);
  let w = 0, n = 0, seed = 5000;
  const per = {};
  for (const d of ['normal', 'hard']) for (const o of WEAPON_ORDER) {
    if (o === id) continue;
    for (let i = 0; i < N; i++) {
      const swap = i % 2 === 1;
      const m = new Match({ weapons: swap ? [o, id] : [id, o] });
      const ai = [new AIController(d, seed++), new AIController(d, seed++)];
      while (!m.over) m.step([ai[0].think(m, 0), ai[1].think(m, 1)]);
      const me = swap ? 1 : 0;
      const r = m.winner === 'draw' ? 0.5 : m.winner === me ? 1 : 0;
      w += r; n++; per[o] = (per[o] ?? 0) + r;
    }
  }
  const vs = WEAPON_ORDER.filter((o) => o !== id).map((o) => `${WEAPONS[o].name} ${Math.round(per[o] / (2 * N) * 100)}`).join(' ');
  console.log(`${(w / n * 100).toFixed(1)}%  ${JSON.stringify(c)}  | ${vs}`);
}
applyKnobs(id, base);
