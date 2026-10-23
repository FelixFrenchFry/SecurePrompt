import type { Detection } from '@secureprompt/core';

// messages between extension pages and the model host (the offscreen document), over a port
export const MODEL_PORT = 'secureprompt-model';

// hosts of the model files on Hugging Face, an optional permission the user grants
export const MODEL_HOST_PERMISSIONS = [
    'https://huggingface.co/*',
    'https://*.huggingface.co/*',
    'https://*.hf.co/*',
    'https://*.xethub.hf.co/*',
];

export type ModelRequest =
    | { type: 'detect'; id: number; text: string }
    | { type: 'cancel'; id: number };

// detections carry positions and categories only, never the text they point to
export type ModelEvent =
    | { type: 'ready'; crossOriginIsolated: boolean; cores: number }
    | { type: 'loading'; status: string; file?: string; progress?: number; loaded?: number; total?: number }
    | { type: 'progress'; id: number; fraction: number }
    | { type: 'result'; id: number; detections: Detection[] }
    | { type: 'failed'; id: number; reason: 'cancelled' | 'error' };
