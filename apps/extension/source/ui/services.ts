import { RULE_NAMES, RULES } from '@secureprompt/core';
import { browser } from 'wxt/browser';
import { createMasker } from '../masking/masker';
import { GET_CHAT_TARGET_MESSAGE, INJECT_PROMPT_MESSAGE, type RuntimeResponse } from '../messaging';
import { createOffscreenDetector, type ModelLoading } from '../model/client';
import { createDownloadProgress } from '../model/download-progress';
import { requestModelHost } from '../model/host';
import { MODEL_HOST_PERMISSIONS } from '../model/protocol';
import type { ChatTarget, ModelStatus, ScanStep } from './state';

// the side panel's links to the browser: the model, the chat page and the permission prompt

export type ModelListener = { onModel: (model: ModelStatus) => void; onScan: (scan: ScanStep) => void };

export const createServices = (listener: ModelListener) =>
{
    const downloads = createDownloadProgress();

    // transformers.js reports each file's bytes, 'done' per file and 'ready' once the model is loaded
    const onLoading = (loading: ModelLoading) =>
    {
        const progress = downloads(loading);

        if (progress != null)
        {
            listener.onModel('downloading');
            listener.onScan({ step: 'downloading', ...progress });
        }
        else if (loading.status === 'done')
        {
            listener.onModel('loading');
            listener.onScan({ step: 'loading' });
        }
        else if (loading.status === 'ready')
        {
            listener.onModel('ready');
        }
    };

    const model = createOffscreenDetector({ ensureHost: requestModelHost, onLoading });
    const masker = createMasker({ rules: RULE_NAMES.map((name) => RULES[name]), model });

    // downloads and loads the model ahead of the first prompt, on a placeholder text
    const warmUp = async (signal: AbortSignal) =>
    {
        await model.detect('SecurePrompt', { signal });
    };

    return { masker, warmUp };
};

export const hasModelPermission = async (): Promise<boolean> =>
{
    try
    {
        return await browser.permissions.contains({ origins: MODEL_HOST_PERMISSIONS });
    }
    catch
    {
        return false;
    }
};

// asks once for the Hugging Face hosts, must run right after a click for Chrome to show the prompt
export const requestModelPermission = async (): Promise<boolean> =>
{
    try
    {
        return await browser.permissions.request({ origins: MODEL_HOST_PERMISSIONS });
    }
    catch
    {
        return false;
    }
};

// the chat page a response names, even a failed one ("Refresh ChatGPT and try again")
const toTarget = (response: RuntimeResponse | undefined): ChatTarget | undefined =>
{
    return response?.provider != null && response.providerLabel != null
        ? { id: response.provider, label: response.providerLabel, ...(response.pageUrl == null ? {} : { pageUrl: response.pageUrl }) }
        : undefined;
};

// the window this side panel lives in, so the chat target follows its tabs, not the last focused window
const panelWindow = async (): Promise<{ windowId?: number }> =>
{
    try
    {
        const { id } = await browser.windows.getCurrent();

        return id == null ? {} : { windowId: id };
    }
    catch
    {
        return {};
    }
};

export const requestChatTarget = async (): Promise<ChatTarget | undefined> =>
{
    try
    {
        return toTarget((await browser.runtime.sendMessage({ type: GET_CHAT_TARGET_MESSAGE, ...(await panelWindow()) })) as RuntimeResponse | undefined);
    }
    catch
    {
        return undefined;
    }
};

export type InsertResult = { ok: boolean; message: string; target?: ChatTarget };

export const insertIntoChat = async (text: string): Promise<InsertResult> =>
{
    try
    {
        const response = (await browser.runtime.sendMessage({ type: INJECT_PROMPT_MESSAGE, text, ...(await panelWindow()) })) as RuntimeResponse | undefined;
        const target = toTarget(response);
        const message =
            response?.ok === true
                ? `Inserted into ${target?.label ?? 'the chat'}. Check it and send it there.`
                : (response?.error ?? 'Could not insert into the chat page.');

        return { ok: response?.ok === true, message, ...(target == null ? {} : { target }) };
    }
    catch
    {
        return { ok: false, message: 'Could not insert into the chat page.' };
    }
};

export const copyText = async (text: string): Promise<boolean> =>
{
    try
    {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch
    {
        return false;
    }
};
