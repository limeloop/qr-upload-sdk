import { useEffect, useRef, type CSSProperties } from "react";
import type { QrUploadSession } from "./types";
import { mountQrUpload, type MountQrUploadOptions, type QrUploadWidget } from "./widget";

export interface QrUploadProps extends MountQrUploadOptions {
  className?: string;
  style?: CSSProperties;
  /** Receives the widget instance (restart/destroy/session). */
  widgetRef?: (widget: QrUploadWidget | null) => void;
}

/**
 * React wrapper around `mountQrUpload`. Callbacks and the `session` factory may change
 * between renders; the widget is only recreated when the connection settings change.
 */
export function QrUpload({ className, style, widgetRef, ...options }: QrUploadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(options);
  latest.current = options;

  const sessionIsFactory = typeof options.session === "function";
  const fixedSessionId = typeof options.session === "object" ? options.session.id : undefined;

  useEffect(() => {
    const initial = latest.current;
    const widget = mountQrUpload(ref.current!, {
      ...initial,
      session: sessionIsFactory
        ? () => (latest.current.session as () => Promise<QrUploadSession>)()
        : initial.session,
      onComplete: (file, session) => latest.current.onComplete?.(file, session),
      onUpdate: (session) => latest.current.onUpdate?.(session),
      onError: (error) => latest.current.onError?.(error),
    });
    widgetRef?.(widget);
    return () => {
      widgetRef?.(null);
      widget.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.client, options.baseUrl, options.apiKey, sessionIsFactory, fixedSessionId]);

  return <div ref={ref} className={className} style={style} />;
}
