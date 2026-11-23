/**
 * Studio-Grade Wuxia Audio Engine:
 * - Procedural Web Audio API Board SFX on an isolated sfxGain bus (pickup, rosewood move, capture, gong, guzheng)
 * - Decoupled Single-Voice Gemini TTS WAV playback via Object URL HTMLAudioElement (preservesPitch = true)
 *   with exact 60Hz PCM RMS lip-sync envelope (NEVER attaches createMediaElementSource to the SFX AudioContext,
 *   guaranteeing piece selection/moves NEVER mute or interrupt live voice!)
 * - Strict monotonic speechSeq + seamless deferred handoff (ZERO mid-sentence dropouts, ZERO double voices!)
 */

import {
  WavEnvelope,
  base64ToUint8Array,
  extractWavRmsEnvelope,
  sampleWavEnvelopeAt,
} from './wavEnvelope';
import {
  getEmotionBaseProsody,
  splitVietnameseProsodyChunks,
} from './speechProsody';

export type CommentaryVoiceName = 'Charon' | 'Fenrir' | 'Kore' | 'Puck';
export type VoiceEngineStatus = 'gemini_ready' | 'speaking_gemini' | 'speaking_browser' | 'muted' | 'error';

export interface SpeakOptions {
  mood?: 'calm' | 'fierce' | 'check' | 'victory';
  emotion?: string;
  vocalCue?: string;
  voice?: CommentaryVoiceName;
  rate?: number;
  onStart?: (engine: 'gemini' | 'browser') => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

interface CachedAudioClip {
  blobUrl: string;
  envelope: WavEnvelope;
}

class WuxiaAudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentEnvelope: WavEnvelope | null = null;
  private currentAbort: AbortController | null = null;
  private audioCache = new Map<string, CachedAudioClip>(); // key -> blobUrl + PCM RMS envelope (max 24 entries)
  private activeSpeechMode: 'none' | 'gemini' | 'browser' = 'none';
  private inClausePause = false;
  private pauseTimerId: number | null = null;
  private speechStartedAt = 0;
  private speechSeq = 0;

  public muted = false;
  public voiceEnabled = true;
  public voiceName: CommentaryVoiceName = 'Kore';
  public speechRate = 1.0;

