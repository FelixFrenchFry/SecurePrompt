import { describe, expect, it } from 'vitest';
import { AI_CHAT_SITE_NAMES, getAiChatFaviconUrl, getAiChatProviderByUrl } from '../../../apps/extension/source/chat-targets';

const EXTENSION = 'chrome-extension://abcdefghijklmnop';

describe('getAiChatFaviconUrl', () =>
{
    it('asks the extension favicon cache for the site main address', () =>
    {
        const href = getAiChatFaviconUrl('perplexity', EXTENSION)!;
        const url = new URL(href);

        expect(href.startsWith(`${EXTENSION}/_favicon/?`)).toBe(true);
        expect(url.searchParams.get('pageUrl')).toBe('https://www.perplexity.ai/');
        expect(url.searchParams.get('size')).toBe('32');
    });

    it('uses the open chat page when it belongs to the site', () =>
    {
        const pageOf = (href: string | undefined) => new URL(href!).searchParams.get('pageUrl');

        expect(pageOf(getAiChatFaviconUrl('claude', EXTENSION, 'https://claude.ai/new'))).toBe('https://claude.ai/new');
        expect(pageOf(getAiChatFaviconUrl('claude', EXTENSION, 'https://chatgpt.com/c/1'))).toBe('https://claude.ai/');
    });

    it('returns nothing for an unknown site', () =>
    {
        expect(getAiChatFaviconUrl('unknown', EXTENSION)).toBeUndefined();
    });
});

describe('getAiChatProviderByUrl', () =>
{
    it('finds a site on any of its addresses', () =>
    {
        expect(getAiChatProviderByUrl('https://perplexity.ai/search/1')?.id).toBe('perplexity');
        expect(getAiChatProviderByUrl('https://www.perplexity.ai/')?.id).toBe('perplexity');
        expect(getAiChatProviderByUrl('https://example.com/')).toBeUndefined();
    });

    it('finds Mistral and Grok on their chat addresses only', () =>
    {
        expect(getAiChatProviderByUrl('https://chat.mistral.ai/chat')?.id).toBe('mistral');
        expect(getAiChatProviderByUrl('https://grok.com/c/1')?.id).toBe('grok');
        expect(getAiChatProviderByUrl('https://mistral.ai/')).toBeUndefined();
        expect(getAiChatProviderByUrl('https://x.com/i/grok')).toBeUndefined();
    });
});

describe('AI_CHAT_SITE_NAMES', () =>
{
    it('lists every site with "or" before the last', () =>
    {
        expect(AI_CHAT_SITE_NAMES).toBe('ChatGPT, Claude, Gemini, Perplexity, Mistral or Grok');
    });
});
