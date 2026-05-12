import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedFetchUrl,
  formatFetchedTextResult,
  isPrivateIpAddress,
  truncateForLlm,
} from "./http-fetcher.js";

test("assertAllowedFetchUrl only accepts http/https", () => {
  assert.throws(() => assertAllowedFetchUrl("file:///etc/passwd"), /URL must be http\(s\)/);
  assert.equal(assertAllowedFetchUrl("https://example.com/path").hostname, "example.com");
});

test("isPrivateIpAddress blocks loopback and RFC1918 ranges", () => {
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.0.42.5"), true);
  assert.equal(isPrivateIpAddress("172.16.1.1"), true);
  assert.equal(isPrivateIpAddress("192.168.10.4"), true);
  assert.equal(isPrivateIpAddress("169.254.1.9"), true);
  assert.equal(isPrivateIpAddress("::1"), true);
  assert.equal(isPrivateIpAddress("fc00::1"), true);
  assert.equal(isPrivateIpAddress("fe80::1"), true);
  assert.equal(isPrivateIpAddress("93.184.216.34"), false);
});

test("truncateForLlm marks truncated content", () => {
  assert.equal(truncateForLlm("short", 10), "short");
  assert.equal(truncateForLlm("abcdefghijXYZ", 10), "abcdefghij… (truncated)");
});

test("formatFetchedTextResult emits markdown-friendly envelope", () => {
  const text = formatFetchedTextResult({
    url: "https://example.com/article",
    title: "Example article",
    status: 200,
    contentType: "text/plain",
    contentLength: 32,
    bodyText: "Hello world",
    truncated: false,
  });
  assert.match(text, /^URL: https:\/\/example\.com\/article/m);
  assert.match(text, /^Title: Example article/m);
  assert.match(text, /^Status: 200 \(text\/plain\)/m);
  assert.match(text, /Content-Length: 32/);
  assert.match(text, /\n\nHello world$/);
});
