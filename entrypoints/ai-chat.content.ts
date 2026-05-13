import {
    INJECT_PROMPT_MESSAGE,
    OPEN_SIDEPANEL_MESSAGE,
    type RuntimeMessage,
    type RuntimeResponse,
} from '../source/messaging';
import {
    AI_CHAT_MATCHES,
    getAiChatProviderByUrl,
} from '../source/chat-targets';
const BUTTON_ID = 'secureprompt-open-sidepanel';

type ChromeRuntimeApi = {
    runtime: {
        id?: string;
        getURL: (path: string) => string;
        sendMessage: (message: RuntimeMessage) => Promise<unknown> | undefined;
        onMessage: {
            addListener: (
                listener: (
                    message: RuntimeMessage,
                    sender: unknown,
                    sendResponse: (response: RuntimeResponse) => void,
                ) => boolean,
            ) => void;
        };
    };
};

type RuntimeGlobal = typeof globalThis & {
    browser?: ChromeRuntimeApi;
    chrome?: ChromeRuntimeApi;
};

const getExtensionRuntime = () =>
{
    const runtimeGlobal = globalThis as RuntimeGlobal;

    if (runtimeGlobal.browser?.runtime?.id != null) {
        return runtimeGlobal.browser.runtime;
    }

    return runtimeGlobal.chrome?.runtime;
};

declare global {
    interface Window {
        __securepromptMessageListenerRegistered?: boolean;
    }
}

const isVisibleElement = (element: HTMLElement) =>
{
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
    );
};

const isEditableElement = (element: HTMLElement) =>
{
    if (element.getAttribute('aria-disabled') === 'true') {
        return false;
    }

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return !element.disabled && !element.readOnly;
    }

    return !element.hasAttribute('disabled');
};

const getComposerInputScore = (element: HTMLElement) =>
{
    const rect = element.getBoundingClientRect();
    const labelText = [
        element.getAttribute('aria-label'),
        element.getAttribute('placeholder'),
        element.getAttribute('data-placeholder'),
    ]
        .filter((value): value is string => value != null)
        .join(' ')
        .toLowerCase();
    let score = Math.min(window.innerHeight, Math.max(0, rect.bottom));

    if (document.activeElement === element)
    {
        score += 1000;
    }

    if (/prompt|message|ask|chat/.test(labelText))
    {
        score += 400;
    }

    if (element.getAttribute('role') === 'textbox')
    {
        score += 120;
    }

    if (element instanceof HTMLTextAreaElement)
    {
        score += 80;
    }

    if (element.isContentEditable)
    {
        score += 60;
    }

    return score;
};

const chooseComposerInput = (inputs: HTMLElement[]) =>
{
    return [...inputs].sort((left, right) =>
    {
        return getComposerInputScore(right) - getComposerInputScore(left);
    })[0];
};

const findComposerInput = () =>
{
    const provider = getAiChatProviderByUrl(window.location.href);
    const selectors = provider?.inputSelectors ?? [];
    const seenInputs = new Set<HTMLElement>();

    for (const selector of selectors) {
        const selectorInputs: HTMLElement[] = [];
        const inputs = Array.from(document.querySelectorAll<HTMLElement>(selector));

        for (const input of inputs) {
            if (seenInputs.has(input)) {
                continue;
            }

            seenInputs.add(input);

            if (isEditableElement(input) && isVisibleElement(input)) {
                selectorInputs.push(input);
            }
        }

        if (selectorInputs.length > 0)
        {
            return chooseComposerInput(selectorInputs);
        }
    }

    return null;
};

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
{
    const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (setter != null) {
        setter.call(element, value);
        return;
    }

    element.value = value;
};

const dispatchInputEvents = (element: HTMLElement) =>
{
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
};

const getComposerText = (element: HTMLElement) =>
{
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    {
        return element.value;
    }

    return element.innerText || element.textContent || '';
};

