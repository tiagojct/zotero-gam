// A limit on the number of tasks that run at the same time. Pure module: no Zotero or browser globals.

/**
 * limit(fn) runs fn() when fewer than max tasks run, else when one of them ends.
 * It returns the result of fn(). Do not call limit() inside fn: the outer task keeps its place
 * while it waits, and with max such tasks nothing can run.
 */
export function makeLimit(max) {
  if (!(Number.isInteger(max) && max > 0)) throw new Error(`max must be a positive integer: ${max}`);
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
