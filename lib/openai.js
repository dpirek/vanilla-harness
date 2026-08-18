import {
  defaultBaseUrlForProvider,
  normalizeProvider,
  resolveProviderApiKey,
} from "./provider-config.js";

class OpenAIClient {
  // fetchImpl is injectable so tests can mock API responses without network
  // access or an external dependency.
  constructor({ apiKey, baseUrl = "https://api.openai.com/v1", fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  // Sends one Responses API request and normalizes API/JSON failures into
  // regular Error objects for the CLI to display.
  async createResponse(body, { onTextDelta } = {}) {
    if (onTextDelta) return this.createStreamingResponse(body, { onTextDelta });

    const headers = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await this.fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`OpenAI returned invalid JSON (HTTP ${response.status}): ${text}`);
    }

    if (!response.ok) {
      const message = data.error?.message || JSON.stringify(data);
      throw new Error(`OpenAI API error (HTTP ${response.status}): ${message}`);
    }
    return data;
  }

  async createStreamingResponse(body, { onTextDelta }) {
    const headers = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await this.fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`OpenAI returned invalid JSON (HTTP ${response.status}): ${text}`);
      }
      const message = data.error?.message || JSON.stringify(data);
      throw new Error(`OpenAI API error (HTTP ${response.status}): ${message}`);
    }

    let completed = null;
    await readSse(response, (event) => {
      if (event.type === "response.output_text.delta" && event.delta) {
        onTextDelta(event.delta);
      } else if (event.type === "response.completed" && event.response) {
        completed = event.response;
      } else if (event.type === "response.failed") {
        throw new Error(event.response?.error?.message || "OpenAI streaming response failed.");
      }
    });

    if (!completed) throw new Error("OpenAI stream ended without a completed response.");
    return completed;
  }
}

async function readSse(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming response body is not readable.");
  const decoder = new TextDecoder();
  let buffer = "";
  const handleEventText = (eventText) => {
    for (const line of eventText.split(/\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      onEvent(JSON.parse(data));
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const eventText of events) {
      handleEventText(eventText);
    }
  }
  if (buffer.trim()) handleEventText(buffer);
}

function inputText(input = []) {
  return input
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "input_text")
    .map((content) => content.text)
    .join("\n");
}

function inputImages(input = []) {
  return input
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "input_image" && content.image_url)
    .map((content) => content.image_url);
}

function base64Image(dataUrl) {
  return String(dataUrl).replace(/^data:image\/[A-Za-z0-9.+-]+;base64,/, "");
}

function toolMessages(input = []) {
  return input
    .filter((item) => item.type === "function_call_output")
    .map((item) => ({
      role: "tool",
      content: item.output,
      tool_name: item.call_id,
    }));
}

function ollamaToolDefinition(tool) {
  if (tool.type === "mcp") return null;
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function stringifyToolArguments(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value || {});
}

