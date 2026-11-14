// Refresh scheduling. Pure module: no Zotero or browser globals.

/**
 * refresh({force}) runs run() at most once each minInterval ms, unless force is set.
 * A call during a scan waits for it. A forced call during a scan also runs one more scan
 * after it, so its result includes changes made after the first scan started.
 */
export function makeRefresher(run, { minInterval, now = () => Date.now() }) {
  let last = -Infinity;
  let running = null;
  let pending = null;

  const start = () => {
    last = now();
    running = (async () => {
      try {
        await run();
      } finally {
        running = null;
      }
    })();
    return running;
  };

  return async function refresh({ force = false } = {}) {
    if (running) {
      if (!force) return running;
      if (!pending) {
        pending = running.catch(() => {}).then(() => {
          pending = null;
          return start();
        });
      }
      return pending;
    }
    if (!force && now() - last < minInterval) return undefined;
    return start();
  };
}
