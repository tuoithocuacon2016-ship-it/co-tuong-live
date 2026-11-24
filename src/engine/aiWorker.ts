/**
 * Off-Main-Thread Grandmaster Xiangqi AI Web Worker.
 * Runs iterative-deepening PVS + Aspiration Windows + Quiescence search
 * completely off the UI thread so 3D WebGL, Live2D lip-sync, and mobile touch stay 60fps.
 */

import { BoardState } from './xiangqi';
import { AnalyzeOptions, BotDifficulty, DeepAnalysisResult, analyzePosition } from './ai';

export interface AiWorkerRequest {
  id: number;
  state: BoardState;
  difficulty: BotDifficulty;
  options?: AnalyzeOptions;
}

export interface AiWorkerResponse {
  id: number;
  result?: DeepAnalysisResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { id, state, difficulty, options } = event.data;
  try {
    const result = analyzePosition(state, difficulty, options);
    const reply: AiWorkerResponse = { id, result };
    self.postMessage(reply);
  } catch (err) {
    const reply: AiWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(reply);
  }
};
