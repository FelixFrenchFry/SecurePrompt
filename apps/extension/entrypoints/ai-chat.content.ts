import {
    INJECT_PROMPT_MESSAGE,
    OPEN_SIDEPANEL_MESSAGE,
    type RuntimeMessage,
    type RuntimeResponse,
} from '../source/messaging';
import {
    AI_CHAT_MATCHES,
    type AiChatProvider,
    type AiChatProviderId,
    getAiChatProviderByUrl,
} from '../source/chat-targets';
import { mountLauncher } from '../source/sites/launcher';

const BUTTON_ID = 'secureprompt-open-sidepanel';
const INSERTION_VERIFICATION_DELAY_MS = 32;

type ChromeRuntimeApi = {
    runtime: {
        id?: string;
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

type PromptInsertionAdapter = {
    name: string;
    insert: (element: HTMLElement, text: string) => Promise<void> | void;
};

const getExtensionRuntime = () =>
{
    const runtimeGlobal = globalThis as RuntimeGlobal;

    if (runtimeGlobal.browser?.runtime?.id != null)
    {
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
    if (element.getAttribute('aria-disabled') === 'true')
    {
        return false;
    }

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)
    {
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

    for (const selector of selectors)
    {
        const selectorInputs: HTMLElement[] = [];
        const inputs = Array.from(document.querySelectorAll<HTMLElement>(selector));

        for (const input of inputs)
        {
            if (seenInputs.has(input))
            {
                continue;
            }

            seenInputs.add(input);

            if (isEditableElement(input) && isVisibleElement(input))
            {
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

    if (setter != null)
    {
        setter.call(element, value);
        return;
    }

    element.value = value;
};

const dispatchInputEvents = (element: HTMLElement) =>
{
    element.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
    );
    element.dispatchEvent(new Event('change', { bubbles: true }));
};

const dispatchInputEventsWithText = (element: HTMLElement, text: string) =>
{
    element.dispatchEvent(
        new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data: text,
            inputType: 'insertText',
        }),
    );
    element.dispatchEvent(
        new InputEvent('input', {
            bubbles: true,
            data: text,
            inputType: 'insertText',
        }),
    );
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
        .replace(/[\u200b\u2060\ufeff]/g, '')
        .trim();
};

const isPromptInserted = (element: HTMLElement, text: string) =>
{
    const expectedText = normalizeComposerText(text);
    const actualText = normalizeComposerText(getComposerText(element));

    return actualText === expectedText;
};

const waitForComposerUpdate = async () =>
{
    await new Promise<void>((resolve) =>
    {
        window.setTimeout(resolve, INSERTION_VERIFICATION_DELAY_MS);
    });

    await new Promise<void>((resolve) =>
    {
        window.requestAnimationFrame(() =>
        {
            resolve();
        });
    });
};

const focusComposerInput = (element: HTMLElement) =>
{
    element.focus({ preventScroll: true });
};

const createInsertionVerificationError = (
    provider: AiChatProvider | undefined,
): RuntimeResponse =>
{
    return {
        ok: false,
        provider: provider?.id,
        providerLabel: provider?.label,
        error: `Could not verify prompt insertion in ${provider?.label ?? 'the AI chat page'}.`,
    };
};

const createInsertionFailureError = (
    provider: AiChatProvider | undefined,
    error: unknown,
): RuntimeResponse =>
{
    return {
        ok: false,
        provider: provider?.id,
        providerLabel: provider?.label,
        error:
            error instanceof Error
                ? error.message
                : `Could not insert prompt in ${provider?.label ?? 'the AI chat page'}.`,
    };
};

const selectContentEditableContents = (element: HTMLElement) =>
{
    focusComposerInput(element);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
};

const insertTextIntoTextInput = (
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string,
) =>
{
    focusComposerInput(element);
    setNativeValue(element, text);
    dispatchInputEvents(element);
};

const insertTextWithBeforeInput = (element: HTMLElement, text: string) =>
{
    selectContentEditableContents(element);
    element.dispatchEvent(
        new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data: text,
            inputType: 'insertText',
        }),
    );
};

const insertTextWithPasteEvent = (element: HTMLElement, text: string) =>
{
    if (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined')
    {
        return;
    }

    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    selectContentEditableContents(element);
    element.dispatchEvent(
        new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData,
        }),
    );
};

const insertTextWithExecCommand = (element: HTMLElement, text: string) =>
{
    selectContentEditableContents(element);

    const inserted = document.execCommand('insertText', false, text);

    if (inserted)
    {
        dispatchInputEventsWithText(element, text);
    }

    return inserted;
};

