// =============================================================================
// 온라인 대전 — 서버 없이 공유 페이지의 실시간 방(room) 기능으로 중계
// -----------------------------------------------------------------------------
// NetClient(WebSocket)와 같은 모양(on / send / connect / close / connected / rtt)이라
// 게임 코드는 어느 쪽인지 모른다. 서버(server/rooms.js)가 하던 일을 방을 만든 쪽(호스트)이 한다.
//
//   방 만들기: 4자리 코드 → 이름 붙은 방 "duel-<코드>" 에 들어가 호스트(1P)가 됨
//   코드로 참가: 같은 방에 들어가 hello → 호스트가 자리(2P)를 배정
//   로비 상태(무기·준비)는 호스트가 정하고 1초마다 다시 알림 (메시지가 빠져도 맞춰짐)
//   시간 제한: 방장만 바꿀 수 있고(무제한 포함) 로비 상태와 start 에 실려 양쪽이 같은 값으로 경기를 만든다
//   시작: 호스트가 양쪽 준비를 확인하면 start (상대 첫 입력이 올 때까지 반복)
//   입력: 3프레임마다 묶어 보낸다. 상대가 "여기까지 받았다"(a)고 알려 줄 때까지 받지 못한 입력을 계속 다시 싣는다
//         (화면이 잠깐 멈췄다 몰아서 진행해도 빠지는 프레임이 없다 — 예전 '최근 N프레임만 다시 보내기'는 서로 기다리며 멈췄음)
//   나감: bye 또는 방 참가자 목록에서 사라지면 peerLeft
// 전송 제한(초당 약 40회, 4KB)을 지키도록 입력 20회/초 + 핑 1회/초 + 해시 1회/초.
// =============================================================================

import { WEAPON_ORDER } from '../config/weapons.js';
import { BALANCE } from '../config/balance.js';

/** 방장이 고를 수 있는 시간 제한(초, 0 = 무제한) */
export const TIME_OPTIONS = BALANCE.round.timeOptions;
export const validTime = (s) => TIME_OPTIONS.includes(s);

const FRAME_MS = 1000 / 60;
/**
 * 통신 규약 버전: 메시지 모양이나 경기 진행(입력 묶음 등)을 바꾸면 올린다.
 * 배포 주소(GitHub Pages)에서는 빌드 번호(커밋)까지 같아야 함께 할 수 있다 — 같은 입력으로 같은 결과가 나와야 하므로
 * (기기 하나가 예전 버전을 캐시로 들고 있으면 준비·입력이 엇갈려 멈춘다).
 */
export const PROTOCOL = 6;
export function buildVersion() {
  const b = typeof window !== 'undefined' ? window.ORBIT_VERSION : null;
  return b ? `${PROTOCOL}-${b}` : String(PROTOCOL);
}
/** 참가자 목록에서 빠진 상대를 나간 것으로 보기까지 (짧은 재연결은 무시) */
const GONE_GRACE = 6000;
export const ROOM_NET = {
  flushMs: 50,        // 입력 묶음 전송 주기 (3프레임)
  maxBatch: 120,      // 한 메시지에 싣는 최대 입력 프레임 수 (받았다는 확인이 올 때까지 다시 보냄)
  lobbyEveryMs: 1000, // 로비 상태 재전송
  pingEveryMs: 1000,
  joinTimeoutMs: 4000,
  minDelay: 3,
  maxDelay: 12,
};
/** 방에서 쓰는 주제 (게시할 때 참여자 이상에게 열어 둔다) */
export const ROOM_TOPICS = ['hello', 'assign', 'lobby', 'ctl', 'start', 'in', 'hs', 'pg', 'po', 'bye'];

/** 방 코드에 쓰는 글자 (헷갈리는 I·O·0·1 제외, 서버와 같음) */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(rand = Math.random) {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return c;
}

/** 왕복 지연과 묶음 전송 지연을 보고 입력 지연(프레임) 결정 */
export function roomDelayFor(rtts, flushMs = ROOM_NET.flushMs) {
  const worst = Math.max(...rtts.map((r) => r ?? 150));
  const d = Math.ceil((worst / 2 + flushMs) / FRAME_MS) + 1;
  return Math.max(ROOM_NET.minDelay, Math.min(ROOM_NET.maxDelay, d));
}

