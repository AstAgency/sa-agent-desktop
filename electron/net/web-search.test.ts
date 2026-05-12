import test from "node:test";
import assert from "node:assert/strict";
import { formatSearchResults, normalizeSearchLimit } from "./web-search.js";

test("normalizeSearchLimit clamps into supported range", () => {
  assert.equal(normalizeSearchLimit(undefined), 5);
  assert.equal(normalizeSearchLimit(0), 1);
  assert.equal(normalizeSearchLimit(3), 3);
  assert.equal(normalizeSearchLimit(50), 10);
});

test("formatSearchResults produces compact numbered output with endpoint", () => {
  const text = formatSearchResults({
    query: "react markdown best practices",
    endpoint: "http://localhost:8000",
    results: [
      {
        title: "React Markdown",
        url: "https://example.com/react-markdown",
        snippet:
          "A concise snippet that explains why this package works well for rendering markdown safely.",
      },
      {
        title: "Remark GFM",
        url: "https://example.com/remark-gfm",
        snippet: "GitHub-flavored markdown support details.",
      },
    ],
  });

  assert.match(text, /^Query: "react markdown best practices"/m);
  assert.match(text, /^Provider: orio \(http:\/\/localhost:8000\)/m);
  assert.match(text, /^Results \(2\):/m);
  assert.match(text, /1\. React Markdown/);
  assert.match(text, /https:\/\/example\.com\/react-markdown/);
  assert.match(text, /2\. Remark GFM/);
});
