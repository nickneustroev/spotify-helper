export type SyncRunner = <T>(modeName: string, run: () => Promise<T>) => Promise<T>;

export function createSyncRunner(gapMs: number): SyncRunner {
  let syncQueue = Promise.resolve();

  return async <T>(_modeName: string, run: () => Promise<T>): Promise<T> => {
    const previous = syncQueue;
    let release!: () => void;
    const slot = new Promise<void>((resolve) => {
      release = resolve;
    });
    syncQueue = slot.then(() => sleep(gapMs));

    await previous.catch(() => undefined);

    try {
      return await run();
    } finally {
      release();
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }

    setTimeout(resolve, ms);
  });
}
