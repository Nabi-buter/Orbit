// =============================================================================
// 게임 흐름 (화면 전환 + 고정 60fps 루프). 모든 화면은 도트 캔버스에 그린다.
// 타이틀 → 플레이(로드아웃: 캐릭터 + 하단 무기 1열, 모드 선택) → 대전 → 결과
// =============================================================================

import { FPS } from '../config/balance.js';
import { WEAPONS, WEAPON_ORDER } from '../config/weapons.js';
import { Match } from '../core/match.js';
import { EMPTY_INPUT } from '../core/fighter.js';
import { AIController, DIFFICULTY } from '../ai/ai.js';
import { STYLE_LABEL, PATTERN_LABEL } from '../ai/predictor.js';
import { Keyboard } from '../input/keyboard.js';
import { Renderer, hitstopFor, UI, TEAM } from '../render/renderer.js';
import { sfx, playEvent } from '../render/sfx.js';
import { NetClient } from '../net/client.js';
import { RoomNet, openRoom } from '../net/roomNet.js';
import { PeerLobby, loadPeerJS } from '../net/peerLobby.js';
import { Lockstep } from '../net/lockstep.js';
import { TitleScreen, LoadoutScreen, HelpScreen, MenuOverlay, OnlineScreen } from '../ui/screens.js';

const STEP = 1000 / FPS;
const INTRO_FRAMES = 96;

export class App {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.keyboard = new Keyboard();
    this.renderer = new Renderer(canvas);
    this.scene = 'title';
    this.screen = null;   // 현재 UI 화면 (대전 중에는 오버레이)
    this.mode = 'pve';
    this.weapons = ['longsword', 'longsword'];
    this.difficulty = 'normal';
    this.cpuWeapon = 'random';
    this.match = null;
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();

    window.addEventListener('keydown', (e) => this.onKey(e));
    // pointerdown: 마우스와 터치 탭 모두 (메뉴는 탭으로 조작)
    canvas.addEventListener('pointerdown', (e) => {
      canvas.focus();
      const [x, y] = this.renderer.toArt(e.clientX, e.clientY);
      this.screen?.onClick?.(x, y);
    });
    canvas.addEventListener('mousemove', (e) => {
      const [x, y] = this.renderer.toArt(e.clientX, e.clientY);
      this.screen?.onMove?.(x, y);
    });
    this.toTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  // --- 화면 전환 -------------------------------------------------------------
  toTitle() {
    this.scene = 'title';
    this.match = null;
    this.screen = new TitleScreen({
      onPlay: () => this.toLoadout(),
      onOnline: () => this.toLoadout({ mode: 'online' }),
      onHelp: () => this.toHelp(),
    });
  }

  toHelp() {
    this.scene = 'help';
    this.screen = new HelpScreen({ onBack: () => this.toTitle() });
  }

  /** 플레이: 가운데 캐릭터 + 하단 무기 1열 */
  toLoadout(o = {}) {
    this.scene = 'loadout';
    this.match = null;
    this.screen = new LoadoutScreen({
      player: 0,
      weapon: this.weapons[0],
      mode: o.mode ?? (this.mode === 'online' ? 'online' : this.mode === 'local' ? 'local' : 'pve'),
      difficulty: this.difficulty,
      cpuWeapon: this.cpuWeapon,
      onBack: () => this.toTitle(),
      onStart: ({ weapon, mode, difficulty, cpuWeapon }) => {
        this.weapons[0] = weapon;
        this.mode = mode;
        this.difficulty = difficulty;
        this.cpuWeapon = cpuWeapon;
        if (mode === 'pve') {
          this.weapons[1] = cpuWeapon === 'random' ? WEAPON_ORDER[Math.floor(Math.random() * 6)] : cpuWeapon;
          this.startMatch();
        } else if (mode === 'local') {
          this.toLoadoutP2();
        } else {
          this.toOnline();
        }
      },
    });
  }

  toLoadoutP2() {
    this.scene = 'loadout';
    this.screen = new LoadoutScreen({
      player: 1, weapon: this.weapons[1], mode: 'local', lockMode: true, title: 'P2 준비',
      onBack: () => this.toLoadout({ mode: 'local' }),
      onStart: ({ weapon }) => { this.weapons[1] = weapon; this.startMatch(); },
    });
  }

