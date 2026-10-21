import * as react from 'react';
import { CSSProperties } from 'react';
import { MountQrUploadOptions, QrUploadWidget } from './index.js';

interface QrUploadProps extends MountQrUploadOptions {
    className?: string;
    style?: CSSProperties;
    /** Receives the widget instance (restart/destroy/session). */
    widgetRef?: (widget: QrUploadWidget | null) => void;
}
/**
 * React wrapper around `mountQrUpload`. Callbacks and the `session` factory may change
 * between renders; the widget is only recreated when the connection settings change.
 */
declare function QrUpload({ className, style, widgetRef, ...options }: QrUploadProps): react.JSX.Element;

export { QrUpload };
export type { QrUploadProps };
