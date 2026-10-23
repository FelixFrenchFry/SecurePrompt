import type { SessionSnapshot } from '@secureprompt/core';
import { browser } from 'wxt/browser';

// the masked values and their placeholders, in chrome.storage.session: memory only, cleared when the
// browser closes, and readable only by the extension's own pages
const SESSION_STORAGE_KEY = 'secureprompt-session-v1';

export const loadStoredSession = async (): Promise<unknown> =>
{
    try
    {
        return (await browser.storage.session.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY];
    }
    catch
    {
        return undefined;
    }
};

export const storeSession = async (snapshot: SessionSnapshot) =>
{
    await browser.storage.session.set({ [SESSION_STORAGE_KEY]: snapshot }).catch(() => undefined);
};

export const clearStoredSession = async () =>
{
    await browser.storage.session.remove(SESSION_STORAGE_KEY).catch(() => undefined);
};
