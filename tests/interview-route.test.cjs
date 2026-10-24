const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");

const question = { id: "q1", documentId: "doc1", documentTitle: "测试笔记", icon: null, prompt: "怎样避免重复写入？", source: "使用幂等键避免重复写入。", referenceAnswer: "通过幂等键识别相同任务。", explanation: "重试不能重复写入。", heading: null, blockIndex: 0, keywords: ["幂等键"], depth: 1, engine: "ai", model: "test-model" };

function fixture() {
  let modelCalls = 0;
  const route = load("app/api/learning/route.ts", {
    require: (name, fallback) => {
      if (name === "@/lib/learning-store") return { evaluateInterview: () => ({ engine: "local" }) };
      if (name === "@/lib/ai-interview") return {
        generateInterview: async () => { modelCalls += 1; return { questions: [question] }; },
        answerInterviewFollowUp: async (_question, answer, query, history) => { modelCalls += 1; return { answer: "这是针对追问的解释。", context: { answer, query, history } }; },
      };
      return fallback(name);
    },
  });
  return { post: (body) => route.POST({ json: async () => body }), calls: () => modelCalls };
}

test("interview API returns prepared answers, keeps legacy submissions local, and calls the model only on follow-up", async () => {
  const api = fixture();
  const start = await api.post({ action: "interview-start", documentIds: ["doc1"] });
  assert.equal((await start.json()).questions[0].referenceAnswer, question.referenceAnswer);
  assert.equal(api.calls(), 1);
  const submit = await api.post({ action: "interview-answer", question, answer: "使用幂等键" });
  assert.equal(submit.status, 200);
  assert.equal((await submit.json()).engine, "local");
  assert.equal(api.calls(), 1, "legacy answer submission must not invoke an LLM");
  const followUp = await api.post({ action: "interview-follow-up", question, answer: "使用幂等键", query: "怎样设计幂等键？", history: [] });
  assert.equal(followUp.status, 200);
  assert.equal((await followUp.json()).context.query, "怎样设计幂等键？");
  assert.equal(api.calls(), 2);
});

test("follow-up requests validate query, answer and history before calling the model", async () => {
  const api = fixture();
  const valid = { action: "interview-follow-up", question, answer: "使用幂等键", query: "为什么？", history: [] };
  for (const change of [{ query: " " }, { query: "a".repeat(1001) }, { answer: " " }, { history: Array(9).fill({ question: "为什么？", answer: "测试解释" }) }, { history: [{ question: "为什么？", answer: "" }] }]) {
    assert.equal((await api.post({ ...valid, ...change })).status, 400);
  }
  assert.equal(api.calls(), 0);
});
