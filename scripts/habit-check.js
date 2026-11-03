// =============================================================================
// 습관 공략 확인: 단순한 습관을 가진 봇 vs AI
//   node scripts/habit-check.js [판수=4]
// 봇: idle(가만히) · lightSpam(다가가며 약공 연타) · heavySpam(다가가며 강공 연타) · turtle(가드만)
// 출력: 습관별 AI 승률, 경기 시간(초), AI 가 입은 피해 비율
// =============================================================================
import { Match } from '../src/core/match.js';
import { AIController } from '../src/ai/ai.js';
import { WEAPON_ORDER } from '../src/config/weapons.js';
import { reachOf } from '../src/core/attackDef.js';

const N = Number(process.argv[2] || 4);
const BOTS = {
  idle: () => ({}),
  lightSpam: (m, k) => {
    const [b, a] = m.fighters; const d = Math.abs(a.x - b.x);
    const toward = a.x > b.x ? 'right' : 'left';
    return { light: k % 6 === 0, [toward]: d > reachOf(b.weapon.light) - 5 };
  },
  heavySpam: (m, k) => {
    const [b, a] = m.fighters; const d = Math.abs(a.x - b.x);
    const toward = a.x > b.x ? 'right' : 'left';
    return { heavy: k % 6 === 0, [toward]: d > reachOf(b.weapon.heavy) - 10 };
  },
  turtle: () => ({ guard: true }),
};

for (const diff of ['normal', 'hard']) {
  const line = [];
  for (const [name, bot] of Object.entries(BOTS)) {
    let wins = 0, games = 0, secs = 0, dmg = 0;
    for (const wb of WEAPON_ORDER) for (const wa of WEAPON_ORDER) for (let i = 0; i < N; i++) {
      const m = new Match({ weapons: [wb, wa] }); // 0 = 봇, 1 = AI
      const ai = new AIController(diff, 1000 + games);
      let k = 0;
      while (!m.over && m.frame < 60 * 60 * 4) m.step([bot(m, k++), ai.think(m, 1)]);
      if (m.winner === 1) wins++;
      games++; secs += m.frame / 60;
      const A = m.fighters[1];
      dmg += 1 - (A.hp / A.maxHp + (m.lives[1] - 1)) / 2;
    }
    line.push(`${name} AI승 ${(wins / games * 100).toFixed(0)}% ${(secs / games).toFixed(0)}초 AI피해 ${(dmg / games * 100).toFixed(0)}%`);
  }
  console.log(diff.padEnd(6), line.join(' | '));
}