const normalizeComposerText = (text: string) =>
{
    return text
        .replace(/\r\n?/g, '\n')
        .replace(/\u00a0/g, ' ')
        .trim();
};

const isPromptInserted = (element: HTMLElement, text: string) =>
{
    const expectedText = normalizeComposerText(text);
    const actualText = normalizeComposerText(getComposerText(element));

    return actualText === expectedText || actualText.includes(expectedText);
};

const createInsertionVerificationError = (
    providerLabel: string | undefined,
): RuntimeResponse =>
{
    return {
        ok: false,
        providerLabel,
        error: `Could not verify prompt insertion in ${providerLabel ?? 'the AI chat page'}.`,
    };
};

const insertTextIntoContentEditable = (element: HTMLElement, text: string) =>
{
    element.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const inserted = document.execCommand('insertText', false, text);

    if (!inserted) {
        element.textContent = text;
    }

    dispatchInputEvents(element);
};

const insertPromptIntoComposer = (text: string): RuntimeResponse =>
{
    const provider = getAiChatProviderByUrl(window.location.href);
    const input = findComposerInput();

    if (input == null) {
        return {
            ok: false,
            provider: provider?.id,
            providerLabel: provider?.label,
            error: `Could not find the ${provider?.label ?? 'AI chat'} input field.`,
        };
    }

    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.focus();
        setNativeValue(input, text);
        dispatchInputEvents(input);

        if (!isPromptInserted(input, text))
        {
            return createInsertionVerificationError(provider?.label);
        }

        return {
            ok: true,
            provider: provider?.id,
            providerLabel: provider?.label,
        };
    }

    insertTextIntoContentEditable(input, text);

    if (!isPromptInserted(input, text))
    {
        return createInsertionVerificationError(provider?.label);
    }

    return {
        ok: true,
        provider: provider?.id,
        providerLabel: provider?.label,
    };
};

export default defineContentScript({
    matches: AI_CHAT_MATCHES,
    runAt: 'document_idle',
    main()
    {
        const extensionRuntime = getExtensionRuntime();

        if (extensionRuntime == null) {
            return;
        }

        document.getElementById(BUTTON_ID)?.remove();

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.setAttribute('aria-label', 'Open SecurePrompt');

        const icon = document.createElement('img');
        icon.src = extensionRuntime.getURL('/icons/logo-32x32.png');
        icon.alt = '';
        icon.width = 20;
        icon.height = 20;

        const label = document.createElement('span');
        label.textContent = 'SecurePrompt';

        button.append(icon, label);

        Object.assign(button.style, {
            position: 'fixed',
            right: '24px',
            bottom: '24px',
            zIndex: '2147483647',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid #243172',
            borderRadius: '999px',
            padding: '9px 15px 9px 10px',
            background: '#243172',
            color: '#ffffff',
            boxShadow: '0 10px 26px rgba(36, 49, 114, 0.28)',
            cursor: 'pointer',
            font: '600 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        });

        Object.assign(icon.style, {
            display: 'block',
            borderRadius: '5px',
        });

        button.addEventListener('click', () =>
        {
            void Promise.resolve(
                extensionRuntime.sendMessage({ type: OPEN_SIDEPANEL_MESSAGE }),
            ).catch(() => undefined);
        });

        button.addEventListener('mouseenter', () =>
        {
            button.style.background = '#1b2559';
            button.style.borderColor = '#1b2559';
        });

        button.addEventListener('mouseleave', () =>
        {
            button.style.background = '#243172';
            button.style.borderColor = '#243172';
        });

        document.documentElement.append(button);

        if (window.__securepromptMessageListenerRegistered !== true) {
            extensionRuntime.onMessage.addListener((message, _sender, sendResponse) =>
            {
                if (message.type !== INJECT_PROMPT_MESSAGE || typeof message.text !== 'string') {
                    return false;
                }

                sendResponse(insertPromptIntoComposer(message.text));
                return false;
            });

            window.__securepromptMessageListenerRegistered = true;
        }
    },
});
