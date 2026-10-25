import { CATEGORIES, type Category } from '@secureprompt/core';

export type PromptHeaderMode = 'none' | 'note' | 'custom';

export type ThemeSetting = 'system' | 'light' | 'dark';

export type EnabledCategories = Record<Category, boolean>;

export type ExtensionSettings = {
    theme: ThemeSetting;
    localModelDetectionEnabled: boolean;
    // the first-run choice between downloading the model and rules only was made
    modelSetupDone: boolean;
    enabledCategories: EnabledCategories;
    promptHeaderMode: PromptHeaderMode;
    customPromptHeader: string;
};

export const PROMPT_HEADER =
    'Privacy note: Some potentially sensitive values in this message were replaced with placeholders in the format PERSON_001, EMAIL_005, PHONE_071, and so on. ' +
    'Treat them as the real values: Use them naturally, and don’t mention that anything was replaced or try to guess the originals. ' +
    'The same placeholder means the same value throughout this chat, and different placeholders mean different values. ' +
    'Always write a placeholder with its exact spelling (capitals, underscore, all digits, no backslash), also inside code. ' +
    'Keep placeholders in visible text, not inside link targets or math, and prefer standard Markdown over special formats. ' +
    'Don’t make up new placeholders. ' +
    'A tool on the user’s device swaps the placeholders in your answer back to the real values, so they only work if written exactly as given. ' +
    'Answer in the language of the message below.';

const PROMPT_HEADER_SEPARATOR = '\n\n';

// age, gender, companies and countries are reported but not masked by default
export const DEFAULT_ENABLED_CATEGORIES = Object.fromEntries(
    CATEGORIES.map((category) => [category, category !== 'OTHER']),
) as EnabledCategories;

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
    theme: 'system',
    localModelDetectionEnabled: true,
    modelSetupDone: false,
    enabledCategories: DEFAULT_ENABLED_CATEGORIES,
    promptHeaderMode: 'note',
    // the custom note starts as an editable copy of the explaining note
    customPromptHeader: PROMPT_HEADER,
};

export const enabledCategorySet = (enabled: EnabledCategories): ReadonlySet<Category> =>
{
    return new Set(CATEGORIES.filter((category) => enabled[category]));
};

// stored settings from older versions or with unknown values fall back to the defaults
export const normalizeExtensionSettings = (value: unknown): ExtensionSettings =>
{
    if (value == null || typeof value !== 'object')
    {
        return DEFAULT_EXTENSION_SETTINGS;
    }

    const stored = value as Partial<Record<keyof ExtensionSettings, unknown>>;
    const defaults = DEFAULT_EXTENSION_SETTINGS;
    const promptHeaderMode = oneOf(stored.promptHeaderMode, ['none', 'note', 'custom'] as const, defaults.promptHeaderMode);
    const customPromptHeader = typeof stored.customPromptHeader === 'string' ? stored.customPromptHeader : defaults.customPromptHeader;

    return {
        theme: oneOf(stored.theme, ['system', 'light', 'dark'] as const, defaults.theme),
        localModelDetectionEnabled:
            typeof stored.localModelDetectionEnabled === 'boolean' ? stored.localModelDetectionEnabled : defaults.localModelDetectionEnabled,
        modelSetupDone: typeof stored.modelSetupDone === 'boolean' ? stored.modelSetupDone : defaults.modelSetupDone,
        enabledCategories: normalizeCategories(stored.enabledCategories, defaults.enabledCategories),
        promptHeaderMode,
        // an empty custom note, as older versions stored by default, starts again from the explaining note unless it's in use
        customPromptHeader:
            promptHeaderMode !== 'custom' && customPromptHeader.trim().length === 0 ? defaults.customPromptHeader : customPromptHeader,
    };
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
{
    return options.includes(value as T) ? (value as T) : fallback;
};

const normalizeCategories = (value: unknown, fallback: EnabledCategories): EnabledCategories =>
{
    const stored = value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

    return Object.fromEntries(
        CATEGORIES.map((category) =>
        {
            const enabled = stored[category];

            return [category, typeof enabled === 'boolean' ? enabled : fallback[category]];
        }),
    ) as EnabledCategories;
};

export const getPromptHeaderText = (settings: Pick<ExtensionSettings, 'promptHeaderMode' | 'customPromptHeader'>) =>
{
    if (settings.promptHeaderMode === 'note')
    {
        return PROMPT_HEADER;
    }

    if (settings.promptHeaderMode === 'custom')
    {
        return settings.customPromptHeader.trim();
    }

    return '';
};

export const prependPromptHeader = (
    promptText: string,
    settings: Pick<ExtensionSettings, 'promptHeaderMode' | 'customPromptHeader'>,
) =>
{
    const promptHeader = getPromptHeaderText(settings);

    return promptHeader.length === 0 ? promptText : `${promptHeader}${PROMPT_HEADER_SEPARATOR}${promptText}`;
};
