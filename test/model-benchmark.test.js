import assert from "node:assert/strict";
import test from "node:test";

import { benchmarkModel } from "../lib/model-benchmark.js";

test("small streaming inference measures first-token latency and throughput", async () => {
  const times = [0, 100, 500];
  const client = {
    async createResponse(body, { onTextDelta }) {
      assert.equal(body.model, "test-model");
      onTextDelta("one two three");
      return { usage: { output_tokens: 20 } };
    },
  };
  assert.deepEqual(await benchmarkModel(client, "test-model", {
    now: () => times.shift(),
    timestamp: () => 12345,
  }), {
    latency: 100,
    throughput: 50,
    testedAt: 12345,
    outputTokens: 20,
  });
});
