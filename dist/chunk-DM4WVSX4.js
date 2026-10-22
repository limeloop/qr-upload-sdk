// src/client.ts
var QrUploadError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "QrUploadError";
  }
};
var QrUploadExpiredError = class extends QrUploadError {
  constructor(session) {
    super("Uppladdningskoden gick ut innan n\xE5gon bild laddades upp");
    this.session = session;
    this.name = "QrUploadExpiredError";
  }
};
var isFinished = (s) => s.status === "completed" || s.status === "expired";
var QrUploadClient = class {
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  async request(path, init = {}, auth = false) {
    const headers = new Headers(init.headers);
    if (auth) {
      if (!this.apiKey) throw new QrUploadError("Det h\xE4r anropet kr\xE4ver en API-nyckel (apiKey)");
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }
    if (init.body) headers.set("Content-Type", "application/json");
    let res;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new QrUploadError("Kunde inte n\xE5 servern. Kontrollera anslutningen och f\xF6rs\xF6k igen.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new QrUploadError(data.error ?? `Beg\xE4ran misslyckades (${res.status})`, res.status);
    return data;
  }
  /** Create a new upload session. The response includes the QR code as `qrCodeDataUrl`. */
  createSession(options = {}) {
    const { qrSize, ...body } = options;
    const query = qrSize ? `?size=${qrSize}` : "";
    return this.request("/api/sessions" + query, { method: "POST", body: JSON.stringify(body) }, true);
  }
  getSession(id) {
    return this.request(`/api/sessions/${encodeURIComponent(id)}`);
  }
  /** Invalidate a session that hasn't been used yet (its QR code stops working). */
  cancelSession(id) {
    return this.request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
  }
  /**
   * Live updates for a session: status changes and upload progress.
   * Uses Server-Sent Events, falls back to polling. Stops by itself once the
   * session is completed or expired. Returns an unsubscribe function.
   */
  subscribe(id, onUpdate, onError) {
    let stopped = false;
    let source;
    let timer;
    const stop = () => {
      stopped = true;
      source?.close();
      if (timer) clearTimeout(timer);
    };
    const emit = (s) => {
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
        emit(JSON.parse(e.data));
      });
      source.onerror = () => {
        if (stopped) return;
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
  waitForUpload(id, options = {}) {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) return reject(options.signal.reason);
      const unsubscribe = this.subscribe(id, (s) => {
        options.onUpdate?.(s);
        if (s.status === "completed" && s.file) resolve(s.file);
        if (s.status === "expired") reject(new QrUploadExpiredError(s));
      });
      options.signal?.addEventListener("abort", () => {
        unsubscribe();
        reject(options.signal.reason);
      });
    });
  }
  /** Newest first. `directory` filters to one customer directory ("_none" = files outside any directory). */
  listFiles(options = {}) {
    const q = new URLSearchParams();
    if (options.limit) q.set("limit", String(options.limit));
    if (options.before) q.set("before", options.before);
    if (options.directory) q.set("directory", options.directory);
    return this.request(`/api/files?${q}`, {}, true);
  }
  getFile(id) {
    return this.request(`/api/files/${encodeURIComponent(id)}`, {}, true);
  }
  deleteFile(id) {
    return this.request(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
  }
};

