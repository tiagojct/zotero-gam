// Collects new items, so that a batch (for example, from the browser connector) is one batch.

/**
 * jobs: functions (ids) that run one after the other, delay ms after the last add. enabled(): false
 * when no job has work. An error of a job goes to onError; the next job runs.
 */
export function makeNewItems({ delay, enabled, jobs, onError, setTimeout, clearTimeout }) {
  let ids = new Set();
  let timer = null;
  let stopped = false;

  async function run() {
    const batch = [...ids];
    ids = new Set();
    timer = null;
    for (const job of jobs) {
      if (stopped) return;
      try {
        await job(batch);
      } catch (e) {
        onError(e);
      }
    }
  }

  return {
    add(added) {
      if (stopped || !enabled()) return;
      for (const id of added) ids.add(id);
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    cancel() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      ids = new Set();
    },
  };
}
