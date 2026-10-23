import { describe, expect, it } from 'vitest';
import {
    BASIC_PROMPT_HEADER,
    DEFAULT_EXTENSION_SETTINGS,
    enabledCategorySet,
    normalizeExtensionSettings,
    prependPromptHeader,
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
});

describe('prependPromptHeader', () =>
{
    it('adds the chosen note before the prompt', () =>
    {
        expect(prependPromptHeader('Hi PERSON_001', DEFAULT_EXTENSION_SETTINGS)).toBe(`${BASIC_PROMPT_HEADER}\n\nHi PERSON_001`);
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'custom', customPromptHeader: '  Note  ' })).toBe('Note\n\nHi');
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'custom', customPromptHeader: ' ' })).toBe('Hi');
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'none', customPromptHeader: '' })).toBe('Hi');
        expect(prependPromptHeader('Hi', { promptHeaderMode: 'detailed', customPromptHeader: '' })).toMatch(/^NOTE: .*\n\nHi$/s);
    });
});