function taggedParameterValue(raw, schema = {}) {
  const value = raw.trim();
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("integer") && /^-?\d+$/.test(value)) return Number(value);
  if (types.includes("number") && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (types.includes("boolean") && /^(true|false)$/i.test(value)) return value === "true";
  if (types.includes("null") && value === "null") return null;
  if (types.includes("array") || types.includes("object")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Some local models print their tool protocol as text instead of returning the
// native Ollama `tool_calls` field. Normalize that common protocol so the agent
// loop can execute it exactly like a native call.
function parseTaggedToolCalls(content, tools = []) {
  const definitions = new Map(tools.map((tool) => [tool.function?.name, tool.function]));
  const calls = [];
  const blockPattern = /(?:<tool_call>\s*)?<function=([A-Za-z_][\w.-]*)>\s*([\s\S]*?)<\/function>\s*(?:<\/tool_call>)?/g;
  const remaining = String(content || "").replace(blockPattern, (block, name, body) => {
    const definition = definitions.get(name);
    if (!definition) return block;
    const args = {};
    const parameterPattern = /<parameter=([A-Za-z_][\w.-]*)>\s*([\s\S]*?)<\/parameter>/g;
    for (const match of body.matchAll(parameterPattern)) {
      const parameterSchema = definition.parameters?.properties?.[match[1]] || {};
      args[match[1]] = taggedParameterValue(match[2], parameterSchema);
    }
    calls.push({
      function: { name, arguments: args },
    });
    return "";
  }).trim();
  return { calls, content: remaining };
}

function ollamaToolsUnsupported(status, data, raw) {
  const message = String(data?.error || raw || "");
  return status === 400 && /does not support tools/i.test(message);
}

class OllamaClient {
  constructor({ baseUrl = "http://localhost:11434", fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.messages = [];
  }

  async createResponse(body, { onTextDelta } = {}) {
    const text = inputText(body.input);
    const images = inputImages(body.input);
    if (!body.previous_response_id) {
      this.messages = [{ role: "system", content: body.instructions }];
    }
    this.messages.push(...toolMessages(body.input));
    if (text || images.length > 0) {
      this.messages.push({
        role: "user",
        content: text,
        ...(images.length > 0 ? { images: images.map(base64Image) } : {}),
      });
    }

    const tools = (body.tools || []).map(ollamaToolDefinition).filter(Boolean);
    const requestBody = {
      model: body.model,
      messages: this.messages,
      stream: Boolean(onTextDelta),
    };
    if (tools.length > 0) requestBody.tools = tools;

    let response = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (onTextDelta && response.ok) {
      return this.readStreamingChatResponse(response, onTextDelta, tools);
    }

    let raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${raw}`);
    }
    if (!response.ok && tools.length > 0 && ollamaToolsUnsupported(response.status, data, raw)) {
      response = await this.fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...requestBody, tools: undefined }),
      });
      if (onTextDelta && response.ok) {
        return this.readStreamingChatResponse(response, onTextDelta, []);
      }
      raw = await response.text();
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${raw}`);
      }
    }
    if (!response.ok) {
      throw new Error(`Ollama API error (HTTP ${response.status}): ${data.error || raw}`);
    }

    const message = data.message || {};
    const tagged = message.tool_calls?.length
      ? { calls: [], content: message.content || "" }
      : parseTaggedToolCalls(message.content, tools);
    const normalizedToolCalls = message.tool_calls?.length ? message.tool_calls : tagged.calls;
    this.messages.push({
      role: "assistant",
      content: tagged.content,
      tool_calls: normalizedToolCalls,
    });

    const id = `ollama_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toolCalls = normalizedToolCalls.map((call, index) => ({
      type: "function_call",
      name: call.function?.name || call.name,
      call_id: call.id || `call_${index + 1}`,
      arguments: stringifyToolArguments(call.function?.arguments || call.arguments),
    }));

    const usage = {
      input_tokens: Number(data.prompt_eval_count) || 0,
      output_tokens: Number(data.eval_count) || 0,
    };
    if (toolCalls.length > 0) return { id, output: toolCalls, usage };
    return {
      id,
      usage,
      output_text: tagged.content,
      output: [{
        type: "message",
        content: [{ type: "output_text", text: tagged.content }],
      }],
    };
  }

  async readStreamingChatResponse(response, onTextDelta, tools = []) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Ollama streaming response body is not readable.");
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let toolCalls = [];
    let contentMode = null;
    let usage = { input_tokens: 0, output_tokens: 0 };
    const handleLine = (line) => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      const message = data.message || {};
      if (message.content) {
        content += message.content;
        if (!contentMode && content.trim()) {
          contentMode = content.trimStart().startsWith("<") ? "possible_tool" : "text";
        }
        if (contentMode === "text") onTextDelta(message.content);
      }
      if (message.tool_calls) toolCalls = message.tool_calls;
      if (Number.isFinite(data.prompt_eval_count)) usage.input_tokens = data.prompt_eval_count;
      if (Number.isFinite(data.eval_count)) usage.output_tokens = data.eval_count;
      if (data.error) throw new Error(`Ollama API error: ${data.error}`);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        handleLine(line);
      }
    }
    handleLine(buffer);

    const tagged = toolCalls.length > 0
      ? { calls: [], content }
      : parseTaggedToolCalls(content, tools);
    if (toolCalls.length === 0) toolCalls = tagged.calls;
    if (toolCalls.length === 0 && tagged.content && contentMode !== "text") {
      onTextDelta(tagged.content);
    }
    const message = { role: "assistant", content: tagged.content, tool_calls: toolCalls };
    this.messages.push(message);
    const id = `ollama_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const outputCalls = (toolCalls || []).map((call, index) => ({
      type: "function_call",
      name: call.function?.name || call.name,
      call_id: call.id || `call_${index + 1}`,
      arguments: stringifyToolArguments(call.function?.arguments || call.arguments),
    }));

    if (outputCalls.length > 0) return { id, output: outputCalls, usage };
    return {
      id,
      usage,
      output_text: tagged.content,
      output: [{
        type: "message",
        content: [{ type: "output_text", text: tagged.content }],
      }],
    };
  }
}

function createModelClient({
  provider = process.env.AI_PROVIDER || "openai",
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl,
  fetchImpl = fetch,
} = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider === "ollama") {
    return new OllamaClient({
      baseUrl: baseUrl || defaultBaseUrlForProvider("ollama"),
      fetchImpl,
    });
  }
  if (normalizedProvider === "custom") {
    return new OpenAIClient({
      apiKey: resolveProviderApiKey("custom", apiKey),
      baseUrl: baseUrl || defaultBaseUrlForProvider("custom"),
      fetchImpl,
    });
  }
  return new OpenAIClient({
    apiKey: resolveProviderApiKey("openai", apiKey),
    baseUrl: baseUrl || defaultBaseUrlForProvider("openai") || undefined,
    fetchImpl,
  });
}

export { OpenAIClient, OllamaClient, createModelClient, parseTaggedToolCalls };
