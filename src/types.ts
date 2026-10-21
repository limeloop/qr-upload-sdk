export type SessionStatus = "pending" | "opened" | "uploading" | "completed" | "expired";

export interface UploadedFile {
  id: string;
  /** Public, permanent URL of the image. */
  url: string;
  filename: string;
  contentType: string;
  size: number;
  metadata: Record<string, unknown>;
  sessionId: string | null;
  createdAt: string;
}

export interface UploadProgress {
  loaded: number;
  total: number | null;
}

export interface QrUploadSession {
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
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  completedAt: string | null;
  progress: UploadProgress | null;
  file: UploadedFile | null;
}

export interface CreateSessionOptions {
  /** Heading shown on the phone. */
  title?: string;
  /** Text shown under the heading on the phone. */
  description?: string;
  /** Stored with the session and the uploaded file (e.g. your user/booth id). */
  metadata?: Record<string, unknown>;
  /** How long the QR code stays valid. Default set by the server (15 min). */
  ttlSeconds?: number;
  /** QR image size in px (128–2048). */
  qrSize?: number;
}
