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
import { Renderer, hitstopFor } from '../render/renderer.js';
import { sfx, playEvent } from '../render/sfx.js';
import { Menus } from '../ui/menus.js';
import { NetClient } from '../net/client.js';
import { Lockstep } from '../net/lockstep.js';
import { drawWeaponIcon } from '../render/weaponArt.js';
import { EMPTY_INPUT } from '../core/fighter.js';

const STEP = 1000 / FPS;
const INTRO_FRAMES = 96;

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
      onOnline: () => this.toOnline(),
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
    this.renderer.reset();
    this.hitstop = 0;
    this.intro = INTRO_FRAMES; // READY → FIGHT! 동안 입력 대기
    this.acc = 0;
    this.canvas.focus();
  }

  // --- 온라인 대전 ------------------------------------------------------------
  async toOnline() {
    this.scene = 'online';
    this.mode = 'online';
    this.match = null;
    if (this.net?.connected && this.netState?.phase === 'room') { this.renderLobby(); return; }
    if (window.ORBIT_STATIC) {
      // 정적 호스팅(서버 없음)에서는 온라인 대전을 쓸 수 없다
      this.netState = { phase: 'connecting', error: '이 링크는 서버 없이 게임 파일만 제공해 온라인 대전을 할 수 없습니다. 온라인 대전은 npm start 로 실행한 서버 주소에서 이용하세요. (PvE·로컬 2인 대전은 사용 가능)' };
      this.renderLobby();
      return;
    }
    this.netState = { phase: 'connecting', error: null };
    this.renderLobby();
    try {
      this.net?.close();
      const net = new NetClient(NetClient.defaultUrl());
      this.net = net;
      this.bindNet(net);
      await net.connect();
      if (this.net !== net) return;
      this.netState = { phase: 'connect', error: null };
    } catch (e) {
      this.netState = { phase: 'connect', error: `${e.message} (npm start 로 실행한 서버 주소로 접속했는지 확인하세요)` };
    }
    if (this.scene === 'online') this.renderLobby();
  }

  bindNet(net) {
    net
      .on('joined', (m) => { Object.assign(this.netState, { phase: 'room', code: m.code, slot: m.slot, error: null }); })
      .on('lobby', (m) => {
        Object.assign(this.netState, { phase: 'room', code: m.code, connected: m.connected, weapons: m.weapons, ready: m.ready, playing: m.playing });
        if (this.scene === 'online') this.renderLobby();
      })
      .on('error', (m) => { this.netState.error = m.msg; if (this.scene === 'online') this.renderLobby(); })
      .on('ping', (m) => {
        const changed = this.netState.rtt !== m.rtt;
        this.netState.rtt = m.rtt; this.netState.peerRtt = m.peerRtt;
        if (changed && this.scene === 'online' && this.netState.phase === 'room' && !this.netState.connected?.[1 - this.netState.slot]) this.renderLobby();
      })
      .on('start', (m) => this.startOnlineMatch(m))
      .on('input', (m) => { if (this.lockstep && m.m === this.lockstep.matchId) this.lockstep.onRemoteInput(m.f, m.i); })
      .on('hash', (m) => { if (this.lockstep && m.m === this.lockstep.matchId) this.lockstep.onRemoteHash(m.f, m.h); })
      .on('peerLeft', () => {
        if (this.scene === 'battle' && this.mode === 'online' && !this.match.over) this.toResult({ peerLeft: true });
        else if (this.scene === 'online') this.renderLobby();
      })
      .on('close', () => {
        if (this.net !== net) return;
        this.netState = { phase: 'connect', error: '서버와 연결이 끊어졌습니다.' };
        if (this.scene === 'battle' && this.mode === 'online') this.toResult({ disconnected: true });
        else if (this.scene === 'online') this.toOnline();
      });
  }

  renderLobby() {
    this.menus.onlineLobby(this.netState, {
      onBack: () => this.leaveOnline(),
      onCreate: () => this.net.send({ t: 'create' }),
      onJoin: (code) => this.net.send({ t: 'join', code }),
      onSelect: (weapon) => this.net.send({ t: 'select', weapon }),
      onReady: (ready) => this.net.send({ t: 'ready', ready }),
      onLeave: () => { this.net.send({ t: 'leave' }); this.netState = { phase: 'connect', error: null }; this.renderLobby(); },
      onRendered: (node) => {
        node.querySelectorAll('.weapon-card').forEach((c) => drawWeaponIcon(c.querySelector('canvas'), c.dataset.id, WEAPONS[c.dataset.id].color));
        const oc = node.querySelector('.opp-weapon canvas');
        const ow = this.netState.weapons?.[1 - this.netState.slot];
        if (oc && ow) drawWeaponIcon(oc, ow, WEAPONS[ow].color);
      },
    });
  }

  leaveOnline() {
    this.net?.send({ t: 'leave' });
    this.net?.close();
    this.net = null;
    this.lockstep = null;
    this.toTitle();
  }

  startOnlineMatch(msg) {
    this.mode = 'online';
    this.weapons = msg.weapons;
    this.slot = msg.slot;
    this.netDelay = msg.delay;
    this.lockstep = new Lockstep({ slot: msg.slot, delay: msg.delay, matchId: msg.matchId, send: (m) => this.net.send(m) });
    this.onlineMenuOpen = false;
    this.startMatch();
  }

  toggleOnlineMenu() {
    if (this.match.over) return;
    this.onlineMenuOpen = !this.onlineMenuOpen;
    if (!this.onlineMenuOpen) { this.menus.clear(); return; }
    this.menus.onlineMenu({
      onResume: () => this.toggleOnlineMenu(),
      onLeave: () => { this.onlineMenuOpen = false; this.net.send({ t: 'leave' }); this.lockstep = null; this.netState = { phase: 'connect', error: null }; this.toOnline(); },
    });
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

  toResult(net = {}) {
    this.scene = 'result';
    const m = this.match;
    const names = this.playerNames();
    let title, color;
    const online = this.mode === 'online';
    if (online && (net.peerLeft || net.disconnected)) {
      this.lockstep = null;
      this.menus.result({
        title: net.peerLeft ? '승리 (상대 퇴장)' : '연결 끊김',
        color: net.peerLeft ? '#ffd34a' : '#ff6b6b',
        subtitle: net.peerLeft ? '상대가 대전을 떠났습니다.' : '서버와의 연결이 끊어졌습니다.',
        onRematch: () => this.toOnline(), onMain: () => this.leaveOnline(),
        labels: ['온라인 로비', null, '메인 화면'],
      });
      return;
    }
    if (online) {
      this.net?.send({ t: 'end', m: this.lockstep?.matchId });
      this.lockstep = null;
    }
    if (m.winner === 'draw') { title = '무승부'; color = '#e8e8e8'; }
    else if (online) {
      const won = m.winner === this.slot;
      title = won ? '승리!' : '패배…';
      color = won ? '#ffd34a' : '#ff6b6b';
    }
    else if (this.mode === 'pve') {
      title = m.winner === 0 ? '승리!' : '패배…';
      color = m.winner === 0 ? '#ffd34a' : '#ff6b6b';
    } else { title = `${names[m.winner]} 승리!`; color = m.winner === 0 ? '#4aa3ff' : '#ff5a5a'; }
    const reason = m.endReason === 'ko' ? 'K.O.' : '시간 종료 — 남은 체력 판정';
    const statRow = (f, i) => `<div><b>${names[i]}</b> · ${WEAPONS[this.weapons[i]].name}<br>` +
      `체력 ${Math.ceil(f.hp)} · 적중 ${f.stats.hitsLanded} · 패링 ${f.stats.parries} · 완벽패링 ${f.stats.perfects}</div>`;
    if (online) {
      this.menus.result({
        title, color, subtitle: reason, stats: m.fighters.map(statRow).join(''),
        onRematch: () => this.toOnline(), onMain: () => this.leaveOnline(),
        labels: ['로비로 (재대결·무기 변경)', null, '나가기'],
      });
      return;
    }
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
    if (this.mode === 'online') return this.slot === 0 ? ['나', '상대'] : ['상대', '나'];
    return this.mode === 'pve' ? ['플레이어', `CPU (${DIFFICULTY[this.difficulty].label})`] : ['P1', 'P2'];
  }

  // --- 입력 ------------------------------------------------------------------
  onMenuKey(e) {
    if (e.repeat) return;
    if (e.code === 'KeyM' && this.scene !== 'select') { sfx.muted = !sfx.muted; return; }
    if (this.scene === 'battle') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (this.mode === 'online') this.toggleOnlineMenu();
        else this.paused ? this.resume() : this.pause();
        return;
      }
      if (this.onlineMenuOpen && this.menus.handleKey(e.code)) { e.preventDefault(); return; }
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
    if (this.match) {
      this.renderer.draw(this.match, {
        names: this.playerNames(), paused: this.paused, dt,
        frozen: this.paused || this.hitstop > 0,
        intro: this.introText(),
        net: this.mode === 'online' && this.scene === 'battle' ? this.netInfo() : null,
      });
    } else this.renderer.drawBackdrop(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  netInfo() {
    const ls = this.lockstep;
    return {
      text: `온라인 · 핑 ${this.net?.rtt ?? '-'}ms · 입력 지연 ${this.netDelay}f`,
      waiting: !!ls && ls.stalled > 20,
      desync: ls?.desyncAt != null,
    };
  }

  introText() {
    if (!this.match || this.intro <= 0 || this.scene !== 'battle') return null;
    const fightAt = 30;
    if (this.intro > fightAt) return { text: 'READY', t: (this.intro - fightAt) / (INTRO_FRAMES - fightAt) };
    return { text: 'FIGHT!', t: this.intro / fightAt };
  }

  tick() {
    const m = this.match;
    // 시작 연출: 입력 무시
    if (this.intro > 0) {
      if (this.intro === 30) playEvent('fight');
      this.intro--;
      this.keyboard.endFrame();
      return;
    }
    // 히트스톱: 시뮬레이션 정지(양쪽 동일). 짧은 입력은 래치되어 유지된다
    if (this.hitstop > 0) { this.hitstop--; return; }
    let inputs;
    if (this.mode === 'online') {
      const ls = this.lockstep;
      if (!ls) return;
      if (ls.needsLocal()) {
        // 온라인에서는 내 캐릭터를 P1/P2 어느 키 배치로도 조작할 수 있다
        let mine = { ...EMPTY_INPUT };
        if (!this.onlineMenuOpen) {
          const a = this.keyboard.sample(0), b = this.keyboard.sample(1);
          for (const k of Object.keys(mine)) mine[k] = a[k] || b[k];
        }
        ls.pushLocal(mine);
        this.keyboard.endFrame();
      }
      inputs = ls.next();
      if (!inputs) return; // 상대 입력 대기
    } else {
      const p1 = this.keyboard.sample(0);
      const p2 = this.ai ? this.ai.think(m, 1) : this.keyboard.sample(1);
      inputs = [p1, p2];
      this.keyboard.endFrame();
    }
    const events = m.step(inputs);
    this.lockstep?.afterStep(m);
    this.renderer.pushEvents(events, m);
    this.hitstop = hitstopFor(events);
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
    <p><b>연결</b> 약·강공격이 맞거나 가드되면 다음 공격으로 이어 갈 수 있다. 헛치면 후딜레이가 생긴다.</p>
    <p><b>콤보 상한</b> 무기마다 약공·강공 최대 연속 횟수가 정해져 있다(예: 대검 약공 2, 단검 3, 너클 5). 상한에 닿으면 <b>숨 고르기</b>(공격 불가) 딜레이. 약·강을 섞으면 더 길게 잇고 딜레이도 짧다. 콤보 직후 잠깐 빠졌다 다시 쳐도 같은 콤보로 계산된다.</p>
    <p><b>일반 패링</b> 가드 상태로 막으면 피해 50%, 가드 게이지 소모. 상대의 공격권은 유지된다.</p>
    <p><b>완벽패링</b> 공격이 닿기 직전에 가드를 누르면 피해가 거의 없고 상대 공격이 끊긴다 → 반격 기회. 궁극기도 끊을 수 있다. 연타하면 실패한다.</p>
    <p><b>가드 브레이크</b> 가드 게이지가 0이 되면 잠시 기절. 상대는 강공격으로 특수강공을 쓸 수 있다.</p>
    <p><b>궁극기</b> 즉시 발동, 일반 공격에 끊기지 않고 일반 가드로 막을 수 없다. 오직 완벽패링만 통한다.</p>
    <p><b>점프</b> 지상 공격을 피한다. 하강 중 공격 버튼으로 낙하 공격(착지 후딜레이 있음).</p>
    <p>Esc / P: 일시정지 · F2: 판정 박스 표시</p>
  </div>`;
}
