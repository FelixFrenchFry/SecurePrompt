import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

export const MODELS_DIR = resolve(ROOT, '.models');
export const MODEL_FILE = resolve(MODELS_DIR, 'bardsai/eu-pii-anonimization-multilang-v2/onnx/model_quantized.onnx');
export const TEST_FILES_DIR = resolve(ROOT, 'test-files');

// the test build downloads the model from this local mirror, built into the extension
export const MIRROR_PORT = 48123;
export const MIRROR_URL = `http://127.0.0.1:${MIRROR_PORT}/`;
export const TEST_EXTENSION_DIR = resolve(ROOT, 'apps/extension/.output/chrome-mv3-test');
