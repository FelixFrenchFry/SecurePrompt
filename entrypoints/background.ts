import { browser } from 'wxt/browser';
import {
    INJECT_PROMPT_MESSAGE,
    OPEN_SIDEPANEL_MESSAGE,
    type RuntimeMessage,
    type RuntimeResponse,
} from '../source/messaging';

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
    let lastChatGptTabId: number | undefined;

    const isChatGptUrl = (url: string | undefined) =>
    {
        if (url == null) {
            return false;
        }

        try {
            const origin = new URL(url).origin;
            return origin === 'https://chatgpt.com' || origin === 'https://chat.openai.com';
        } catch {
            return false;
        }
    };

    const getTab = async (tabId: number | undefined) =>
    {
        if (tabId == null) {
            return undefined;
        }

        try {
            return await browser.tabs.get(tabId);
        } catch {
            return undefined;
        }
    };

    const findTargetChatGptTab = async () =>
    {
        const [activeTab] = await browser.tabs.query({
            active: true,
            lastFocusedWindow: true,
        });

        if (activeTab?.id != null && isChatGptUrl(activeTab.url)) {
            lastChatGptTabId = activeTab.id;
            return activeTab;
        }

        const previousTab = await getTab(lastChatGptTabId);

        if (previousTab?.id != null && isChatGptUrl(previousTab.url)) {
            return previousTab;
        }

        return undefined;
    };

    const rememberChatGptTab = (tabId: number | undefined, url: string | undefined) =>
    {
        if (tabId != null && isChatGptUrl(url)) {
            lastChatGptTabId = tabId;
        }
    };

    const openSidePanelForTab = async (tabId: number | undefined, url: string | undefined) =>
    {
        if (tabId == null || browser.sidePanel?.open == null) {
            return;
        }

        rememberChatGptTab(tabId, url);
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
        if (isRuntimeResponse(response)) {
            return response;
        }

        return {
            ok: false,
            error: 'ChatGPT did not confirm the prompt insertion. Refresh ChatGPT and try again.',
        };
    };

    const sendPromptToTab = async (tabId: number, text: string): Promise<RuntimeResponse> =>
    {
        const message = {
            type: INJECT_PROMPT_MESSAGE,
            text,
        } satisfies RuntimeMessage;

        try {
            const response = await browser.tabs.sendMessage(tabId, message);
            return normalizeRuntimeResponse(response);
        } catch {
            return {
                ok: false,
                error: 'Could not connect to the ChatGPT page. Refresh ChatGPT and try again.',
            };
        }
    };

    const injectPromptIntoActiveTab = async (text: string): Promise<RuntimeResponse> =>
    {
        const targetTab = await findTargetChatGptTab();

        if (targetTab?.id == null) {
            return {
                ok: false,
                error: 'Open ChatGPT in the active tab before sending.',
            };
        }

        return sendPromptToTab(targetTab.id, text);
    };

    void browser.sidePanel
        ?.setPanelBehavior?.({
            openPanelOnActionClick: true,
        })
        .catch(() => undefined);

    browser.action.onClicked.addListener((tab) =>
    {
        void openSidePanelForTab(tab.id, tab.url).catch(() => undefined);
    });

    chromeRuntime.onMessage.addListener((message, sender, sendResponse) =>
    {
        if (message.type === INJECT_PROMPT_MESSAGE && typeof message.text === 'string') {
            void injectPromptIntoActiveTab(message.text)
                .then(sendResponse)
                .catch(() =>
                {
                    sendResponse({
                        ok: false,
                        error: 'Could not send to ChatGPT.',
                    } satisfies RuntimeResponse);
                });

            return true;
        }

        if (message.type === OPEN_SIDEPANEL_MESSAGE) {
            void openSidePanelForTab(sender.tab?.id, sender.tab?.url).catch(() => undefined);
        }

        return false;
    });
});
