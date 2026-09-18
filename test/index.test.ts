import { Experimental_EvaluationMockModelV4 as MockEvaluationModel } from "ai/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { shouldWake } from "../src/index.js";

const waitingFor = "A reply from Dana (HR at Acme) about the interview";
const event = { type: "email", from: "news@medium.com", subject: "Your Daily Digest" };

function jev(answer: (state: unknown, signal?: AbortSignal) => Promise<number | undefined>) {
  const states: unknown[] = [];
  const model = new MockEvaluationModel({
    doEvaluate: async ({ state, abortSignal }) => {
      states.push(state);
      const wake = await answer(state, abortSignal);
      const probabilities = wake === undefined ? undefined : { wake, not_yet: 1 - wake, unrelated: 0 };
      return { answers: { worth_waking: { type: "choice", choice: (wake ?? 1) >= 0.5 ? "wake" : "not_yet", probabilities } }, warnings: [] };
    },
  });
  return { model, states };
}
const says = (wake: number | undefined) => jev(async () => wake);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("no network in unit tests"))));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("wakes when Jev says the event is worth it, and resets the skip count", async () => {
  const { model } = says(0.9);
  expect(await shouldWake({ waitingFor, event, skipped: 3, model })).toEqual({ wake: true, reason: "judged", probability: 0.9, skipped: 0 });
});

test("keeps sleeping when Jev is sure it is not worth it, and counts the skip", async () => {
  const { model } = says(0.05);
  expect(await shouldWake({ waitingFor, event, skipped: 2, model })).toEqual({ wake: false, reason: "judged", probability: 0.05, skipped: 3 });
});

test("wakes when Jev leans towards sleeping but is not sure enough", async () => {
  const { model } = says(0.3);
  expect(await shouldWake({ waitingFor, event, skipped: 0, model })).toMatchObject({ wake: true, reason: "unsure", probability: 0.3 });
});

test("wakes when Jev gives no probabilities", async () => {
  const { model } = says(undefined);
  expect(await shouldWake({ waitingFor, event, skipped: 0, model })).toMatchObject({ wake: true, reason: "unsure" });
});

test("always wakes for a user message, without asking Jev", async () => {
  const { model, states } = says(0);
  expect(await shouldWake({ waitingFor, event: { text: "stop" }, fromUser: true, skipped: 0, model })).toMatchObject({ wake: true, reason: "user-message" });
  expect(states).toHaveLength(0);
});

test("wakes on its own timer when there is nothing to judge, without asking Jev", async () => {
  const { model, states } = says(0);
  expect(await shouldWake({ waitingFor, skipped: 0, model })).toMatchObject({ wake: true, reason: "nothing-to-judge" });
  expect(states).toHaveLength(0);
});

test("wakes after maxSkips skips in a row, without asking Jev", async () => {
  const { model, states } = says(0);
  expect(await shouldWake({ waitingFor, event, skipped: 10, model })).toEqual({ wake: true, reason: "skip-limit", skipped: 0 });
  expect(await shouldWake({ waitingFor, event, skipped: 2, maxSkips: 2, model })).toMatchObject({ wake: true, reason: "skip-limit" });
  expect(await shouldWake({ waitingFor, event, skipped: 1, maxSkips: 2, model })).toMatchObject({ wake: false, skipped: 2 });
  expect(states).toHaveLength(1);
});

test("treats a missing or broken skip count as over the limit", async () => {
  const { model } = says(0);
  expect(await shouldWake({ waitingFor, event, skipped: Number.NaN, model })).toMatchObject({ wake: true, reason: "skip-limit" });
  expect(await shouldWake({ waitingFor, event, model } as never)).toMatchObject({ wake: true, reason: "skip-limit" });
});

test("wakes and hands back the error when Jev fails", async () => {
  const { model } = jev(async () => Promise.reject(new Error("gateway down")));
  const verdict = await shouldWake({ waitingFor, event, skipped: 0, model });
  expect(verdict).toMatchObject({ wake: true, reason: "error", skipped: 0 });
  expect(String(verdict.error)).toContain("gateway down");
});

test("wakes when Jev does not answer in time", async () => {
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), 10);
    return controller.signal;
  });
  const { model } = jev((_, signal) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason))));
  expect(await shouldWake({ waitingFor, event, skipped: 0, model })).toMatchObject({ wake: true, reason: "error" });
});

test("wakes when there is no API key", async () => {
  vi.stubEnv("AI_GATEWAY_API_KEY", undefined);
  vi.stubEnv("VERCEL_OIDC_TOKEN", undefined);
  expect(await shouldWake({ waitingFor, event, skipped: 0 })).toMatchObject({ wake: true, reason: "error" });
});

test("sends Jev plain JSON that says what woke the agent", async () => {
  const { model, states } = says(0.9);
  await shouldWake({ waitingFor, event: { ...event, cc: undefined, at: new Date(0) }, skipped: 0, model });
  await shouldWake({ waitingFor, observation: { price: 329 }, skipped: 0, model });
  expect(states).toEqual([
    { waiting_for: waitingFor, woken_by: "event", event: { ...event, at: "1970-01-01T00:00:00.000Z" } },
    { waiting_for: waitingFor, woken_by: "timer", observation: { price: 329 } },
  ]);
});
