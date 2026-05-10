import type { SensitiveItem, SensitiveItemCategory } from '../../types';
import {
    PRIVACY_FILTER_AGGREGATION_STRATEGY,
    PRIVACY_FILTER_CHUNK_MAX_LENGTH,
    PRIVACY_FILTER_CHUNK_MIN_LENGTH,
    PRIVACY_FILTER_CHUNK_OVERLAP_LENGTH,
} from './privacy-filter-config';
import {
    getPrivacyFilterPipeline,
    type PrivacyFilterOutput,
    type PrivacyFilterPipeline,
} from './privacy-filter-loader';
import { postProcessPrivacyFilterItems } from './post-process-privacy-filter-items';

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

type PrivacyFilterChunk = PrivacyFilterSpan & {
    text: string;
    maxLength: number;
};

type PrivacyFilterDetectionState = {
    nextItemIndex: number;
};

export const detectPrivacyFilterItems = async (
    inputText: string,
): Promise<SensitiveItem[]> =>
{
    if (inputText.length === 0)
    {
        return [];
    }

    const classifier = await getPrivacyFilterPipeline();
    const detectedItems: SensitiveItem[] = [];
    const detectionState = {
        nextItemIndex: 1,
    };

    for (const chunk of createPrivacyFilterChunks(
        inputText,
        0,
        inputText.length,
        PRIVACY_FILTER_CHUNK_MAX_LENGTH,
    ))
    {
        detectedItems.push(
            ...(await detectPrivacyFilterChunkItems(
                classifier,
                inputText,
                chunk,
                detectionState,
            )),
        );
    }

    return postProcessPrivacyFilterItems(inputText, detectedItems);
};

const detectPrivacyFilterChunkItems = async (
    classifier: PrivacyFilterPipeline,
    inputText: string,
    chunk: PrivacyFilterChunk,
    detectionState: PrivacyFilterDetectionState,
): Promise<SensitiveItem[]> =>
{
    try
    {
        return await runPrivacyFilterChunk(
            classifier,
            inputText,
            chunk,
            detectionState,
        );
    }
    catch (error)
    {
        if (!canRetryPrivacyFilterChunk(chunk, error))
        {
            throw error;
        }

        const retryMaxLength = Math.max(
            PRIVACY_FILTER_CHUNK_MIN_LENGTH,
            Math.floor(chunk.maxLength / 2),
        );

        return detectPrivacyFilterChunks(
            classifier,
            inputText,
            createPrivacyFilterChunks(inputText, chunk.start, chunk.end, retryMaxLength),
            detectionState,
        );
    }
};

const detectPrivacyFilterChunks = async (
    classifier: PrivacyFilterPipeline,
    inputText: string,
    chunks: PrivacyFilterChunk[],
    detectionState: PrivacyFilterDetectionState,
): Promise<SensitiveItem[]> =>
{
    const detectedItems: SensitiveItem[] = [];

    for (const chunk of chunks)
    {
        detectedItems.push(
            ...(await detectPrivacyFilterChunkItems(
                classifier,
                inputText,
                chunk,
                detectionState,
            )),
        );
    }

    return detectedItems;
};

const runPrivacyFilterChunk = async (
    classifier: PrivacyFilterPipeline,
    inputText: string,
    chunk: PrivacyFilterChunk,
    detectionState: PrivacyFilterDetectionState,
): Promise<SensitiveItem[]> =>
{
    const output = await classifier(chunk.text, {
        aggregation_strategy: PRIVACY_FILTER_AGGREGATION_STRATEGY,
    });
    const detectedItems: SensitiveItem[] = [];
    let fallbackSearchStart = chunk.start;

    for (const match of output)
    {
        const item = createPrivacyFilterItem(
            inputText,
            chunk,
            match,
            detectionState.nextItemIndex,
            fallbackSearchStart,
        );

        if (item == null)
        {
            continue;
        }

        detectedItems.push(item);
        detectionState.nextItemIndex += 1;
        fallbackSearchStart = Math.max(fallbackSearchStart, item.end);
    }

    return detectedItems;
};

const createPrivacyFilterItem = (
    inputText: string,
    chunk: PrivacyFilterChunk,
    match: PrivacyFilterOutput,
    itemIndex: number,
    fallbackSearchStart: number,
): SensitiveItem | null =>
{
    const category = getSensitiveItemCategory(match);
    const span = getPrivacyFilterSpan(inputText, chunk, match, fallbackSearchStart);

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
    chunk: PrivacyFilterChunk,
    match: PrivacyFilterOutput,
    fallbackSearchStart: number,
): PrivacyFilterSpan | null =>
{
    const offsetSpan = getPrivacyFilterOffsetSpan(inputText, chunk, match);

    if (offsetSpan != null)
    {
        return offsetSpan;
    }

    return getPrivacyFilterWordSpan(inputText, chunk, match, fallbackSearchStart);
};

