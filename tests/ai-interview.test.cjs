const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");

const source = {
  id: "local-question", documentId: "doc-1", documentTitle: "附件上传", icon: null,
  prompt: "本地问题", source: "附件先进入消息队列，通过幂等键避免重复写入。", heading: "异步上传",
  referenceAnswer: "附件先进入消息队列，通过幂等键避免重复写入。", explanation: "",
  blockIndex: 1, keywords: ["消息队列", "幂等键"], depth: 1, engine: "local", model: null,
};

function moduleWith({ env = {}, fetch, savedConfig = null, ...overrides }) {
  const configured = savedConfig || (env.DEEPSEEK_API_KEY ? {
    provider: "deepseek", apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    model: env.DEEPSEEK_MODEL || "deepseek-flash",
  } : env.OPENAI_API_KEY ? {
    provider: "openai", apiKey: env.OPENAI_API_KEY,
    baseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: env.OPENAI_MODEL || "gpt-4o-mini",
  } : null);
  return load("lib/ai-interview.ts", {
    process: { ...process, env }, fetch, AbortSignal,
    ...overrides,
    require: (name, fallback) => name === "./ai-config" ? { getAiConfig: () => configured } : name === "./learning-store" ? {
      buildInterview: () => [source],
      evaluateInterview: (question, answer) => ({
        coverage: answer.includes("幂等") ? 50 : 0, matched: answer.includes("幂等") ? ["幂等键"] : [],
        omissions: ["消息队列"], message: "本地评阅", followUp: { ...question, depth: 2 },
        engine: "local", model: null, notice: null,
      }),
    } : fallback(name),
  });
}

function response(value) {
  return { ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }) };
}

test("AI interview generates questions with complete answers once and only calls again for an explicit follow-up", async () => {
  const requests = [];
  const ai = moduleWith({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model", OPENAI_BASE_URL: "https://example.test/v1" },
    fetch: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return requests.length === 1
        ? response({ questions: [{ sourceIndex: 0, prompt: "为什么异步上传需要幂等键？", answerQuotes: [source.source], keyPoints: ["避免重复写入", "幂等键"] }] })
        : response({ answer: "幂等键使同一任务在重试时仍只写入一次，避免重复处理。" });
    },
  });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(session.engine, "ai");
  assert.equal(session.model, "test-model");
  assert.equal(session.questions[0].source, source.source, "keeps the local source instead of trusting model output");
  assert.match(session.questions[0].prompt, /幂等键/);
  assert.equal(session.questions[0].referenceAnswer, source.referenceAnswer);
  assert.equal(session.questions[0].explanation, source.explanation);
  assert.equal(requests.length, 1, "answers are available from the generation request");
  const history = [{ question: "为什么会重试？", answer: "失败任务可能重新执行。" }];
  const followUp = await ai.answerInterviewFollowUp(session.questions[0], "幂等键可以避免重复写入", "重试为什么安全？", history);
  assert.equal(followUp.model, "test-model");
  assert.match(followUp.answer, /重试/);
  assert.equal(requests.length, 2);
  const context = JSON.parse(requests[1].body.input[1].content);
  assert.equal(context.query, "重试为什么安全？");
  assert.equal(context.referenceAnswer, source.referenceAnswer);
  assert.equal(context.userAnswer, "幂等键可以避免重复写入");
  assert.deepEqual(context.history, history);
  assert.equal(requests[0].url, "https://example.test/v1/responses");
  assert.equal(requests[0].body.text.format.type, "json_schema");
  assert.equal(requests[0].body.text.format.strict, true);
  assert.equal(requests[0].body.reasoning, undefined, "does not change OpenAI reasoning settings");
  assert.match(requests[0].init.headers.Authorization, /^Bearer test-key$/);
});

