import { setTimeout as delay } from 'node:timers/promises';

export function withModelRetries(client, { retries = 2, delayMs = 500 } = {}) {
  return {
    async createResponse(body, options = {}) {
      let streamed = false;
      const requestOptions = { ...options, ...(options.onTextDelta ? { onTextDelta(text) { streamed = true; options.onTextDelta(text); } } : {}) };
      for (let attempt = 0; ; attempt++) {
        options.signal?.throwIfAborted();
        try { return await client.createResponse(body, requestOptions); }
        catch (error) {
          options.signal?.throwIfAborted();
          const transient = /HTTP\s+(429|50[0234])\b/i.test(error.message);
          if (!transient || streamed || attempt >= retries) throw error;
          await delay(delayMs * 2 ** attempt, undefined, { signal: options.signal });
        }
      }
    },
  };
}
