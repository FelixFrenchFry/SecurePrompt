import { browser } from 'wxt/browser';
import {
    DEFAULT_EXTENSION_SETTINGS,
    type ExtensionSettings,
} from './types';

const SETTINGS_STORAGE_KEY = 'secureprompt-extension-settings-v1';

export const loadExtensionSettings = async (): Promise<ExtensionSettings> =>
{
    const storedSettings = await browser.storage.local.get(SETTINGS_STORAGE_KEY);

    return normalizeExtensionSettings(storedSettings[SETTINGS_STORAGE_KEY]);
};

export const saveExtensionSettings = async (settings: ExtensionSettings) =>
{
    await browser.storage.local.set({
        [SETTINGS_STORAGE_KEY]: settings,
    });
};

const normalizeExtensionSettings = (value: unknown): ExtensionSettings =>
{
    if (value == null || typeof value !== 'object')
    {
        return DEFAULT_EXTENSION_SETTINGS;
    }

    const storedSettings = value as Partial<Record<keyof ExtensionSettings, unknown>>;

    return {
        darkModeEnabled: getStoredBooleanSetting(
            storedSettings.darkModeEnabled,
            DEFAULT_EXTENSION_SETTINGS.darkModeEnabled,
        ),
        rulesDetectionEnabled: getStoredBooleanSetting(
            storedSettings.rulesDetectionEnabled,
            DEFAULT_EXTENSION_SETTINGS.rulesDetectionEnabled,
        ),
        localModelDetectionEnabled: getStoredBooleanSetting(
            storedSettings.localModelDetectionEnabled,
            DEFAULT_EXTENSION_SETTINGS.localModelDetectionEnabled,
        ),
    };
};

const getStoredBooleanSetting = (
    value: unknown,
    fallbackValue: boolean,
) =>
{
    return typeof value === 'boolean' ? value : fallbackValue;
};
