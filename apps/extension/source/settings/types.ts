import { CATEGORIES, type Category } from '@secureprompt/core';

export type PromptHeaderMode = 'none' | 'basic' | 'detailed' | 'custom';

export type ThemeSetting = 'system' | 'light' | 'dark';

export type EnabledCategories = Record<Category, boolean>;

export type ExtensionSettings = {
    theme: ThemeSetting;
    localModelDetectionEnabled: boolean;
    enabledCategories: EnabledCategories;
    promptHeaderMode: PromptHeaderMode;
    customPromptHeader: string;
};

export const BASIC_PROMPT_HEADER =
    'NOTE: Sensitive values in the prompt were replaced with stable typed placeholders such as EMAIL_001, PHONE_001, PERSON_001, ADDRESS_001, ACCOUNT_001, DATE_001, NETWORK_001, SECRET_001, and OTHER_001. Repeated placeholders refer to the same original value within this prompt. Do not infer or reconstruct originals, but preserve placeholders and the surrounding operational meaning.';

export const DETAILED_PROMPT_HEADER =
    'NOTE: Sensitive values in the prompt were replaced locally with stable typed placeholders before submission. EMAIL_001 represents an email address. PHONE_001 represents a phone number. PERSON_001 represents a private person or name. ADDRESS_001 represents a street address, postal address, or private location. ACCOUNT_001 represents an account, customer, payment, invoice, bank, tax, subscription, tenant, contract, ticket, or similar identifier. DATE_001 represents a date or time value. NETWORK_001 represents a URL, domain, hostname, IP address, endpoint, email link, or private infrastructure reference. SECRET_001 represents a credential, token, API key, password, private key, connection string, webhook, or similar secret. OTHER_001 represents a sensitive value that does not fit one of the named categories. Repeated placeholders refer to the same original value within this specific prompt. Different placeholder numbers usually refer to different original values, even within the same category. Do not infer, reconstruct, guess, or invent original private values. Preserve placeholders when referring to them, keep category distinctions intact, and preserve the surrounding operational meaning.';

const PROMPT_HEADER_SEPARATOR = '\n\n';

// age, gender, companies and countries are reported but not masked by default
export const DEFAULT_ENABLED_CATEGORIES = Object.fromEntries(
    CATEGORIES.map((category) => [category, category !== 'OTHER']),
) as EnabledCategories;

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
    theme: 'system',
    localModelDetectionEnabled: true,
    enabledCategories: DEFAULT_ENABLED_CATEGORIES,
    promptHeaderMode: 'basic',
    customPromptHeader: '',
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

    return {
        theme: oneOf(stored.theme, ['system', 'light', 'dark'] as const, defaults.theme),
        localModelDetectionEnabled:
            typeof stored.localModelDetectionEnabled === 'boolean' ? stored.localModelDetectionEnabled : defaults.localModelDetectionEnabled,
        enabledCategories: normalizeCategories(stored.enabledCategories, defaults.enabledCategories),
        promptHeaderMode: oneOf(stored.promptHeaderMode, ['none', 'basic', 'detailed', 'custom'] as const, defaults.promptHeaderMode),
        customPromptHeader: typeof stored.customPromptHeader === 'string' ? stored.customPromptHeader : defaults.customPromptHeader,
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
    if (settings.promptHeaderMode === 'basic')
    {
        return BASIC_PROMPT_HEADER;
    }

    if (settings.promptHeaderMode === 'detailed')
    {
        return DETAILED_PROMPT_HEADER;
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
