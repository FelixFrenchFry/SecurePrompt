import {
    SENSITIVE_ITEM_CATEGORIES,
    type SensitiveItemCategory,
} from '../privacy/types';

export type PromptHeaderMode = 'none' | 'basic' | 'detailed' | 'custom';

export type EnabledSensitiveItemCategories = Record<SensitiveItemCategory, boolean>;

export type ExtensionSettings = {
    darkModeEnabled: boolean;
    rulesDetectionEnabled: boolean;
    localModelDetectionEnabled: boolean;
    enabledCategories: EnabledSensitiveItemCategories;
    promptHeaderMode: PromptHeaderMode;
    customPromptHeader: string;
};

export const BASIC_PROMPT_HEADER =
    'NOTE: Sensitive values in the prompt were replaced with stable typed placeholders such as EMAIL_001, PHONE_001, PERSON_001, ADDRESS_001, ACCOUNT_001, DATE_001, NETWORK_001, and SECRET_001. Repeated placeholders refer to the same original value within this prompt. Do not infer or reconstruct originals, but preserve placeholders and the surrounding operational meaning.';

export const DETAILED_PROMPT_HEADER =
    'NOTE: Sensitive values in the prompt were replaced locally with stable typed placeholders before submission. EMAIL_001 represents an email address. PHONE_001 represents a phone number. PERSON_001 represents a private person or name. ADDRESS_001 represents a street address, postal address, or private location. ACCOUNT_001 represents an account, customer, payment, invoice, bank, tax, subscription, tenant, contract, ticket, or similar identifier. DATE_001 represents a date or time value. NETWORK_001 represents a URL, domain, hostname, IP address, endpoint, email link, or private infrastructure reference. SECRET_001 represents a credential, token, API key, password, private key, connection string, webhook, or similar secret. Repeated placeholders refer to the same original value within this specific prompt. Different placeholder numbers usually refer to different original values, even within the same category. Do not infer, reconstruct, guess, or invent original private values. Preserve placeholders when referring to them, keep category distinctions intact, and preserve the surrounding operational meaning.';

export const DEFAULT_ENABLED_CATEGORIES = SENSITIVE_ITEM_CATEGORIES.reduce(
    (enabledCategories, category) =>
    {
        enabledCategories[category] = true;
        return enabledCategories;
    },
    {} as EnabledSensitiveItemCategories,
);

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
    darkModeEnabled: false,
    rulesDetectionEnabled: true,
    localModelDetectionEnabled: true,
    enabledCategories: DEFAULT_ENABLED_CATEGORIES,
    promptHeaderMode: 'basic',
    customPromptHeader: '',
};

export const isSensitiveItemCategoryEnabled = (
    enabledCategories: EnabledSensitiveItemCategories,
    category: SensitiveItemCategory,
) =>
{
    return enabledCategories[category];
};

export const getPromptHeaderText = (
    settings: Pick<ExtensionSettings, 'promptHeaderMode' | 'customPromptHeader'>,
) =>
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

    if (promptHeader.length === 0)
    {
        return promptText;
    }

    return `${promptHeader}\n\n${promptText}`;
};
