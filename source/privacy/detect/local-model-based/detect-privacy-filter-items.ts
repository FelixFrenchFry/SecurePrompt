import type { SensitiveItem, SensitiveItemCategory } from '../../types';
import { PRIVACY_FILTER_AGGREGATION_STRATEGY } from './privacy-filter-config';
import {
    getPrivacyFilterPipeline,
    type PrivacyFilterOutput,
} from './privacy-filter-loader';

const PRIVACY_FILTER_CATEGORY_MAP: Record<string, SensitiveItemCategory> = {
    account_number: 'ACCOUNT',
    private_address: 'ADDRESS',
    private_date: 'DATE',
    private_email: 'EMAIL',
    private_person: 'PERSON',
    private_phone: 'PHONE',
    private_url: 'NETWORK',
    secret: 'SECRET',
};

type PrivacyFilterSpan = {
    start: number;
    end: number;
};

export const detectPrivacyFilterItems = async (
    inputText: string,
): Promise<SensitiveItem[]> =>
{
    const classifier = await getPrivacyFilterPipeline();
    const output = await classifier(inputText, {
        aggregation_strategy: PRIVACY_FILTER_AGGREGATION_STRATEGY,
    });
    const detectedItems: SensitiveItem[] = [];
    let fallbackSearchStart = 0;

    for (const match of output)
    {
        const item = createPrivacyFilterItem(
            inputText,
            match,
            detectedItems.length + 1,
            fallbackSearchStart,
        );

        if (item == null)
        {
            continue;
        }

        detectedItems.push(item);
        fallbackSearchStart = Math.max(fallbackSearchStart, item.end);
    }

    return detectedItems;
};

const createPrivacyFilterItem = (
    inputText: string,
    match: PrivacyFilterOutput,
    itemIndex: number,
    fallbackSearchStart: number,
): SensitiveItem | null =>
{
    const category = getSensitiveItemCategory(match);
    const span = getPrivacyFilterSpan(inputText, match, fallbackSearchStart);

    if (category == null || span == null)
    {
        return null;
    }

    return {
        id: `privacy-filter-${String(itemIndex).padStart(3, '0')}`,
        category,
        start: span.start,
        end: span.end,
        value: inputText.slice(span.start, span.end),
        confidence: getPrivacyFilterConfidence(match),
        source: 'model',
    };
};

const getSensitiveItemCategory = (
    match: PrivacyFilterOutput,
): SensitiveItemCategory | null =>
{
    const rawCategory = match.entity_group ?? match.entity;

    if (rawCategory == null)
    {
        return null;
    }

    const normalizedCategory = rawCategory
        .replace(/^[BIES]-/, '')
        .toLowerCase();

    return PRIVACY_FILTER_CATEGORY_MAP[normalizedCategory] ?? null;
};

const getPrivacyFilterSpan = (
    inputText: string,
    match: PrivacyFilterOutput,
    fallbackSearchStart: number,
): PrivacyFilterSpan | null =>
{
    const offsetSpan = getPrivacyFilterOffsetSpan(inputText, match);

    if (offsetSpan != null)
    {
        return offsetSpan;
    }

    return getPrivacyFilterWordSpan(inputText, match, fallbackSearchStart);
};

const getPrivacyFilterOffsetSpan = (
    inputText: string,
    match: PrivacyFilterOutput,
): PrivacyFilterSpan | null =>
{
    const start = match.start;
    const end = match.end;

    if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isInteger(start) ||
        !Number.isInteger(end)
    )
    {
        return null;
    }

    return normalizePrivacyFilterSpan(inputText, {
        start,
        end,
    });
};

const getPrivacyFilterWordSpan = (
    inputText: string,
    match: PrivacyFilterOutput,
    fallbackSearchStart: number,
): PrivacyFilterSpan | null =>
{
    const value = match.word?.trim();

    if (value == null || value.length === 0)
    {
        return null;
    }

    const start = inputText.indexOf(value, fallbackSearchStart);

    if (start !== -1)
    {
        return normalizePrivacyFilterSpan(inputText, {
            start,
            end: start + value.length,
        });
    }

    const fallbackStart = inputText.indexOf(value);

    if (fallbackStart === -1)
    {
        return null;
    }

    return normalizePrivacyFilterSpan(inputText, {
        start: fallbackStart,
        end: fallbackStart + value.length,
    });
};

const normalizePrivacyFilterSpan = (
    inputText: string,
    span: PrivacyFilterSpan,
): PrivacyFilterSpan | null =>
{
    let start = span.start;
    let end = span.end;

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

    // model spans may include surrounding whitespace from token aggregation
    while (start < end && /\s/.test(inputText[start]))
    {
        start += 1;
    }

    while (end > start && /\s/.test(inputText[end - 1]))
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

const getPrivacyFilterConfidence = (match: PrivacyFilterOutput) =>
{
    if (match.score == null || !Number.isFinite(match.score))
    {
        return 0;
    }

    return Math.min(1, Math.max(0, match.score));
};
