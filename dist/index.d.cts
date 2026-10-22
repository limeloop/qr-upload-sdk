type SessionStatus = "pending" | "opened" | "uploading" | "completed" | "expired";
interface UploadedFile {
    id: string;
    /** Public, permanent URL of the image. */
    url: string;
    filename: string;
    contentType: string;
    size: number;
    /** Pixel size after the server optimized the image; null for GIF/HEIC kept as uploaded. */
    width: number | null;
    height: number | null;
    metadata: Record<string, unknown>;
    /** Customer directory the image belongs to, or null. */
    directory: string | null;
    sessionId: string | null;
    createdAt: string;
}
interface UploadProgress {
    loaded: number;
    total: number | null;
}
interface QrUploadSession {
    id: string;
    status: SessionStatus;
    /** The URL encoded in the QR code (the phone upload page). */
    uploadUrl: string;
    /** PNG of the QR code. */
    qrCodeUrl: string;
    /** Inline PNG of the QR code; only present on the createSession response. */
    qrCodeDataUrl?: string;
    title: string | null;
    description: string | null;
    metadata: Record<string, unknown>;
    directory: string | null;
    createdAt: string;
    expiresAt: string;
    openedAt: string | null;
    completedAt: string | null;
    progress: UploadProgress | null;
    file: UploadedFile | null;
}
interface CreateSessionOptions {
    /** Heading shown on the phone. */
    title?: string;
    /** Text shown under the heading on the phone. */
    description?: string;
    /** Stored with the session and the uploaded file (e.g. your user/booth id). */
    metadata?: Record<string, unknown>;
    /**
     * Slug of a customer directory (created in the server's /admin). The image is stored there and
     * its URL becomes https://<server>/<directory>/<id>.jpg.
     */
    directory?: string;
    /** How long the QR code stays valid. Default set by the server (15 min). */
    ttlSeconds?: number;
    /** QR image size in px (128–2048). */
    qrSize?: number;
}

interface QrUploadClientOptions {
    /** Base URL of the QR-UPLOAD-API, e.g. https://upload.example.com */
    baseUrl: string;
    /**
     * Needed for createSession and the file endpoints. Keep it on your server when you can;
     * watching a session only needs its id.
     */
    apiKey?: string;
    fetch?: typeof fetch;
}
declare class QrUploadError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
declare class QrUploadExpiredError extends QrUploadError {
    readonly session: QrUploadSession;
    constructor(session: QrUploadSession);
}
declare class QrUploadClient {
    readonly baseUrl: string;
    private readonly apiKey?;
    private readonly fetchFn;
    constructor(options: QrUploadClientOptions);
    private request;
    /** Create a new upload session. The response includes the QR code as `qrCodeDataUrl`. */
    createSession(options?: CreateSessionOptions): Promise<QrUploadSession>;
    getSession(id: string): Promise<QrUploadSession>;
    /** Invalidate a session that hasn't been used yet (its QR code stops working). */
    cancelSession(id: string): Promise<QrUploadSession>;
    /**
     * Live updates for a session: status changes and upload progress.
     * Uses Server-Sent Events, falls back to polling. Stops by itself once the
     * session is completed or expired. Returns an unsubscribe function.
     */
    subscribe(id: string, onUpdate: (session: QrUploadSession) => void, onError?: (error: unknown) => void): () => void;
    /** Resolves with the uploaded file, or rejects with QrUploadExpiredError. */
    waitForUpload(id: string, options?: {
        onUpdate?: (session: QrUploadSession) => void;
        signal?: AbortSignal;
    }): Promise<UploadedFile>;
    /** Newest first. `directory` filters to one customer directory ("_none" = files outside any directory). */
    listFiles(options?: {
        limit?: number;
        before?: string;
        directory?: string;
    }): Promise<{
        files: UploadedFile[];
        nextBefore: string | null;
    }>;
    getFile(id: string): Promise<UploadedFile>;
    deleteFile(id: string): Promise<{
        deleted: true;
    }>;
}

interface QrUploadLabels {
    scan: string;
    scanHint: string;
    connected: string;
    connectedHint: string;
    uploading: string;
    completed: string;
    expired: string;
    newCode: string;
    uploadAnother: string;
    error: string;
    retry: string;
    /** Alt text of the QR image (screen readers). */
    qrAlt: string;
    expiresIn: (time: string) => string;
}
/** Default texts (Swedish). */
declare const defaultLabels: QrUploadLabels;
/** English texts: `mountQrUpload(el, { labels: englishLabels })`. */
declare const englishLabels: QrUploadLabels;
interface MountQrUploadOptions {
    /** A client, or pass baseUrl (+ apiKey) and one is created for you. */
    client?: QrUploadClient;
    baseUrl?: string;
    apiKey?: string;
    /**
     * Where sessions come from. Default: `client.createSession(sessionOptions)`.
     * Pass a function to create the session on your own backend (recommended, keeps the API key secret),
     * or a session object you already created.
     */
    session?: QrUploadSession | (() => Promise<QrUploadSession>);
    sessionOptions?: CreateSessionOptions;
    /** Create a fresh QR code automatically when one expires. Default true. */
    autoRenew?: boolean;
    /** Show the received image in the widget. Default true. */
    showPreview?: boolean;
    /** QR size in CSS px. Default 240. */
    size?: number;
    /** Override any text. Defaults are Swedish; pass `englishLabels` for English. */
    labels?: Partial<QrUploadLabels>;
    onComplete?: (file: UploadedFile, session: QrUploadSession) => void;
    onUpdate?: (session: QrUploadSession) => void;
    onError?: (error: unknown) => void;
}
interface QrUploadWidget {
    readonly session: QrUploadSession | undefined;
    /** Throw away the current code and show a new one. */
    restart(): Promise<void>;
    destroy(): void;
}
/**
 * Renders a self-updating QR upload box into `target`:
 * QR code → "phone connected" → upload progress → received image.
 */
declare function mountQrUpload(target: HTMLElement | string, options?: MountQrUploadOptions): QrUploadWidget;

export { QrUploadClient, QrUploadError, QrUploadExpiredError, defaultLabels, englishLabels, mountQrUpload };
export type { CreateSessionOptions, MountQrUploadOptions, QrUploadClientOptions, QrUploadLabels, QrUploadSession, QrUploadWidget, SessionStatus, UploadProgress, UploadedFile };
