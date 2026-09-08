async function benchmarkModel(client, model, {
  now = () => performance.now(),
  timestamp = () => Date.now(),
} = {}) {
  const startedAt = now();
  let firstTokenAt = null;
  let streamedText = "";
  const response = await client.createResponse({
    model,
    instructions: "Follow the user's instruction exactly and do not add commentary.",
    input: [{
      role: "user",
      content: [{ type: "input_text", text: "Reply with exactly these ten words: one two three four five six seven eight nine ten" }],
    }],
    max_output_tokens: 32,
  }, {
    onTextDelta(delta) {
      if (firstTokenAt === null) firstTokenAt = now();
      streamedText += delta;
    },
  });
  const completedAt = now();
  const outputText = streamedText || String(response?.output_text || "");
  const outputTokens = Number(response?.usage?.output_tokens) || Math.max(1, Math.ceil(outputText.length / 4));
  const generationStartedAt = firstTokenAt ?? startedAt;
  const generationSeconds = Math.max((completedAt - generationStartedAt) / 1000, 0.001);
  return {
    latency: Math.max(0, Math.round((firstTokenAt ?? completedAt) - startedAt)),
    throughput: Math.round((outputTokens / generationSeconds) * 10) / 10,
    testedAt: timestamp(),
    outputTokens,
  };
}

export { benchmarkModel };
