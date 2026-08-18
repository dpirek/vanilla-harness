import assert from "node:assert/strict";
import test from "node:test";

import { markdownBlocks, safeLinkHref } from "../public/lib/message-rendering.js";

test("markdown messages split into semantic block types", () => {
  const blocks = markdownBlocks(`# Result

- **First** item
- Second item

| Name | Status |
| :--- | ---: |
| Build | Done |

> Safe output

\`\`\`js
const ready = true;
\`\`\``);

  assert.deepEqual(blocks.map((block) => block.type), [
    "heading",
    "list",
    "table",
    "quote",
    "code",
  ]);
  assert.deepEqual(blocks[1].items, ["**First** item", "Second item"]);
  assert.deepEqual(blocks[2].alignments, ["left", "right"]);
  assert.equal(blocks[4].language, "js");
});

test("markdown links allow web destinations and reject executable URLs", () => {
  assert.equal(safeLinkHref("https://example.com/docs"), "https://example.com/docs");
  assert.equal(safeLinkHref("mailto:team@example.com"), "mailto:team@example.com");
  assert.equal(safeLinkHref("./trump-news-latest.png"), "./trump-news-latest.png");
  assert.equal(safeLinkHref("./trump-news-latest.html"), "./trump-news-latest.html");
  assert.equal(safeLinkHref("../reports/latest.html"), "../reports/latest.html");
  assert.equal(safeLinkHref("#sources"), "#sources");
  assert.equal(safeLinkHref("javascript:alert(1)"), "");
  assert.equal(safeLinkHref("data:text/html,unsafe"), "");
  assert.equal(safeLinkHref("//example.com/unsafe"), "");
});
