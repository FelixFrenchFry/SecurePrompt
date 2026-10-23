import { browser } from 'wxt/browser';
import { normalizeExtensionSettings, type ExtensionSettings } from './types';

// settings only, never prompt text or original values
const SETTINGS_STORAGE_KEY = 'secureprompt-extension-settings-v1';

export const loadExtensionSettings = async (): Promise<ExtensionSettings> =>
{
    const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);

    return normalizeExtensionSettings(stored[SETTINGS_STORAGE_KEY]);
};

export const saveExtensionSettings = async (settings: ExtensionSettings) =>
{
    await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
};
