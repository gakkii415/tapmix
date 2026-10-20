// Original, deterministic demo music and a small, build-free Web Audio engine.
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const frequency = note => 440 * 2 ** ((note - 69) / 12);

function synthTrack(variant, part, sampleRate) {
  const bpm = variant === 'moon' ? 112 : 126;
  const beat = 60 / bpm;
  const duration = 30.5;
  const samples = new Float32Array(Math.round(duration * sampleRate));
  let seed = 7919 + part * 1337 + (variant === 'moon' ? 1901 : 0);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 * 2 - 1;
  };
  function voice(at, length, amplitude, sound) {
    const start = Math.round(at * sampleRate);
    const count = Math.min(Math.round(length * sampleRate), samples.length - start);
    for (let j = 0; j < count; j++) samples[start + j] += amplitude * sound(j / sampleRate, length);
  }
  const roots = variant === 'moon' ? [38, 34, 41, 36] : [33, 41, 36, 43];
  const melody = part ? [7, 12, 10, 7, 3, 5, 7, 0] : [0, 7, 12, 10, 7, 3, 5, 7];
  const beats = Math.ceil(duration / beat);
  for (let n = 0; n < beats; n++) {
    const at = n * beat;
    const chordIndex = (Math.floor(n / 8) + part) % roots.length;
    const root = roots[chordIndex];
    const third = chordIndex === 0 ? 3 : 4;
    const seventh = chordIndex === 1 || chordIndex === 2 ? 11 : 10;
    voice(at, .34, .56, t => Math.sin(TAU * (47 * t + 48 * .027 * (1 - Math.exp(-t / .027)))) * Math.exp(-t * 16));
    for (let half = 0; half < 2; half++) {
      let previousNoise = 0;
      voice(at + half * beat / 2, half ? .12 : .065, half ? .08 : .045, (t, length) => {
        const noise = random();
        const high = noise - previousNoise;
        previousNoise = noise;
        return high * Math.exp(-t / (length * .21));
      });
      const f = frequency(root + (half && n % 4 === 3 ? 12 : 0));
      voice(at + half * beat / 2, beat * .43, .14, (t, length) => {
        const envelope = Math.min(1, t / .009) * Math.min(1, (length - t) / .055);
        return envelope * (Math.sin(TAU * f * t) + .22 * Math.sin(TAU * f * 2 * t)) * (1 - .4 * t / length);
      });
    }
    if (n % 2 === 1) {
      voice(at, .15, .105, t => (random() * .7 + Math.sin(TAU * 185 * t) * .3) * Math.exp(-t * 33));
    }
    if (n % 4 === 0) {
      const chord = [0, third, 7, seventh];
      const chordLength = Math.min(beat * 3.8, duration - at);
      for (const interval of chord) {
        const f = frequency(root + 24 + interval);
        voice(at, chordLength, .032, (t, length) => {
          const envelope = Math.min(1, t / .12) * Math.min(1, (length - t) / .3);
          return envelope * (Math.sin(TAU * f * t) + .16 * Math.sin(TAU * f * 2.003 * t));
        });
      }
    }
    for (let step = 0; step < 2; step++) {
      const index = (n * 2 + step) % melody.length;
      let interval = melody[index];
      if (interval === 3) interval = third;
      if (interval === 10) interval = seventh;
      if (interval === 5 && chordIndex === 1) interval = 6;
      const f = frequency(root + 36 + interval);
      const noteTime = at + step * beat / 2;
      const tone = (t, length) => Math.min(1, t / .008) * Math.exp(-t * 11) * Math.min(1, (length - t) / .025) *
        (Math.sin(TAU * f * t) + .16 * Math.sin(TAU * f * 3 * t));
      voice(noteTime, beat * .7, .075, tone);
      voice(noteTime + beat * .75, beat * .7, .022, tone);
    }
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const normalization = .87 / Math.max(.87, peak);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] *= normalization * Math.min(1, t / .012, (duration - t) / .08);
  }
  return {
    samples, sampleRate, bpm, beatOffset: 0,
    title: variant === 'moon' ? (part ? 'Blue Hour' : 'Moonlight') : (part ? 'Afterglow' : 'Neon Drive'),
    artist: 'TAPMIX Original'
  };
}

