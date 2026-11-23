import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToUint8Array,
  extractWavRmsEnvelope,
  sampleWavEnvelopeAt,
} from './wavEnvelope';

function buildTestWav(pcmSamples: Int16Array, sampleRate = 24000): Uint8Array {
  const dataBytes = pcmSamples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcmSamples.length; i++) {
    view.setInt16(44 + i * 2, pcmSamples[i], true);
  }
  return new Uint8Array(buf);
}

test('extractWavRmsEnvelope produces zero for silence and strong 0..1 amplitude for voiced syllables', () => {
  const sr = 24000;
  // 0.25s silence -> 0.50s 320Hz voiced syllable -> 0.25s silence (total 1.0s)
  const pcm = new Int16Array(sr);
  for (let i = Math.floor(sr * 0.25); i < Math.floor(sr * 0.75); i++) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 320 * i) / sr) * 16000);
  }
  const wav = buildTestWav(pcm, sr);
  const env = extractWavRmsEnvelope(wav, 60);

  assert.equal(env.sampleRate, sr);
  assert.ok(env.durationSec > 0.98 && env.durationSec <= 1.02);
  assert.equal(env.samples.length, 60);

  // Silent opening & ending should stay 0
  assert.equal(sampleWavEnvelopeAt(env, 0.05), 0);
  assert.equal(sampleWavEnvelopeAt(env, 0.9), 0);

  // Voiced middle should register crisp lip-sync level
  const voiced = sampleWavEnvelopeAt(env, 0.5);
  assert.ok(voiced > 0.55 && voiced <= 1.0, `Expected voiced RMS > 0.55, got ${voiced}`);

  // Out-of-range timestamps return 0 safely
  assert.equal(sampleWavEnvelopeAt(env, -0.5), 0);
  assert.equal(sampleWavEnvelopeAt(env, 2.5), 0);
});

test('base64ToUint8Array round-trips WAV header cleanly', () => {
  const wav = buildTestWav(new Int16Array(480), 24000);
  const b64 = Buffer.from(wav).toString('base64');
  const decoded = base64ToUint8Array(b64);
  assert.equal(decoded.byteLength, wav.byteLength);
  assert.equal(String.fromCharCode(decoded[0], decoded[1], decoded[2], decoded[3]), 'RIFF');
});
