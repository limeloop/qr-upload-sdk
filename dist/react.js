import {
  mountQrUpload
} from "./chunk-PW3TXCW2.js";

// src/react.tsx
import { useEffect, useRef } from "react";
import { jsx } from "react/jsx-runtime";
function QrUpload({ className, style, widgetRef, ...options }) {
  const ref = useRef(null);
  const latest = useRef(options);
  latest.current = options;
  const sessionIsFactory = typeof options.session === "function";
  const fixedSessionId = typeof options.session === "object" ? options.session.id : void 0;
  useEffect(() => {
    const initial = latest.current;
    const widget = mountQrUpload(ref.current, {
      ...initial,
      session: sessionIsFactory ? () => latest.current.session() : initial.session,
      onComplete: (file, session) => latest.current.onComplete?.(file, session),
      onUpdate: (session) => latest.current.onUpdate?.(session),
      onError: (error) => latest.current.onError?.(error)
    });
    widgetRef?.(widget);
    return () => {
      widgetRef?.(null);
      widget.destroy();
    };
  }, [options.client, options.baseUrl, options.apiKey, sessionIsFactory, fixedSessionId]);
  return /* @__PURE__ */ jsx("div", { ref, className, style });
}
export {
  QrUpload
};
//# sourceMappingURL=react.js.map