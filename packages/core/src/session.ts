import { CATEGORIES, isCategory, type Category } from './types';

export const formatPlaceholder = (category: Category, index: number): string =>
{
    return `${category}_${String(index).padStart(3, '0')}`;
};

// any placeholder-shaped token, including ones from earlier prompts or pasted AI answers
export const PLACEHOLDER_PATTERN = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${CATEGORIES.join('|')})_\\d{3,}(?![\\p{L}\\p{N}_])`,
    'gu',
);

// formatting variants share a placeholder, normalized per category:
// - names and addresses ignore case and spacing ('anna schmidt' = 'Anna Schmidt')
// - emails ignore case
// - phone and account numbers ignore spaces, dashes, dots, slashes and brackets
// - secrets, URLs, dates and the rest stay exact apart from surrounding whitespace
const CASE_INSENSITIVE: ReadonlySet<Category> = new Set(['PERSON', 'ADDRESS', 'EMAIL', 'OTHER']);

// whether values of this category that differ only in case are the same value
export const ignoresCase = (category: Category): boolean => CASE_INSENSITIVE.has(category);

export const normalizeValue = (category: Category, value: string): string =>
{
    const collapsed = value.normalize('NFC').replace(/\s+/g, ' ').trim();

    if (ignoresCase(category))
    {
        return collapsed.toLowerCase();
    }

    if (category === 'PHONE' || category === 'ACCOUNT')
    {
        return collapsed.replace(/[\s\-./()]/g, '');
    }

    return collapsed;
};

type Entry = {
    category: Category;
    value: string;
    placeholder: string;
};

// a session's contents as plain data, only for memory-only storage (chrome.storage.session)
export type SessionSnapshot = {
    entries: Entry[];
};

// the value ↔ placeholder registry of one conversation, stable across prompts
export type MaskSession = {
    // returns the value's placeholder, assigning a new one if needed, never a reserved one
    placeholderFor: (category: Category, value: string, reserved?: ReadonlySet<string>) => string;
    // original value for a placeholder this session assigned
    originalFor: (placeholder: string) => string | undefined;
    placeholders: () => string[];
    // independent copy, for trial runs that must not change this session
    fork: () => MaskSession;
    snapshot: () => SessionSnapshot;
};

export const createSession = (): MaskSession =>
{
    return createSessionFrom(new Map(), new Map(), new Map());
};

const placeholderIndex = (category: Category, placeholder: string): number | undefined =>
{
    const match = new RegExp(`^${category}_(\\d{3,})$`).exec(placeholder);

    return match == null ? undefined : Number(match[1]);
};

// rebuilds a session from an untrusted snapshot, with errors that never quote its values
export const restoreSession = (snapshot: SessionSnapshot): MaskSession =>
{
    const byKey = new Map<string, Entry>();
    const byPlaceholder = new Map<string, Entry>();
    const nextIndex = new Map<Category, number>();
    const invalid = () => new Error('Invalid session snapshot');

    if (!Array.isArray(snapshot?.entries))
    {
        throw invalid();
    }

    for (const entry of snapshot.entries)
    {
        if (entry == null || !isCategory(entry.category) || typeof entry.value !== 'string' || entry.value.trim().length === 0)
        {
            throw invalid();
        }

        const { category, value, placeholder } = entry;
        const index = typeof placeholder === 'string' ? placeholderIndex(category, placeholder) : undefined;
        const key = `${category}\u0000${normalizeValue(category, value)}`;

        // each value and each placeholder appears once
        if (index == null || byKey.has(key) || byPlaceholder.has(placeholder))
        {
            throw invalid();
        }

        const copy = { category, value, placeholder };

        byKey.set(key, copy);
        byPlaceholder.set(placeholder, copy);
        nextIndex.set(category, Math.max(nextIndex.get(category) ?? 1, index + 1));
    }

    return createSessionFrom(byKey, byPlaceholder, nextIndex);
};

const createSessionFrom = (
    byKey: Map<string, Entry>,
    byPlaceholder: Map<string, Entry>,
    nextIndex: Map<Category, number>,
): MaskSession =>
{
    const placeholderFor = (category: Category, value: string, reserved?: ReadonlySet<string>) =>
    {
        const key = `${category}\u0000${normalizeValue(category, value)}`;
        const existing = byKey.get(key);

        if (existing != null)
        {
            return existing.placeholder;
        }

        let index = nextIndex.get(category) ?? 1;
        let placeholder = formatPlaceholder(category, index);

        // skip placeholders that already appear in the text as literal words
        while (reserved?.has(placeholder) || byPlaceholder.has(placeholder))
        {
            index += 1;
            placeholder = formatPlaceholder(category, index);
        }

        const entry = { category, value, placeholder };

        nextIndex.set(category, index + 1);
        byKey.set(key, entry);
        byPlaceholder.set(placeholder, entry);

        return placeholder;
    };

    return {
        placeholderFor,
        originalFor: (placeholder) => byPlaceholder.get(placeholder)?.value,
        placeholders: () => [...byPlaceholder.keys()],
        fork: () => createSessionFrom(new Map(byKey), new Map(byPlaceholder), new Map(nextIndex)),
        snapshot: () => ({ entries: [...byPlaceholder.values()].map((entry) => ({ ...entry })) }),
    };
};
