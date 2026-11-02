// =============================================================================
// 메뉴 화면 (DOM 오버레이). 게임 로직과 분리: 콜백으로만 결과를 전달한다.
// =============================================================================

import { WEAPONS, WEAPON_ORDER } from '../config/weapons.js';
import { DIFFICULTY } from '../ai/ai.js';
import { reachOf } from '../core/attackDef.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** 무기 성능을 0~5 막대로 표시하기 위한 지표 (데이터에서 자동 계산) */
export function weaponStats(id) {
  const w = WEAPONS[id];
  const dps = (d) => d.hits.reduce((s, h) => s + h.damage, 0) / d.duration;
  const speed = 1 / (w.light.hits[0].from + w.heavy.hits[0].from);
  const reach = reachOf(w.light) + reachOf(w.heavy);
  const power = w.heavy.hits.reduce((s, h) => s + h.damage, 0);
  const guardPressure = [...w.light.hits, ...w.heavy.hits].reduce((s, h) => s + h.guardDamage, 0);
  const combo = w.light.hits.length + w.heavy.hits.length;
  return { speed, reach, power, guardPressure, combo, dps: dps(w.light) + dps(w.heavy) };
}

function normalizedStats() {
  const all = WEAPON_ORDER.map((id) => [id, weaponStats(id)]);
  const keys = ['speed', 'reach', 'power', 'guardPressure', 'combo'];
  const out = {};
  for (const k of keys) {
    const vals = all.map(([, s]) => s[k]);
    const min = Math.min(...vals), max = Math.max(...vals);
    for (const [id, s] of all) {
      out[id] ??= {};
      out[id][k] = 1 + Math.round(((s[k] - min) / (max - min || 1)) * 4);
    }
  }
  return out;
}

const STAT_LABELS = { speed: '속도', reach: '사거리', power: '위력', guardPressure: '가드 압박', combo: '연타' };

export class Menus {
  constructor(root) {
    this.root = root;
    this.stats = normalizedStats();
  }

  clear() {
    this.root.innerHTML = '';
    this.root.hidden = true;
    this.keyHandler = null;
  }

  show(node) {
    this.root.innerHTML = '';
    this.root.appendChild(node);
    this.root.hidden = false;
    const first = node.querySelector('[data-autofocus]') || node.querySelector('button');
    first?.focus();
  }

  /** 키보드 메뉴 이동: 버튼 목록을 방향키/WASD 로 이동, Enter/J/Space 로 선택 */
  handleKey(code) {
    if (this.keyHandler) return this.keyHandler(code);
    const buttons = [...this.root.querySelectorAll('button:not([disabled])')];
    if (!buttons.length) return false;
    const i = buttons.indexOf(document.activeElement);
    if (['ArrowDown', 'KeyS', 'ArrowRight', 'KeyD'].includes(code)) { buttons[(i + 1) % buttons.length].focus(); return true; }
    if (['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA'].includes(code)) { buttons[(i - 1 + buttons.length) % buttons.length].focus(); return true; }
    if (['Enter', 'Space', 'KeyJ', 'NumpadEnter'].includes(code) && i >= 0) { buttons[i].click(); return true; }
    return false;
  }

  title({ onPvP, onPvE, onHelp }) {
    const n = el('div', 'screen title-screen');
    n.append(
      el('div', 'logo', '<span>ORBIT</span> DUEL'),
      el('p', 'tagline', '거리 · 타이밍 · 심리전 — 2D 1:1 무기 격투'),
    );
    const list = el('div', 'menu-list');
    const b1 = el('button', 'btn primary', '플레이어 대전 <small>PvP · 한 키보드 2인</small>');
    const b2 = el('button', 'btn', '컴퓨터 대전 <small>PvE · AI 상대</small>');
    const b3 = el('button', 'btn ghost', '조작 방법');
    b1.dataset.autofocus = '';
    b1.onclick = onPvP; b2.onclick = onPvE; b3.onclick = onHelp;
    list.append(b1, b2, b3);
    n.append(list, el('p', 'hint', '방향키/WASD 로 이동 · Enter/J 로 선택'));
    this.show(n);
  }