export function renderDemo(variant = 'neon', sampleRate = 32000) {
  sampleRate = Math.round(clamp(finite(sampleRate, 32000), 8000, 96000));
  return [synthTrack(variant, 0, sampleRate), synthTrack(variant, 1, sampleRate)];
}

export function analyzeAudio(buffer) {
  const sampleRate = finite(buffer?.sampleRate);
  const length = finite(buffer?.length);
  if (!sampleRate || !length || typeof buffer?.getChannelData !== 'function') {
    return { bpm: null, confidence: 0, beatOffset: 0, peaks: [] };
  }
  const data = buffer.getChannelData(0);
  const peaks = new Array(180).fill(0);
  let globalPeak = 0;
  for (let bin = 0; bin < peaks.length; bin++) {
    const from = Math.floor(bin * length / peaks.length);
    const to = Math.floor((bin + 1) * length / peaks.length);
    // Sampling at most 400 values per bin keeps long uploads inexpensive.
    const stride = Math.max(1, Math.floor((to - from) / 400));
    for (let i = from; i < to; i += stride) peaks[bin] = Math.max(peaks[bin], Math.abs(data[i] || 0));
    globalPeak = Math.max(globalPeak, peaks[bin]);
  }
  if (globalPeak > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= globalPeak;
  const hop = Math.max(1, Math.round(sampleRate / 200));
  const frameRate = sampleRate / hop;
  const count = Math.floor(Math.min(length, sampleRate * 90) / hop);
  if (count < frameRate * 3 || globalPeak < .00001) return { bpm: null, confidence: 0, beatOffset: 0, peaks };
  const energy = new Float32Array(count);
  const onset = new Float32Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < hop; j += 2) sum += data[i * hop + j] ** 2;
    energy[i] = Math.sqrt(sum / Math.ceil(hop / 2));
    const baseline = i > 2 ? (energy[i - 1] + energy[i - 2] + energy[i - 3]) / 3 : 0;
    onset[i] = Math.max(0, energy[i] - baseline);
    total += onset[i] ** 2;
  }
  if (total < 1e-9) return { bpm: null, confidence: 0, beatOffset: 0, peaks };
  const minLag = Math.floor(frameRate * 60 / 180);
  const maxLag = Math.ceil(frameRate * 60 / 70);
  const correlations = new Float64Array(maxLag * 4 + 3);
  for (let lag = minLag; lag < correlations.length && lag < count / 2; lag++) {
    let numerator = 0, left = 0, right = 0;
    for (let i = lag; i < count; i++) {
      numerator += onset[i] * onset[i - lag];
      left += onset[i] ** 2;
      right += onset[i - lag] ** 2;
    }
    correlations[lag] = numerator / Math.sqrt(left * right || 1);
  }
  let bestLag = minLag, bestScore = -1, scoreSum = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 * frameRate / lag;
    const preference = .93 + .07 * Math.exp(-(((bpm - 122) / 35) ** 2));
    const score = (correlations[lag] + .45 * correlations[lag * 2] + .2 * correlations[lag * 4]) * preference;
    scoreSum += score;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  const center = correlations[bestLag];
  const delta = clamp(.5 * (correlations[bestLag - 1] - correlations[bestLag + 1]) /
    (correlations[bestLag - 1] - 2 * center + correlations[bestLag + 1] || 1), -.5, .5);
  const period = bestLag + delta;
  const confidence = clamp(center * .82 + (bestScore - scoreSum / (maxLag - minLag + 1)) * .35, 0, 1);
  if (confidence < .13) return { bpm: null, confidence, beatOffset: 0, peaks };
  let bestPhase = 0, phaseScore = -1;
  for (let phase = 0; phase < Math.ceil(period); phase++) {
    let sum = 0;
    for (let at = phase; at < count; at += period) sum += onset[Math.round(at)] || 0;
    if (sum > phaseScore) { phaseScore = sum; bestPhase = phase; }
  }
  return { bpm: Math.round(60 * frameRate / period * 10) / 10, confidence, beatOffset: bestPhase / frameRate, peaks };
}