  private ensureSfxBus(): { ctx: AudioContext; bus: GainNode } | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.sfxGain) {
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, bus: this.sfxGain };
  }

  /**
   * Real-time 0..1 vocal amplitude for Live2D lip-sync & speaking gestures.
   * Reads the exact offline-computed 60Hz PCM RMS envelope synced to audio.currentTime,
   * with zero Web Audio MediaElementSource interference.
   */
  public getVoiceLevel(): number {
    if (
      this.muted ||
      !this.voiceEnabled ||
      this.activeSpeechMode === 'none' ||
      this.inClausePause
    ) {
      return 0;
    }

    if (
      this.activeSpeechMode === 'gemini' &&
      this.currentAudio &&
      !this.currentAudio.paused &&
      !this.currentAudio.ended &&
      this.currentEnvelope &&
      this.currentEnvelope.samples.length > 0
    ) {
      return sampleWavEnvelopeAt(this.currentEnvelope, this.currentAudio.currentTime);
    }

    // Expressive Vietnamese syllable cadence envelope (browser fallback or brief pre-play lead-in)
    const t = (performance.now() - this.speechStartedAt) / 1000;
    const rate = Math.max(0.85, this.speechRate);
    const syl1 = Math.max(0, Math.sin(t * 13.2 * rate));
    const syl2 = Math.max(0, Math.sin(t * 7.6 * rate + 1.4));
    const phraseContour = 0.52 + 0.48 * Math.sin(t * 2.2 * rate);
    return Math.min(1, (syl1 * 0.62 + syl2 * 0.38) * phraseContour);
  }

  /** Delicate wooden pickup tap when selecting/holding a piece — NEVER interrupts live voice! */
  public playPieceSelect() {
    const sfx = this.ensureSfxBus();
    if (!sfx) return;
    const { ctx, bus } = sfx;
    const now = ctx.currentTime;
    const pitchVar = 0.96 + Math.random() * 0.08;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.032);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.042);
  }

  /** Crisp rosewood piece placement click */
  public playPieceMove() {
    const sfx = this.ensureSfxBus();
    if (!sfx) return;
    const { ctx, bus } = sfx;
    const now = ctx.currentTime;
    const pitchVar = 0.94 + Math.random() * 0.12;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.085);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.1);

    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(1450 * pitchVar, now);
    clickOsc.frequency.exponentialRampToValueAtTime(420, now + 0.025);
    clickGain.gain.setValueAtTime(0.18, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    clickOsc.connect(clickGain);
    clickGain.connect(bus);
    clickOsc.start(now);
    clickOsc.stop(now + 0.035);
  }

  /** Heavy martial-arts capture: sword clash + war drum boom */
  public playCapture() {
    const sfx = this.ensureSfxBus();
    if (!sfx) return;
    const { ctx, bus } = sfx;
    const now = ctx.currentTime;

    const drum = ctx.createOscillator();
    const drumGain = ctx.createGain();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(150, now);
    drum.frequency.exponentialRampToValueAtTime(38, now + 0.28);
    drumGain.gain.setValueAtTime(0.45, now);
    drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    drum.connect(drumGain);
    drumGain.connect(bus);
    drum.start(now);
    drum.stop(now + 0.34);

    const freqs = [1180, 1790, 2640];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f * (0.97 + Math.random() * 0.06), now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.35);
      g.gain.setValueAtTime(0.075 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.38);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  /** Resonant temple bronze gong for Check ("Chiếu Tướng") */
  public playCheck() {
    const sfx = this.ensureSfxBus();
    if (!sfx) return;
    const { ctx, bus } = sfx;
    const now = ctx.currentTime;

    const partials = [196, 293.66, 392, 587.33, 740];
    partials.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.992, now + 1.1);
      gain.gain.setValueAtTime(0.16 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.15);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(now);
      osc.stop(now + 1.2);
    });
  }

  /** Pentatonic guzheng sweep for match start / deep analysis activation */
  public playGuzhengSweep() {
    const sfx = this.ensureSfxBus();
    if (!sfx) return;
    const { ctx, bus } = sfx;
    const now = ctx.currentTime;
    const notes = [293.66, 329.63, 369.99, 440, 493.88, 587.33];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.65);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(start);
      osc.stop(start + 0.7);
    });
  }

  /** Stop only the currently playing audio stream (used right at handoff to next ready clip) */
  private stopActivePlaybackOnly() {
    this.activeSpeechMode = 'none';
    this.inClausePause = false;
    this.currentEnvelope = null;
    if (this.pauseTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.pauseTimerId);
      this.pauseTimerId = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onplay = null;
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  /** Hard stop any in-flight TTS request and active speech (mute / voice toggle off / unmount) */
  public stopSpeech() {
    this.speechSeq++;
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
    this.stopActivePlaybackOnly();
  }

  private lockedBrowserVoiceURI: string | null = null;

  private pickConsistentVietnameseFemaleVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    if (this.lockedBrowserVoiceURI) {
      const locked = voices.find((v) => v.voiceURI === this.lockedBrowserVoiceURI);
      if (locked) return locked;
    }
    const viVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('vi'));
    if (viVoices.length === 0) return null;
    // Consistently prefer a female Vietnamese voice (HoaiMy / Linh / Google Tiếng Việt)
    const femalePreferred =
      viVoices.find((v) => /hoaimy|linh|nu|female|google/i.test(v.name)) ?? viVoices[0];
    this.lockedBrowserVoiceURI = femalePreferred.voiceURI;
    return femalePreferred;
  }

  private playBrowserFallback(text: string, options: SpeakOptions, seq: number) {
    if (
      seq !== this.speechSeq ||
      this.muted ||
      !this.voiceEnabled ||
      typeof window === 'undefined'
    ) {
      return;
    }
    if (!('speechSynthesis' in window)) {
      this.activeSpeechMode = 'none';
      options.onEnd?.();
      return;
    }

    const chunks = splitVietnameseProsodyChunks(text, options.emotion ?? options.mood);
    if (chunks.length === 0) {
      this.activeSpeechMode = 'none';
      options.onEnd?.();
      return;
    }

    try {
      this.stopActivePlaybackOnly();
      const { baseRate, basePitch } = getEmotionBaseProsody(options.emotion ?? options.mood);
      const userRate = Math.min(1.3, Math.max(0.82, options.rate ?? this.speechRate));
      const viVoice = this.pickConsistentVietnameseFemaleVoice();
      let startedNotified = false;

      const speakChunkAt = (idx: number) => {
        if (seq !== this.speechSeq || this.muted || !this.voiceEnabled) return;
        const chunk = chunks[idx];
        if (!chunk) {
          this.activeSpeechMode = 'none';
          this.inClausePause = false;
          options.onEnd?.();
          return;
        }

        const utter = new SpeechSynthesisUtterance(chunk.text);
        utter.lang = 'vi-VN';
        utter.rate = Math.min(1.28, Math.max(0.78, userRate * baseRate * chunk.rateMultiplier));
        utter.pitch = Math.min(1.26, Math.max(0.88, basePitch + chunk.pitchOffset));
        if (viVoice) utter.voice = viVoice;

        utter.onstart = () => {
          if (seq !== this.speechSeq) {
            window.speechSynthesis.cancel();
            return;
          }
          this.activeSpeechMode = 'browser';
          this.inClausePause = false;
          this.speechStartedAt = performance.now();
          if (!startedNotified) {
            startedNotified = true;
            options.onStart?.('browser');
          }
        };

        const advanceNext = () => {
          if (seq !== this.speechSeq) return;
          if (idx + 1 >= chunks.length) {
            this.activeSpeechMode = 'none';
            this.inClausePause = false;
            options.onEnd?.();
            return;
          }
          // Authentic breath pause between phrases — closes Live2D mouth naturally during the silence!
          this.inClausePause = true;
          const scaledPause = Math.round(chunk.pauseAfterMs / Math.max(0.85, userRate));
          this.pauseTimerId = window.setTimeout(() => {
            this.pauseTimerId = null;
            speakChunkAt(idx + 1);
          }, Math.max(110, scaledPause));
        };

        utter.onend = advanceNext;
        utter.onerror = () => {
          if (seq !== this.speechSeq) return;
          this.activeSpeechMode = 'none';
          this.inClausePause = false;
          options.onEnd?.();
        };

        window.speechSynthesis.speak(utter);
      };

      speakChunkAt(0);
    } catch {
      if (seq === this.speechSeq) {
        this.activeSpeechMode = 'none';
        this.inClausePause = false;
        options.onEnd?.();
      }
    }
  }

  /**
   * Speaks live Vietnamese commentary via single-voice server-side Gemini TTS (gemini-3.8-flash-lite-tts).
   * Keeps any ongoing line speaking seamlessly until the next WAV clip is ready to play (ZERO dead cuts,
   * ZERO overlapping double voices!).
   */
  public async speakCommentary(text: string, options: SpeakOptions = {}) {
    if (this.muted || !this.voiceEnabled || typeof window === 'undefined') return;
    const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    // Abort only an older pending fetch; let any already-speaking line finish smoothly until the new WAV arrives!
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
    const seq = ++this.speechSeq;

    const voice = options.voice ?? this.voiceName;
    const rate = options.rate ?? this.speechRate;
    const emotionKey = options.emotion ?? options.mood ?? 'calm';
    const cacheKey = `${voice}::${emotionKey}::${clean}`;

    const playClip = (clip: CachedAudioClip) => {
      if (seq !== this.speechSeq || this.muted || !this.voiceEnabled) return;

      // Cleanly hand off right as the new WAV starts -> NEVER two voices overlapping!
      this.stopActivePlaybackOnly();

      const audio = new Audio(clip.blobUrl);
      audio.volume = 1.0;
      audio.playbackRate = Math.min(1.55, Math.max(0.88, rate));
      const pitchAudio = audio as HTMLAudioElement & {
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ('preservesPitch' in pitchAudio) pitchAudio.preservesPitch = true;
      if ('webkitPreservesPitch' in pitchAudio) pitchAudio.webkitPreservesPitch = true;

      this.currentAudio = audio;
      this.currentEnvelope = clip.envelope;

      audio.onplay = () => {
        if (seq !== this.speechSeq) {
          audio.pause();
          return;
        }
        this.activeSpeechMode = 'gemini';
        this.speechStartedAt = performance.now();
        options.onStart?.('gemini');
      };
      audio.onended = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentEnvelope = null;
          this.activeSpeechMode = 'none';
        }
        if (seq === this.speechSeq) {
          options.onEnd?.();
        }
      };
      audio.onerror = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentEnvelope = null;
          this.activeSpeechMode = 'none';
        }
        if (seq === this.speechSeq) {
          options.onEnd?.();
        }
      };

      audio.play().catch(() => {
        if (seq === this.speechSeq) {
          this.activeSpeechMode = 'none';
          this.currentAudio = null;
          this.currentEnvelope = null;
          options.onEnd?.();
        }
      });
    };

    const cached = this.audioCache.get(cacheKey);
    if (cached) {
      playClip(cached);
      return;
    }

    const controller = new AbortController();
    this.currentAbort = controller;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: clean,
          voice,
          mood: options.mood ?? 'calm',
          emotion: options.emotion ?? options.mood ?? 'calm',
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted || seq !== this.speechSeq) return;

      const data = await res.json();
      if (seq !== this.speechSeq) return;

      if (!res.ok || !data?.audioBase64) {
        options.onError?.(data?.error || 'Không tạo được giọng bình luận AI.');
        this.playBrowserFallback(clean, options, seq);
        return;
      }

      const wavBytes = base64ToUint8Array(data.audioBase64);
      const envelope = extractWavRmsEnvelope(wavBytes, 60);
      const wavBlob = new Blob([wavBytes.slice().buffer], {
        type: data.mimeType || 'audio/wav',
      });
      const blobUrl = URL.createObjectURL(wavBlob);
      const clip: CachedAudioClip = { blobUrl, envelope };

      if (this.audioCache.size >= 24) {
        const firstKey = this.audioCache.keys().next().value;
        if (firstKey) {
          const evicted = this.audioCache.get(firstKey);
          if (evicted && this.currentAudio?.src !== evicted.blobUrl) {
            URL.revokeObjectURL(evicted.blobUrl);
          }
          this.audioCache.delete(firstKey);
        }
      }
      this.audioCache.set(cacheKey, clip);
      playClip(clip);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || seq !== this.speechSeq) return;
      this.playBrowserFallback(clean, options, seq);
    }
  }
}

export const wuxiaAudio = new WuxiaAudioEngine();