  help({ onBack, controlsHtml }) {
    const n = el('div', 'screen help-screen');
    n.append(el('h2', null, '조작 방법'), el('div', 'help-body', controlsHtml));
    const back = el('button', 'btn primary', '돌아가기');
    back.onclick = onBack;
    back.dataset.autofocus = '';
    n.append(back);
    this.show(n);
  }

  /**
   * 무기 선택.
   * @param {{mode:'pvp'|'pve', initial:[string,string], difficulty:string, onStart:Function, onBack:Function}} o
   */
  weaponSelect(o) {
    const sel = [...o.initial];
    let difficulty = o.difficulty;
    const ready = [false, o.mode === 'pve'];
    const n = el('div', 'screen select-screen');
    n.append(el('h2', null, o.mode === 'pvp' ? '무기 선택 — 플레이어 대전' : '무기 선택 — 컴퓨터 대전'));

    const cols = el('div', 'select-cols');
    const panels = [0, 1].map((p) => {
      const panel = el('div', `select-panel p${p + 1}`);
      const label = o.mode === 'pve' && p === 1 ? 'CPU' : `P${p + 1}`;
      const keys = p === 0 ? 'A/D 선택 · J 확정' : '←/→ 선택 · Num1(,) 확정';
      panel.append(el('div', 'panel-head', `<b>${label}</b><span>${o.mode === 'pve' && p === 1 ? '클릭해서 선택' : keys}</span>`));
      const grid = el('div', 'weapon-grid');
      WEAPON_ORDER.forEach((id) => {
        const c = el('button', 'weapon-card');
        c.style.setProperty('--wc', WEAPONS[id].color);
        c.innerHTML = `<canvas width="96" height="64"></canvas><span>${WEAPONS[id].name}</span>`;
        c.onclick = () => { sel[p] = id; ready[p] = o.mode === 'pvp' ? ready[p] : ready[p]; render(); };
        c.dataset.id = id;
        grid.append(c);
      });
      const info = el('div', 'weapon-info');
      const readyBtn = el('button', 'btn small ready-btn', '준비');
      readyBtn.onclick = () => { ready[p] = !ready[p]; render(); };
      if (o.mode === 'pve' && p === 1) readyBtn.hidden = true;
      panel.append(grid, info, readyBtn);
      cols.append(panel);
      return { panel, grid, info, readyBtn };
    });
    n.append(cols);

    const bottom = el('div', 'select-bottom');
    if (o.mode === 'pve') {
      const d = el('div', 'difficulty');
      d.append(el('span', null, 'AI 난이도'));
      for (const [k, v] of Object.entries(DIFFICULTY)) {
        const b = el('button', 'btn small diff', v.label);
        b.dataset.diff = k;
        b.onclick = () => { difficulty = k; render(); };
        d.append(b);
      }
      const rnd = el('button', 'btn small', 'CPU 무기 무작위');
      rnd.onclick = () => { sel[1] = WEAPON_ORDER[Math.floor(Math.random() * WEAPON_ORDER.length)]; render(); };
      d.append(rnd);
      bottom.append(d);
    }
    const back = el('button', 'btn ghost', '← 메인으로');
    back.onclick = o.onBack;
    const start = el('button', 'btn primary start-btn', '대전 시작');
    start.onclick = () => o.onStart({ weapons: [...sel], difficulty });
    bottom.append(back, start);
    n.append(bottom);

    const render = () => {
      panels.forEach((pp, p) => {
        for (const c of pp.grid.children) c.classList.toggle('selected', c.dataset.id === sel[p]);
        const w = WEAPONS[sel[p]];
        const st = this.stats[sel[p]];
        pp.info.innerHTML = `<h3 style="color:${w.color}">${w.name}</h3><p>${w.desc}</p>` +
          Object.entries(STAT_LABELS).map(([k, l]) =>
            `<div class="stat"><span>${l}</span><i>${'<b></b>'.repeat(st[k])}${'<b class="off"></b>'.repeat(5 - st[k])}</i></div>`).join('');
        pp.panel.classList.toggle('is-ready', ready[p]);
        pp.readyBtn.textContent = ready[p] ? '준비 완료 ✓' : '준비';
      });
      for (const b of n.querySelectorAll('.diff')) b.classList.toggle('selected', b.dataset.diff === difficulty);
      start.disabled = o.mode === 'pvp' && !(ready[0] && ready[1]);
      start.textContent = start.disabled ? '양쪽 준비 대기 중…' : '대전 시작';
      o.onPreview?.(panels.map((pp) => pp.grid), sel);
    };
    render();

    // 키보드: 각 플레이어가 자기 키로 무기 선택/준비
    const move = (p, d) => {
      if (ready[p]) return;
      const i = WEAPON_ORDER.indexOf(sel[p]);
      sel[p] = WEAPON_ORDER[(i + d + WEAPON_ORDER.length) % WEAPON_ORDER.length];
      render();
    };
    this.show(n);
    start.blur();
    this.keyHandler = (code) => {
      const pvp = o.mode === 'pvp';
      switch (code) {
        case 'KeyA': move(0, -1); return true;
        case 'KeyD': move(0, 1); return true;
        case 'KeyW': move(0, -3); return true;
        case 'KeyS': move(0, 3); return true;
        case 'KeyJ':
          if (o.mode === 'pve') { start.click(); return true; }
          ready[0] = true; render(); return true;
        case 'KeyK': ready[0] = false; render(); return true;
        case 'ArrowLeft': if (pvp) move(1, -1); return true;
        case 'ArrowRight': if (pvp) move(1, 1); return true;
        case 'ArrowUp': if (pvp) move(1, -3); return true;
        case 'ArrowDown': if (pvp) move(1, 3); return true;
        case 'Numpad1': case 'Comma': if (pvp) { ready[1] = true; render(); } return true;
        case 'Numpad2': case 'Period': if (pvp) { ready[1] = false; render(); } return true;
        case 'Enter': case 'NumpadEnter':
          if (!start.disabled) start.click(); return true;
        case 'Escape': o.onBack(); return true;
        default: return false;
      }
    };
  }

