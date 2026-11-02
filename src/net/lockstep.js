// =============================================================================
// 락스텝 넷코드 (입력 지연 방식) — DOM/네트워크 구현과 무관
// -----------------------------------------------------------------------------
// - 내 입력은 delay 프레임 뒤의 시뮬레이션 프레임에 배정해 상대에게 보낸다.
// - 시뮬레이션은 양쪽 입력이 모두 도착한 프레임만 진행한다 (도착 전에는 대기).
// - 전투 로직이 결정론적이므로 두 컴퓨터의 결과가 항상 같다.
// - 주기적으로 상태 해시를 교환해 비동기화(desync)를 감지한다.
// =============================================================================

import { EMPTY_INPUT } from '../core/fighter.js';

const KEYS = ['left', 'right', 'up', 'guard', 'light', 'heavy', 'dash', 'ult'];

export function encodeInput(input) {
  let b = 0;
  KEYS.forEach((k, i) => { if (input[k]) b |= 1 << i; });
  return b;
}

export function decodeInput(bits) {
  const o = { ...EMPTY_INPUT };
  KEYS.forEach((k, i) => { o[k] = (bits & (1 << i)) !== 0; });
  return o;
}

/** 경기 상태 요약 해시 (비동기화 감지용) */
export function stateHash(match) {
  let h = 2166136261;
  const mix = (v) => { h ^= Math.round(v * 100) | 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(match.frame);
  for (const f of match.fighters) {
    mix(f.x); mix(f.y); mix(f.hp); mix(f.guard); mix(f.stamina); mix(f.ult); mix(f.combo.lock);
    for (const ch of f.state) mix(ch.charCodeAt(0));
  }
  return h >>> 0;
}

export const HASH_EVERY = 60;

export class Lockstep {
  /**
   * @param {{slot:0|1, delay:number, send:(msg)=>void, matchId:number}} o
   */
  constructor({ slot, delay, send, matchId }) {
    this.slot = slot;
    this.delay = delay;
    this.send = send;
    this.matchId = matchId;
    this.local = new Map();
    this.remote = new Map();
    for (let f = 0; f < delay; f++) { this.local.set(f, 0); this.remote.set(f, 0); }
    this.scheduled = delay;   // 다음에 배정할 내 입력 프레임
    this.frame = 0;           // 다음에 진행할 시뮬레이션 프레임
    this.stalled = 0;         // 연속 대기 틱 수
    this.myHashes = new Map();
    this.remoteHashes = new Map();
    this.desyncAt = null;
  }

  onRemoteInput(f, bits) {
    if (f >= this.frame) this.remote.set(f, bits | 0);
  }

  onRemoteHash(f, h) {
    this.remoteHashes.set(f, h);
    this.checkHash(f);
  }

  checkHash(f) {
    if (this.myHashes.has(f) && this.remoteHashes.has(f)) {
      if (this.myHashes.get(f) !== this.remoteHashes.get(f) && this.desyncAt == null) this.desyncAt = f;
      this.myHashes.delete(f); this.remoteHashes.delete(f);
    }
  }

  /** 지금 내 입력을 배정해야 하는가 (배정해야 할 때만 키보드를 샘플링) */
  needsLocal() { return this.scheduled < this.frame + this.delay; }

  pushLocal(input) {
    const bits = encodeInput(input);
    const f = this.scheduled++;
    this.local.set(f, bits);
    this.send({ t: 'input', m: this.matchId, f, i: bits });
  }

  /** 진행 가능하면 [P1입력, P2입력] 반환, 아니면 null(상대 입력 대기) */
  next() {
    const f = this.frame;
    if (!this.remote.has(f) || !this.local.has(f)) { this.stalled++; return null; }
    const mine = decodeInput(this.local.get(f));
    const theirs = decodeInput(this.remote.get(f));
    this.local.delete(f); this.remote.delete(f);
    this.frame++;
    this.stalled = 0;
    return this.slot === 0 ? [mine, theirs] : [theirs, mine];
  }

  /** 시뮬레이션 1프레임 진행 후 호출 */
  afterStep(match) {
    if (match.frame % HASH_EVERY === 0) {
      const h = stateHash(match);
      this.myHashes.set(match.frame, h);
      this.send({ t: 'hash', m: this.matchId, f: match.frame, h });
      this.checkHash(match.frame);
    }
  }
}
