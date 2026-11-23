/**
 * Pure, decoupled PCM WAV RMS amplitude envelope extractor for real-time Live2D lip-sync.
 * Decodes 16-bit signed linear PCM WAV bytes directly into a normalized 0..1 envelope array
 * (default 60 frames/sec) WITHOUT attaching HTMLAudioElement to Web Audio MediaElementSource
 * — preventing Chromium AudioContext/SFX muting bugs while preserving natural pitch at any speed.
 */

export interface WavEnvelope {
  samples: Float32Array;
  fps: number;
  durationSec: number;
  sampleRate: number;
}

/**
 * Extracts a normalized 0..1 RMS vocal amplitude envelope from a RIFF/WAVE PCM16 buffer.
 */
export function extractWavRmsEnvelope(wavBytes: Uint8Array, fps = 60): WavEnvelope {
  if (wavBytes.byteLength < 44) {
    return { samples: new Float32Array(0), fps, durationSec: 0, sampleRate: 24000 };
  }

  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataLength = Math.max(0, wavBytes.byteLength - 44);

  // Verify RIFF/WAVE header and scan chunks so non-standard headers work reliably
  const isRiff =
    wavBytes[0] === 0x52 &&
    wavBytes[1] === 0x49 &&
    wavBytes[2] === 0x46 &&
    wavBytes[3] === 0x46;

  if (isRiff) {
    let offset = 12;
    let foundData = false;
    while (offset + 8 <= wavBytes.byteLength) {
      const id = String.fromCharCode(
        wavBytes[offset],
        wavBytes[offset + 1],
        wavBytes[offset + 2],
        wavBytes[offset + 3],
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (id === 'fmt ' && offset + 24 <= wavBytes.byteLength) {
        channels = Math.max(1, view.getUint16(offset + 10, true));
        sampleRate = Math.max(8000, view.getUint32(offset + 12, true));
        bitsPerSample = view.getUint16(offset + 22, true) || 16;
      } else if (id === 'data') {
        dataOffset = offset + 8;
        dataLength = Math.min(chunkSize, wavBytes.byteLength - dataOffset);
        foundData = true;
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    if (!foundData) {
      dataOffset = 44;
      dataLength = Math.max(0, wavBytes.byteLength - 44);
    }
  } else {
    // Raw 16-bit mono 24kHz PCM fallback
    dataOffset = 0;
    dataLength = wavBytes.byteLength;
  }

  const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
  const frameStrideBytes = bytesPerSample * channels;
  const totalPcmFrames = Math.floor(dataLength / frameStrideBytes);
  if (totalPcmFrames <= 0) {
    return { samples: new Float32Array(0), fps, durationSec: 0, sampleRate };
  }

  const durationSec = totalPcmFrames / sampleRate;
  const bucketCount = Math.max(1, Math.ceil(durationSec * fps));
  const samplesPerBucket = Math.max(1, Math.floor(sampleRate / fps));
  const envelope = new Float32Array(bucketCount);

  let peakRms = 0.0001;
  for (let b = 0; b < bucketCount; b++) {
    const startFrame = Math.floor((b * sampleRate) / fps);
    const endFrame = Math.min(totalPcmFrames, startFrame + samplesPerBucket);
    let sumSq = 0;
    let count = 0;
    for (let f = startFrame; f < endFrame; f++) {
      const byteIdx = dataOffset + f * frameStrideBytes;
      if (byteIdx + 1 >= wavBytes.byteLength) break;
      const pcmVal =
        bitsPerSample === 16
          ? view.getInt16(byteIdx, true) / 32768
          : (wavBytes[byteIdx] - 128) / 128;
      sumSq += pcmVal * pcmVal;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    envelope[b] = rms;
    if (rms > peakRms) peakRms = rms;
  }

  // Normalize gently so natural conversational syllables move lips expressively in 0..1
  const normScale = Math.min(8.5, Math.max(2.6, 0.88 / peakRms));
  for (let b = 0; b < bucketCount; b++) {
    const raw = envelope[b];
    if (raw < 0.008) {
      envelope[b] = 0;
    } else {
      envelope[b] = Math.min(1, Math.pow(raw * normScale, 0.78));
    }
  }

  return { samples: envelope, fps, durationSec, sampleRate };
}

/**
 * Samples the extracted RMS envelope at a given playback timestamp in seconds.
 */
export function sampleWavEnvelopeAt(env: WavEnvelope | null, currentTimeSec: number): number {
  if (!env || env.samples.length === 0 || currentTimeSec < 0) return 0;
  const idx = Math.floor(currentTimeSec * env.fps);
  if (idx < 0 || idx >= env.samples.length) return 0;
  return env.samples[idx];
}

/**
 * Decodes a base64 string into a Uint8Array (works in both browser and Node.js).
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
