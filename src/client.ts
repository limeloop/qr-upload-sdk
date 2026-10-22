import type { CreateSessionOptions, QrUploadSession, UploadedFile } from "./types";

export interface QrUploadClientOptions {
  /** Base URL of the QR-UPLOAD-API, e.g. https://upload.example.com */
  baseUrl: string;
  /**
   * Needed for createSession and the file endpoints. Keep it on your server when you can;
   * watching a session only needs its id.
   */
  apiKey?: string;
  fetch?: typeof fetch;
}

export class QrUploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "QrUploadError";
  }
}

export class QrUploadExpiredError extends QrUploadError {
  constructor(public readonly session: QrUploadSession) {
    super("The upload session expired before an image was uploaded");
    this.name = "QrUploadExpiredError";
  }
}

const isFinished = (s: QrUploadSession) => s.status === "completed" || s.status === "expired";

export class QrUploadClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: QrUploadClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
    const headers = new Headers(init.headers);
    if (auth) {
      if (!this.apiKey) throw new QrUploadError("This call needs an apiKey");
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }
    if (init.body) headers.set("Content-Type", "application/json");
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new QrUploadError(data.error ?? `Request failed (${res.status})`, res.status);
    return data as T;
  }

  /** Create a new upload session. The response includes the QR code as `qrCodeDataUrl`. */
  createSession(options: CreateSessionOptions = {}): Promise<QrUploadSession> {
    const { qrSize, ...body } = options;
    const query = qrSize ? `?size=${qrSize}` : "";
    return this.request("/api/sessions" + query, { method: "POST", body: JSON.stringify(body) }, true);
  }

  getSession(id: string): Promise<QrUploadSession> {
    return this.request(`/api/sessions/${encodeURIComponent(id)}`);
  }

  /** Invalidate a session that hasn't been used yet (its QR code stops working). */
  cancelSession(id: string): Promise<QrUploadSession> {
    return this.request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
  }

  /**
   * Live updates for a session: status changes and upload progress.
   * Uses Server-Sent Events, falls back to polling. Stops by itself once the
   * session is completed or expired. Returns an unsubscribe function.
   */
  subscribe(
    id: string,
    onUpdate: (session: QrUploadSession) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    let stopped = false;
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
      source?.close();
      if (timer) clearTimeout(timer);
    };
    const emit = (s: QrUploadSession) => {
      if (stopped) return;
      onUpdate(s);
      if (isFinished(s)) stop();
    };

    const poll = async () => {
      if (stopped) return;
      try {
        emit(await this.getSession(id));
      } catch (err) {
        onError?.(err);
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    };

    if (typeof EventSource === "undefined") {
      void poll();
      return stop;
    }

    let failures = 0;
    const connect = () => {
      source = new EventSource(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}/events`);
      source.addEventListener("session", (e) => {
        failures = 0;
        emit(JSON.parse((e as MessageEvent).data));
      });
      source.onerror = () => {
        if (stopped) return;
        // EventSource reconnects on its own; after repeated failures switch to polling.
        if (++failures >= 3) {
          source?.close();
          void poll();
        }
      };
    };
    connect();
    return stop;
  }

  /** Resolves with the uploaded file, or rejects with QrUploadExpiredError. */
  waitForUpload(
    id: string,
    options: { onUpdate?: (session: QrUploadSession) => void; signal?: AbortSignal } = {},
  ): Promise<UploadedFile> {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) return reject(options.signal.reason);
      const unsubscribe = this.subscribe(id, (s) => {
        options.onUpdate?.(s);
        if (s.status === "completed" && s.file) resolve(s.file);
        if (s.status === "expired") reject(new QrUploadExpiredError(s));
      });
      options.signal?.addEventListener("abort", () => {
        unsubscribe();
        reject(options.signal!.reason);
      });
    });
  }

  /** Newest first. `directory` filters to one customer directory ("_none" = files outside any directory). */
  listFiles(options: { limit?: number; before?: string; directory?: string } = {}) {
    const q = new URLSearchParams();
    if (options.limit) q.set("limit", String(options.limit));
    if (options.before) q.set("before", options.before);
    if (options.directory) q.set("directory", options.directory);
    return this.request<{ files: UploadedFile[]; nextBefore: string | null }>(`/api/files?${q}`, {}, true);
  }

  getFile(id: string): Promise<UploadedFile> {
    return this.request(`/api/files/${encodeURIComponent(id)}`, {}, true);
  }

  deleteFile(id: string): Promise<{ deleted: true }> {
    return this.request(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
  }
}
