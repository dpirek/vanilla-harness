import assert from "node:assert/strict";
import test from "node:test";

import { randomUuid } from "../public/lib/ids.js";

test("randomUuid uses the native secure-context implementation when available", () => {
  const expected = "00000000-0000-4000-8000-000000000001";
  assert.equal(randomUuid({ randomUUID: () => expected }), expected);
});

test("randomUuid generates a UUID when randomUUID is unavailable over HTTP", () => {
  const cryptoApi = {
    getRandomValues(bytes) {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    },
  };

  assert.equal(randomUuid(cryptoApi), "00010203-0405-4607-8809-0a0b0c0d0e0f");
});

test("randomUuid has a last-resort UUID fallback without Web Crypto", () => {
  assert.match(
    randomUuid(null),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
