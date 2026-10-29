const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");

function fixture() {
  let saved = null;
  const config = {
    getAiConfigStatus: () => saved
      ? { configured: true, source: "saved", provider: saved.provider, model: saved.model, baseUrl: saved.baseUrl }
      : { configured: false, source: null, provider: "deepseek", model: "deepseek-flash", baseUrl: "https://api.deepseek.com" },
    getSavedAiConfig: () => saved,
    saveAiConfig: (value) => { saved = value; },
    clearSavedAiConfig: () => { saved = null; },
  };
  const route = load("app/api/ai-config/route.ts", {
    require: (name, fallback) => name === "@/lib/ai-config" ? config : fallback(name),
  });
  return { route, value: () => saved };
}

test("AI configuration API never returns the key and uses a saved key immediately", async () => {
  const api = fixture();
  const initial = await api.route.GET();
  assert.deepEqual(await initial.json(), { configured: false, source: null, provider: "deepseek", model: "deepseek-flash", baseUrl: "https://api.deepseek.com" });

  const saved = await api.route.PUT({ json: async () => ({ provider: "openai", apiKey: "private-key", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" }) });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { configured: true, source: "saved", provider: "openai", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" });
  assert.equal(api.value().apiKey, "private-key");

  const update = await api.route.PUT({ json: async () => ({ provider: "openai", model: "gpt-4.1-mini", baseUrl: "http://127.0.0.1:11434/v1" }) });
  assert.equal(update.status, 200);
  assert.equal(api.value().apiKey, "private-key", "an empty field keeps the server-only saved key");
  assert.equal(api.value().model, "gpt-4.1-mini");
});

test("AI configuration API requires a key before first save and can remove the local configuration", async () => {
  const api = fixture();
  const invalid = await api.route.PUT({ json: async () => ({ provider: "deepseek", model: "deepseek-flash", baseUrl: "https://api.deepseek.com" }) });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).message, /API Key/);

  await api.route.PUT({ json: async () => ({ provider: "deepseek", apiKey: "private-key", model: "deepseek-flash", baseUrl: "https://api.deepseek.com" }) });
  const removed = await api.route.DELETE();
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).configured, false);
});