test("AI interview stays local without a key and falls back when the API fails", async () => {
  let calls = 0;
  const local = moduleWith({ env: {}, fetch: async () => { calls += 1; throw new Error("unexpected"); } });
  const session = await local.generateInterview(["doc-1"]);
  assert.equal(session.engine, "local");
  assert.match(session.notice, /未配置/);
  assert.equal(session.questions[0].referenceAnswer, source.referenceAnswer);
  const followUp = await local.answerInterviewFollowUp(source, "使用幂等键", "为什么？");
  assert.equal(followUp.answer, "");
  assert.match(followUp.notice, /未配置/);
  assert.equal(calls, 0);

  const failing = moduleWith({ env: { OPENAI_API_KEY: "test-key" }, fetch: async () => { throw new Error("offline"); } });
  const fallback = await failing.generateInterview(["doc-1"]);
  assert.equal(fallback.engine, "local");
  assert.match(fallback.notice, /暂时不可用/);
});

test("DeepSeek key selects the official Responses endpoint and default model", async () => {
  let request;
  const ai = moduleWith({
    env: { DEEPSEEK_API_KEY: "deepseek-test-key", OPENAI_API_KEY: "openai-test-key" },
    fetch: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return response(generated);
    },
  });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(session.engine, "ai");
  assert.equal(session.model, "deepseek-flash");
  assert.equal(request.url, "https://api.deepseek.com/responses");
  assert.equal(request.body.model, "deepseek-flash");
  assert.equal(request.body.reasoning.effort, "none", "keeps the output budget for interview content");
  assert.equal(request.init.headers.Authorization, "Bearer deepseek-test-key");
});

test("a saved browser configuration takes effect for the very next interview request", async () => {
  let request;
  const ai = moduleWith({
    env: { DEEPSEEK_API_KEY: "environment-key" },
    savedConfig: { provider: "openai", apiKey: "saved-key", baseUrl: "https://gateway.example/v1", model: "saved-model" },
    fetch: async (url, init) => { request = { url, init, body: JSON.parse(init.body) }; return response(generated); },
  });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(session.model, "saved-model");
  assert.equal(request.url, "https://gateway.example/v1/responses");
  assert.equal(request.init.headers.Authorization, "Bearer saved-key");
});

const generated = { questions: [{ sourceIndex: 0, prompt: "消息队列在异步上传中解决了什么问题？", answerQuotes: [source.source], keyPoints: ["消息队列", "幂等键"] }] };

test("a transient DeepSeek connection timeout is retried within the same deadline", async () => {
  const signals = [];
  const ai = moduleWith({
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetch: async (_url, init) => {
      signals.push(init.signal);
      if (signals.length === 1) throw new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
      return response(generated);
    },
  });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(session.engine, "ai");
  assert.equal(session.notice, null);
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1], "retry does not reset the 45 second deadline");
});

test("persistent connection failures stop after one retry and explain the fallback safely", async () => {
  let calls = 0;
  const warnings = [];
  const ai = moduleWith({
    env: { DEEPSEEK_API_KEY: "secret-test-key" },
    console: { warn: (...args) => warnings.push(args.join(" ")) },
    fetch: async () => {
      calls += 1;
      throw new TypeError("secret-test-key and private prompt must never be logged", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    },
  });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(calls, 2);
  assert.equal(session.engine, "local");
  assert.match(session.notice, /连接或响应超时/);
  assert.doesNotMatch(session.notice + warnings.join(), /secret-test-key|private prompt/);
});

test("authentication and balance failures show actionable notices without retries", async () => {
  for (const [status, pattern] of [[401, /密钥验证失败/], [403, /无访问权限/], [402, /余额不足/], [400, /请求参数或模型配置不兼容/]]) {
    let calls = 0;
    const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async () => { calls += 1; return { ok: false, status }; } });
    const session = await ai.generateInterview(["doc-1"]);
    assert.equal(calls, 1);
    assert.match(session.notice, pattern);
    assert.match(session.notice, new RegExp(`HTTP ${status}`));
  }
});

test("temporary server failures are retried for explicit follow-ups", async () => {
  let calls = 0;
  const ai = moduleWith({
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetch: async () => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 503 }
        : response({ answer: "幂等键保证重复任务只写入一次。" });
    },
  });
  const result = await ai.answerInterviewFollowUp(source, "幂等键避免重复写入", "如何理解幂等？");
  assert.equal(calls, 2);
  assert.match(result.answer, /只写入一次/);
});

