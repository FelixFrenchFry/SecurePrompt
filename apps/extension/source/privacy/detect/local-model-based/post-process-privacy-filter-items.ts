import ipaddr from 'ipaddr.js';
import { parse } from 'tldts';
import type { SensitiveItem, SensitiveItemCategory } from '../../types';

type TextRange = {
    start: number;
    end: number;
};

const PRIVATIZED_MASK_PATTERN =
    /(?:EMAIL|PHONE|PERSON|ADDRESS|ACCOUNT|DATE|NETWORK|SECRET|OTHER)_\d{3,}/g;
const PRIVATIZED_MASK_VALUE_PATTERN =
    /^(?:EMAIL|PHONE|PERSON|ADDRESS|ACCOUNT|DATE|NETWORK|SECRET|OTHER)_\d{3,}$/;

const PROPAGATED_CATEGORIES = new Set<SensitiveItemCategory>([
    'EMAIL',
    'PHONE',
    'PERSON',
    'ADDRESS',
    'ACCOUNT',
    'NETWORK',
    'SECRET',
]);

const COMMON_NON_SECRET_VALUES = new Set([
    'abc123',
    'example',
    'null',
    'password',
    'placeholder',
    'todo',
]);

const PRIVATE_NETWORK_SUFFIXES = [
    'corp',
    'home',
    'internal',
    'intranet',
    'lan',
    'local',
];

export const postProcessPrivacyFilterItems = (
    inputText: string,
    items: SensitiveItem[],
): SensitiveItem[] =>
{
    const privatizedMaskRanges = findPrivatizedMaskRanges(inputText);
    const cleanItems = dedupeSensitiveItems(
        items
            .map((item) =>
            {
                return cleanPrivacyFilterItem(inputText, item, privatizedMaskRanges);
            })
            .filter((item): item is SensitiveItem =>
            {
                return item != null;
            }),
    );
    const propagatedItems = propagateRepeatedModelItems(
        inputText,
        cleanItems,
        privatizedMaskRanges,
    );

    return dedupeSensitiveItems([...cleanItems, ...propagatedItems]).sort(compareItemsByPosition);
};

const cleanPrivacyFilterItem = (
    inputText: string,
    item: SensitiveItem,
    privatizedMaskRanges: TextRange[],
): SensitiveItem | null =>
{
    const span = normalizeModelSpan(inputText, item);

    if (span == null)
    {
        return null;
    }

    const value = inputText.slice(span.start, span.end);
    const cleanedItem = {
        ...item,
        start: span.start,
        end: span.end,
        value,
    };

    // ignore masks from an earlier privatization step
    if (isPrivatizedMask(value) || overlapsAnyRange(span, privatizedMaskRanges))
    {
        return null;
    }

    // reject partial spans such as "GooPERSON_001e"
    if (!hasCleanModelBoundaries(inputText, cleanedItem.category, span))
    {
        return null;
    }

    if (!isPlausibleModelItem(cleanedItem))
    {
        return null;
    }

    return cleanedItem;
};

const normalizeModelSpan = (
    inputText: string,
    item: Pick<SensitiveItem, 'start' | 'end'>,
): TextRange | null =>
{
    let start = item.start;
    let end = item.end;

    if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > inputText.length ||
        end <= start
    )
    {
        return null;
    }

    // model aggregation can include wrapping punctuation
    while (start < end && isLeadingTrimCharacter(inputText[start]))
    {
        start += 1;
    }

    while (end > start && isTrailingTrimCharacter(inputText[end - 1]))
    {
        end -= 1;
    }

    if (end <= start)
    {
        return null;
    }

    return {
        start,
        end,
    };
};

const findPrivatizedMaskRanges = (inputText: string): TextRange[] =>
{
    return [...inputText.matchAll(PRIVATIZED_MASK_PATTERN)].map((match) =>
    {
        return {
            start: match.index,
            end: match.index + match[0].length,
        };
    });
};