const getPrivacyFilterOffsetSpan = (
    inputText: string,
    chunk: PrivacyFilterChunk,
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
        start: chunk.start + start,
        end: chunk.start + end,
    });
};

const getPrivacyFilterWordSpan = (
    inputText: string,
    chunk: PrivacyFilterChunk,
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

    if (isPrivacyFilterWordSpanInChunk(start, value, chunk))
    {
        return normalizePrivacyFilterSpan(inputText, {
            start,
            end: start + value.length,
        });
    }

    const fallbackStart = inputText.indexOf(value, chunk.start);

    if (!isPrivacyFilterWordSpanInChunk(fallbackStart, value, chunk))
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

const isPrivacyFilterWordSpanInChunk = (
    start: number,
    value: string,
    chunk: PrivacyFilterChunk,
) =>
{
    return (
        start >= chunk.start &&
        start + value.length <= chunk.end
    );
};

const getPrivacyFilterConfidence = (match: PrivacyFilterOutput) =>
{
    if (match.score == null || !Number.isFinite(match.score))
    {
        return 0;
    }

    return Math.min(1, Math.max(0, match.score));
};

const createPrivacyFilterChunks = (
    inputText: string,
    start: number,
    end: number,
    maxLength: number,
): PrivacyFilterChunk[] =>
{
    if (end - start <= maxLength)
    {
        return [createPrivacyFilterChunk(inputText, start, end, maxLength)];
    }

    const chunks: PrivacyFilterChunk[] = [];
    let chunkStart = start;

    while (chunkStart < end)
    {
        const hardEnd = Math.min(end, chunkStart + maxLength);
        const chunkEnd =
            hardEnd === end
                ? hardEnd
                : findPrivacyFilterChunkEnd(inputText, chunkStart, hardEnd, maxLength);

        chunks.push(
            createPrivacyFilterChunk(inputText, chunkStart, chunkEnd, maxLength),
        );

        if (chunkEnd >= end)
        {
            break;
        }

        const nextStart = Math.max(
            start,
            chunkEnd - Math.min(PRIVACY_FILTER_CHUNK_OVERLAP_LENGTH, maxLength - 1),
        );
        chunkStart = nextStart > chunkStart ? nextStart : chunkEnd;
    }

    return chunks;
};

const createPrivacyFilterChunk = (
    inputText: string,
    start: number,
    end: number,
    maxLength: number,
): PrivacyFilterChunk =>
{
    return {
        start,
        end,
        text: inputText.slice(start, end),
        maxLength,
    };
};

const findPrivacyFilterChunkEnd = (
    inputText: string,
    start: number,
    hardEnd: number,
    maxLength: number,
) =>
{
    const minEnd = Math.min(
        hardEnd,
        start + Math.max(1, maxLength - PRIVACY_FILTER_CHUNK_OVERLAP_LENGTH),
    );
    const lineBreak = inputText.lastIndexOf('\n', hardEnd - 1);

    if (lineBreak >= minEnd)
    {
        return lineBreak + 1;
    }

    for (let index = hardEnd; index > minEnd; index -= 1)
    {
        if (
            isPrivacyFilterChunkBoundary(
                inputText[index - 1],
                inputText[index],
            )
        )
        {
            return index;
        }
    }

    return hardEnd;
};

const isPrivacyFilterChunkBoundary = (
    previousCharacter: string | undefined,
    character: string | undefined,
) =>
{
    return (
        character != null &&
        (/\s/.test(character) ||
            (previousCharacter != null && /[.!?;:]/.test(previousCharacter)))
    );
};

const canRetryPrivacyFilterChunk = (
    chunk: PrivacyFilterChunk,
    error: unknown,
) =>
{
    return (
        chunk.maxLength > PRIVACY_FILTER_CHUNK_MIN_LENGTH &&
        isPrivacyFilterRuntimeError(error)
    );
};

const isPrivacyFilterRuntimeError = (error: unknown) =>
{
    const message = error instanceof Error ? error.message : String(error);

    return /OrtRun|onnxruntime|Non-zero status code|Failed to wait for the operation|ExecuteKernel/i.test(
        message,
    );
};
