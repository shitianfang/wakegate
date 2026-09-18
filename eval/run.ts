import { shouldWake } from "../src/index.js";
import { scenarios } from "./scenarios.js";

if (!process.env.AI_GATEWAY_API_KEY) {
  console.log("eval skipped: AI_GATEWAY_API_KEY is not set");
} else {
  const rows = [];
  for (const { name, wake, wakeup } of scenarios) {
    const start = performance.now();
    const verdict = await shouldWake({ ...wakeup, skipped: 0 });
    const ms = Math.round(performance.now() - start);
    rows.push({ name, expected: wake ? "wake" : "sleep", got: verdict.wake ? "wake" : "sleep", reason: verdict.reason, p: verdict.probability?.toFixed(2), ms });
    if (verdict.error) console.error(name, String(verdict.error).slice(0, 200));
  }
  console.table(rows);

  const wrong = rows.filter((r) => r.expected !== r.got);
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const percentile = (q: number) => ms[Math.ceil(q * ms.length) - 1];
  console.log(`accuracy ${rows.length - wrong.length}/${rows.length}`);
  console.log(`woke when it should have slept: ${wrong.filter((r) => r.got === "wake").length}, slept when it should have woken: ${wrong.filter((r) => r.got === "sleep").length}`);
  console.log(`errors ${rows.filter((r) => r.reason === "error").length}, latency p50 ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms`);
  for (const r of wrong) console.log(`wrong: ${r.name} (expected ${r.expected}, p=${r.p})`);
}