  result({ title, subtitle, color, stats, onRematch, onSelect, onMain }) {
    const n = el('div', 'screen result-screen');
    const h = el('div', 'result-title', title);
    h.style.color = color;
    n.append(h, el('p', 'result-sub', subtitle));
    if (stats) n.append(el('div', 'result-stats', stats));
    const list = el('div', 'menu-list row');
    const b1 = el('button', 'btn primary', '다시 대전');
    const b2 = el('button', 'btn', '무기 선택');
    const b3 = el('button', 'btn ghost', '메인 화면');
    b1.dataset.autofocus = '';
    b1.onclick = onRematch; b2.onclick = onSelect; b3.onclick = onMain;
    list.append(b1, b2, b3);
    n.append(list);
    this.show(n);
  }

  pause({ onResume, onRestart, onSelect, onMain }) {
    const n = el('div', 'screen pause-screen');
    n.append(el('h2', null, '일시정지'));
    const list = el('div', 'menu-list');
    const items = [['계속하기', onResume, 'primary'], ['재시작', onRestart], ['무기 선택', onSelect], ['메인 화면', onMain, 'ghost']];
    items.forEach(([t, fn, cls], i) => {
      const b = el('button', `btn ${cls ?? ''}`, t);
      b.onclick = fn;
      if (i === 0) b.dataset.autofocus = '';
      list.append(b);
    });
    n.append(list, el('p', 'hint', 'Esc / P: 계속하기'));
    this.show(n);
  }
}
