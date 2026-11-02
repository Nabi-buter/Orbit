// 상성표 출력: node scripts/matrix.js [n=6]
import { evaluateAll } from './evalcore.js';
import { WEAPON_ORDER, WEAPONS } from '../src/config/weapons.js';
const n = Number(process.argv[2] || 6);
const seed = Number(process.argv[3] || 1);
const { rates, pair } = evaluateAll(WEAPON_ORDER, n, seed);
console.log('        ' + WEAPON_ORDER.map((w) => WEAPONS[w].name.padStart(3, '　')).join(' '));
for (const a of WEAPON_ORDER) console.log(WEAPONS[a].name.padEnd(4, '　') + ' ' + WEAPON_ORDER.map((b) => a === b ? '   -' : String(Math.round(pair[`${a}|${b}`] * 100)).padStart(4)).join(' '));
console.log(WEAPON_ORDER.map((w) => `${WEAPONS[w].name} ${(rates[w] * 100).toFixed(1)}`).join(' · '));
