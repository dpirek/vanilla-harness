function createSession(title = "New chat", workspace = ".") {
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    events: [],
    tokenHistory: [],
    workspace,
    updatedAt: Date.now(),
  };
}

function titleFromPrompt(prompt) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length > 34 ? `${compact.slice(0, 34)}...` : compact;
}

function promptHistoryFromSessions(sessions) {
  const prompts = [];
  const seen = new Set();
  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.role !== "user" || seen.has(message.text)) continue;
      seen.add(message.text);
      prompts.push(message.text);
    }
  }
  return prompts.reverse();
}

export { createSession, promptHistoryFromSessions, titleFromPrompt };
