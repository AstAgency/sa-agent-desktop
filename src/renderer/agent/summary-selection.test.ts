import assert from "node:assert/strict";
import test from "node:test";
import type { Message, SearchSummaryResult, Summary } from "../lib/types.js";
import { buildRetrievalQuery, selectSummaries } from "./summary-selection.js";

function summary(id: string, distance?: number): SearchSummaryResult {
  return {
    id,
    session_id: "s",
    profile_id: "p",
    content: `summary ${id}`,
    from_message_id: null,
    to_message_id: null,
    embedding: null,
    created_at: id,
    updated_at: id,
    distance,
  };
}

function msg(role: Message["role"], content: string): Message {
  return { id: content, session_id: "s", role, content, created_at: content };
}

test("selectSummaries orders by distance and applies the threshold", () => {
  const out = selectSummaries({
    results: [summary("c", 0.4), summary("a", 0.05), summary("b", 0.2)],
    distanceThreshold: 0.3,
  });
  // a, b clear the threshold; c (0.4) is dropped because the >=2 guarantee is
  // already satisfied by real matches.
  assert.deepEqual(
    out.map((s) => s.id),
    ["a", "b"],
  );
});

test("selectSummaries still returns the closest matches when none clear the threshold", () => {
  const out = selectSummaries({
    results: [summary("far", 0.9), summary("near", 0.45), summary("mid", 0.7)],
    distanceThreshold: 0.3,
  });
  assert.deepEqual(
    out.map((s) => s.id),
    ["near", "mid"],
  );
});

test("selectSummaries treats unknown distance as worst, not best", () => {
  const out = selectSummaries({
    results: [summary("noscore"), summary("good", 0.1)],
    distanceThreshold: 0.3,
  });
  assert.equal(out[0]!.id, "good");
  assert.equal(out[1]!.id, "noscore");
});

test("selectSummaries appends the recency anchor and dedupes overlap", () => {
  const recent = [summary("r1"), summary("good"), summary("r2")] as Summary[];
  const out = selectSummaries({
    results: [summary("good", 0.1)],
    recentSummaries: recent,
    distanceThreshold: 0.3,
  });
  // "good" stays in its semantic position; only the last RECENCY_ANCHOR (2)
  // recents are anchored, and the duplicate is dropped.
  assert.deepEqual(
    out.map((s) => s.id),
    ["good", "r2"],
  );
});

test("buildRetrievalQuery grounds the user message with the prior assistant tail", () => {
  const messages = [
    msg("user", "old question"),
    msg("assistant", "the answer was 42"),
    msg("user", "and the other one?"),
  ];
  const query = buildRetrievalQuery(messages, "and the other one?");
  assert.ok(query.includes("the answer was 42"));
  assert.ok(query.endsWith("and the other one?"));
});

test("buildRetrievalQuery falls back to just the user text", () => {
  assert.equal(buildRetrievalQuery([], "hello"), "hello");
  assert.equal(
    buildRetrievalQuery([msg("assistant", "   ")], "hello"),
    "hello",
  );
});