  startMatch() {
    this.scene = 'battle';
    this.paused = false;
    this.screen = null;
    this.match = new Match({ weapons: this.weapons });
    this.ai = this.mode === 'pve' ? new AIController(this.difficulty) : null;
    this.renderer.reset();
    this.hitstop = 0;
    this.intro = INTRO_FRAMES;
    this.acc = 0;
    this.canvas.focus();
  }

  pause() {
    if (this.scene !== 'battle' || this.match.over) return;
    this.paused = true;
    this.screen = new MenuOverlay({
      title: 'PAUSE',
      items: [['계속하기', () => this.resume(), true], ['재시작', () => this.startMatch()], ['무기 선택', () => this.toLoadout()], ['메인 화면', () => this.toTitle()]],
      onBack: () => this.resume(),
    });
  }

  resume() {
    this.paused = false;
    this.screen = null;
    this.last = performance.now();
    this.acc = 0;
  }

  toResult(net = {}) {
    this.scene = 'result';
    const m = this.match;
    const names = this.playerNames();
    const online = this.mode === 'online';
    if (online && (net.peerLeft || net.disconnected)) {
      this.lockstep = null;
      this.screen = new MenuOverlay({
        title: net.peerLeft ? '승리' : '연결 끊김',
        titleColor: net.peerLeft ? UI.gold : UI.red,
        subtitle: net.peerLeft ? '상대가 대전을 떠났습니다' : '서버와의 연결이 끊어졌습니다',
        items: [['온라인 로비', () => this.toOnline(), true], ['메인 화면', () => this.leaveOnline()]],
      });
      return;
    }
    if (online) { this.net?.send({ t: 'end', m: this.lockstep?.matchId }); this.lockstep = null; }

    let title, color;
    if (m.winner === 'draw') { title = 'DRAW'; color = UI.paper; }
    else if (this.mode === 'pve' || online) {
      const mine = online ? this.slot : 0;
      title = m.winner === mine ? 'WIN!' : 'LOSE';
      color = m.winner === mine ? UI.gold : UI.red;
    } else { title = `P${m.winner + 1} WIN!`; color = TEAM[m.winner].ui; }
    const reason = m.endReason === 'ko' ? (m.round > 1 ? `${m.round}라운드 끝에 K.O.` : 'K.O.') : '시간 종료';
    // 기록은 짧게: 무기 · 적중 · 완벽패링
    const lines = m.fighters.map((f, i) => [
      `${WEAPONS[this.weapons[i]].name}  적중 ${f.stats.hitsLanded}  완벽패링 ${f.stats.perfects}`, TEAM[i].ui,
    ]);
    const items = online
      ? [['로비로 (재대결)', () => this.toOnline(), true], ['나가기', () => this.leaveOnline()]]
      : [['다시 대전', () => this.startMatch(), true], ['무기 선택', () => this.toLoadout()], ['메인 화면', () => this.toTitle()]];
    this.screen = new MenuOverlay({ title, titleColor: color, subtitle: reason, lines, items });
  }

  playerNames() {
    if (this.mode === 'online') return this.slot === 0 ? ['나', '상대'] : ['상대', '나'];
    return this.mode === 'pve' ? ['플레이어', `CPU ${DIFFICULTY[this.difficulty].label}`] : ['P1', 'P2'];
  }