export function planMix(a, b) {
  const durationA = Math.max(0, finite(a?.duration));
  const durationB = Math.max(0, finite(b?.duration));
  const validTempo = track => Number.isFinite(track?.bpm) && track.bpm >= 50 && track.bpm <= 200 && finite(track.confidence) >= .5;
  let rateA = 1, rateB = 1, bpm = null, synced = false;
  if (validTempo(a) && validTempo(b)) {
    const target = Math.sqrt(a.bpm * b.bpm);
    if (Math.abs(target / a.bpm - 1) <= .08 && Math.abs(target / b.bpm - 1) <= .08) {
      rateA = target / a.bpm;
      rateB = target / b.bpm;
      bpm = target;
      synced = true;
    }
  }
  const offsetA = synced ? clamp(finite(a.beatOffset), 0, Math.max(0, durationA - .1)) : 0;
  const offsetB = synced ? clamp(finite(b.beatOffset), 0, Math.max(0, durationB - .1)) : 0;
  let lengthA = Math.min(32, (durationA - offsetA) / rateA);
  let lengthB = Math.min(32, (durationB - offsetB) / rateB);
  let fadeDuration;
  if (synced) {
    const beat = 60 / bpm;
    if (lengthA >= beat) lengthA = Math.floor(lengthA / beat + 1e-8) * beat;
    if (lengthB >= beat) lengthB = Math.floor(lengthB / beat + 1e-8) * beat;
    const beats = Math.min(lengthA, lengthB) >= beat * 16 ? 8 : 4;
    fadeDuration = beats * beat;
    if (fadeDuration > Math.min(lengthA, lengthB) * .45) {
      fadeDuration = Math.floor(Math.min(lengthA, lengthB) * .45 / beat) * beat;
    }
  } else fadeDuration = Math.min(4, Math.min(lengthA, lengthB) * .3);
  fadeDuration = Math.max(0, Math.min(fadeDuration, lengthA, lengthB));
  const bStart = Math.max(0, lengthA - fadeDuration);
  return { bStart, fadeDuration, duration: bStart + lengthB, rateA, rateB, offsetA, offsetB, lengthA, lengthB, synced, bpm };
}

export class AutoMixer {
  constructor({ onEnded, onStateChange } = {}) {
    this.onEnded = onEnded;
    this.onStateChange = onStateChange;
    this._context = null;
    this._nodes = [];
    this._generation = 0;
    this._playing = false;
    this._position = 0;
    this._volume = .8;
    this._plan = null;
  }

  getContext() {
    if (!this._context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('This browser does not support Web Audio.');
      this._context = new Context();
      this._master = this._context.createGain();
      this._master.gain.value = this._volume;
      const limiter = this._context.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = .003;
      limiter.release.value = .15;
      this._master.connect(limiter);
      limiter.connect(this._context.destination);
    }
    return this._context;
  }

  get isPlaying() { return this._playing; }

  getPosition() {
    return clamp(this._position + (this._playing ? Math.max(0, this._context.currentTime - this._startedAt) : 0), 0, this._plan?.duration || 0);
  }

  setVolume(value) {
    this._volume = clamp(finite(value, .8), 0, 1);
    if (this._master) this._master.gain.setTargetAtTime(this._volume, this._context.currentTime, .015);
  }

