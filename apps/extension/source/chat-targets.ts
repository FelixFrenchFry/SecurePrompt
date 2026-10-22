export type AiChatProviderId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

export type AiChatProvider = {
    id: AiChatProviderId;
    label: string;
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
        origins: ['https://perplexity.ai', 'https://www.perplexity.ai'],
        matches: ['https://perplexity.ai/*', 'https://www.perplexity.ai/*'],
        inputSelectors: [
            'textarea[placeholder]',
            'textarea[aria-label*="ask" i]',
            '[contenteditable="true"][data-lexical-editor="true"]',
            '[contenteditable="true"][aria-label*="ask" i]',
            ...COMMON_INPUT_SELECTORS,
        ],
    },
];

export const AI_CHAT_MATCHES = AI_CHAT_PROVIDERS.flatMap((provider) => provider.matches);

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
