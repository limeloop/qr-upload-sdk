# qr-upload-sdk

**Let a user upload an image from their phone to your app, just by scanning a QR code.**

Made for screens where picking a file is awkward or impossible: a monitor at a fair, a kiosk, a shared laptop, a TV. Your app shows a QR code, the user scans it and picks a photo on their phone, and your app gets back a permanent image URL a moment later, with live progress along the way.

```
  Your app (screen)                         Phone
  ┌───────────────────┐                     ┌──────────────────┐
  │  ▄▄▄ ▄ ▄▄▄        │   scan              │ Upload an image  │
  │  █▄█ ▀ █▄█        │ ──────────────────▶ │ [ choose photo ] │
  │  Scan to upload   │                     │ [   Upload    ]  │
  └───────────────────┘                     └──────────────────┘
          │  "Phone connected" → progress 0–100% → "Image received"
          ▼
  onComplete(file) → file.url = https://upload.example.com/f/k8Dvm4DE….jpg
```

- **Drop-in widget** (React or plain JS) with the QR code, status, progress bar and image preview. Expired codes renew automatically.
- **Typed client** for building your own UI or calling the API from your backend.
- **Live updates** over Server-Sent Events, falling back to polling.
- Small, no runtime dependencies, works in any framework.

> You need a running **QR-UPLOAD-API** server: the self-hosted backend that makes the QR codes, hosts the phone upload page and stores the images. You'll need its URL (e.g. `https://upload.example.com`) and an API key.

---

## Install

```bash
npm install github:limeloop/qr-upload-sdk
```

Pin a release so updates only arrive when you choose: `npm install github:limeloop/qr-upload-sdk#v1.2.0` (see [CHANGELOG](CHANGELOG.md)).

Once it's published to npm you can use `npm install qr-upload-sdk` instead. For a plain `<script>` tag:

```html
<script src="https://cdn.jsdelivr.net/gh/limeloop/qr-upload-sdk@main/dist/qr-upload.global.js"></script>
<!-- window.QrUpload.mountQrUpload(...) -->
```

## Quick start (React)

```tsx
import { QrUpload } from "qr-upload-sdk/react";

export function PhotoFromPhone({ onUploaded }: { onUploaded: (url: string) => void }) {
  return (
    <QrUpload
      baseUrl="https://upload.example.com"
      session={() => fetch("/api/qr-session", { method: "POST" }).then((r) => r.json())}
      onComplete={(file) => onUploaded(file.url)}
    />
  );
}
```

