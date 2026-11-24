/**
 * Vietnamese Live Voice Move Listener with Echo-Guard.
 * Uses Web Speech API (vi-VN) so the active challenger on PK/mic or the live host
 * can speak Xiangqi moves aloud ("pháo hai bình năm", "mã tám tiến bảy", "xe ăn pháo")
 * while automatically suppressing self-hearing whenever Kỳ Ma's TTS voice is speaking!
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface VoiceTranscriptEvent {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export class VoiceMoveListener {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private suppressed = false;
  private suppressedUntilMs = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private onTranscriptCb: ((ev: VoiceTranscriptEvent) => void) | null = null;
  private onErrorCb: ((msg: string) => void) | null = null;
  private onStatusCb: ((listening: boolean) => void) | null = null;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  public isActive(): boolean {
    return this.active;
  }

  /**
   * Echo-Guard: suppress incoming speech transcripts while Kỳ Ma's voice is playing
   * plus a 550ms acoustic tail so speakers never trigger false chess moves!
   */
  public setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (!suppressed) {
      this.suppressedUntilMs = Date.now() + 550;
    }
  }

  public start(callbacks: {
    onTranscript: (ev: VoiceTranscriptEvent) => void;
    onError?: (msg: string) => void;
    onStatus?: (listening: boolean) => void;
  }): boolean {
    if (!this.isSupported()) {
      callbacks.onError?.(
        'Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói Web Speech (dùng Chrome/Edge để bật Mic nghe cờ).',
      );
      return false;
    }

    this.onTranscriptCb = callbacks.onTranscript;
    this.onErrorCb = callbacks.onError ?? null;
    this.onStatusCb = callbacks.onStatus ?? null;
    this.active = true;
    this.spawnRecognition();
    this.onStatusCb?.(true);
    return true;
  }

  public stop(): void {
    this.active = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {
        // ignore stop errors
      }
      this.recognition = null;
    }
    this.onStatusCb?.(false);
  }

  private spawnRecognition(): void {
    if (!this.active || typeof window === 'undefined') return;
    const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    try {
      const rec = new Ctor();
      rec.lang = 'vi-VN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev: SpeechRecognitionEventLike) => {
        if (!this.active) return;
        // Echo-Guard check: ignore everything heard while bot TTS is playing or within acoustic tail
        if (this.suppressed || Date.now() < this.suppressedUntilMs) return;

        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const result = ev.results[i];
          const alt = result?.[0];
          const transcript = (alt?.transcript ?? '').trim();
          if (!transcript) continue;
          this.onTranscriptCb?.({
            transcript,
            isFinal: Boolean(result.isFinal),
            confidence: typeof alt.confidence === 'number' ? alt.confidence : 0.85,
          });
        }
      };

      rec.onerror = (ev: SpeechRecognitionErrorEventLike) => {
        if (!this.active) return;
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          this.active = false;
          this.onStatusCb?.(false);
          this.onErrorCb?.('Trình duyệt chưa cấp quyền Microphone để nghe nước cờ.');
          return;
        }
        // Transient errors ("no-speech", "network", "aborted") are recovered on onend
      };

      rec.onend = () => {
        if (!this.active) return;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          this.spawnRecognition();
        }, 320);
      };

      this.recognition = rec;
      rec.start();
    } catch {
      this.active = false;
      this.onStatusCb?.(false);
      this.onErrorCb?.('Không thể khởi động Microphone nghe nước đi.');
    }
  }
}

export const voiceMoveListener = new VoiceMoveListener();