// src/widget.ts
var defaultLabels = {
  scan: "Skanna f\xF6r att ladda upp",
  scanHint: "\xD6ppna kameran i mobilen och rikta den mot koden.",
  connected: "Mobilen \xE4r ansluten",
  connectedHint: "V\xE4lj en bild i mobilen.",
  uploading: "Tar emot bild\u2026",
  completed: "Bilden \xE4r mottagen",
  expired: "Koden har g\xE5tt ut",
  newCode: "H\xE4mta en ny kod",
  uploadAnother: "Ladda upp en till",
  error: "N\xE5got gick fel",
  retry: "F\xF6rs\xF6k igen",
  qrAlt: "QR-kod f\xF6r att ladda upp en bild",
  expiresIn: (t) => `Koden g\xE5r ut om ${t}`
};
var englishLabels = {
  scan: "Scan to upload",
  scanHint: "Open your phone camera and point it at the code.",
  connected: "Phone connected",
  connectedHint: "Choose an image on your phone.",
  uploading: "Receiving image\u2026",
  completed: "Image received",
  expired: "This code has expired",
  newCode: "Get a new code",
  uploadAnother: "Upload another",
  error: "Something went wrong",
  retry: "Try again",
  qrAlt: "QR code for uploading an image",
  expiresIn: (t) => `Code expires in ${t}`
};
var STYLE_ID = "qr-upload-sdk-styles";
var css = (
  /* css */
  `
.qru {
  --qru-bg: #ffffff; --qru-fg: #1c1917; --qru-muted: #78716c; --qru-line: #e7e5e4;
  --qru-accent: #1c1917; --qru-accent-fg: #fafaf9; --qru-track: #e7e5e4; --qru-ok: #15803d; --qru-err: #b91c1c;
  --qru-radius: 16px; --qru-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-family: var(--qru-font); color: var(--qru-fg); background: var(--qru-bg);
  border: 1px solid var(--qru-line); border-radius: var(--qru-radius);
  padding: 24px; text-align: center; box-sizing: border-box; max-width: 100%;
  display: inline-flex; flex-direction: column; align-items: center; gap: 4px;
}
.qru * { box-sizing: border-box; }
.qru-frame { position: relative; width: var(--qru-size); height: var(--qru-size); max-width: 100%; margin-bottom: 14px; }
.qru-frame img.qru-qr { width: 100%; height: 100%; display: block; image-rendering: pixelated; border-radius: 8px; transition: opacity .2s, filter .2s; }
.qru-frame.is-dim img.qru-qr { opacity: .12; filter: blur(2px); }
.qru-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.qru-preview { width: 100%; height: 100%; object-fit: contain; border-radius: 8px; background: var(--qru-track); }
.qru-title { font-size: 18px; font-weight: 600; line-height: 1.3; margin: 0; }
.qru-hint { font-size: 14px; color: var(--qru-muted); margin: 0; max-width: 32ch; line-height: 1.45; }
.qru-hint.is-err { color: var(--qru-err); }
.qru-bar { width: min(var(--qru-size), 100%); height: 6px; border-radius: 99px; background: var(--qru-track); overflow: hidden; margin-top: 12px; }
.qru-bar > div { height: 100%; width: 0; background: var(--qru-accent); transition: width .2s ease; }
.qru-bar.is-indeterminate > div { width: 35%; animation: qru-slide 1.1s ease-in-out infinite; }
.qru-pct { font-size: 13px; color: var(--qru-muted); font-variant-numeric: tabular-nums; margin-top: 6px; }
.qru-btn { appearance: none; border: 0; margin-top: 14px; padding: 10px 16px; border-radius: 10px; cursor: pointer;
  background: var(--qru-accent); color: var(--qru-accent-fg); font: inherit; font-size: 14px; font-weight: 600; }
.qru-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--qru-track); border-top-color: var(--qru-accent); animation: qru-spin .8s linear infinite; }
.qru-icon { width: 44px; height: 44px; }
.qru-icon.is-ok { color: var(--qru-ok); } .qru-icon.is-err { color: var(--qru-err); }
@keyframes qru-spin { to { transform: rotate(360deg); } }
@keyframes qru-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { .qru-spinner, .qru-bar.is-indeterminate > div { animation-duration: 3s; } }
`
);
var phoneIcon = `<svg class="qru-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>`;
var okIcon = `<svg class="qru-icon is-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12.5 2.5 2.5L16 9.5"/></svg>`;
var errIcon = `<svg class="qru-icon is-err" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>`;
function injectStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
function formatBytes(n) {
  return n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}
