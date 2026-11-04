// =============================================================================
// 상성 평가: 후보 변수 세트를 적용해 모든 상성을 병렬로 측정한다.
//   node scripts/matchup.js <조합·난이도쌍당 판수> <시드> '<JSON {무기: 변경}>'
// 출력: 무기별 승률, 승률 편차, 가장 쏠린 상성, 상성 편차 제곱합
// =============================================================================
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { WEAPON_ORDER, WEAPONS, KNOBS, applyKnobs } from '../src/config/weapons.js';
import { DIFF_PAIRS, playOne } from './evalcore.js';

function applyAll(over) {
  for (const [id, c] of Object.entries(over)) {
    const base = KNOBS[id];
    applyKnobs(id, { ...base, ...c, combo: { ...base.combo, ...(c.combo ?? {}) } });
  }
}

if (isMainThread) {
  const n = Number(process.argv[2] || 12);
  const seed = Number(process.argv[3] || 1);
  const over = JSON.parse(process.argv[4] || '{}');
  const pairs = [];
  for (let i = 0; i < WEAPON_ORDER.length; i++) for (let j = i + 1; j < WEAPON_ORDER.length; j++) pairs.push([WEAPON_ORDER[i], WEAPON_ORDER[j], pairs.length]);
  const pool = Math.max(1, Math.min(pairs.length, cpus().length));
  const res = {};
  let next = 0;
  await new Promise((done) => {
    let active = 0;
    const launch = () => {
      if (next >= pairs.length) { if (active === 0) done(); return; }
      const [a, b, idx] = pairs[next++];
      active++;
      const w = new Worker(new URL(import.meta.url), { workerData: { a, b, n, seed: seed * 100000 + idx * 1000, over } });
      w.on('message', (r) => { res[`${a}|${b}`] = r; res[`${b}|${a}`] = 1 - r; });
      w.on('exit', () => { active--; launch(); });
    };
    for (let k = 0; k < pool; k++) launch();
  });
  const rate = Object.fromEntries(WEAPON_ORDER.map((w) => [w, WEAPON_ORDER.filter((o) => o !== w).reduce((s, o) => s + res[`${w}|${o}`], 0) / (WEAPON_ORDER.length - 1)]));
  const v = Object.values(rate);
  const spread = Math.max(...v) - Math.min(...v);
  let worst = ['', 0], sq = 0;
  for (const [a, b] of pairs) { const d = Math.abs(res[`${a}|${b}`] - 0.5); sq += d * d; if (d > Math.abs(worst[1] - 0.5)) worst = [`${WEAPONS[a].name}>${WEAPONS[b].name}`, res[`${a}|${b}`] >= 0.5 ? res[`${a}|${b}`] : 1 - res[`${a}|${b}`]]; if (res[`${a}|${b}`] < 0.5) worst[0] = worst[0]; }
  const strong = pairs.map(([a, b]) => { const r = res[`${a}|${b}`]; return r >= 0.5 ? [a, b, r] : [b, a, 1 - r]; }).filter((x) => x[2] >= 0.62).sort((x, y) => y[2] - x[2]);
  console.log(JSON.stringify({
    rates: Object.fromEntries(WEAPON_ORDER.map((w) => [WEAPONS[w].name, Math.round(rate[w] * 1000) / 10])),
    spread: Math.round(spread * 1000) / 10,
    rms: Math.round(Math.sqrt(sq / pairs.length) * 1000) / 10,
    strong: strong.map(([a, b, r]) => `${WEAPONS[a].name}>${WEAPONS[b].name} ${Math.round(r * 100)}`),
  }));
} else {
  const { a, b, n, seed, over } = workerData;
  applyAll(over);
  let s = seed, aw = 0, cnt = 0;
  for (const [da, db] of DIFF_PAIRS) for (let k = 0; k < n; k++) {
    const swap = k % 2 === 1;
    aw += swap ? 1 - playOne(b, a, da, db, s++) : playOne(a, b, da, db, s++);
    cnt++;
  }
  parentPort.postMessage(aw / cnt);
}
