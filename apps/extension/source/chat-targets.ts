export type AiChatProviderId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'mistral' | 'grok';

export type AiChatProvider = {
    id: AiChatProviderId;
    label: string;
    // the first origin is the site's main address, whose icon the side panel shows
    origins: string[];
    matches: string[];
    inputSelectors: string[];
};

const COMMON_INPUT_SELECTORS = [
    '[contenteditable="true"][role="textbox"]',
    '[role="textbox"][contenteditable="true"]',
    'textarea',
];

export const AI_CHAT_PROVIDERS: AiChatProvider[] = [
    {
        id: 'chatgpt',
        label: 'ChatGPT',
        origins: ['https://chatgpt.com', 'https://chat.openai.com'],
        matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
        inputSelectors: [
            '#prompt-textarea',
            '#prompt-textarea[contenteditable="true"]',
            '[data-testid="composer-text-input"]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
    {
        id: 'claude',
        label: 'Claude',
        origins: ['https://claude.ai'],
        matches: ['https://claude.ai/*'],
        inputSelectors: [
            '.ProseMirror[contenteditable="true"]',
            '[data-testid="chat-input"] [contenteditable="true"]',
            '[contenteditable="true"][data-placeholder]',
            '[contenteditable="true"][aria-label*="prompt" i]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
    {
        id: 'gemini',
        label: 'Gemini',
        origins: ['https://gemini.google.com'],
        matches: ['https://gemini.google.com/*'],
        inputSelectors: [
            'rich-textarea [contenteditable="true"]',
            '.ql-editor[contenteditable="true"]',
            '[contenteditable="true"][aria-label*="enter a prompt" i]',
            '[contenteditable="true"][aria-label*="prompt" i]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
    {
        id: 'perplexity',
        label: 'Perplexity',
        origins: ['https://www.perplexity.ai', 'https://perplexity.ai'],
        matches: ['https://perplexity.ai/*', 'https://www.perplexity.ai/*'],
        inputSelectors: [
            'textarea[placeholder]',
            'textarea[aria-label*="ask" i]',
            '[contenteditable="true"][data-lexical-editor="true"]',
            '[contenteditable="true"][aria-label*="ask" i]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
    {
        // Mistral's chat, formerly Le Chat, now "Vibe by Mistral"
        id: 'mistral',
        label: 'Mistral',
        origins: ['https://chat.mistral.ai'],
        matches: ['https://chat.mistral.ai/*'],
        inputSelectors: [
            '.ProseMirror[contenteditable="true"]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
    {
        // grok.com only, as Grok inside x.com would need access to all of X
        id: 'grok',
        label: 'Grok',
        origins: ['https://grok.com'],
        matches: ['https://grok.com/*'],
        inputSelectors: [
            // a TipTap editor with role="combobox", which the common selectors miss
            '.ProseMirror[contenteditable="true"]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
];

export const AI_CHAT_MATCHES = AI_CHAT_PROVIDERS.flatMap((provider) => provider.matches);

// the supported sites by name, as in "ChatGPT, Claude or Gemini"
export const AI_CHAT_SITE_NAMES = AI_CHAT_PROVIDERS.map((provider) => provider.label).join(', ').replace(/, ([^,]+)$/, ' or $1');

// the site's icon from the browser's favicon cache (favicon permission), an extension URL that makes no network request;
// looked up for the open chat page when known, as a site's root may never be visited (claude.ai/ redirects to /new)
export const getAiChatFaviconUrl = (id: string, extensionOrigin: string, pageUrl?: string, size = 32) =>
{
    const provider = AI_CHAT_PROVIDERS.find((candidate) => candidate.id === id);

    if (provider == null)
    {
        return undefined;
    }

    const url = new URL('/_favicon/', extensionOrigin);
    const page = pageUrl != null && getAiChatProviderByUrl(pageUrl)?.id === id ? pageUrl : `${provider.origins[0]}/`;

    url.searchParams.set('pageUrl', page);
    url.searchParams.set('size', String(size));

    return url.href;
};

export const getAiChatProviderByUrl = (url: string | undefined) =>
{
    if (url == null)
    {
        return undefined;
    }

    try
    {
        const origin = new URL(url).origin;
        return AI_CHAT_PROVIDERS.find((provider) => provider.origins.includes(origin));
    }
    catch
    {
        return undefined;
    }
};