  // --- 온라인 대전 ------------------------------------------------------------
  async toOnline() {
    this.scene = 'online';
    this.mode = 'online';
    this.match = null;
    const screen = new OnlineScreen({
      onBack: () => this.leaveOnline(),
      onCreate: () => this.net?.send({ t: 'create' }),
      onJoin: (code) => this.net?.send({ t: 'join', code }),
      onSelect: (weapon) => { this.weapons[0] = weapon; this.net?.send({ t: 'select', weapon }); },
      onReady: (ready) => this.net?.send({ t: 'ready', ready }),
      onLeave: () => { this.net?.send({ t: 'leave' }); this.setNet({ phase: 'connect', error: null }); },
    });
    this.screen = screen;
    // 이미 방에 있으면 그대로 돌아간다 (잠깐 연결이 흔들려도 다시 접속하지 않음 — 다시 접속하면 방을 나가게 된다)
    if (this.net && this.netState?.phase === 'room') { screen.setState(this.netState); return; }
    this.setNet({ phase: 'connecting', error: null });
    try {
      this.net?.close();
      // 공유 링크(게임 파일만 있는 페이지): 서버 대신 페이지의 실시간 방 기능으로 중계
      let net;
      if (window.ORBIT_STATIC) {
        // claude.ai 공유 링크: 페이지 실시간 방 기능 / 그 밖의 웹 주소(GitHub Pages 등): 브라우저끼리 직접 연결(WebRTC)
        const room = await openRoom();
        if (room) net = new RoomNet(room);
        else if (window.claude?.use) {
          // claude.ai 안인데 방 기능을 못 씀 (로그인·권한 문제)
          this.setNet({ phase: 'connecting', error: '이 화면에서는 온라인 대전을 쓸 수 없습니다. claude.ai 에 로그인한 상태로 공유 링크를 열어 주세요 (참여자 이상 권한 필요).' });
          return;
        } else {
          const Peer = await loadPeerJS();
          net = new RoomNet(new PeerLobby(Peer), { net: { flushMs: 17, window: 12 } });
        }
      } else {
        net = new NetClient(NetClient.defaultUrl());
      }
      this.net = net;
      this.bindNet(net);
      await net.connect();
      if (this.net !== net) return;
      this.setNet({ phase: 'connect', error: null });
    } catch (e) {
      this.setNet({ phase: 'connect', error: window.ORBIT_STATIC ? e.message : `${e.message} npm start 로 실행한 서버 주소로 접속했는지 확인하세요.` });
    }
  }

  setNet(st) {
    this.netState = st;
    if (this.scene === 'online' && this.screen instanceof OnlineScreen) this.screen.setState(st);
  }

  bindNet(net) {
    net
      .on('joined', (m) => {
        Object.assign(this.netState, { phase: 'room', code: m.code, slot: m.slot, error: null });
        net.send({ t: 'select', weapon: this.weapons[0] }); // 로드아웃에서 고른 무기
      })
      .on('lobby', (m) => this.setNet({ ...this.netState, phase: 'room', code: m.code, connected: m.connected, weapons: m.weapons, ready: m.ready, playing: m.playing }))
      .on('error', (m) => this.setNet({ ...this.netState, error: m.msg }))
      .on('roomClosed', (m) => this.setNet({ phase: 'connect', error: m.msg }))
      .on('ping', (m) => { if (this.netState) { this.netState.rtt = m.rtt; this.netState.peerRtt = m.peerRtt; } })
      .on('start', (m) => this.startOnlineMatch(m))
      .on('input', (m) => { if (this.lockstep && m.m === this.lockstep.matchId) this.lockstep.onRemoteInput(m.f, m.i); })
      .on('hash', (m) => { if (this.lockstep && m.m === this.lockstep.matchId) this.lockstep.onRemoteHash(m.f, m.h); })
      .on('peerLeft', () => {
        if (this.scene === 'battle' && this.mode === 'online' && !this.match.over) this.toResult({ peerLeft: true });
      })
      .on('close', () => {
        if (this.net !== net) return;
        this.net = null;
        if (this.scene === 'battle' && this.mode === 'online') this.toResult({ disconnected: true });
        else if (this.scene === 'online') this.setNet({ phase: 'connect', error: '서버와 연결이 끊어졌습니다.' });
      });
  }

  leaveOnline() {
    this.net?.send({ t: 'leave' });
    this.net?.close();
    this.net = null;
    this.lockstep = null;
    this.netState = null;
    this.toTitle();
  }

  startOnlineMatch(msg) {
    this.mode = 'online';
    this.weapons = [...msg.weapons];
    this.slot = msg.slot;
    this.netDelay = msg.delay;
    this.lockstep = new Lockstep({ slot: msg.slot, delay: msg.delay, matchId: msg.matchId, send: (m) => this.net?.send(m) });
    this.onlineMenuOpen = false;
    this.startMatch();
  }

