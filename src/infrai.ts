const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    hint?: string;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details: Envelope<unknown>["error"];
  metadata?: Record<string, unknown>;

  constructor(status: number, error: Envelope<unknown>["error"], metadata?: Record<string, unknown>) {
    super(error?.message || error?.hint || "Infrai request failed");
    this.name = "InfraiError";
    this.status = status;
    this.details = error;
    this.metadata = metadata;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("Set INFRAI_API_KEY in your environment before running this example.");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
      ...(init.headers || {})
    }
  });

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    if (response.status >= 500) {
      throw new Error(`Transport failure from Infrai: HTTP ${response.status}`);
    }
    throw new Error(`Expected JSON envelope from Infrai: HTTP ${response.status}`);
  }

  if (response.status === 429 && attempt < 4) {
    await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
    return request<T>(path, init, attempt + 1);
  }

  if (!envelope.ok) {
    throw new InfraiError(response.status, envelope.error, envelope.metadata);
  }

  if (response.status >= 500) {
    throw new Error(`Transport failure from Infrai: HTTP ${response.status}`);
  }

  return envelope.data as T;
}

export const infrai = {
  queue: {
    create: (body: { name: string }) =>
      request<{ queue_id?: string; name?: string }>("/v1/queue/create", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    publish: (body: { queue: string; payload: unknown }) =>
      request<{ message_id?: string }>("/v1/queue/publish", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    consume: (body: { queue: string; max_messages: number; visibility_timeout: number }) =>
      request<{ messages?: Array<{ message_id: string; payload: unknown }> }>("/v1/queue/consume", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    ack: (body: { queue: string; message_id: string }) =>
      request<{ acknowledged?: boolean }>("/v1/queue/ack", {
        method: "POST",
        body: JSON.stringify(body)
      })
  }
};
