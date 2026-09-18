# wakegate

Before you resume a sleeping agent, ask [Jev](https://vercel.com/ai-gateway/models/jev) whether the wakeup is worth a full LLM turn.

## Why

Long-running agents sleep. A timer fires every 30 minutes to re-check a price, or an email lands while the agent waits for one particular reply. Each wakeup usually resumes the LLM with its whole context, and many of them end in "nothing changed, back to sleep". That turn's tokens are spent anyway.

wakegate puts one Jev call in front of the resume. Jev is TypeSafe AI's judgment model: it reads JSON state and returns probabilities for typed questions without generating text. A call took about 250 ms in our runs. wakegate asks one question: given what the agent said it was waiting for, is this worth waking up for? Plain code handles everything else, including how long to sleep and when to force a wake.

## Install

Not on npm yet.

```sh
npm install github:shitianfang/wakegate ai
```

`ai` (the Vercel AI SDK, 7.0.105 or later) is a peer dependency. By default the model is `typesafe-ai/jev` on the Vercel AI Gateway, which reads `AI_GATEWAY_API_KEY`.

## Usage

```ts
import { shouldWake } from "wakegate";

// An email arrived while the agent slept.
const verdict = await shouldWake({
  waitingFor: "A reply from Dana Li (HR at Acme) about scheduling my second-round interview",
  event: { type: "email", from: "noreply@medium.com", subject: "Your Daily Digest: 7 stories about AI agents" },
  skipped: 0, // skips in a row so far: store verdict.skipped and pass it back next time
});
// { wake: false, reason: "judged", probability: 0.01, skipped: 1 }

if (verdict.wake) await resumeAgent(); // your full LLM turn
```

| Field | |
|---|---|
| `waitingFor` | What the agent said it was waiting for when it went to sleep. |
| `event` | What woke it: an email, a webhook payload, a notification. Leave it out when the agent's own timer fired. |
| `observation` | Optional. A cheap, fresh look at what it waits on, such as a price you just fetched or new inbox subjects. |
| `fromUser` | The event is a message from the user. Always wakes. |
| `skipped` | Skips in a row so far. |
| `maxSkips` | Wake anyway after this many skips in a row. Default 10. |
| `model` | Any AI SDK evaluation model. Default `"typesafe-ai/jev"`. |

You get back `{ wake, reason, probability?, skipped, error? }`, where `probability` is Jev's probability that the wakeup is worth it. wakegate never picks a sleep duration. Re-arm your timer with your own interval.

## In a Durable Object alarm

Secrets arrive on `env`, so pass the key through a gateway instance:

```ts
import { DurableObject } from "cloudflare:workers";
import { createGateway } from "ai";
import { shouldWake } from "wakegate";

const every = 30 * 60_000;

export class PriceWatch extends DurableObject<Env> {
  async alarm() {
    const waitingFor = (await this.ctx.storage.get<string>("waitingFor"))!;
    const skipped = (await this.ctx.storage.get<number>("skipped")) ?? 0;
    const price = await fetch("https://api.example.com/price/wh-1000xm6").then((r) => r.json());

    const verdict = await shouldWake({
      waitingFor,
      observation: price,
      skipped,
      model: createGateway({ apiKey: this.env.AI_GATEWAY_API_KEY }).evaluationModel("typesafe-ai/jev"),
    });
    console.log("wakegate", verdict.reason, verdict.probability, verdict.error);
    await this.ctx.storage.put("skipped", verdict.skipped);

    if (verdict.wake) await this.resume(price); // your LLM turn
    else await this.ctx.storage.setAlarm(Date.now() + every);
  }
}
```

We ran this alarm in local workerd (wrangler 4.86, without `nodejs_compat`), reading the price from storage instead of fetching it. An unchanged $349.99 kept the agent asleep (p = 0.04). $279.99 against a "below $300" goal woke it (p = 0.99). With no key it woke with `reason: "error"`.

## Safety rules

wakegate skips a wakeup only when Jev answers and puts less than 0.2 on "wake". Every other path wakes the agent:

| Situation | `wake` | `reason` |
|---|---|---|
| `fromUser: true` (Jev is not asked) | `true` | `user-message` |
| No `event` and no `observation`: the agent's own timer, nothing to judge (Jev is not asked) | `true` | `nothing-to-judge` |
| `skipped >= maxSkips`, or `skipped` is missing or NaN (Jev is not asked) | `true` | `skip-limit` |
| Jev throws, takes over 5 s, or there is no API key | `true` | `error`, with the cause in `verdict.error` |
| Jev puts 0.2 to 0.5 on "wake", or returns no probabilities | `true` | `unsure` |
| Jev puts 0.5 or more on "wake" | `true` | `judged` |
| Jev puts less than 0.2 on "wake" | `false` | `judged` |

A wake resets `skipped` to 0, and a skip returns `skipped + 1`.

## Eval

`eval/scenarios.ts` has 21 hand-written scenarios: 11 should wake and 10 should not.

- An agent waiting for an HR reply receives a newsletter, a LinkedIn alert that names the company, the reply itself, a calendar invite, and a vague mail from a personal address.
- Price, BTC, CI and parcel watches wake on a timer with a fresh observation: unchanged, target met, changed but not met, sold out, and a broken page.
- Payment webhooks arrive for the awaited invoice and for a different one.
- Two of the cases are in Chinese.

```sh
AI_GATEWAY_API_KEY=... npm run eval   # skipped without a key
```

One run against the real Jev on 2026-09-18, through the Vercel AI Gateway from one Linux container, with calls made one after another:

| | |
|---|---|
| Correct | 21 / 21 |
| Skipped a wakeup that should have woken | 0 |
| Woke when it could have slept | 0 |
| Latency per call | p50 253 ms, p95 519 ms (n = 21) |

There were two close calls. Two of the 11 correct wakes came only from the `unsure` band: the Google Calendar invite for the interview (0.38) and "sold out" on the price watch (0.48). Jev leaned towards sleeping both times, and the 0.2 threshold woke the agent anyway.

Discount these numbers:

- The same person wrote the scenarios and the question.
- The first wording, a yes/no question, scored 16/21 on this set. It woke on four "not yet" timer observations: price dropped but still above target (0.41), BTC below threshold (0.30), CI still running (0.20), parcel moving between facilities (0.44). Two calls also timed out at 5 s and woke by the error rule. One of them, the LinkedIn alert, should have slept. That wording never skipped a wakeup it shouldn't have.
- The current wording is a three-way choice: wake, not yet, or unrelated. It was picked from three candidates on a separate 16-scenario dev set, which is not in the repo. It scored 15/16 there. Its one miss was a ticket price still above target that woke at exactly 0.20.
- A separate 60-call latency probe (no retries, no timeout) gave p50 241 ms, p95 336 ms, max 540 ms, and no errors. The two 5 s timeouts did not reproduce.
- 21 scenarios make a smoke test, not a benchmark.

## Limitations

- Jev only sees what you pass. wakegate fetches nothing, so a vague `waitingFor` or a stale observation gets a poor verdict.
- Every wakeup that reaches Jev costs one call, about a quarter second here. The rules above decide the rest without a call.
- Savings are not measured. How many wakeups get skipped depends on your agent's traffic, and we have no production numbers.
- The 0.2 threshold and the 5 s timeout are fixed. If you want your own rule on top, use `verdict.probability`.
- `event` and `observation` are untrusted. A crafted email could try to talk Jev into "unrelated". The question tells Jev that they are data, and `maxSkips` bounds how long the agent can be kept asleep. Neither is a security boundary.
- `experimental_evaluate` is experimental in the AI SDK and may change in patch releases.

The whole thing is `src/index.ts`, 69 lines.

## License

MIT
