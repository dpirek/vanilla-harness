import assert from "node:assert/strict";
import test from "node:test";

import {
  matchingProviderId,
  providerSettingsFromRecord,
} from "../public/lib/settings.js";

test("preset provider dropdown matches a saved provider identity", () => {
  const providers = [{
    id: "provider-1",
    name: "Production OpenAI",
    type: "openai",
    model: "gpt-5.1-codex",
    baseUrl: "",
    apiKey: "secret",
  }];

  assert.equal(matchingProviderId(providers, {
    provider: "openai",
    model: "gpt-5.1-codex",
    baseUrl: "",
    apiKey: "secret",
  }), "provider-1");
});

test("saved provider identities convert to preset provider settings", () => {
  assert.deepEqual(providerSettingsFromRecord({
    type: "custom",
    model: "private-model",
    baseUrl: "https://models.example/v1",
    apiKey: "token",
  }), {
    provider: "custom",
    model: "private-model",
    baseUrl: "https://models.example/v1",
    apiKey: "token",
  });
});
