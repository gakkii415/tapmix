import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The site is buildless, so load its browser ES module without requiring package.json.
const code = await readFile(new URL('../audio.js', import.meta.url), 'utf8');
const { renderDemo, analyzeAudio, planMix, AutoMixer } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const buffer = (data, sampleRate = 8000) => ({ sampleRate, length: data.length, duration: data.length / sampleRate, getChannelData: () => data });
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);

test('original demos are deterministic, finite, unclipped, and analyze near their declared tempo', () => {
  for (const variant of ['neon', 'moon']) {
    const tracks = renderDemo(variant, 8000);
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0].samples.length, 244000);
    assert.deepEqual(tracks[0].samples, renderDemo(variant, 8000)[0].samples);
    for (const track of tracks) {
      let peak = 0;
      for (const value of track.samples) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); }
      assert.ok(peak > .3 && peak <= .871);
      near(track.samples[0], 0);
      const result = analyzeAudio(buffer(track.samples));
      near(result.bpm, track.bpm, 1);
      assert.ok(result.confidence > .5);
      assert.equal(result.peaks.length, 180);
    }
  }
});

test('silence and a short upload return no invented tempo', () => {
  assert.equal(analyzeAudio(buffer(new Float32Array(80000))).bpm, null);
  assert.equal(analyzeAudio(buffer(new Float32Array(800))).confidence, 0);
});

test('mix planning bounds tempo adjustments, aligns beats, and handles very short files', () => {
  const a = { duration: 160, bpm: 126, confidence: .9, beatOffset: .1 };
  const b = { duration: 90, bpm: 112, confidence: .9, beatOffset: .2 };
  const p = planMix(a, b);
  assert.ok(p.synced && p.rateA >= .92 && p.rateB <= 1.08);
  near(p.bStart / (60 / p.bpm), Math.round(p.bStart / (60 / p.bpm)));
  assert.ok(p.duration > 55 && p.duration < 65);
  assert.ok(p.offsetA + p.lengthA * p.rateA <= a.duration);
  assert.ok(p.offsetB + p.lengthB * p.rateB <= b.duration);
  for (const pair of [[.01, .03], [0, 40], [40, 0], [0, 0]]) {
    const short = planMix({ duration: pair[0] }, { duration: pair[1] });
    for (const key of ['bStart', 'fadeDuration', 'duration', 'offsetA', 'offsetB', 'lengthA', 'lengthB']) {
      assert.ok(Number.isFinite(short[key]) && short[key] >= 0);
    }
  }
  const uncertain = planMix(a, { ...b, confidence: .1 });
  assert.equal(uncertain.synced, false);
  assert.equal(uncertain.rateA, 1);
  assert.equal(uncertain.rateB, 1);
  const distant = planMix(a, { ...b, bpm: 80 });
  assert.equal(distant.synced, false);
});

class FakeParam {
  value = 0;
  setTargetAtTime(value) { this.value = value; }
  setValueCurveAtTime(curve, when, duration) { this.curve = curve; this.when = when; this.duration = duration; }
}
class FakeNode {
  gain = new FakeParam();
  playbackRate = new FakeParam();
  connect() {}
  disconnect() { this.disconnected = true; }
  start(...args) { this.startArgs = args; }
  stop() { this.stopped = true; }
}
class FakeContext {
  currentTime = 0;
  state = 'suspended';
  destination = {};
  sources = [];
  createGain() { return new FakeNode(); }
  createBufferSource() { const source = new FakeNode(); this.sources.push(source); return source; }
  createDynamicsCompressor() { return Object.assign(new FakeNode(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, new FakeParam()]))); }
  async resume() { this.state = 'running'; }
}

test('pause/resume and seek preserve positions through a crossfade; stale endings are ignored', async () => {
  globalThis.AudioContext = FakeContext;
  let ended = 0;
  const mixer = new AutoMixer({ onEnded: () => ended++ });
  const plan = planMix({ duration: 30, bpm: 120, confidence: 1 }, { duration: 30, bpm: 120, confidence: 1 });
  const input = buffer(new Float32Array(240000));
  await mixer.play(input, input, plan);
  const ctx = mixer.getContext();
  const staleEnd = ctx.sources[1].onended;
  ctx.currentTime = .025 + plan.bStart + 1;
  mixer.pause();
  near(mixer.getPosition(), plan.bStart + 1);
  assert.ok(ctx.sources.every(source => source.stopped));
  staleEnd();
  assert.equal(ended, 0);
  await mixer.resume();
  const [a, b] = ctx.sources.slice(-2);
  near(a.startArgs[1], plan.bStart + 1);
  near(b.startArgs[1], 1);
  near(a.startArgs[0], b.startArgs[0]);
  await mixer.seek(40);
  near(mixer.getPosition(), 40);
  assert.equal(ctx.sources.at(-1).startArgs[1], 40 - plan.bStart);
  const naturalEnd = ctx.sources.at(-1).onended;
  naturalEnd();
  assert.equal(ended, 1);
  assert.equal(mixer.isPlaying, false);
  near(mixer.getPosition(), plan.duration);
  mixer.stop();
  near(mixer.getPosition(), 0);
  assert.equal(ended, 1);
  delete globalThis.AudioContext;
});