export class RoomNet {
  /**
   * @param {object} lobbyRoom  `await claude.use("room")` 의 결과 (테스트에서는 같은 모양의 가짜)
   * @param {object} [opts]     { now, setInterval, clearInterval, setTimeout } — 테스트용 시계
   */
  constructor(lobbyRoom, opts = {}) {
    this.lobby = lobbyRoom;
    this.handlers = new Map();
    this.now = opts.now ?? (() => Date.now());
    this.timers = {
      setInterval: opts.setInterval ?? ((f, ms) => setInterval(f, ms)),
      clearInterval: opts.clearInterval ?? ((id) => clearInterval(id)),
      setTimeout: opts.setTimeout ?? ((f, ms) => setTimeout(f, ms)),
    };
    this.rand = opts.rand ?? Math.random;
    // 전송 방식별 설정: 직접 연결(WebRTC)은 매 프레임 보낼 수 있다
    this.cfg = { ...ROOM_NET, ...(opts.net ?? {}) };
    this.version = opts.version ?? buildVersion();
    this.room = null;        // 이름 붙은 방
    this.unsubs = [];
    this.intervals = [];
    this.rtt = null;
    this.peerRtt = null;
    this.reset();
  }

  reset() {
    this.code = null;
    this.slot = -1;
    this.host = false;
    this.otherPeer = null;
    this.state = null;       // 호스트: { weapons, ready, playing, matchId, delay }
    this.matchId = 0;
    this.recvNext = 0; this.peerAck = 0; this.recvDirty = false;
    this.sentInputs = new Map();
    this.pending = false;
    this.startAcked = true;
    this.lastStart = null;
    this.want = null;
    this.matchIdle = false;
    this.goneAt = null;
    this.seenTime = null;
    this.lastLobby = null;
  }

  on(type, fn) { this.handlers.set(type, fn); return this; }
  emitLocal(type, msg = {}) { this.handlers.get(type)?.({ t: type, ...msg }); }

  get connected() { return !!this.lobby && (this.lobby.connected?.() ?? true); }

  /** 방 기능이 연결될 때까지 (최대 5초) */
  async connect() {
    if (!this.lobby) throw new Error('이 화면에서는 온라인 대전 기능을 쓸 수 없습니다.');
    if (this.connected) return this;
    await new Promise((resolve, reject) => {
      let done = false;
      const un = this.lobby.onConnection((c) => { if (c && !done) { done = true; un?.(); resolve(); } }, (e) => {
        if (!done) { done = true; reject(new Error(e.code === 'not_granted' ? '로그인했고 이 페이지에 참여자 이상 권한이 있어야 온라인 대전을 할 수 있습니다.' : '온라인 연결에 실패했습니다.')); }
      });
      this.timers.setTimeout(() => { if (!done) { done = true; un?.(); reject(new Error('온라인 연결 시간이 초과되었습니다.')); } }, 5000);
    });
    return this;
  }

  // --- 게임 쪽에서 오는 메시지 (서버 프로토콜과 같음) -----------------------------
  send(msg) {
    switch (msg.t) {
      case 'create': this.create(); break;
      case 'join': this.joinCode(msg.code); break;
      case 'leave': this.leaveRoom(); break;
      case 'select': this.control({ op: 'select', weapon: msg.weapon }); break;
      case 'time': if (this.host) this.hostControl(0, { op: 'time', time: msg.time }); break;
      case 'ready': this.control({ op: 'ready', ready: !!msg.ready }); break;
      case 'end': this.control({ op: 'end', m: msg.m }); break;
      case 'input':
        if (msg.m !== this.matchId) return;
        if (msg.f < this.peerAck) return;
        this.sentInputs.set(msg.f, msg.i);
        this.pending = true;
        break;
      case 'hash':
        this.room?.emit('hs', { m: msg.m, f: msg.f, h: msg.h }).catch(() => {});
        break;
      default: break;
    }
  }

  close() { this.leaveRoom(); }

