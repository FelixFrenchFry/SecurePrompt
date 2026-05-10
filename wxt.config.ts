import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

const onnxRuntimeDistDirectory = dirname(fileURLToPath(import.meta.resolve('onnxruntime-web/wasm')));
const onnxRuntimeAliasDirectory = `${onnxRuntimeDistDirectory.replace(/\\/g, '/')}/`;

export default defineConfig({
    manifestVersion: 3,
    modules: ['@wxt-dev/module-react'],
    vite: () => ({
        resolve: {
            alias: {
                'secureprompt-onnx-runtime/': onnxRuntimeAliasDirectory,
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
        permissions: ['sidePanel', 'clipboardWrite'],
        host_permissions: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
        content_security_policy: {
            extension_pages:
                "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
        },
        optional_host_permissions: [
            'https://huggingface.co/*',
            'https://*.huggingface.co/*',
            'https://*.hf.co/*',
            'https://*.xethub.hf.co/*',
        ],
        web_accessible_resources: [
            {
                resources: ['icons/logo-32x32.png'],
                matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
            },
        ],
    },
});
