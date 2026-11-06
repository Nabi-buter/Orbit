// =============================================================================
// 게임 흐름 (화면 전환 + 고정 60fps 루프). 모든 화면은 도트 캔버스에 그린다.
// 타이틀 → 플레이(로드아웃: 캐릭터 + 하단 무기 1열, 모드 선택) → 대전 → 결과
// =============================================================================

import { FPS, BALANCE } from '../config/balance.js';
import { WEAPONS, WEAPON_ORDER, randomWeapon } from '../config/weapons.js';
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
import { TitleScreen, LoadoutScreen, HelpScreen, MenuOverlay, OnlineScreen, SettingsScreen } from '../ui/screens.js';

const STEP = 1000 / FPS;
/** 훈련장 더미의 몸(체력 등)으로 쓸 무기 — 무기는 그리지 않는다 */
const DUMMY_BODY = 'longsword';
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
    this.picks = [null, null]; // 무기 선택 화면에서 고른 것 ('random' 이면 대전마다 새로 뽑음)
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
      onSettings: () => this.toSettings(),
    });
  }

  toSettings() {
    this.scene = 'settings';
    this.screen = new SettingsScreen({ onBack: () => this.toTitle() });
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
      weapon: this.picks[0] ?? this.weapons[0],
      mode: o.mode ?? (['online', 'training'].includes(this.mode) ? this.mode : 'pve'),
      difficulty: this.difficulty,
      cpuWeapon: this.cpuWeapon,
      onBack: () => this.toTitle(),
      onStart: ({ weapon, pick, mode, difficulty, cpuWeapon }) => {
        this.weapons[0] = weapon;
        this.picks[0] = pick;
        this.mode = mode;
        this.difficulty = difficulty;
        this.cpuWeapon = cpuWeapon;
        if (mode === 'online') this.toOnline();
        else this.startMatch(); // AI 대전 · 훈련장
      },
    });
  }

  startMatch() {
    // 무작위로 고른 쪽은 대전(재시작·다시 대전 포함)마다 새로 뽑는다. 온라인은 방에서 정한 무기 그대로
    if (this.mode !== 'online') {
      if (this.picks[0] === 'random') this.weapons[0] = randomWeapon();
      // 훈련장 더미는 무기를 들지 않는다 (판정·체력 계산용 기본 무기만 두고 그리지 않음)
      const other = this.mode === 'training' ? DUMMY_BODY : this.cpuWeapon;
      this.weapons[1] = other === 'random' ? randomWeapon() : other;
    }
    this.scene = 'battle';
    this.paused = false;
    this.screen = null;
    // 훈련장: 시간 제한 없음 (더미는 쓰러지지 않음 — tick 의 trainingAssist)
    const roundSeconds = this.mode === 'online' && this.netTime != null ? this.netTime : this.mode === 'training' ? 0 : undefined;
    this.match = new Match({ weapons: this.weapons, ...(roundSeconds !== undefined ? { roundSeconds } : {}) });
    if (this.mode === 'training') this.match.fighters[1].unarmed = true;
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

  /**
   * 훈련장 보조: 더미는 쓰러지지 않고(체력이 줄면 다시 채움), 잠시 안 맞으면 체력·자세가 회복된다.
   * 플레이어는 궁극기 게이지가 늘 차 있어 궁극기도 바로 시험할 수 있다.
   */
  trainingAssist(m) {
    const [me, dummy] = m.fighters;
    dummy.unarmed = true; // (라운드가 바뀌어 새로 만들어져도)
    if (me.state !== 'ultimate') me.ult = Math.max(me.ult, BALANCE.ultimate.cost);
    const since = m.frame - (dummy.flash?.frame ?? -999);
    if (dummy.hp < dummy.maxHp * 0.35 || (since > 120 && dummy.hp < dummy.maxHp)) dummy.hp = dummy.maxHp;
    if (since > 120) dummy.guard = BALANCE.fighter.maxGuard;
  }

  playerNames() {
    if (this.mode === 'online') return this.slot === 0 ? ['나', '상대'] : ['상대', '나'];
    return this.mode === 'pve' ? ['플레이어', DIFFICULTY[this.difficulty].name] : ['플레이어', '더미'];
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
      onTime: (time) => this.net?.send({ t: 'time', time }),
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
          net = new RoomNet(new PeerLobby(Peer), { net: { flushMs: 17 } });
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
      .on('lobby', (m) => this.setNet({ ...this.netState, error: this.netState?.phase === 'room' && m.connected?.[1] && !this.netState?.connected?.[1] ? null : this.netState?.error, phase: 'room', code: m.code, connected: m.connected, weapons: m.weapons, ready: m.ready, playing: m.playing, time: m.time }))
      .on('error', (m) => this.setNet({ ...this.netState, error: m.msg }))
      .on('roomClosed', (m) => this.setNet({ phase: 'connect', error: m.msg }))
      .on('ping', (m) => { if (this.netState) { this.netState.rtt = m.rtt; this.netState.peerRtt = m.peerRtt; } })
      .on('start', (m) => this.startOnlineMatch(m))
      .on('input', (m) => {
        if (!this.lockstep || m.m !== this.lockstep.matchId) return;
        this.lockstep.onRemoteInput(m.f, m.i);
        // 이 탭이 가려져 있으면(다른 탭·창 뒤, 앱 전환) 화면 루프가 멈춘다 → 상대 입력이 올 때마다 따라 진행
        if (typeof document !== 'undefined' && document.hidden && !this.catchUpQueued) {
          this.catchUpQueued = true;
          queueMicrotask(() => { this.catchUpQueued = false; this.catchUpHidden(); });
        }
      })
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
    this.netTime = msg.time ?? BALANCE.round.onlineDefault;
    this.lockstep = new Lockstep({ slot: msg.slot, delay: msg.delay, matchId: msg.matchId, send: (m) => this.net?.send(m) });
    this.onlineMenuOpen = false;
    this.startMatch();
  }

  /**
   * 가려진 탭에서 온라인 대전 따라가기: 브라우저가 화면 루프(requestAnimationFrame)와 타이머를 멈추거나 늦추므로,
   * 상대 입력이 도착하면 진행할 수 있는 만큼 진행하고 내 입력(빈 입력)을 바로 보낸다.
   * 안 하면 상대는 내 입력을, 나는 화면이 돌아오기를 기다리며 양쪽이 멈춘다.
   */
  catchUpHidden() {
    if (this.scene !== 'battle' || this.mode !== 'online') return;
    for (let i = 0; i < 900; i++) {
      const ls = this.lockstep;
      if (!ls || this.scene !== 'battle') break;
      const s0 = ls.stalled;
      this.tick();
      if (ls.stalled > s0) break; // 상대 입력을 기다리는 곳까지 왔다
    }
    this.net?.flushInputs?.();
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
    // 설정에서 새 키를 기다리는 중이면 어떤 키든 그 화면이 받는다
    if (this.screen?.capturing) { this.screen.onKey(e); e.preventDefault(); return; }
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
    if (this.scene === 'battle' && !this.paused && !(typeof document !== 'undefined' && document.hidden)) {
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
        note: this.mode === 'training' && this.scene === 'battle' ? '훈련장 · F2 판정 보기' : null,
        ai: this.ai ? this.aiInfo() : null,
      });
    }
    // 대전 위에 메뉴(일시정지·결과·온라인 메뉴)를 띄울 때는 층을 나눠 메뉴가 대전 글자를 덮게
    if (this.match && this.screen) this.renderer.flushLayer();
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
          Object.assign(mine, this.keyboard.sample(0));
        }
        ls.pushLocal(mine);
        this.keyboard.endFrame();
      }
      inputs = ls.next();
      if (!inputs) return;
    } else {
      const p1 = this.keyboard.sample(0);
      // 훈련장 더미는 아무 조작도 하지 않는다 (무기를 든 자세 그대로)
      const p2 = this.ai ? this.ai.think(m, 1) : EMPTY_INPUT;
      inputs = [p1, p2];
      this.keyboard.endFrame();
      if (this.mode === 'training') this.trainingAssist(m);
    }
    const events = m.step(inputs);
    this.lockstep?.afterStep(m);
    this.renderer.pushEvents(events, m);
    if (m.roundIntro === 28) playEvent('fight');
    this.hitstop = hitstopFor(events);
    if (m.over) this.toResult();
  }
}
