import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { parseDeepSeekPricing } from "../lib/deepseek-pricing.js";
import { createSettingsApiHandlers } from "../api/settings.js";

const html = `<table>
<tr><td colspan="3">MODEL</td><td>deepseek-flash<sup>(1)</sup></td><td>deepseek-v4-pro</td></tr>
<tr><td>PRICING</td><td rowspan="2">1M INPUT TOKENS<br>(CACHE HIT)</td><td>OFF-PEAK</td><td>$0.001</td><td>$0.002</td></tr>
<tr><td>PEAK</td><td>$0.002</td><td>$0.004</td></tr>
<tr><td rowspan="2">1M INPUT TOKENS<br>(CACHE MISS)</td><td>OFF-PEAK</td><td>$0.1</td><td>$0.5</td></tr>
<tr><td>PEAK</td><td>$0.2</td><td>$1</td></tr>
<tr><td rowspan="2">1M OUTPUT TOKENS</td><td>OFF-PEAK</td><td>$0.4</td><td>$1.5</td></tr>
<tr><td>PEAK</td><td>$0.8</td><td>$3</td></tr>
</table>
<p>deepseek-v4-flash and deepseek-v4-flash-vision-exp are billed at the Flash price.</p>`;

test("DeepSeek parser selects peak cache-miss prices and documented aliases", () => {
  const prices = parseDeepSeekPricing(html);
  assert.deepEqual(prices.get("deepseek-flash"), { inputCost: 0.2 / 1e6, outputCost: 0.8 / 1e6 });
  assert.deepEqual(prices.get("deepseek-v4-pro"), { inputCost: 1 / 1e6, outputCost: 3 / 1e6 });
  assert.deepEqual(prices.get("deepseek-v4-flash"), prices.get("deepseek-flash"));
  assert.equal(prices.has("deepseek-chat"), false);
  assert.equal(parseDeepSeekPricing(html.split("</table>")[0]).has("deepseek-v4-flash"), false);
  assert.equal(parseDeepSeekPricing("unavailable").size, 0);
});

test("custom DeepSeek API models receive prices without forwarding credentials to docs", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "https://api.deepseek.com/models") {
      return new Response(JSON.stringify({ data: [{ id: "deepseek-v4-flash" }, { id: "unknown" }] }));
    }
    assert.equal(url, "https://api-docs.deepseek.com/quick_start/pricing/");
    assert.equal(options.headers, undefined);
    return new Response(html);
  });
  const handlers = createSettingsApiHandlers({ uiStateStore: { getAll: () => ({}) } });
  const req = Readable.from([Buffer.from(JSON.stringify({
    provider: "custom", baseUrl: "https://api.deepseek.com", apiKey: "test-key",
  }))]);
  req.method = "POST";
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  await handlers["/api/models"](req, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.modelDetails[0].inputCost, 0.2 / 1e6);
  assert.equal(res.body.modelDetails[1].inputCost, null);
});
