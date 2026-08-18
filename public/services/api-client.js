async function requestJson(url, options = {}, fallbackError = "Request failed.") {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || fallbackError);
  }
  return payload;
}

function jsonOptions(method, body, options = {}) {
  return {
    ...options,
    method,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(body),
  };
}

export { jsonOptions, requestJson };
