import { enrichOllamaPrices } from "../lib/ollama-pricing.js";
const origin = "http://localhost:8010";
const read = async () => {
  const response = await fetch(origin + "/api/ui-state");
  if (!response.ok) throw new Error("Unable to read provider cache");
  return (await response.json()).state;
};
const state = await read();
const provider = state.providers.find(p => p.id === "77dfeedf-d9db-492e-92f9-5db4a772c5fc");
if (!provider || new URL(provider.baseUrl).hostname !== "ollama.com") throw new Error("Ollama Cloud provider not found");
const models = await enrichOllamaPrices(provider.models);
const priced = models.filter(m => m.inputCost != null || m.outputCost != null);
console.log(JSON.stringify({ total: models.length, priced: priced.length, examples: priced.slice(0, 3).map(m=>({id:m.id,inputCost:m.inputCost,outputCost:m.outputCost})) }));
if (!priced.length) throw new Error("No prices fetched; cache left unchanged");
const latest = await read();
const byId = new Map(models.map(m => [m.id, m]));
const providers = latest.providers.map(p => p.id !== provider.id ? p : {
  ...p,
  models: p.models.map(m => {
    const price = byId.get(m.id);
    return price ? { ...m, inputCost: price.inputCost, outputCost: price.outputCost } : m;
  }),
});
const response = await fetch(origin + "/api/ui-state", {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ state: { providers } }),
});
if (!response.ok) throw new Error("Unable to save pricing cache");
const saved = (await read()).providers.find(p=>p.id === provider.id);
console.log("Verified persisted models with prices:", saved.models.filter(m=>m.inputCost != null || m.outputCost != null).length);
