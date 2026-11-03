// =============================================================================
// 상성 기준 자동 미세 조정 (좌표 하강)
//   node scripts/tune-matchup.js <판수> <반복> '<시작 JSON>'
// 목표: 상성 RMS + 0.5 × 무기별 승률 편차 최소화. 무기 정체성 규칙을 깨는 후보는 버린다.
// 각 후보는 scripts/matchup.js (병렬) 로 평가. 출력 마지막 줄 = 최적 JSON.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { KNOBS, WEAPONS, WEAPON_ORDER, applyKnobs } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';

const N = Number(process.argv[2] || 24);
const ITERS = Number(process.argv[3] || 2);
let cur = JSON.parse(process.argv[4] || '{}');
const SEED = 9;

const clone = (o) => JSON.parse(JSON.stringify(o));
const r2 = (v) => Math.round(v * 100) / 100;

function identityOK(over) {
  const base = clone(KNOBS);
  for (const [id, c] of Object.entries(over)) applyKnobs(id, { ...base[id], ...c });
  const W = WEAPONS;
  const su = (id, k) => W[id][k].hits[0].from;
  const dmg = (id, k) => W[id][k].hits.reduce((s, h) => s + h.damage, 0);
  let bad = null;
  for (const id of WEAPON_ORDER) {
    if (id === 'greatsword') continue;
    if (su('greatsword', 'heavy') < su(id, 'heavy') || dmg('greatsword', 'heavy') <= dmg(id, 'heavy')) bad = 'greatsword';
  }
  for (const id of WEAPON_ORDER) if (id !== 'spear' && reachOf(W.spear.light) <= reachOf(W[id].light)) bad = 'spear reach';
  for (const id of ['longsword', 'greatsword', 'axe', 'spear']) {
    if (su('dagger', 'light') >= su(id, 'light') || su('knuckle', 'light') >= su(id, 'light')) bad = 'fast light';
    if (reachOf(W.knuckle.light) >= reachOf(W[id].light)) bad = 'knuckle reach';
  }
  if (reachOf(W.knuckle.light) >= reachOf(W.dagger.light)) bad = 'knuckle<dagger';
  const hits = (id) => [...W[id].lights, ...W[id].heavies].flatMap((d) => d.hits);
  const avg = (a) => a.reduce((s, h) => s + h.damage, 0) / a.length;
  if (avg(hits('dagger')) <= avg(hits('knuckle')) * 1.4) bad = 'dagger per-hit';
  for (const id of WEAPON_ORDER) applyKnobs(id, base[id]);
  return bad;
}

function score(over) {
  const out = execFileSync(process.execPath, ['scripts/matchup.js', String(N), String(SEED), JSON.stringify(over)], { encoding: 'utf8' });
  const r = JSON.parse(out.trim().split('\n').at(-1));
  return { s: r.rms + 0.5 * r.spread, r };
}

const val = (over, id, k) => over[id]?.[k] ?? KNOBS[id][k] ?? 1;
const STEP = { damage: 0.04, reach: 0.03, speed: 0.04, hp: 0.04 };
let best = score(cur);
console.log('시작', best.s.toFixed(2), JSON.stringify(best.r));
for (let it = 0; it < ITERS; it++) {
  for (const id of WEAPON_ORDER) for (const k of Object.keys(STEP)) for (const dir of [1, -1]) {
    const cand = clone(cur);
    cand[id] = { ...(cand[id] ?? {}), [k]: r2(val(cur, id, k) + dir * STEP[k]) };
    const v = cand[id][k];
    if (v <= 0.7 || v >= 1.7) continue;
    const bad = identityOK(cand);
    if (bad) continue;
    const sc = score(cand);
    if (sc.s < best.s - 0.15) {
      best = sc; cur = cand;
      console.log(`  ${id}.${k} → ${v}  점수 ${sc.s.toFixed(2)}  ${JSON.stringify(sc.r)}`);
      break; // 같은 변수 반대 방향은 건너뜀
    }
  }
  console.log(`반복 ${it + 1} 끝: ${best.s.toFixed(2)}`);
}
console.log(JSON.stringify(cur));
