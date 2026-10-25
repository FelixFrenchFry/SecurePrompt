import { browser } from 'wxt/browser';
import {
    AI_CHAT_SITE_NAMES,
    getAiChatProviderByUrl,
    type AiChatProvider,
} from '../source/chat-targets';
import {
    GET_CHAT_TARGET_MESSAGE,
    INJECT_PROMPT_MESSAGE,
    OPEN_SIDEPANEL_MESSAGE,
    type RuntimeMessage,
    type RuntimeResponse,
} from '../source/messaging';
import {
    ENSURE_MODEL_HOST_MESSAGE,
    ensureModelHost,
    ModelPermissionError,
    type EnsureModelHostResponse,
} from '../source/model/host';
import { registerModelTestHook } from '../source/model/test-hook';

type ChromeMessageSender = {
    tab?: {
        id?: number;
        url?: string;
    };
};

type ChromeRuntimeApi = {
    runtime: {
        onMessage: {
            addListener: (
                listener: (
                    message: RuntimeMessage,
                    sender: ChromeMessageSender,
                    sendResponse: (response: RuntimeResponse) => void,
                ) => boolean,
            ) => void;
        };
    };
};

const chromeRuntime = (globalThis as typeof globalThis & { chrome: ChromeRuntimeApi }).chrome
    .runtime;

export default defineBackground(() =>
{
    const getChatProvider = (url: string | undefined) =>
    {
        return getAiChatProviderByUrl(url);
    };

    // only the active tab of the side panel's window counts (the last focused one without it), so prompts
    // never go to a chat the user can't see
    const findTargetAiChatTab = async (windowId: unknown) =>
    {
        const [activeTab] = await browser.tabs.query(
            typeof windowId === 'number' ? { active: true, windowId } : { active: true, lastFocusedWindow: true },
        );
        const activeProvider = getChatProvider(activeTab?.url);

        if (activeTab?.id == null || activeProvider == null)
        {
            return undefined;
        }

        return {
            tab: activeTab,
            provider: activeProvider,
        };
    };

    const openSidePanelForTab = async (tabId: number | undefined) =>
    {
        if (tabId == null || browser.sidePanel?.open == null)
        {
            return;
        }

        await browser.sidePanel.open({ tabId });
    };

    const isRuntimeResponse = (response: unknown): response is RuntimeResponse =>
    {
        return (
            typeof response === 'object' &&
            response !== null &&
            'ok' in response &&
            typeof response.ok === 'boolean'
        );
    };

    const normalizeRuntimeResponse = (response: unknown): RuntimeResponse =>
    {
        if (isRuntimeResponse(response))
        {
            return response;
        }

        return {
            ok: false,
            error:
                'The AI chat page did not confirm the prompt insertion. Refresh the page and try again.',
        };
    };

    // the tab's address for its favicon, without query or hash
    const pageUrlOf = (url: string | undefined): Pick<RuntimeResponse, 'pageUrl'> =>
    {
        try
        {
            const { origin, pathname } = new URL(url ?? '');

            return { pageUrl: `${origin}${pathname}` };
        }
        catch
        {
            return {};
        }
    };

    const withProvider = (
        response: RuntimeResponse,
        provider: AiChatProvider,
    ): RuntimeResponse =>
    {
        return {
            ...response,
            provider: provider.id,
            providerLabel: provider.label,
        };
    };

    const sendPromptToTab = async (
        tabId: number,
        provider: AiChatProvider,
        text: string,
    ): Promise<RuntimeResponse> =>
    {
        const message = {
            type: INJECT_PROMPT_MESSAGE,
            text,
        } satisfies RuntimeMessage;

        try
        {
            const response = await browser.tabs.sendMessage(tabId, message);
            return withProvider(normalizeRuntimeResponse(response), provider);
        }
        catch
        {
            return {
                ok: false,
                provider: provider.id,
                providerLabel: provider.label,
                error: `Could not connect to ${provider.label}. Refresh ${provider.label} and try again.`,
            };
        }
    };

    const injectPromptIntoActiveTab = async (text: string, windowId: unknown): Promise<RuntimeResponse> =>
    {
        const target = await findTargetAiChatTab(windowId);

        if (target?.tab.id == null)
        {
            return {
                ok: false,
                error: `Switch to a ${AI_CHAT_SITE_NAMES} tab to insert.`,
            };
        }

        return { ...(await sendPromptToTab(target.tab.id, target.provider, text)), ...pageUrlOf(target.tab.url) };
    };

    const getCurrentChatTarget = async (windowId: unknown): Promise<RuntimeResponse> =>
    {
        const target = await findTargetAiChatTab(windowId);

        if (target?.tab.id == null)
        {
            return {
                ok: false,
                error: `Switch to a ${AI_CHAT_SITE_NAMES} tab to insert.`,
            };
        }

        return {
            ok: true,
            provider: target.provider.id,
            providerLabel: target.provider.label,
            ...pageUrlOf(target.tab.url),
        };
    };

    void browser.sidePanel
        ?.setPanelBehavior?.({
            openPanelOnActionClick: true,
        })
        .catch(() => undefined);

    browser.action.onClicked.addListener((tab) =>
    {
        void openSidePanelForTab(tab.id).catch(() => undefined);
    });

    chromeRuntime.onMessage.addListener((message, sender, sendResponse) =>
    {
        if (message.type === INJECT_PROMPT_MESSAGE && typeof message.text === 'string')
        {
            void injectPromptIntoActiveTab(message.text, message.windowId)
                .then(sendResponse)
                .catch(() =>
                {
                    sendResponse({
                        ok: false,
                        error: 'Could not send to the AI chat page.',
                    } satisfies RuntimeResponse);
                });

            return true;
        }

        if (message.type === GET_CHAT_TARGET_MESSAGE)
        {
            void getCurrentChatTarget(message.windowId)
                .then(sendResponse)
                .catch(() =>
                {
                    sendResponse({
                        ok: false,
                        error: 'Could not find a supported AI chat page.',
                    } satisfies RuntimeResponse);
                });

            return true;
        }

        if (message.type === OPEN_SIDEPANEL_MESSAGE)
        {
            void openSidePanelForTab(sender.tab?.id).catch(() => undefined);
        }

        return false;
    });

    // extension pages ask for the model host here, content scripts get no answer
    browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) =>
    {
        // content scripts send from the chat site's address, never from the extension's
        const fromExtensionPage = sender.url?.startsWith(browser.runtime.getURL('/')) === true;

        if ((message as { type?: unknown } | null)?.type !== ENSURE_MODEL_HOST_MESSAGE || !fromExtensionPage)
        {
            return undefined;
        }

        void ensureModelHost()
            .then(() => sendResponse({ ok: true } satisfies EnsureModelHostResponse))
            .catch((error: unknown) =>
            {
                const reason = error instanceof ModelPermissionError ? 'permission' : 'failed';

                sendResponse({ ok: false, reason } satisfies EnsureModelHostResponse);
            });

        return true;
    });

    registerModelTestHook();
});
