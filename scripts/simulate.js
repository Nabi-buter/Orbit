// AI 대 AI 헤드리스 시뮬레이션: 무기 조합별 승률/평균 경기 시간
// node scripts/simulate.js [matchesPerPair=20] [difficulty=hard]
import { Match } from '../src/core/match.js';
import { AIController } from '../src/ai/ai.js';
import { WEAPON_ORDER, WEAPONS } from '../src/config/weapons.js';

const N = Number(process.argv[2] || 20);
const diff = process.argv[3] || 'hard';
let seed = 12345;

export function playMatch(w1, w2, d1 = diff, d2 = diff) {
  const m = new Match({ weapons: [w1, w2] });
  const ais = [new AIController(d1, seed++), new AIController(d2, seed++)];
  const counts = { hit: 0, parry: 0, perfect: 0, guardBreak: 0, special: 0, armored: 0, ultCast: 0, ultHit: 0, ultPerfected: 0 };
  const prev = ['', ''];
  while (!m.over) {
    const ev = m.step([ais[0].think(m, 0), ais[1].think(m, 1)]);
    for (const e of ev) {
      if (e.type in counts) counts[e.type]++;
      if (e.kind === 'ultimate' && e.type === 'hit') counts.ultHit++;
      if (e.kind === 'ultimate' && e.type === 'perfect') counts.ultPerfected++;
    }
    m.fighters.forEach((f, i) => { if (f.state === 'ultimate' && prev[i] !== 'ultimate') counts.ultCast++; prev[i] = f.state; });
  }
  return { winner: m.winner, frames: m.frame, counts, hp: m.fighters.map((f) => f.hp) };
}

const wins = Object.fromEntries(WEAPON_ORDER.map((w) => [w, { w: 0, l: 0, d: 0 }]));
const total = { hit: 0, parry: 0, perfect: 0, guardBreak: 0, special: 0, armored: 0, ultCast: 0, ultHit: 0, ultPerfected: 0 };
let frames = 0, games = 0, timeouts = 0;
const table = [];
for (const a of WEAPON_ORDER) {
  const row = [];
  for (const b of WEAPON_ORDER) {
    let aw = 0;
    if (a === b) { row.push('   -'); continue; }
    for (let i = 0; i < N; i++) {
      // 좌우 교대로 위치 편향 제거
      const swap = i % 2 === 1;
      const r = swap ? playMatch(b, a) : playMatch(a, b);
      const aIdx = swap ? 1 : 0;
      games++; frames += r.frames;
      if (r.frames >= 99 * 60 - 1) timeouts++;
      for (const k in total) total[k] += r.counts[k];
      if (r.winner === 'draw') { wins[a].d++; aw += 0.5; }
      else if (r.winner === aIdx) { wins[a].w++; aw++; }
      else wins[a].l++;
    }
    row.push((aw / N * 100).toFixed(0).padStart(4));
  }
  table.push(`${WEAPONS[a].name.padEnd(4, '　')} ${row.join(' ')}`);
}
console.log(`난이도 ${diff}, 조합당 ${N}판 (행 무기의 승률 %)`);
console.log('        ' + WEAPON_ORDER.map((w) => WEAPONS[w].name.padStart(3, '　')).join(' '));
console.log(table.join('\n'));
console.log('\n무기별 종합 승률');
for (const w of WEAPON_ORDER) {
  const s = wins[w];
  console.log(`  ${WEAPONS[w].name}: ${((s.w + s.d / 2) / (s.w + s.l + s.d) * 100).toFixed(1)}%`);
}
console.log(`\n평균 경기 시간 ${(frames / games / 60).toFixed(1)}s, 시간 초과 ${timeouts}/${games}`);
console.log('경기당 이벤트', Object.fromEntries(Object.entries(total).map(([k, v]) => [k, (v / games).toFixed(1)])));
console.log(`궁극기: 시전 ${total.ultCast}회 → 적중 ${(total.ultHit / total.ultCast * 100).toFixed(0)}%, 완벽패링당함 ${(total.ultPerfected / total.ultCast * 100).toFixed(0)}%, 빗나감 ${((total.ultCast - total.ultHit - total.ultPerfected) / total.ultCast * 100).toFixed(0)}%`);