  // --- 방 들어가기 ------------------------------------------------------------
  async enter(code) {
    await this.leaveRoom(true);
    this.code = code;
    this.room = await this.lobby.join(`duel-${code.toLowerCase()}`);
    const r = this.room;
    const on = (topic, fn) => this.unsubs.push(r.on(topic, (m) => {
      if (m.sameTab) return; // 내 메아리만 무시 (isMe 는 "같은 계정의 다른 탭·기기"도 포함 → 혼자 두 기기로 시험할 때 막힘)
      if (m.peer === this.otherPeer) this.goneAt = null; // 소식이 오면 살아 있음
      fn(m.data ?? {}, m);
    }));
    on('hello', (d, m) => this.host && this.onHello(m.peer, d.v));
    on('assign', (d, m) => this.onAssign(d, m.peer));
    on('lobby', (d, m) => { if (!this.host && m.peer === this.otherPeer) this.applyLobby(d); });
    on('ctl', (d, m) => { if (this.host && m.peer === this.otherPeer) this.hostControl(1, d); });
    on('start', (d, m) => { if (!this.host && m.peer === this.otherPeer) this.onStart(d); });
    on('in', (d, m) => { if (m.peer === this.otherPeer) this.onInputs(d); });
    on('hs', (d, m) => { if (m.peer === this.otherPeer && d.m === this.matchId) this.emitLocal('hash', { m: d.m, f: d.f, h: d.h }); });
    on('pg', (d, m) => { if (m.peer === this.otherPeer) { this.peerRtt = d.rtt ?? null; r.emit('po', { ts: d.ts }).catch(() => {}); } });
    on('po', (d, m) => {
      if (m.peer !== this.otherPeer || typeof d.ts !== 'number') return;
      this.rtt = Math.min(2000, this.now() - d.ts);
      this.emitLocal('ping', { rtt: this.rtt, peerRtt: this.peerRtt });
    });
    // 확실히 나감(bye)은 바로, 참가자 목록에서 잠깐 빠진 것은 재연결일 수 있으니 유예 후 판단
    on('bye', (d, m) => { if (m.peer === this.otherPeer) this.onPeerGone(); });
    this.unsubs.push(r.onPeers((ch) => {
      if (!this.otherPeer) return;
      const gone = ch.left.find((p) => p.peer === this.otherPeer);
      if (gone?.final) this.onPeerGone();      // 전송 방식이 확실하다고 알려 줌 (직접 연결 닫힘)
      else if (gone) this.suspectGone();
      if (ch.joined.some((p) => p.peer === this.otherPeer)) this.goneAt = null;
    }));
    this.intervals.push(this.timers.setInterval(() => this.tick(), this.cfg.flushMs));
    this.intervals.push(this.timers.setInterval(() => this.otherPeer && r.emit('pg', { ts: this.now(), rtt: this.rtt }).catch(() => {}), this.cfg.pingEveryMs));
    return r;
  }

  async create() {
    try {
      await this.enter(makeCode(this.rand));
      this.host = true;
      this.slot = 0;
      this.state = { weapons: ['longsword', 'longsword'], ready: [false, false], playing: false, matchId: 0, time: BALANCE.round.onlineDefault };
      this.lastLobbyAt = 0;
      this.emitLocal('joined', { code: this.code, slot: 0 });
      this.broadcastLobby();
    } catch (e) {
      this.emitLocal('error', { msg: e?.userMessage ?? '방을 만들 수 없습니다. 잠시 뒤 다시 시도하세요.' });
    }
  }

  async joinCode(raw) {
    const code = String(raw || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{4}$/.test(code)) { this.emitLocal('error', { msg: '코드는 4자리입니다.' }); return; }
    try {
      await this.enter(code);
    } catch (e) {
      this.emitLocal('error', { msg: e?.userMessage ?? '방에 들어갈 수 없습니다.' });
      return;
    }
    this.host = false;
    this.joinToken = Math.floor(this.rand() * 1e9);
    // 호스트가 답할 때까지 몇 번 인사, 끝내 답이 없으면 없는 방
    let tries = 0;
    const hello = () => {
      if (this.slot >= 0 || !this.room) return;
      if (tries++ * 700 >= this.cfg.joinTimeoutMs) {
        this.emitLocal('error', { msg: '방을 찾을 수 없습니다.' });
        this.leaveRoom(true);
        return;
      }
      this.room.emit('hello', { token: this.joinToken, v: this.version }).catch(() => {});
      this.timers.setTimeout(hello, 700);
    };
    hello();
  }

