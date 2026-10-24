const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const { interviewMaterials, interviewPrompt } = load("lib/interview-material.ts");
const block = (type, text, extra = {}) => ({ type, content: [{ type: "text", text }], ...extra });
const h = (text, level = 2) => block("heading", text, { props: { level } });

test("a long topic heading never replaces its following paragraphs, list items or code", () => {
  const result = interviewMaterials(JSON.stringify([
    h("1. Kafka 的基本架构"),
    block("codeBlock", "Producer：生产者，发送消息\nBroker：Kafka 服务节点\nConsumer：消费者，读取消息"),
    h("2. Topic 和 Partition"),
    block("paragraph", "Topic 是消息的逻辑分类。"),
    block("paragraph", "一个 Topic 可以划分为多个 Partition。"),
    block("codeBlock", "order-topic\n├── Partition 0\n└── Partition 1"),
    block("bulletListItem", "Kafka 只保证单个 Partition 内的顺序，不保证 Topic 的全局顺序。"),
    h("3. 只有标题没有正文的知识点"),
    h("4. 分区的作用"),
    block("paragraph", "分区用于提高吞吐量，使不同消费者能够并行处理不同分区。"),
  ]), "");
  assert.equal(result.length, 3);
  assert.match(result[0].text, /Producer.*生产者/);
  assert.match(result[1].text, /逻辑分类/);
  assert.match(result[1].text, /多个 Partition/);
  assert.match(result[1].text, /order-topic\n├── Partition/);
  assert.match(result[1].text, /不保证 Topic 的全局顺序/);
  assert.equal(result[1].blockIndex, 3);
  assert.ok(!result.some((item) => item.heading.includes("只有标题")));
  assert.equal(interviewPrompt(result[1].heading, []), "Topic 和 Partition有什么区别和联系？");
});

test("sections retain nested blocks, table cells, subheadings and conclusions past the old 360 character cutoff", () => {
  const tail = "注意：不同 Partition 的 offset 不能直接比较。";
  const result = interviewMaterials(JSON.stringify([
    h("Kafka 笔记", 1), h("分区的顺序", 2), h("定义", 3),
    block("paragraph", "分区内的消息按 offset 排列。".repeat(30), { children: [block("bulletListItem", tail)] }),
    { type: "table", content: { rows: [{ cells: [[{ type: "text", text: "Topic" }], [{ type: "text", text: "逻辑分类" }]] }] } },
    h("消费者组", 2), block("paragraph", "同一消费者组中的消费者各自处理不同的分区，协同消费主题。"),
  ]), "");
  assert.equal(result.length, 2);
  assert.match(result[0].text, /定义/);
  assert.match(result[0].text, /offset 不能直接比较/);
  assert.match(result[0].text, /Topic \| 逻辑分类/);
  assert.ok(result[0].text.length > 360);
  assert.doesNotMatch(result[0].text, /协同消费主题/);
});

test("heading-only documents produce no interview material", () => {
  assert.equal(interviewMaterials(JSON.stringify([h("Topic 和 Partition 是面试中很重要的知识点"), h("必须掌握的 Kafka 消费者组原理", 3)]), "").length, 0);
});

test("numbered topics stay separate even when imported heading levels are inconsistent", () => {
  const result = interviewMaterials(JSON.stringify([
    h("1. Kafka 的基本架构", 2), block("codeBlock", "Producer 发送消息到 Broker，Consumer 从 Broker 消费消息。"),
    h("2. Topic 和 Partition", 2), block("paragraph", "一个 Topic 可以划分成多个 Partition，各分区分别保存有序消息。"),
    h("3. 为什么 Kafka 要分区", 1), block("paragraph", "分区使生产者和消费者能够并行处理消息，从而提高吞吐量。"),
  ]), "");
  assert.equal(result.length, 3);
  assert.equal(result[1].heading, "2. Topic 和 Partition");
  assert.match(result[1].text, /多个 Partition/);
  assert.doesNotMatch(result[1].text, /吞吐量/);
});

test("long sections keep their content in bounded parts and local questions target knowledge", () => {
  const text = "分区通过并行消费提高吞吐量。".repeat(700);
  const result = interviewMaterials(JSON.stringify([h("为什么 Kafka 要分区"), block("paragraph", text)]), "");
  assert.ok(result.length > 1);
  assert.ok(result.every((item) => item.text.length <= 5000));
  assert.equal(result.map((item) => item.text).join(""), text);
  assert.equal(interviewPrompt(result[0].heading, []), "为什么 Kafka 要分区？");
  const boundaryText = "分".repeat(5010);
  assert.equal(interviewMaterials(JSON.stringify([h("分区"), block("paragraph", boundaryText)]), "").map((item) => item.text).join(""), boundaryText);
});
