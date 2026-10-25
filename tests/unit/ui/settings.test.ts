import { describe, expect, it } from 'vitest';
import {
    DEFAULT_EXTENSION_SETTINGS,
    enabledCategorySet,
    normalizeExtensionSettings,
    prependPromptHeader,
    PROMPT_HEADER,
} from '../../../apps/extension/source/settings/types';

describe('normalizeExtensionSettings', () =>
{
    it('uses the defaults for missing or broken settings, with OTHER off', () =>
    {
        expect(normalizeExtensionSettings(undefined)).toEqual(DEFAULT_EXTENSION_SETTINGS);
        expect(normalizeExtensionSettings({ theme: 'neon', promptHeaderMode: 7, enabledCategories: 'all' })).toEqual(DEFAULT_EXTENSION_SETTINGS);
        expect(DEFAULT_EXTENSION_SETTINGS.enabledCategories.OTHER).toBe(false);
    });

    it('keeps valid stored values and ignores keys of older versions', () =>
    {
        const stored = {
            theme: 'dark',
            darkModeEnabled: true,
            localModelDetectionEnabled: false,
            modelSetupDone: true,
            enabledCategories: { DATE: false, OTHER: true, UNKNOWN: true },
            promptHeaderMode: 'custom',
            customPromptHeader: 'Keep placeholders.',
        };
        const settings = normalizeExtensionSettings(stored);

        expect(settings).toEqual({
            theme: 'dark',
            localModelDetectionEnabled: false,
            modelSetupDone: true,
            enabledCategories: { ...DEFAULT_EXTENSION_SETTINGS.enabledCategories, DATE: false, OTHER: true },
            promptHeaderMode: 'custom',
            customPromptHeader: 'Keep placeholders.',
        });
        expect([...enabledCategorySet(settings.enabledCategories)]).not.toContain('DATE');
    });

    it('moves the former short and detailed notes to the single note', () =>
    {
        expect(normalizeExtensionSettings({ promptHeaderMode: 'basic' }).promptHeaderMode).toBe('note');
        expect(normalizeExtensionSettings({ promptHeaderMode: 'detailed' }).promptHeaderMode).toBe('note');
    });

    it('starts the custom note from the explaining note when none was written', () =>
    {
        expect(DEFAULT_EXTENSION_SETTINGS.customPromptHeader).toBe(PROMPT_HEADER);
        expect(normalizeExtensionSettings({ customPromptHeader: '' }).customPromptHeader).toBe(PROMPT_HEADER);
        expect(normalizeExtensionSettings({ customPromptHeader: '  ' }).customPromptHeader).toBe(PROMPT_HEADER);
    });

    it('keeps an emptied custom note while the custom note is chosen', () =>
    {
        expect(normalizeExtensionSettings({ promptHeaderMode: 'custom', customPromptHeader: '' }).customPromptHeader).toBe('');
    });
});

describe('prependPromptHeader', () =>
{
    it('adds the chosen note before the prompt', () =>
    {
        expect(prependPromptHeader('Hi PERSON_001', DEFAULT_EXTENSION_SETTINGS)).toBe(`${PROMPT_HEADER}\n\nHi PERSON_001`);
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'custom', customPromptHeader: '  Note  ' })).toBe('Note\n\nHi');
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'custom', customPromptHeader: ' ' })).toBe('Hi');
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'none', customPromptHeader: '' })).toBe('Hi');
    });
});