  toggleOnlineMenu() {
    if (this.match.over) return;
    this.onlineMenuOpen = !this.onlineMenuOpen;
    if (!this.onlineMenuOpen) { this.screen = null; return; }
    this.screen = new MenuOverlay({
      title: 'MENU',
      subtitle: '온라인 대전 중에는 게임이 멈추지 않습니다',
      items: [['계속하기', () => this.toggleOnlineMenu(), true], ['대전 나가기 (기권)', () => {
        this.onlineMenuOpen = false; this.net?.send({ t: 'leave' }); this.lockstep = null;
        this.netState = { phase: 'connect', error: null }; this.toOnline();
      }]],
      onBack: () => this.toggleOnlineMenu(),
    });
  }

  // --- 입력 ------------------------------------------------------------------
  onKey(e) {
    if (e.repeat) return;
    if (e.code === 'KeyM' && !(this.screen instanceof OnlineScreen)) { sfx.muted = !sfx.muted; return; }
    if (this.scene === 'battle') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (this.mode === 'online') this.toggleOnlineMenu();
        else this.paused ? this.resume() : this.pause();
        return;
      }
      if ((this.paused || this.onlineMenuOpen) && this.screen?.onKey(e)) { e.preventDefault(); return; }
      if (e.code === 'F2') { e.preventDefault(); this.renderer.showBoxes = !this.renderer.showBoxes; }
      return;
    }
    if (this.screen?.onKey(e)) e.preventDefault();
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
    const ctx = this.renderer.begin();
    if (this.match) {
      this.renderer.drawBattle(this.match, {
        names: this.playerNames(), dt,
        frozen: this.paused || this.hitstop > 0,
        intro: this.introText(),
        net: this.mode === 'online' && this.scene === 'battle' ? this.netInfo() : null,
        ai: this.ai ? this.aiInfo() : null,
      });
    }
    this.screen?.draw(ctx);
    this.renderer.present();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** PvE: AI 가 플레이어를 어떻게 분석하고 있는지 */
  aiInfo() {
    const LABEL = { light: '약공', heavy: '강공', guard: '가드', dashIn: '접근', retreat: '후퇴', jump: '점프', wait: '대기', ult: '궁극기' };
    const p = this.ai.lastPrediction;
    const pat = this.ai.activePattern(this.match.frame);
    return { style: pat ? `${PATTERN_LABEL[pat]} → 공략 중` : STYLE_LABEL[this.ai.model.style()], predict: p && p.p >= 0.28 ? LABEL[p.action] : null };
  }

  netInfo() {
    const ls = this.lockstep;
    return {
      text: `온라인 · 핑 ${this.net?.rtt ?? '-'}ms · 지연 ${this.netDelay}F`,
      waiting: !!ls && ls.stalled > 20,
      desync: ls?.desyncAt != null,
    };
  }

  introText() {
    if (!this.match || this.scene !== 'battle') return null;
    const ri = this.match.roundIntro;
    if (this.intro <= 0 && ri > 0) return { text: ri > 28 ? `ROUND ${this.match.round}` : 'FIGHT!' };
    if (this.intro <= 0) return null;
    return { text: this.intro > 30 ? 'READY' : 'FIGHT!' };
  }

  tick() {
    const m = this.match;
    if (this.intro > 0) {
      if (this.intro === 30) playEvent('fight');
      this.intro--;
      this.keyboard.endFrame();
      return;
    }
    if (this.hitstop > 0) { this.hitstop--; return; }
    let inputs;
    if (this.mode === 'online') {
      const ls = this.lockstep;
      if (!ls) return;
      if (ls.needsLocal()) {
        const mine = { ...EMPTY_INPUT };
        if (!this.onlineMenuOpen) {
          const a = this.keyboard.sample(0), b = this.keyboard.sample(1);
          for (const k of Object.keys(mine)) mine[k] = a[k] || b[k];
        }
        ls.pushLocal(mine);
        this.keyboard.endFrame();
      }
      inputs = ls.next();
      if (!inputs) return;
    } else {
      const p1 = this.keyboard.sample(0);
      const p2 = this.ai ? this.ai.think(m, 1) : this.keyboard.sample(1);
      inputs = [p1, p2];
      this.keyboard.endFrame();
    }
    const events = m.step(inputs);
    this.lockstep?.afterStep(m);
    this.renderer.pushEvents(events, m);
    if (m.roundIntro === 28) playEvent('fight');
    this.hitstop = hitstopFor(events);
    if (m.over) this.toResult();
  }
}