  async play(a, b, plan, offset = 0) {
    this._cancel();
    this._a = a;
    this._b = b;
    this._plan = plan;
    this._position = clamp(finite(offset), 0, plan.duration);
    const context = this.getContext();
    const generation = this._generation;
    if (context.state === 'suspended') await context.resume();
    if (generation !== this._generation) return;
    if (this._position >= plan.duration) this._position = 0;
    this._schedule();
  }

  _level(track, time) {
    const p = this._plan;
    let gain = 1;
    if (p.fadeDuration > 0) {
      const progress = clamp((time - p.bStart) / p.fadeDuration, 0, 1);
      gain = track === 'a' ? Math.cos(progress * Math.PI / 2) : Math.sin(progress * Math.PI / 2);
    }
    return gain * clamp(time / .015, 0, 1) * clamp((p.duration - time) / .065, 0, 1);
  }

  _schedule() {
    const ctx = this._context;
    const p = this._plan;
    const position = this._position;
    const start = ctx.currentTime + .025;
    const generation = ++this._generation;
    this._startedAt = start;
    this._playing = true;
    const segments = [
      { track: 'a', buffer: this._a, from: 0, length: p.lengthA, rate: p.rateA, offset: p.offsetA },
      { track: 'b', buffer: this._b, from: p.bStart, length: p.lengthB, rate: p.rateB, offset: p.offsetB }
    ];
    let lastSource = null, lastEnd = -1;
    for (const segment of segments) {
      const from = Math.max(position, segment.from);
      const end = segment.from + segment.length;
      if (from >= end || !segment.buffer) continue;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = segment.buffer;
      source.playbackRate.value = segment.rate;
      source.connect(gain);
      gain.connect(this._master);
      const when = start + from - position;
      const count = Math.max(3, Math.ceil((end - from) * 100));
      const curve = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const elapsed = i / (count - 1) * (end - from);
        curve[i] = this._level(segment.track, from + elapsed) * Math.min(1, elapsed / .012);
      }
      gain.gain.setValueCurveAtTime(curve, when, end - from);
      // BufferSource duration is in source seconds; playbackRate changes wall time.
      source.start(when, segment.offset + (from - segment.from) * segment.rate, (end - from) * segment.rate);
      this._nodes.push({ source, gain, track: segment.track });
      if (end > lastEnd) { lastSource = source; lastEnd = end; }
    }
    if (lastSource) lastSource.onended = () => {
      if (generation !== this._generation || !this._playing) return;
      this._position = p.duration;
      this._playing = false;
      for (const node of this._nodes) { node.source.disconnect(); node.gain.disconnect(); }
      this._nodes = [];
      this.onStateChange?.('ended');
      this.onEnded?.();
    };
    else { this._playing = false; this.onStateChange?.('stopped'); return; }
    this.onStateChange?.('playing');
  }

  _cancel() {
    const position = this.getPosition();
    this._generation++;
    this._playing = false;
    for (const node of this._nodes) {
      node.source.onended = null;
      try { node.source.stop(); } catch (_) { /* Already ended. */ }
      node.source.disconnect();
      node.gain.disconnect();
    }
    this._nodes = [];
    return position;
  }

  pause() {
    if (!this._playing) {
      // Also invalidate a play() awaiting the browser's audio unlock.
      this._generation++;
      return;
    }
    this._position = this._cancel();
    this.onStateChange?.('paused');
  }

  async resume() {
    if (!this._plan || this._playing) return;
    await this.play(this._a, this._b, this._plan, this._position);
  }

  stop() {
    this._cancel();
    this._position = 0;
    this.onStateChange?.('stopped');
  }

  async seek(seconds) {
    if (!this._plan) return;
    const wasPlaying = this._playing;
    this._cancel();
    this._position = clamp(finite(seconds), 0, this._plan.duration);
    if (wasPlaying && this._position < this._plan.duration) await this.play(this._a, this._b, this._plan, this._position);
    else this.onStateChange?.('paused');
  }
}