  onHello(peer, v) {
    // 게임 버전이 다르면 들이지 않는다 (서로 다른 규칙으로는 같은 경기를 계산할 수 없음)
    if (v !== this.version && peer !== this.otherPeer) {
      this.room.emit('assign', { to: peer, slot: -2, v: this.version }).catch(() => {});
      if (this.badVersionPeer !== peer) {
        this.badVersionPeer = peer;
        this.emitLocal('error', { msg: '참가하려는 상대의 게임 버전이 다릅니다. 상대에게 페이지를 새로고침해 달라고 하세요.' });
      }
      return;
    }
    if (!this.otherPeer) {
      this.otherPeer = peer;
      this.state.ready = [false, false];
    }
    // 이미 다른 사람이 2P 면 가득 참
    this.room.emit('assign', { to: peer, slot: peer === this.otherPeer ? 1 : -1, v: this.version }).catch(() => {});
    this.broadcastLobby();
    this.pingNow();
  }

  onAssign(d, from) {
    if (this.host || this.slot >= 0) return;
    const me = this.myPeer();
    if (me && d.to !== me) return;
    if (d.slot === -2 || d.v !== this.version) {
      this.emitLocal('error', { msg: '방장과 게임 버전이 다릅니다. 두 기기 모두 페이지를 새로고침한 뒤 다시 참가하세요.' });
      this.leaveRoom(true);
      return;
    }
    if (d.slot !== 1) { this.emitLocal('error', { msg: '방이 가득 찼습니다.' }); this.leaveRoom(true); return; }
    this.slot = 1;
    this.otherPeer = from; // 자리를 배정한 쪽이 호스트
    this.matchIdle = true;
    this.emitLocal('joined', { code: this.code, slot: 1 });
    this.pingNow();
  }

  /** 상대가 정해지면 바로 핑 (입력 지연을 정할 때 실제 왕복 지연을 쓰도록) */
  pingNow() { if (this.otherPeer) this.room?.emit('pg', { ts: this.now(), rtt: this.rtt }).catch(() => {}); }

  myPeer() { return this.room?.peers().find((p) => p.sameTab)?.peer ?? null; }

  // --- 로비 (호스트가 정함) ------------------------------------------------------
  lobbyMsg() {
    const s = this.state;
    return { code: this.code, connected: [true, !!this.otherPeer], weapons: s.weapons, ready: s.ready, playing: s.playing, matchId: s.matchId, time: s.time };
  }

  broadcastLobby() {
    if (!this.host || !this.room) return;
    const msg = this.lobbyMsg();
    this.emitLocal('lobby', msg);
    this.room.emit('lobby', { ...msg, guest: this.otherPeer }).catch(() => {});
    this.lastLobbyAt = this.now();
  }

  applyLobby(d) {
    if (this.slot !== 1) return;
    this.lastLobby = d;
    this.matchIdle = !d.playing;
    // 방장이 시간을 바꾸면 양쪽 준비가 풀린다 → 내가 다시 보내던 '준비' 도 내려놓는다 (안 그러면 혼자 다시 준비됨)
    if (this.seenTime != null && d.time !== this.seenTime && this.want) this.want.ready = false;
    this.seenTime = d.time;
    // 내가 방금 바꾼 준비 상태는 방장 확인이 오기 전에도 그대로 보여 준다 (눌렀는데 안 바뀐 것처럼 보이지 않게)
    const ready = Array.isArray(d.ready) ? [...d.ready] : [false, false];
    if (!d.playing && this.want && typeof this.want.ready === 'boolean' && this.now() - (this.wantAt ?? -1e9) < 1500) ready[1] = this.want.ready;
    this.emitLocal('lobby', { code: d.code, connected: d.connected, weapons: d.weapons, ready, playing: d.playing, time: validTime(d.time) ? d.time : BALANCE.round.onlineDefault });
  }