const propagateRepeatedModelItems = (
    inputText: string,
    cleanItems: SensitiveItem[],
    privatizedMaskRanges: TextRange[],
): SensitiveItem[] =>
{
    const propagatedItems: SensitiveItem[] = [];
    const seedItems = getPropagationSeedItems(cleanItems);
    let propagatedIndex = 1;

    for (const seedItem of seedItems)
    {
        let start = inputText.indexOf(seedItem.value);

        while (start !== -1)
        {
            const span = {
                start,
                end: start + seedItem.value.length,
            };

            if (
                !overlapsAnyRange(span, cleanItems) &&
                !overlapsAnyRange(span, propagatedItems) &&
                !overlapsAnyRange(span, privatizedMaskRanges) &&
                hasCleanModelBoundaries(inputText, seedItem.category, span)
            )
            {
                propagatedItems.push({
                    ...seedItem,
                    id: `privacy-filter-propagated-${String(propagatedIndex).padStart(3, '0')}`,
                    start: span.start,
                    end: span.end,
                    value: inputText.slice(span.start, span.end),
                });
                propagatedIndex += 1;
            }

            start = inputText.indexOf(seedItem.value, span.end);
        }
    }

    return propagatedItems;
};

const getPropagationSeedItems = (items: SensitiveItem[]) =>
{
    const seedItems = new Map<string, SensitiveItem>();

    for (const item of items)
    {
        if (!shouldPropagateItem(item))
        {
            continue;
        }

        const key = `${item.category}:${item.value}`;
        const existingItem = seedItems.get(key);

        if (existingItem == null || item.confidence > existingItem.confidence)
        {
            seedItems.set(key, item);
        }
    }

    return [...seedItems.values()];
};

const shouldPropagateItem = (item: SensitiveItem) =>
{
    if (!PROPAGATED_CATEGORIES.has(item.category))
    {
        return false;
    }

    if (item.value.length < 3)
    {
        return false;
    }

    return !isPrivatizedMask(item.value);
};

const isPlausibleModelItem = (item: SensitiveItem) =>
{
    const value = item.value.trim();

    if (value.length < 2)
    {
        return false;
    }

    if (PRIVATIZED_MASK_VALUE_PATTERN.test(value))
    {
        return false;
    }

    if (item.category === 'EMAIL')
    {
        return isPlausibleEmail(value);
    }

    if (item.category === 'PHONE')
    {
        return countDigits(value) >= 7;
    }

    if (item.category === 'PERSON')
    {
        return hasLetter(value);
    }

    if (item.category === 'ADDRESS')
    {
        return hasLetter(value) && value.length >= 4;
    }

    if (item.category === 'ACCOUNT')
    {
        return countAlphaNumericCharacters(value) >= 6;
    }

    if (item.category === 'DATE')
    {
        return isPlausibleDate(value);
    }

    if (item.category === 'NETWORK')
    {
        return isPlausibleNetworkValue(value);
    }

    if (item.category === 'SECRET')
    {
        return isPlausibleSecret(value);
    }

    return true;
};

const hasCleanModelBoundaries = (
    inputText: string,
    category: SensitiveItemCategory,
    span: TextRange,
) =>
{
    const before = span.start > 0 ? inputText[span.start - 1] : undefined;
    const after = span.end < inputText.length ? inputText[span.end] : undefined;

    return (
        !isBoundaryBlockingCharacter(category, before) &&
        !isBoundaryBlockingCharacter(category, after)
    );
};

const isBoundaryBlockingCharacter = (
    category: SensitiveItemCategory,
    character: string | undefined,
) =>
{
    if (character == null)
    {
        return false;
    }

    if (isWordLikeCharacter(character))
    {
        return true;
    }

    if (category === 'EMAIL')
    {
        return /[.@%+-]/.test(character);
    }

    if (category === 'PHONE')
    {
        return /[+().\-/]/.test(character);
    }

    if (category === 'PERSON')
    {
        return /['\u2018\u2019-]/.test(character);
    }

    if (category === 'ACCOUNT')
    {
        return /[-./@]/.test(character);
    }

    if (category === 'DATE')
    {
        return /[-/.]/.test(character);
    }

    if (category === 'NETWORK')
    {
        return /[.:/?#@%&=+-]/.test(character);
    }

    if (category === 'SECRET')
    {
        return /[._\-+/=]/.test(character);
    }

    return false;
};

const isPlausibleEmail = (value: string) =>
{
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const isPlausibleDate = (value: string) =>
{
    return (
        /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(value) ||
        /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(value) ||
        /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(value) ||
        /\b(?:today|tomorrow|yesterday)\b/i.test(value) ||
        /\b(?:next|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year)\b/i.test(value) ||
        /\bq[1-4]\s+\d{4}\b/i.test(value)
    );
};

const isPlausibleNetworkValue = (value: string) =>
{
    if (value === 'localhost')
    {
        return true;
    }

    if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(value))
    {
        return true;
    }

    if (isPlausibleIpAddress(value))
    {
        return true;
    }

    if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value))
    {
        return isPlausibleExplicitUrl(value);
    }

    return isPlausibleDomain(value);
};

