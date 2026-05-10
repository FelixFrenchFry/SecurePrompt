export const PRIVACY_FILTER_MODEL_ID = 'openai/privacy-filter';
export const PRIVACY_FILTER_TASK = 'token-classification';
export const PRIVACY_FILTER_DEVICE = 'webgpu';
export const PRIVACY_FILTER_DTYPE = 'q4';
export const PRIVACY_FILTER_AGGREGATION_STRATEGY = 'simple';
export const PRIVACY_FILTER_WEBGPU_FORCE_CPU_NODE_NAMES = [
    '/model/layers.0/attn/sinks/expand',
    '/model/layers.1/attn/sinks/expand',
    '/model/layers.2/attn/sinks/expand',
    '/model/layers.3/attn/sinks/expand',
    '/model/layers.4/attn/sinks/expand',
    '/model/layers.5/attn/sinks/expand',
    '/model/layers.6/attn/sinks/expand',
    '/model/layers.7/attn/sinks/expand',
];
export const PRIVACY_FILTER_CHUNK_MAX_LENGTH = 4000;
export const PRIVACY_FILTER_CHUNK_MIN_LENGTH = 1000;
export const PRIVACY_FILTER_CHUNK_OVERLAP_LENGTH = 500;
