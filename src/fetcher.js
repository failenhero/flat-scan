const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 2_000;

export async function fetchHtml(url, opts = {}) {
  const {
    contactEmail = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = opts;
  const userAgent = `flats-scan/1.0 (+${contactEmail})`;
  const headers = { 'User-Agent': userAgent, 'Accept-Language': 'de' };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500 && res.status < 600) {
        if (attempt === 1) {
          await sleep(retryDelayMs);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      const isLast = attempt === 2;
      const isHttpError = /^HTTP \d+$/.test(err.message);
      if (isLast || isHttpError) throw err;
      await sleep(retryDelayMs);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
