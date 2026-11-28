// One Gemini call with honest rate-limit handling, shared by the scan tools.
// - Per-minute limit (429): waits as long as Google says (RetryInfo), up to ~5 min in total, then tries again.
// - Daily limit / no quota: throws QuotaError so the tool stops cleanly, saves what it has, and tells you —
//   instead of failing every remaining guide one after another.
export class QuotaError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geminiJSON({ key, model, parts, schema, timeoutMs = 180000 }) {
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } };
  let waited = 0;
  for (let i = 0; ; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.ok) {
      const out = await r.json();
      const text = (out?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
      return JSON.parse(text || '{}');
    }
    const t = await r.text();
    if (r.status === 429) {
      if (/per ?day|PerDay|daily|limit: 0\b|exceeded your current quota.*billing/i.test(t)) {
        throw new QuotaError('Gemini daily limit reached on this key (free tier). Run again tomorrow — it picks up where it stopped — or turn on billing for this key in Google AI Studio.');
      }
      const m = t.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
      const wait = Math.min(120000, m ? Math.ceil(Number(m[1]) * 1000) + 1000 : 20000 * (i + 1));
      if (waited + wait > 300000) throw new QuotaError('Gemini keeps refusing (per-minute limit) — wait a few minutes and run again; it picks up where it stopped.');
      console.log(`    Gemini limit — waiting ${Math.round(wait / 1000)} s…`);
      await sleep(wait); waited += wait;
      continue;
    }
    if (r.status >= 500 && i < 4) { await sleep(5000 * (i + 1)); continue; }
    if (r.status === 400 && /API key/i.test(t)) throw new QuotaError('Gemini says the API key is not valid — set $env:GEMINI_API_KEY again.');
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 160)}`);
  }
}
