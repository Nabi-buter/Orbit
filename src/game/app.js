// =============================================================================
// 게임 흐름 (화면 전환 + 고정 60fps 루프)
// 타이틀 → 무기 선택 → 대전 → 결과 → (다시 대전 / 무기 선택 / 메인)
// =============================================================================

import { FPS } from '../config/balance.js';
import { WEAPONS } from '../config/weapons.js';
import { CONTROLS, KEY_LABELS } from '../config/controls.js';
import { Match } from '../core/match.js';
import { AIController, DIFFICULTY } from '../ai/ai.js';
import { Keyboard } from '../input/keyboard.js';
import { Renderer } from '../render/renderer.js';
import { Menus } from '../ui/menus.js';

const STEP = 1000 / FPS;

export class App {
  constructor({ canvas, overlay }) {
    this.canvas = canvas;
    this.keyboard = new Keyboard();
    this.renderer = new Renderer(canvas);
    this.menus = new Menus(overlay);
    this.scene = 'title';
    this.mode = 'pvp';
    this.weapons = ['longsword', 'longsword'];
    this.difficulty = 'normal';
    this.match = null;
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();

    window.addEventListener('keydown', (e) => this.onMenuKey(e));
    this.toTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  // --- 화면 전환 -------------------------------------------------------------
  toTitle() {
    this.scene = 'title';
    this.match = null;
    this.menus.title({
      onPvP: () => this.toSelect('pvp'),
      onPvE: () => this.toSelect('pve'),
      onHelp: () => this.toHelp(),
    });
  }

  toHelp() {
    this.scene = 'help';
    this.menus.help({ onBack: () => this.toTitle(), controlsHtml: controlsHtml() });
  }

  toSelect(mode = this.mode) {
    this.scene = 'select';
    this.mode = mode;
    this.match = null;
    this.menus.weaponSelect({
      mode,
      initial: this.weapons,
      difficulty: this.difficulty,
      onBack: () => this.toTitle(),
      onStart: ({ weapons, difficulty }) => {
        this.weapons = weapons;
        this.difficulty = difficulty;
        this.startMatch();
      },
      onPreview: (grids) => this.renderer.drawWeaponIcons?.(grids),
    });
  }

  startMatch() {
    this.scene = 'battle';
    this.paused = false;
    this.menus.clear();
    this.match = new Match({ weapons: this.weapons });
    this.ai = this.mode === 'pve' ? new AIController(this.difficulty) : null;
    this.renderer.reset?.();
    this.canvas.focus();
  }

  pause() {
    if (this.scene !== 'battle' || this.match.over) return;
    this.paused = true;
    this.menus.pause({
      onResume: () => this.resume(),
      onRestart: () => this.startMatch(),
      onSelect: () => this.toSelect(),
      onMain: () => this.toTitle(),
    });
  }

  resume() {
    this.paused = false;
    this.menus.clear();
    this.last = performance.now();
    this.acc = 0;
  }

  toResult() {
    this.scene = 'result';
    const m = this.match;
    const names = this.playerNames();
    let title, color;
    if (m.winner === 'draw') { title = '무승부'; color = '#e8e8e8'; }
    else if (this.mode === 'pve') {
      title = m.winner === 0 ? '승리!' : '패배…';
      color = m.winner === 0 ? '#ffd34a' : '#ff6b6b';
    } else { title = `${names[m.winner]} 승리!`; color = m.winner === 0 ? '#4aa3ff' : '#ff5a5a'; }
    const reason = m.endReason === 'ko' ? 'K.O.' : '시간 종료 — 남은 체력 판정';
    const statRow = (f, i) => `<div><b>${names[i]}</b> · ${WEAPONS[this.weapons[i]].name}<br>` +
      `체력 ${Math.ceil(f.hp)} · 적중 ${f.stats.hitsLanded} · 패링 ${f.stats.parries} · 완벽패링 ${f.stats.perfects}</div>`;
    this.menus.result({
      title, color,
      subtitle: reason,
      stats: m.fighters.map(statRow).join(''),
      onRematch: () => this.startMatch(),
      onSelect: () => this.toSelect(),
      onMain: () => this.toTitle(),
    });
  }

  playerNames() {
    return this.mode === 'pve' ? ['플레이어', `CPU (${DIFFICULTY[this.difficulty].label})`] : ['P1', 'P2'];
  }

  // --- 입력 ------------------------------------------------------------------
  onMenuKey(e) {
    if (e.repeat) return;
    if (this.scene === 'battle') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.paused ? this.resume() : this.pause();
        return;
      }
      if (this.paused && this.menus.handleKey(e.code)) e.preventDefault();
      if (!this.paused && e.code === 'F2') { e.preventDefault(); this.renderer.showBoxes = !this.renderer.showBoxes; }
      return;
    }
    if (this.scene === 'help' && e.code === 'Escape') { this.toTitle(); return; }
    if (this.menus.handleKey(e.code)) e.preventDefault();
  }

  // --- 루프 ------------------------------------------------------------------
  loop(now) {
    const dt = Math.min(250, now - this.last);
    this.last = now;
    if (this.scene === 'battle' && !this.paused) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.tick();
        this.acc -= STEP;
        if (this.scene !== 'battle') break;
      }
    } else {
      this.keyboard.endFrame();
    }
    if (this.match) this.renderer.draw(this.match, { names: this.playerNames(), paused: this.paused, dt });
    else this.renderer.drawBackdrop?.(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  tick() {
    const m = this.match;
    const p1 = this.keyboard.sample(0);
    const p2 = this.ai ? this.ai.think(m, 1) : this.keyboard.sample(1);
    const events = m.step([p1, p2]);
    this.renderer.pushEvents(events, m);
    this.keyboard.endFrame();
    if (m.over) this.toResult();
  }
}

