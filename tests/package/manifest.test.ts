import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// checks the production build, which CI makes before the tests run
const BUILD = resolve(import.meta.dirname, '../../apps/extension/.output/chrome-mv3');

const CHAT_SITES = [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
    'https://perplexity.ai/*',
    'https://www.perplexity.ai/*',
    'https://chat.mistral.ai/*',
    'https://grok.com/*',
];

const read = (file: string) =>
{
    if (!existsSync(join(BUILD, file)))
    {
        throw new Error('No production build, run pnpm build first');
    }

    return readFileSync(join(BUILD, file), 'utf8');
};

// every script file of the build, as text
const scripts = (directory = BUILD): string[] =>
{
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    {
        const path = join(directory, entry.name);

        if (entry.isDirectory())
        {
            return scripts(path);
        }

        return /\.(js|mjs)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
    });
};

describe('manifest', () =>
{
    const manifest = JSON.parse(read('manifest.json'));

    it('asks only for the intended permissions', () =>
    {
        expect(manifest.permissions).toEqual(['sidePanel', 'clipboardWrite', 'storage', 'offscreen', 'favicon']);
        expect(manifest.optional_permissions ?? []).toEqual([]);
        expect(manifest.host_permissions).toEqual(CHAT_SITES);
        expect(manifest.optional_host_permissions).toEqual([
            'https://huggingface.co/*',
            'https://*.huggingface.co/*',
            'https://*.hf.co/*',
            'https://*.xethub.hf.co/*',
        ]);
        expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|\*:\/\/\*\/|https?:\/\/\*\//);
    });

    it('runs content scripts only on the chat sites and shares no files with web pages', () =>
    {
        for (const script of manifest.content_scripts)
        {
            expect([...script.matches].sort()).toEqual([...CHAT_SITES].sort());
        }

        expect(manifest).not.toHaveProperty('web_accessible_resources');
        expect(manifest).not.toHaveProperty('externally_connectable');
    });

    it('loads code only from the extension and keeps the model page isolated', () =>
    {
        expect(manifest.content_security_policy).toEqual({
            extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
        });
        expect(manifest.cross_origin_embedder_policy).toEqual({ value: 'require-corp' });
        expect(manifest.cross_origin_opener_policy).toEqual({ value: 'same-origin' });
    });
});

describe('production build', () =>
{
    it('contains no test hook and no local model mirror', () =>
    {
        const code = scripts().join('\n');

        expect(code).not.toContain('securePromptTest');
        expect(code).not.toMatch(/127\.0\.0\.1:\d+/);
    });
});
