import test from "node:test";
import assert from "node:assert/strict";
import { getNavigationLockReason, isNavigationLocked } from "./navigation-lock.js";

test("navigation is locked while a message is streaming", () => {
  assert.equal(isNavigationLocked({ sendingMessage: true }), true);
});

test("navigation is not locked when nothing is streaming", () => {
  assert.equal(isNavigationLocked({ sendingMessage: false }), false);
});

test("lock reason explains how to resume navigation", () => {
  assert.equal(
    getNavigationLockReason("en"),
    "Wait for the agent to finish or press Stop before switching chats, changing the agent, or attaching files.",
  );
});
