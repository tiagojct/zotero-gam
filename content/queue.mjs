// One queue for all work that writes to the library (citation keys, titles): each job starts
// when the one before it ends, so it plans with what that one wrote.

let queue = Promise.resolve();

export function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}