const insertTextIntoRichTextComposer = async (
    element: HTMLElement,
    text: string,
) =>
{
    insertTextWithBeforeInput(element, text);
    await waitForComposerUpdate();

    if (isPromptInserted(element, text))
    {
        return;
    }

    if (insertTextWithExecCommand(element, text))
    {
        await waitForComposerUpdate();

        if (isPromptInserted(element, text))
        {
            return;
        }
    }

    insertTextWithPasteEvent(element, text);
    await waitForComposerUpdate();

    if (isPromptInserted(element, text))
    {
        return;
    }
};

const TEXT_INPUT_INSERTION_ADAPTER: PromptInsertionAdapter = {
    name: 'native-input',
    insert: (element, text) =>
    {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
        {
            throw new Error('Selected composer is not a text input.');
        }

        insertTextIntoTextInput(element, text);
    },
};

const RICH_TEXT_INSERTION_ADAPTER: PromptInsertionAdapter = {
    name: 'rich-text',
    insert: insertTextIntoRichTextComposer,
};

const PROVIDER_INSERTION_ADAPTERS: Partial<
    Record<AiChatProviderId, PromptInsertionAdapter[]>
> = {
    chatgpt: [RICH_TEXT_INSERTION_ADAPTER],
    claude: [RICH_TEXT_INSERTION_ADAPTER],
    gemini: [RICH_TEXT_INSERTION_ADAPTER],
    perplexity: [RICH_TEXT_INSERTION_ADAPTER],
};

const getPromptInsertionAdapters = (
    provider: AiChatProvider | undefined,
    input: HTMLElement,
) =>
{
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
    {
        return [TEXT_INPUT_INSERTION_ADAPTER];
    }

    const providerAdapters =
        provider == null ? [] : (PROVIDER_INSERTION_ADAPTERS[provider.id] ?? []);

    return getUniqueInsertionAdapters([
        ...providerAdapters,
        RICH_TEXT_INSERTION_ADAPTER,
    ]);
};

const getUniqueInsertionAdapters = (adapters: PromptInsertionAdapter[]) =>
{
    const adapterByName = new Map<string, PromptInsertionAdapter>();

    for (const adapter of adapters)
    {
        adapterByName.set(adapter.name, adapter);
    }

    return [...adapterByName.values()];
};

const tryPromptInsertionAdapter = async (
    adapter: PromptInsertionAdapter,
    input: HTMLElement,
    text: string,
) =>
{
    await adapter.insert(input, text);
    await waitForComposerUpdate();

    return isPromptInserted(input, text);
};

const insertPromptIntoComposer = async (text: string): Promise<RuntimeResponse> =>
{
    const provider = getAiChatProviderByUrl(window.location.href);
    const input = findComposerInput();

    if (input == null)
    {
        return {
            ok: false,
            provider: provider?.id,
            providerLabel: provider?.label,
            error: `Could not find the ${provider?.label ?? 'AI chat'} input field.`,
        };
    }

    const adapters = getPromptInsertionAdapters(provider, input);
    let insertionError: unknown;

    for (const adapter of adapters)
    {
        try
        {
            if (await tryPromptInsertionAdapter(adapter, input, text))
            {
                return {
                    ok: true,
                    provider: provider?.id,
                    providerLabel: provider?.label,
                };
            }
        }
        catch (error)
        {
            insertionError = error;
        }
    }

    if (insertionError != null)
    {
        return createInsertionFailureError(provider, insertionError);
    }

    return createInsertionVerificationError(provider);
};

export default defineContentScript({
    matches: AI_CHAT_MATCHES,
    runAt: 'document_idle',
    main()
    {
        const extensionRuntime = getExtensionRuntime();

        if (extensionRuntime == null)
        {
            return;
        }

        mountLauncher({
            id: BUTTON_ID,
            onOpen: () =>
            {
                void Promise.resolve(extensionRuntime.sendMessage({ type: OPEN_SIDEPANEL_MESSAGE })).catch(() => undefined);
            },
        });

        if (window.__securepromptMessageListenerRegistered !== true)
        {
            extensionRuntime.onMessage.addListener((message, _sender, sendResponse) =>
            {
                if (message.type !== INJECT_PROMPT_MESSAGE || typeof message.text !== 'string')
                {
                    return false;
                }

                void insertPromptIntoComposer(message.text)
                    .then(sendResponse)
                    .catch((error) =>
                    {
                        sendResponse({
                            ok: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : 'Could not insert prompt.',
                        });
                    });

                return true;
            });

            window.__securepromptMessageListenerRegistered = true;
        }
    },
});