function keyNames(codes) {
  return codes.map((c) => `<kbd>${KEY_LABELS[c] ?? c}</kbd>`).join(' ');
}

export function controlsHtml() {
  const rows = [
    ['이동', 'left', 'right'], ['점프', 'up'], ['가드 / 패링', 'guard'], ['약공격', 'light'],
    ['강공격 (가드 브레이크된 상대 → 특수강공)', 'heavy'], ['대시 (+방향, 또는 방향키 두 번)', 'dash'], ['궁극기 (게이지 100%)', 'ult'],
  ];
  const tr = rows.map(([label, ...acts]) =>
    `<tr><td>${label}</td>${[0, 1].map((p) => `<td>${acts.map((a) => keyNames(CONTROLS[p][a])).join(' ')}</td>`).join('')}</tr>`).join('');
  return `
  <table class="keys"><thead><tr><th></th><th>P1</th><th>P2 (PvE에서는 미사용)</th></tr></thead><tbody>${tr}</tbody></table>
  <div class="tips">
    <p><b>연결</b> 약·강공격이 맞거나 가드되면 다음 공격으로 자유롭게 이어 갈 수 있다. 헛치면 후딜레이가 생긴다.</p>
    <p><b>일반 패링</b> 가드 상태로 막으면 피해 50%, 가드 게이지 소모. 상대의 공격권은 유지된다.</p>
    <p><b>완벽패링</b> 공격이 닿기 직전에 가드를 누르면 피해가 거의 없고 상대 공격이 끊긴다 → 반격 기회. 궁극기도 끊을 수 있다. 연타하면 실패한다.</p>
    <p><b>가드 브레이크</b> 가드 게이지가 0이 되면 잠시 기절. 상대는 강공격으로 특수강공을 쓸 수 있다.</p>
    <p><b>궁극기</b> 즉시 발동, 일반 공격에 끊기지 않고 일반 가드로 막을 수 없다. 오직 완벽패링만 통한다.</p>
    <p><b>점프</b> 지상 공격을 피한다. 하강 중 공격 버튼으로 낙하 공격(착지 후딜레이 있음).</p>
    <p>Esc / P: 일시정지 · F2: 판정 박스 표시</p>
  </div>`;
}