  control(op) {
    if (!this.room) return;
    if (this.host) { this.hostControl(0, op); return; }
    // 손님: 원하는 상태(무기·준비)를 기억해 두고 주기적으로 다시 알린다 (메시지가 빠져도 맞춰짐)
    if (op.op === 'select') this.want = { ...(this.want ?? {}), weapon: op.weapon, ready: false };
    if (op.op === 'ready') this.want = { ...(this.want ?? {}), ready: !!op.ready };
    if (op.op === 'select' || op.op === 'ready') this.wantAt = this.now();
    if (op.op === 'ready' && this.lastLobby) this.applyLobby(this.lastLobby); // 내 화면은 바로 바꿔 보여 준다
    this.room.emit('ctl', op).catch(() => {});
    this.lastWantAt = this.now();
  }

  hostControl(slot, op) {
    const s = this.state;
    if (!s) return;
    if (op.op === 'select') {
      if (s.playing || !WEAPON_ORDER.includes(op.weapon)) return;
      s.weapons[slot] = op.weapon;
      s.ready[slot] = false;
    } else if (op.op === 'time') {
      // 시간 제한은 방장만 (손님 ctl 로 오는 것은 무시). 바꾸면 양쪽 준비를 풀어 상대가 확인하게 한다
      if (slot !== 0 || s.playing || !validTime(op.time) || s.time === op.time) return;
      s.time = op.time;
      s.ready = [false, false];
    } else if (op.op === 'ready') {
      if (s.playing) return;
      s.ready[slot] = !!op.ready;
      if (s.ready[0] && s.ready[1] && this.otherPeer) this.hostStart();
    } else if (op.op === 'sync') {
      // 손님이 반복해서 보내는 현재 상태: 같으면 아무것도 바꾸지 않는다
      if (s.playing) return;
      let changed = false;
      if (WEAPON_ORDER.includes(op.weapon) && s.weapons[slot] !== op.weapon) { s.weapons[slot] = op.weapon; s.ready[slot] = false; changed = true; }
      if (typeof op.ready === 'boolean' && s.ready[slot] !== op.ready) { s.ready[slot] = op.ready; changed = true; }
      if (!changed) return;
      if (s.ready[0] && s.ready[1] && this.otherPeer) this.hostStart();
    } else if (op.op === 'end') {
      if (op.m !== s.matchId) return;
      s.playing = false;
    }
    this.broadcastLobby();
  }

  hostStart() {
    const s = this.state;
    s.playing = true;
    s.ready = [false, false];
    s.matchId++;
    const delay = roomDelayFor([this.rtt, this.peerRtt ?? this.rtt], this.cfg.flushMs); // 상대 측정값이 아직 없으면 내 값으로
    this.lastStart = { matchId: s.matchId, weapons: [...s.weapons], delay, time: s.time };
    this.startAcked = false;
    this.room.emit('start', this.lastStart).catch(() => {});
    this.beginMatch(s.matchId, delay);
    this.emitLocal('start', { ...this.lastStart, slot: 0 });
  }

  onStart(d) {
    if (this.slot !== 1 || d.matchId === this.matchId) return; // 같은 시작 신호 반복은 무시
    this.matchIdle = false;
    if (this.want) this.want.ready = false;
    this.beginMatch(d.matchId, d.delay);
    this.emitLocal('start', { matchId: d.matchId, weapons: d.weapons, delay: d.delay, time: validTime(d.time) ? d.time : BALANCE.round.onlineDefault, slot: 1 });
  }

  beginMatch(id, delay = 0) {
    this.matchId = id;
    this.sentInputs = new Map();
    this.pending = false;
    // 입력 확인: 처음 delay 프레임은 양쪽 모두 빈 입력으로 정해져 있다
    this.recvNext = delay | 0;   // 상대 입력을 여기 전까지 빠짐없이 받았다
    this.peerAck = delay | 0;    // 상대가 내 입력을 여기 전까지 받았다
    this.recvDirty = false;      // 새로 받은 입력이 있어 확인을 보내야 함
  }

