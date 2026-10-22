import { browser } from 'wxt/browser';
import {
    SENSITIVE_ITEM_CATEGORIES,
    type SensitiveItemCategory,
} from '../privacy/types';
import {
    DEFAULT_EXTENSION_SETTINGS,
    type EnabledSensitiveItemCategories,
    type ExtensionSettings,
    type PromptHeaderMode,
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
        enabledCategories: getStoredEnabledCategories(
            storedSettings.enabledCategories,
            DEFAULT_EXTENSION_SETTINGS.enabledCategories,
        ),
        promptHeaderMode: getStoredPromptHeaderMode(
            storedSettings.promptHeaderMode,
            DEFAULT_EXTENSION_SETTINGS.promptHeaderMode,
        ),
        customPromptHeader: getStoredStringSetting(
            storedSettings.customPromptHeader,
            DEFAULT_EXTENSION_SETTINGS.customPromptHeader,
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

const getStoredStringSetting = (
    value: unknown,
    fallbackValue: string,
) =>
{
    return typeof value === 'string' ? value : fallbackValue;
};

const getStoredEnabledCategories = (
    value: unknown,
    fallbackValue: EnabledSensitiveItemCategories,
): EnabledSensitiveItemCategories =>
{
    if (value == null || typeof value !== 'object')
    {
        return { ...fallbackValue };
    }

    const storedCategories = value as Partial<Record<SensitiveItemCategory, unknown>>;

    return SENSITIVE_ITEM_CATEGORIES.reduce((enabledCategories, category) =>
    {
        enabledCategories[category] = getStoredBooleanSetting(
            storedCategories[category],
            fallbackValue[category],
        );
        return enabledCategories;
    }, {} as EnabledSensitiveItemCategories);
};

const getStoredPromptHeaderMode = (
    value: unknown,
    fallbackValue: PromptHeaderMode,
): PromptHeaderMode =>
{
    if (
        value === 'none' ||
        value === 'basic' ||
        value === 'detailed' ||
        value === 'custom'
    )
    {
        return value;
    }

    return fallbackValue;
};