const isPlausibleSecret = (value: string) =>
{
    const normalizedValue = value
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .toLowerCase();

    if (COMMON_NON_SECRET_VALUES.has(normalizedValue))
    {
        return false;
    }

    return countAlphaNumericCharacters(value) >= 8;
};

const isPlausibleExplicitUrl = (value: string) =>
{
    try
    {
        const url = new URL(value);
        const protocol = url.protocol.toLowerCase();

        if (protocol === 'http:' || protocol === 'https:')
        {
            return isPlausibleUrlHostname(url.hostname);
        }

        return url.hostname.length > 0;
    }
    catch
    {
        return false;
    }
};

const isPlausibleIpAddress = (value: string) =>
{
    const withoutBrackets = value.replace(/^\[/, '').replace(/\]$/, '');

    return ipaddr.isValid(withoutBrackets);
};

const isPlausibleUrlHostname = (hostname: string) =>
{
    const normalizedHostname = hostname.replace(/^\[/, '').replace(/\]$/, '');

    return (
        ipaddr.isValid(normalizedHostname) ||
        /^localhost$/i.test(normalizedHostname) ||
        isPlausibleDomain(normalizedHostname)
    );
};

const isPlausibleDomain = (value: string) =>
{
    if (value.includes('@'))
    {
        return false;
    }

    if (isLocalhostValue(value))
    {
        return true;
    }

    const parsed = parse(value);
    const hostname = parsed.hostname ?? '';

    return (
        isPlausiblePublicHostname(hostname, parsed.domain, parsed.publicSuffix) ||
        isPlausiblePrivateHostname(hostname)
    );
};

const isLocalhostValue = (value: string) =>
{
    return /^localhost(?::\d{1,5})?$/i.test(value);
};

const isPlausiblePublicHostname = (
    hostname: string,
    domain: string | null,
    publicSuffix: string | null,
) =>
{
    return (
        domain != null &&
        publicSuffix != null &&
        hostname.includes('.') &&
        /[a-z]/i.test(hostname)
    );
};

const isPlausiblePrivateHostname = (hostname: string) =>
{
    const labels = hostname.toLowerCase().split('.');
    const suffix = labels.at(-1) ?? '';

    return (
        labels.length >= 2 &&
        PRIVATE_NETWORK_SUFFIXES.includes(suffix) &&
        labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    );
};

const dedupeSensitiveItems = (items: SensitiveItem[]) =>
{
    const itemsByKey = new Map<string, SensitiveItem>();

    for (const item of items)
    {
        const key = `${item.category}:${item.start}:${item.end}:${item.value}`;
        const existingItem = itemsByKey.get(key);

        if (existingItem == null || item.confidence > existingItem.confidence)
        {
            itemsByKey.set(key, item);
        }
    }

    return [...itemsByKey.values()];
};

const compareItemsByPosition = (left: SensitiveItem, right: SensitiveItem) =>
{
    return left.start - right.start || right.end - left.end;
};

const overlapsAnyRange = (range: TextRange, ranges: TextRange[]) =>
{
    return ranges.some((existingRange) =>
    {
        return range.start < existingRange.end && range.end > existingRange.start;
    });
};

const isPrivatizedMask = (value: string) =>
{
    return PRIVATIZED_MASK_VALUE_PATTERN.test(value);
};

const isLeadingTrimCharacter = (character: string | undefined) =>
{
    return character != null && /[\s"'`<([{]/.test(character);
};

const isTrailingTrimCharacter = (character: string | undefined) =>
{
    return character != null && /[\s"'`>.,;:!?)}\]]/.test(character);
};

const isWordLikeCharacter = (character: string) =>
{
    return /[\p{L}\p{N}_]/u.test(character);
};

const hasLetter = (value: string) =>
{
    return /\p{L}/u.test(value);
};

const countDigits = (value: string) =>
{
    return [...value].filter((character) =>
    {
        return /\p{N}/u.test(character);
    }).length;
};

const countAlphaNumericCharacters = (value: string) =>
{
    return [...value].filter((character) =>
    {
        return /[\p{L}\p{N}]/u.test(character);
    }).length;
};