  // --- 입력 묶음 ------------------------------------------------------------
  tick() {
    if (!this.room) return;
    // 호스트: 시작 신호를 상대 첫 입력이 올 때까지 반복, 로비 상태 주기적 재전송
    if (this.host && this.lastStart && !this.startAcked) this.room.emit('start', this.lastStart).catch(() => {});
    if (this.host && this.now() - (this.lastLobbyAt ?? 0) >= this.cfg.lobbyEveryMs) this.broadcastLobby();
    if (!this.host && this.slot === 1 && this.want && this.matchIdle && this.now() - (this.lastWantAt ?? 0) >= 500) {
      this.room.emit('ctl', { op: 'sync', ...this.want }).catch(() => {});
      this.lastWantAt = this.now();
    }
    this.flushInputs();
  }

  /** 상대가 아직 받았다고 확인하지 않은 입력을 오래된 것부터 보낸다 (+ 내가 받은 곳까지 확인) */
  flushInputs() {
    if (!this.matchId) return;
    for (const f of this.sentInputs.keys()) if (f < this.peerAck) this.sentInputs.delete(f);
    if (!this.sentInputs.size && !this.recvDirty) return;
    const frames = [...this.sentInputs.keys()].sort((a, b) => a - b);
    const f0 = frames.length ? frames[0] : this.peerAck;
    const bits = [];
    for (let f = f0; f <= (frames.at(-1) ?? f0 - 1) && bits.length < this.cfg.maxBatch; f++) {
      if (!this.sentInputs.has(f)) break; // (생기지 않지만) 빈 곳은 보내지 않는다
      bits.push(this.sentInputs.get(f));
    }
    this.room.emit('in', { m: this.matchId, f0, b: bits, a: this.recvNext }).catch(() => {});
    this.recvDirty = false;
    this.pending = false;
  }

  onInputs(d) {
    if (d.m !== this.matchId || !Array.isArray(d.b) || typeof d.f0 !== 'number') return;
    if (this.host) this.startAcked = true;
    if (typeof d.a === 'number' && d.a > this.peerAck) this.peerAck = d.a;
    if (!d.b.length) return;
    this.recvDirty = true;
    if (d.f0 <= this.recvNext) this.recvNext = Math.max(this.recvNext, d.f0 + d.b.length);
    d.b.forEach((bits, i) => this.emitLocal('input', { m: d.m, f: d.f0 + i, i: bits | 0 }));
  }

  /** 상대가 목록에서 빠짐: GONE_GRACE 동안 아무 소식이 없으면 나간 것으로 본다 */
  suspectGone() {
    if (this.goneAt != null) return;
    this.goneAt = this.now();
    const token = this.goneAt;
    this.timers.setTimeout(() => { if (this.goneAt === token) this.onPeerGone(); }, GONE_GRACE);
  }

  onPeerGone() {
    this.goneAt = null;
    const wasPlaying = this.state?.playing || this.matchId > 0;
    if (this.host) {
      this.otherPeer = null;
      if (this.state) { this.state.ready = [false, false]; this.state.playing = false; }
      this.emitLocal('peerLeft');
      this.broadcastLobby();
    } else {
      // 호스트가 나가면 방이 없어진다 → 방 화면을 닫고 처음(방 만들기/참가)으로
      this.emitLocal('peerLeft');
      this.leaveRoom(true);
      this.emitLocal('roomClosed', { msg: '방장이 방을 나갔습니다. 새 방을 만들거나 다른 코드로 참가하세요.' });
    }
    return wasPlaying;
  }

  async leaveRoom(silent = false) {
    const r = this.room;
    if (!r) return;
    if (!silent || this.slot >= 0) r.emit('bye', {}).catch(() => {});
    this.unsubs.forEach((u) => u());
    this.intervals.forEach((id) => this.timers.clearInterval(id));
    this.unsubs = [];
    this.intervals = [];
    this.room = null;
    this.reset();
    try { await r.leave(); } catch { /* ignore */ }
  }
}

/**
 * 공유 페이지에서 방 기능 열기. 쓸 수 없으면 null.
 * (claude.use 는 게시된 페이지에만 있다)
 */
export async function openRoom() {
  const use = typeof window !== 'undefined' && window.claude?.use;
  if (!use) return null;
  try { return await window.claude.use('room'); } catch { return null; }
}
