export class GatewayError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Read streaming bytes rather than trusting Content-Length from an upstream.
export async function requestJson(url, options = {}, { timeoutMs = 5000, maxBytes = 524288 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new GatewayError('UPSTREAM_HTTP', `Upstream returned HTTP ${response.status}.`);
    if (!response.body) throw new GatewayError('UPSTREAM_SCHEMA', 'Upstream response has no body.');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        controller.abort();
        throw new GatewayError('UPSTREAM_TOO_LARGE', 'Upstream response exceeds the size limit.');
      }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new GatewayError('UPSTREAM_SCHEMA', 'Upstream returned invalid JSON.'); }
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    if (controller.signal.aborted) throw new GatewayError('UPSTREAM_TIMEOUT', 'Upstream request timed out.', 504);
    throw new GatewayError('UPSTREAM_UNAVAILABLE', 'Upstream is unavailable.');
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}

export function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayError('UPSTREAM_SCHEMA', `${name} must be an object.`);
  }
  return value;
}

export function requireString(value, name, maxLength = 8192) {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new GatewayError('UPSTREAM_SCHEMA', `${name} must be a bounded string.`);
  }
  return value;
}
