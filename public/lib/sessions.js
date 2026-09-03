import { randomUuid } from "./ids.js";

function createSession(title = "New chat", workspace = ".") {
  return {
    id: randomUuid(),
    title,
    messages: [],
    events: [],
    tokenHistory: [],
    workspace,
    updatedAt: Date.now(),
  };
}

function clearSessionHistory(session, updatedAt = Date.now()) {
  if (!session) return null;
  session.title = "New chat";
  session.messages = [];
  session.events = [];
  session.tokenHistory = [];
  session.updatedAt = updatedAt;
  return session;
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

export { clearSessionHistory, createSession, promptHistoryFromSessions, titleFromPrompt };
