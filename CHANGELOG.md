# Changelog

## 1.1.0 (2026-10-22)

- **Swedish texts by default.** The widget and client error messages are now in Swedish (network failures included). Use `labels={englishLabels}` for English.
- New `qrAlt` label for the QR image's alt text.
- **Customer directories:** `createSession({ directory })`; sessions and files expose `directory`; `listFiles({ directory })`.
- Docs: per-directory API keys with allowed origins.

## 1.0.0 (2026-10-21)

- First release: `QrUploadClient`, `mountQrUpload` widget, React `<QrUpload />`, script-tag build.
