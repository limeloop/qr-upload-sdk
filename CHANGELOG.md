# Changelog

## 1.3.0 (2026-10-26)

- **Sub-directories:** `createSession({ directory: "acme/demo" })`. Sub-directories of an existing customer directory are created on first use (max two levels, 50 per customer).
- `listFiles({ directory, recursive })`: `recursive: true` includes sub-directories.
- Docs: directory rules, key scope over sub-directories, Lovable guidance.

## 1.2.0 (2026-10-22)

- `UploadedFile` has `width` and `height` (size after the server optimized the image).
- The widget's preview loads a 480 px thumbnail (`?w=480`) instead of the full image.
- Docs: image optimization and `?w=` thumbnails.

## 1.1.0 (2026-10-22)

- **Swedish texts by default.** The widget and client error messages are now in Swedish (network failures included). Use `labels={englishLabels}` for English.
- New `qrAlt` label for the QR image's alt text.
- **Customer directories:** `createSession({ directory })`; sessions and files expose `directory`; `listFiles({ directory })`.
- Docs: per-directory API keys with allowed origins.

## 1.0.0 (2026-10-21)

- First release: `QrUploadClient`, `mountQrUpload` widget, React `<QrUpload />`, script-tag build.