function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1e3));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function mountQrUpload(target, options = {}) {
  const container = typeof target === "string" ? document.querySelector(target) : target;
  if (!container) throw new Error(`mountQrUpload: target ${String(target)} not found`);
  injectStyles();
  const labels = { ...defaultLabels, ...options.labels };
  const autoRenew = options.autoRenew ?? true;
  const showPreview = options.showPreview ?? true;
  const fixedSession = typeof options.session === "object" ? options.session : void 0;
  const clientBaseUrl = options.client?.baseUrl ?? options.baseUrl ?? fixedSession?.uploadUrl.replace(/\/u\/[^/]+$/, "");
  if (!clientBaseUrl) throw new Error("mountQrUpload: pass `client`, `baseUrl` or a `session`");
  const client = options.client ?? new QrUploadClient({ baseUrl: clientBaseUrl, apiKey: options.apiKey });
  const root = el("div", "qru");
  root.style.setProperty("--qru-size", `${options.size ?? 240}px`);
  root.setAttribute("role", "region");
  root.setAttribute("aria-live", "polite");
  container.appendChild(root);
  let session;
  let qrSrc = "";
  let unsubscribe;
  let countdown;
  let destroyed = false;
  let generation = 0;
  let completedFor;
  const clearTimers = () => {
    unsubscribe?.();
    unsubscribe = void 0;
    if (countdown) clearInterval(countdown);
    countdown = void 0;
  };
  function renderLoading() {
    root.replaceChildren(Object.assign(el("div", "qru-frame"), { innerHTML: `<div class="qru-overlay"><div class="qru-spinner"></div></div>` }));
  }
  function renderError(err) {
    root.replaceChildren();
    root.insertAdjacentHTML("beforeend", errIcon);
    const msg = err instanceof Error ? err.message : String(err);
    const btn = el("button", "qru-btn", labels.retry);
    btn.type = "button";
    btn.onclick = () => void start();
    root.append(el("p", "qru-title", labels.error), el("p", "qru-hint is-err", msg), btn);
  }
  function render(s) {
    if (countdown) clearInterval(countdown);
    countdown = void 0;
    root.replaceChildren();
    root.dataset.status = s.status;
    if (s.status === "completed" && s.file) {
      const frame2 = el("div", "qru-frame");
      if (showPreview && s.file.contentType.startsWith("image/") && !/hei[cf]/.test(s.file.contentType)) {
        const img = el("img", "qru-preview");
        img.src = s.file.url;
        img.alt = s.file.filename;
        frame2.append(img);
      } else {
        frame2.innerHTML = `<div class="qru-overlay">${okIcon}</div>`;
      }
      const btn = el("button", "qru-btn", labels.uploadAnother);
      btn.type = "button";
      btn.onclick = () => void start();
      root.append(frame2, el("p", "qru-title", labels.completed), el("p", "qru-hint", s.file.filename));
      if (!fixedSession) root.append(btn);
      return;
    }
    if (s.status === "expired") {
      root.insertAdjacentHTML("beforeend", errIcon);
      root.append(el("p", "qru-title", labels.expired));
      if (!fixedSession) {
        const btn = el("button", "qru-btn", labels.newCode);
        btn.type = "button";
        btn.onclick = () => void start();
        root.append(btn);
      }
      return;
    }
    const frame = el("div", "qru-frame");
    const qr = el("img", "qru-qr");
    qr.src = qrSrc;
    qr.alt = labels.qrAlt;
    frame.append(qr);
    root.append(frame);
    if (s.status === "pending") {
      const expiry = el("p", "qru-pct");
      const tick = () => expiry.textContent = labels.expiresIn(formatRemaining(Date.parse(s.expiresAt) - Date.now()));
      tick();
      countdown = setInterval(tick, 1e3);
      root.append(el("p", "qru-title", labels.scan), el("p", "qru-hint", labels.scanHint), expiry);
      return;
    }
    frame.classList.add("is-dim");
    const overlay = el("div", "qru-overlay");
    overlay.innerHTML = phoneIcon;
    frame.append(overlay);
    if (s.status === "opened") {
      root.append(el("p", "qru-title", labels.connected), el("p", "qru-hint", labels.connectedHint));
      return;
    }
    const bar = el("div", "qru-bar");
    const fill = el("div");
    bar.append(fill);
    const pct = el("p", "qru-pct");
    const p = s.progress;
    if (p?.total) {
      const ratio = Math.min(p.loaded / p.total, 1);
      fill.style.width = `${Math.round(ratio * 100)}%`;
      pct.textContent = `${Math.round(ratio * 100)}% \xB7 ${formatBytes(p.loaded)} / ${formatBytes(p.total)}`;
    } else {
      bar.classList.add("is-indeterminate");
    }
    root.append(el("p", "qru-title", labels.uploading), bar, pct);
  }
  function handleUpdate(s, gen) {
    if (destroyed || gen !== generation) return;
    session = { ...s, qrCodeDataUrl: session?.qrCodeDataUrl };
    options.onUpdate?.(session);
    if (s.status === "expired" && autoRenew && !fixedSession) {
      void start();
      return;
    }
    render(session);
    if (s.status === "completed" && s.file && completedFor !== s.id) {
      completedFor = s.id;
      options.onComplete?.(s.file, session);
    }
  }
  async function start() {
    const gen = ++generation;
    clearTimers();
    renderLoading();
    try {
      const next = typeof options.session === "function" ? await options.session() : fixedSession ?? await client.createSession(options.sessionOptions);
      if (destroyed || gen !== generation) return;
      session = next;
      qrSrc = next.qrCodeDataUrl ?? next.qrCodeUrl;
      render(next);
      unsubscribe = client.subscribe(
        next.id,
        (s) => handleUpdate(s, gen),
        (err) => options.onError?.(err)
      );
    } catch (err) {
      if (destroyed || gen !== generation) return;
      options.onError?.(err);
      renderError(err);
    }
  }
  void start();
  return {
    get session() {
      return session;
    },
    restart: start,
    destroy() {
      destroyed = true;
      clearTimers();
      root.remove();
    }
  };
}

export {
  QrUploadError,
  QrUploadExpiredError,
  QrUploadClient,
  defaultLabels,
  englishLabels,
  mountQrUpload
};
//# sourceMappingURL=chunk-DM4WVSX4.js.map