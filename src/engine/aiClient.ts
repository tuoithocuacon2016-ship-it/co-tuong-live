/**
 * Resilient Async Xiangqi AI Client.
 * Executes deep Grandmaster search inside a dedicated Web Worker in browsers
 * (keeping 3D WebGL & mobile touch at 60fps), with seamless synchronous fallback
 * if Web Workers are unavailable or fail to initialize.
 */

import { BoardState } from './xiangqi';
import { AnalyzeOptions, BotDifficulty, DeepAnalysisResult, analyzePosition } from './ai';
import type { AiWorkerRequest, AiWorkerResponse } from './aiWorker';

class XiangqiAiWorkerClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (res: DeepAnalysisResult) => void; fallback: () => DeepAnalysisResult }
  >();

  private ensureWorker(): Worker | null {
    if (this.workerFailed) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') {
      this.workerFailed = true;
      return null;
    }

    try {
      const worker = new Worker(new URL('./aiWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
        const { id, result, error } = event.data;
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (result && !error) {
          entry.resolve(result);
        } else {
          entry.resolve(entry.fallback());
        }
      };
      worker.onerror = () => {
        this.workerFailed = true;
        this.worker?.terminate();
        this.worker = null;
        // Resolve any in-flight requests cleanly via synchronous fallback
        for (const [id, entry] of this.pending.entries()) {
          this.pending.delete(id);
          entry.resolve(entry.fallback());
        }
      };
      this.worker = worker;
      return worker;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  public analyzeAsync(
    state: BoardState,
    difficulty: BotDifficulty = 'cao_thu',
    options?: AnalyzeOptions,
  ): Promise<DeepAnalysisResult> {
    const worker = this.ensureWorker();
    if (!worker) {
      return Promise.resolve(analyzePosition(state, difficulty, options));
    }

    return new Promise<DeepAnalysisResult>((resolve) => {
      const id = this.nextId++;
      const fallback = () => analyzePosition(state, difficulty, options);
      this.pending.set(id, { resolve, fallback });

      const payload: AiWorkerRequest = { id, state, difficulty, options };
      try {
        worker.postMessage(payload);
      } catch {
        this.pending.delete(id);
        resolve(fallback());
      }
    });
  }

  public dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }
}

export const xiangqiAiClient = new XiangqiAiWorkerClient();