`session` is a function that asks **your backend** for a new upload session. Your backend holds the API key; see [Keep your API key secret](#keep-your-api-key-secret).

---

## Using it in a Lovable app

Lovable apps are React plus Supabase, so session creation goes in a **Supabase Edge Function** (where the API key lives) and the widget goes in a React component.

### 1. Add the secrets

In Supabase (or Lovable → *Cloud* / *Supabase* → *Secrets*), add:

| Secret | Value |
|---|---|
| `QR_UPLOAD_URL` | `https://upload.example.com` |
| `QR_UPLOAD_API_KEY` | a **directory key** for this customer (`qru_…`, from the server's `/admin` → directory → **API keys**) |

When you create the key, set its allowed origins to your app's addresses, previews included, e.g. `https://your-app.lovable.app, https://*.lovable.app, https://your-custom-domain.com`. The server allows these origins for CORS automatically. A directory key always uploads into its own directory, so the app doesn't need to pass `directory`.

### 2. Edge function: `supabase/functions/qr-upload-session/index.ts`

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { title, description, metadata, directory } = await req.json().catch(() => ({}));
  const res = await fetch(`${Deno.env.get("QR_UPLOAD_URL")}/api/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("QR_UPLOAD_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, description, metadata, directory }),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

By default Supabase only lets signed-in users call the function (`verify_jwt`). If your kiosk runs without a signed-in user, set `verify_jwt = false` for this function in `supabase/config.toml`. The QR codes stay short-lived and single-use either way.

### 3. Component

```tsx
import { QrUpload } from "qr-upload-sdk/react";
import { supabase } from "@/integrations/supabase/client";

export function UploadFromPhone({ onUploaded }: { onUploaded: (url: string) => void }) {
  return (
    <QrUpload
      baseUrl={import.meta.env.VITE_QR_UPLOAD_URL ?? "https://upload.example.com"}
      session={async () => {
        const { data, error } = await supabase.functions.invoke("qr-upload-session", {
          body: { title: "Send a photo to the screen" },
        });
        if (error) throw error;
        return data;
      }}
      onComplete={(file) => onUploaded(file.url)}
    />
  );
}
```

### Prompt you can paste into Lovable

> Install the npm package `github:limeloop/qr-upload-sdk`. Create a Supabase Edge Function `qr-upload-session` that POSTs to `${QR_UPLOAD_URL}/api/sessions` with header `Authorization: Bearer ${QR_UPLOAD_API_KEY}` and JSON body `{ title, description, metadata, directory }` from the request, and returns the JSON response (with CORS headers). Then add a component that renders `<QrUpload />` from `qr-upload-sdk/react` with `baseUrl="https://upload.example.com"`, a `session` prop that calls `supabase.functions.invoke("qr-upload-session")` and returns `data`, and an `onComplete={(file) => ...}` that uses `file.url` as the image URL. Add a button "Upload from phone" that opens it in a dialog, and close the dialog when the upload completes.

---

## Plain JavaScript

```ts
import { mountQrUpload } from "qr-upload-sdk";

const widget = mountQrUpload("#qr", {
  baseUrl: "https://upload.example.com",
  session: () => fetch("/api/qr-session", { method: "POST" }).then((r) => r.json()),
  onComplete(file) {
    document.querySelector("img")!.src = file.url;
  },
});

widget.restart(); // show a new code
widget.destroy(); // remove it
```

## Headless: build your own UI

```ts
import { QrUploadClient } from "qr-upload-sdk";

const qr = new QrUploadClient({ baseUrl: "https://upload.example.com", apiKey: process.env.QR_UPLOAD_API_KEY });

const session = await qr.createSession({ title: "Upload your logo", metadata: { userId: "42" } });
showImage(session.qrCodeDataUrl!); // data:image/png;base64,…

const file = await qr.waitForUpload(session.id, {
  onUpdate(s) {
    // s.status: "pending" | "opened" | "uploading" | "completed" | "expired"
    if (s.progress?.total) setProgress(s.progress.loaded / s.progress.total);
  },
});
console.log(file.url);
```

`waitForUpload` and `subscribe` only need the session id, so they work in the browser without an API key.

---

## Customer directories

Group uploads per customer. First create a directory in the server's admin (`https://upload.example.com/admin` → **New directory**), e.g. `acme`. Then pass its slug when you create a session:

```ts
await qr.createSession({ directory: "acme", title: "Send a photo to Acme" });
```

The image is stored in that directory and gets a URL like `https://upload.example.com/acme/k8Dvm4DE….jpg` (`file.directory === "acme"`). An unknown slug is rejected with a 400 error, so create directories in the admin first.

Each directory also has its own kiosk page at `https://upload.example.com/acme`, behind the admin login, so you don't need any app for a monitor: open the URL and it shows a QR code for that customer.

With the Lovable edge function above, pass it through the request body: `supabase.functions.invoke("qr-upload-session", { body: { directory: "acme" } })`.

## Keep your API key secret

The API key lets someone create sessions and list or delete files. Use a **directory key** per client app (created in the server's `/admin`). It only reaches that customer's directory, can be limited to your app's origins, and can be revoked on its own. Even so, don't ship it to browsers:

- ✅ Create sessions on your backend (an edge function, API route or server) and pass `session={() => fetch(...)}`.
- ✅ Watching a session from the browser needs no key; the session id is enough.
- ⚠️ `apiKey` straight on the widget is only OK for a closed kiosk where nobody can read the page source.

Each QR code works for **one** upload and **expires** (15 minutes by default, set with `ttlSeconds`).

---

## Reference

### `<QrUpload />` (from `qr-upload-sdk/react`)

Takes every `mountQrUpload` option below, plus `className`, `style` and `widgetRef`. Callbacks can change between renders. The widget is only recreated when `baseUrl`, `apiKey` or `client` changes.

### `mountQrUpload(target, options)`

`target` is an element or a CSS selector. It returns `{ session, restart(), destroy() }`.

| Option | Type | Default | |
|---|---|---|---|
| `baseUrl` | `string` | | QR-UPLOAD-API URL. Or pass `client`. |
| `session` | `() => Promise<QrUploadSession>` or `QrUploadSession` | | Where sessions come from. Omit it to create sessions with `apiKey`. |
| `apiKey` | `string` | | Only without `session` (kiosk mode). |
| `client` | `QrUploadClient` | | Use an existing client. |
| `sessionOptions` | `CreateSessionOptions` | | Used when the widget creates sessions itself. |
| `onComplete` | `(file, session) => void` | | Called once per uploaded image. |
| `onUpdate` | `(session) => void` | | Every status and progress change. |
| `onError` | `(error) => void` | | |
| `autoRenew` | `boolean` | `true` | Get a new code when one expires. |
| `showPreview` | `boolean` | `true` | Show the received image in the widget. |
| `size` | `number` | `240` | QR size in px. |
| `labels` | `Partial<QrUploadLabels>` | Swedish | All texts; see below (`englishLabels` for English). |

### `new QrUploadClient({ baseUrl, apiKey?, fetch? })`

| Method | Needs key | Returns |
|---|---|---|
| `createSession(options?)` | ✓ | `QrUploadSession`, including `qrCodeDataUrl` |
| `getSession(id)` | | `QrUploadSession` |
| `subscribe(id, onUpdate, onError?)` | | `unsubscribe()`; stops by itself once completed or expired |
| `waitForUpload(id, { onUpdate?, signal? })` | | `UploadedFile`; rejects with `QrUploadExpiredError` |
| `cancelSession(id)` | ✓ | `QrUploadSession` |
| `listFiles({ limit?, before?, directory? })` | ✓ | `{ files, nextBefore }`; `directory: "_none"` lists files outside any directory |
| `getFile(id)` / `deleteFile(id)` | ✓ | `UploadedFile` / `{ deleted: true }` |

Errors are thrown as `QrUploadError` (with `.status`).

### `CreateSessionOptions`

```ts
{
  title?: string;                     // heading on the phone
  description?: string;               // text under the heading on the phone
  metadata?: Record<string, unknown>; // stored with the session and the file (user id, booth, …)
  directory?: string;                 // customer directory slug; must exist on the server
  ttlSeconds?: number;                // how long the code is valid (30 s – 24 h)
  qrSize?: number;                    // QR PNG size, 128–2048 px
}
```

### `UploadedFile`

```ts
{ id, url, filename, contentType, size, width, height, metadata, directory, sessionId, createdAt }
```

`url` is public and permanent (cached as immutable), so it's fine to save in your database or use in `<img>`.

The server optimizes every upload for screens: rotated upright, **metadata such as GPS position removed**, scaled to at most 2560 px, re-encoded as JPEG (transparent images stay PNG). `width`/`height` give the stored size. For lists and previews, add `?w=` for a cached thumbnail:

```tsx
<img src={`${file.url}?w=480`} alt="" />   // widths snap to 160, 320, 480, 640, 960 or 1280
```

---

## Customizing

### Texts

The widget's texts are in **Swedish** by default ("Skanna för att ladda upp", "Mobilen är ansluten", "Tar emot bild…", "Bilden är mottagen", …). Override any of them with `labels`:

```tsx
<QrUpload labels={{ scan: "Skanna med mobilen", completed: "Tack! Bilden är mottagen" }} /* … */ />
```

For English, use the bundled `englishLabels`:

```tsx
import { englishLabels } from "qr-upload-sdk";

<QrUpload labels={englishLabels} /* … */ />
```

All keys: `scan`, `scanHint`, `connected`, `connectedHint`, `uploading`, `completed`, `expired`, `newCode`, `uploadAnother`, `error`, `retry`, `qrAlt`, and `expiresIn: (time) => string`.

Set the texts shown on the phone with `title` and `description` when you create the session.

### Look

The widget uses plain DOM with `qru-` class names. Theme it with CSS variables:

```css
.qru {
  --qru-accent: #4f46e5;     /* progress bar, buttons */
  --qru-accent-fg: #fff;
  --qru-bg: transparent;
  --qru-fg: #111827;
  --qru-muted: #6b7280;
  --qru-line: transparent;   /* border */
  --qru-radius: 24px;
  --qru-font: "Inter", sans-serif;
}
```

The current state is on the root element as `data-status` (`pending`, `opened`, `uploading`, `completed`, `expired`), for state-specific styling.

---

## Development

```bash
npm install
npm run build        # dist/: ESM, CJS, .d.ts, and qr-upload.global.js
npm run typecheck
```

Try it against a local server: `python3 -m http.server 5178`, then open
`http://localhost:5178/examples/react.html?api=http://localhost:3000&key=<API_KEY>` (or `kiosk.html`).

`dist/` is committed so that `npm install github:limeloop/qr-upload-sdk` works without a build step. Run `npm run build` before committing source changes.

## License

MIT
