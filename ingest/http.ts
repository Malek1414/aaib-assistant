import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_RETRIES, REQUEST_INTERVAL_MS, USER_AGENT } from "./config.ts";

const CACHE_DIR = ".cache/http";
const lastHit = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-host rate limiter: at most one request every REQUEST_INTERVAL_MS. */
async function throttle(host: string, intervalMs = REQUEST_INTERVAL_MS) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + intervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export interface FetchResult {
  url: string;
  status: number;
  body: string;
  fromCache: boolean;
}

/**
 * Polite GET with an identifying User-Agent, per-host throttling, exponential
 * backoff on 429/5xx and an on-disk cache so re-runs never re-hit the network.
 */
export async function politeGet(url: string, opts: { cache?: boolean } = {}): Promise<FetchResult> {
  const useCache = opts.cache ?? true;
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const file = join(CACHE_DIR, key + ".json");
  if (useCache) {
    try {
      const hit = JSON.parse(await readFile(file, "utf8")) as FetchResult;
      return { ...hit, fromCache: true };
    } catch {
      /* cache miss */
    }
  }
  const host = new URL(url).host;
  let attempt = 0;
  for (;;) {
    await throttle(host);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        attempt++;
        await sleep(2 ** attempt * 2000);
        continue;
      }
      const out: FetchResult = { url, status: res.status, body, fromCache: false };
      if (useCache && res.status === 200) {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, JSON.stringify(out));
      }
      return out;
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      attempt++;
      await sleep(2 ** attempt * 2000);
    }
  }
}
