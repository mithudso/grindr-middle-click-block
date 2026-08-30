// Opt-in rate limiter. Grindr force-logs-out on bursts of writes, so callers that
// issue many block/hide/album calls should route them through here: it serializes
// calls behind a minimum interval and a rolling hourly cap.

/**
 * @param {{minIntervalMs?:number, maxPerHour?:number}} [opts]
 * @returns {{run:(fn:()=>Promise<any>)=>Promise<any>, pending:()=>number}}
 */
export function createLimiter({ minIntervalMs = 500, maxPerHour = 500 } = {}) {
  let chain = Promise.resolve();
  let lastAt = 0;
  let size = 0;
  const stamps = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function gate() {
    let now = Date.now();
    while (stamps.length && now - stamps[0] > 3_600_000) stamps.shift();
    if (stamps.length >= maxPerHour) {
      const wait = 3_600_000 - (now - stamps[0]);
      if (wait > 0) await sleep(wait);
    }
    now = Date.now();
    const since = now - lastAt;
    if (since < minIntervalMs) await sleep(minIntervalMs - since);
    lastAt = Date.now();
    stamps.push(lastAt);
  }

  function run(fn) {
    size += 1;
    const p = chain.then(async () => {
      try { await gate(); return await fn(); }
      finally { size -= 1; }
    });
    chain = p.catch(() => {});
    return p;
  }

  return { run, pending: () => size };
}