test("an expired total deadline prevents retries", async () => {
  let calls = 0;
  const signal = { aborted: false };
  const ai = moduleWith({
    env: { DEEPSEEK_API_KEY: "test-key" },
    AbortSignal: { timeout: () => signal },
    fetch: async () => { calls += 1; signal.aborted = true; throw Object.assign(new Error("deadline"), { name: "TimeoutError" }); },
  });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(calls, 1);
  assert.match(session.notice, /超时/);
});

test("incomplete and invalid structured output do not become network retries", async () => {
  for (const body of [{ status: "incomplete", output: [] }, { output_text: "invalid-json" }, { output_text: JSON.stringify({ questions: [] }) }]) {
    let calls = 0;
    const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async () => { calls += 1; return { ok: true, json: async () => body }; } });
    const session = await ai.generateInterview(["doc-1"]);
    assert.equal(calls, 1);
    assert.equal(session.engine, "local");
    assert.match(session.notice, /生成内容未完成|返回内容不符合要求/);
  }
});

test("generation rejects questions without prepared answers, keeping local references available", async () => {
  const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async () => response({ questions: [{ sourceIndex: 0, prompt: "为什么异步上传需要幂等键？", keyPoints: ["异步处理", "任务解耦"] }] }) });
  const session = await ai.generateInterview(["doc-1"]);
  assert.equal(session.engine, "local");
  assert.equal(session.questions[0].referenceAnswer, source.referenceAnswer);
});

test("follow-up failure preserves the prepared answer and does not fabricate a reply", async () => {
  const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async () => ({ ok: false, status: 402 }) });
  const result = await ai.answerInterviewFollowUp(source, "使用幂等键", "为什么？");
  assert.equal(result.answer, "");
  assert.match(result.notice, /余额不足.*参考答案仍可查看/);
  assert.equal(source.referenceAnswer, source.source);
});

test("answers can only select and reorder exact document passages, without invented explanations", async () => {
  const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).input[1].content.split("\n").slice(1).join("\n"));
    assert.equal(input[0].documentAnswer, source.source);
    return response({ questions: [{ sourceIndex: 0, prompt: "消息队列与幂等键分别有什么作用？", answerQuotes: ["通过幂等键避免重复写入。", "附件先进入消息队列"], keyPoints: ["幂等键", "消息队列", "不存在的概念"] }] });
  } });
  const result = await ai.generateInterview(["doc-1"]);
  assert.equal(result.engine, "ai");
  assert.equal(result.questions[0].referenceAnswer, "通过幂等键避免重复写入。\n\n附件先进入消息队列");
  assert.equal(result.questions[0].explanation, "");
  assert.equal(result.questions[0].keywords.join(","), "幂等键,消息队列");
});

test("invented answers and material-sufficiency questions are rejected", async () => {
  for (const invalid of [
    { ...generated.questions[0], answerQuotes: [source.source, "Kafka 保证所有分区的全局顺序。"] },
    { ...generated.questions[0], prompt: "材料以标题为主题，但正文仅有标题本身，应该如何严谨回答？" },
  ]) {
    const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async () => response({ questions: [invalid] }) });
    const result = await ai.generateInterview(["doc-1"]);
    assert.equal(result.engine, "local");
    assert.equal(result.questions[0].referenceAnswer, source.source);
    assert.doesNotMatch(result.questions[0].referenceAnswer, /全局顺序/);
  }
});

test("each generated item asks one core question instead of bundling automatic follow-ups", async () => {
  const ai = moduleWith({ env: { DEEPSEEK_API_KEY: "test-key" }, fetch: async () => response({ questions: [{ ...generated.questions[0], prompt: "消息队列在异步上传中解决了什么问题？为什么需要幂等键？怎么实现重试？" }] }) });
  const result = await ai.generateInterview(["doc-1"]);
  assert.equal(result.questions[0].prompt, "消息队列在异步上传中解决了什么问题？");
  assert.equal(result.questions[0].referenceAnswer, source.source);
});
