import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'wxt';
import { AI_CHAT_MATCHES } from './source/chat-targets';
import { MODEL_HOST_PERMISSIONS } from './source/model/protocol';

// the ONNX runtime files of the build the model runtime's transformers.js loads, packaged with the
// extension, as model-onnx-runtime/* for the offscreen page's imports
const modelRuntimeRequire = createRequire(resolve(import.meta.dirname, '../../packages/model-runtime/package.json'));
const modelOnnxDirectory = dirname(createRequire(modelRuntimeRequire.resolve('@huggingface/transformers')).resolve('onnxruntime-web'));

// browser tests set a local model mirror and build into their own folder
const testBuild = process.env.WXT_MODEL_HOST != null;

export default defineConfig({
    manifestVersion: 3,
    modules: ['@wxt-dev/module-react'],
    ...(testBuild ? { outDirTemplate: '{{browser}}-mv{{manifestVersion}}-test' } : {}),
    vite: () => ({
        resolve: {
            alias: {
                'model-onnx-runtime/': `${modelOnnxDirectory.replace(/\\/g, '/')}/`,
            },
        },
    }),
    manifest: {
        name: 'SecurePrompt',
        description:
            'Censor private information in your prompts before sending them to AI chatbots. ' +
            'Sensitive text is detected and replaced locally on your device.',
        icons: {
            16: '/icons/logo-16x16.png',
            32: '/icons/logo-32x32.png',
            48: '/icons/logo-48x48.png',
            128: '/icons/logo-128x128.png',
        },
        action: {
            default_title: 'Open SecurePrompt',
            default_icon: {
                16: '/icons/logo-16x16.png',
                32: '/icons/logo-32x32.png',
                48: '/icons/logo-48x48.png',
                128: '/icons/logo-128x128.png',
            },
        },
        // offscreen hosts the model in a hidden extension page
        permissions: ['sidePanel', 'clipboardWrite', 'storage', 'offscreen'],
        // test builds hold the model hosts from the start, as tests can't confirm a permission prompt
        host_permissions: testBuild ? [...AI_CHAT_MATCHES, ...MODEL_HOST_PERMISSIONS] : AI_CHAT_MATCHES,
        content_security_policy: {
            extension_pages:
                "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
        },
        // cross-origin isolation lets the model use several CPU threads
        cross_origin_embedder_policy: { value: 'require-corp' },
        cross_origin_opener_policy: { value: 'same-origin' },
        optional_host_permissions: MODEL_HOST_PERMISSIONS,
        // no web-accessible files, which sites could probe to tell the extension is installed
    },
});
