export interface PauseAwareTimer {
  set(callback: () => void, delayMs: number): number;
  clear(handle: number): void;
}

export function createPauseAwareScheduler(timer: PauseAwareTimer) {
  let paused = false;
  let handle: number | null = null;
  let pending: (() => void) | null = null;

  const clearTimer = () => {
    if (handle === null) return;
    timer.clear(handle);
    handle = null;
  };

  const arm = (delayMs: number) => {
    if (paused || handle !== null || pending === null) return;
    handle = timer.set(() => {
      handle = null;
      if (paused || pending === null) return;
      const action = pending;
      pending = null;
      action();
    }, delayMs);
  };

  return {
    schedule(action: () => void, delayMs: number) {
      clearTimer();
      pending = action;
      arm(delayMs);
    },
    pause() {
      paused = true;
      clearTimer();
    },
    resume() {
      if (!paused) return;
      paused = false;
      arm(0);
    },
    cancel() {
      paused = false;
      clearTimer();
      pending = null;
    },
  };
}
