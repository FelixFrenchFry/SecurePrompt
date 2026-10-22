import type { Detection, Span } from '@secureprompt/core';
import type { TokenEvidence } from './evidence';
import { BARDSAI_TYPE_CATEGORIES, BARDSAI_TYPE_KINDS } from './labels';

// word-level decoder based on the model repo's pii_detector.py (revision 5e61416e)

// per-character sums over the tokens starting there: pooled type probabilities, count, begin mass
export type CharAccumulator = {
    // window-count weighted means, so sums match the original that added each window separately
    add: (offset: Span, typeProbabilities: ArrayLike<number>, beginMass: number, weight?: number) => void;
    at: (position: number) => { typeSums: Float64Array; count: number; beginMass: number } | undefined;
};

export const createCharAccumulator = (text: string, typeCount: number): CharAccumulator =>
{
    const byPosition = new Map<number, { typeSums: Float64Array; count: number; beginMass: number }>();

    return {
        add: (offset, typeProbabilities, beginMass, weight = 1) =>
        {
            let start = offset.start;

            if (offset.end <= start)
            {
                return;
            }

            // offsets include the token's leading space, so it goes to the first visible character
            while (start < offset.end - 1 && /\s/.test(text[start]!))
            {
                start += 1;
            }

            let entry = byPosition.get(start);

            if (entry == null)
            {
                entry = { typeSums: new Float64Array(typeCount + 1), count: 0, beginMass: 0 };
                byPosition.set(start, entry);
            }

            for (let type = 0; type <= typeCount; type += 1)
            {
                entry.typeSums[type]! += typeProbabilities[type]! * weight;
            }

            entry.beginMass += beginMass * weight;
            entry.count += weight;
        },
        at: (position) => byPosition.get(position),
    };
};

export type TypedSpan = Span & { type: string; score: number };

const WORD = /[^\s,;|"<>()[\]{}*^]+/g;
const LEADING_PUNCTUATION = '([{<"\'«„';
const TRAILING_PUNCTUATION = ')]}>"\'».,;:!?';
// a gap of only these characters lets two words of the same type merge
const MERGEABLE_GAP_CHARACTERS = ' ,-/.()';
// a word is masked when one entity type reaches this mean probability, even if "O" narrowly wins
const ENTITY_FLOOR = 0.25;

export const decodeWordSpans = (text: string, accumulator: CharAccumulator, types: readonly string[]): TypedSpan[] =>
{
    const spans: TypedSpan[] = [];
    const outside = types.length;
    const titleType = types.indexOf('PERSON_ROLE_OR_TITLE');
    // the words "O" won since the last span, for bridging a single one
    let skipped: (Span & { type: string }) | undefined;
    let skippedWords = 0;

    for (const match of text.matchAll(WORD))
    {
        let start = match.index;
        let end = start + match[0].length;

        while (start < end && LEADING_PUNCTUATION.includes(text[start]!))
        {
            start += 1;
        }

        while (end > start && TRAILING_PUNCTUATION.includes(text[end - 1]!))
        {
            end -= 1;
        }

        if (end <= start)
        {
            continue;
        }

        // mean of the pooled probabilities of all tokens starting inside the word
        const sums = new Float64Array(outside + 1);
        let count = 0;
        let firstBeginMass = -1;

        for (let position = start; position < end; position += 1)
        {
            const entry = accumulator.at(position);

            if (entry == null || entry.count === 0)
            {
                continue;
            }

            for (let type = 0; type <= outside; type += 1)
            {
                sums[type]! += entry.typeSums[type]!;
            }

            if (firstBeginMass < 0)
            {
                firstBeginMass = entry.beginMass / Math.max(entry.count, 1);
            }

            count += entry.count;
        }

        if (count === 0)
        {
            continue;
        }

        // best entity type, "O" wins only if no entity type reaches the floor
        let best = 0;

        for (let type = 1; type < outside; type += 1)
        {
            if (sums[type]! > sums[best]!)
            {
                best = type;
            }
        }

        // types of one kind split the evidence ("Boston"), so "O" competes with their pooled mass
        const kind = BARDSAI_TYPE_KINDS[types[best]!];
        let entityMass = 0;

        for (let type = 0; type < outside; type += 1)
        {
            if (type === best || (kind != null && BARDSAI_TYPE_KINDS[types[type]!] === kind))
            {
                entityMass += sums[type]!;
            }
        }

        // for a name, title evidence ("Herr", "Dr.") sides with "O", so titles stay readable
        const readableMass = kind === 'name' && titleType >= 0 ? sums[titleType]! : 0;
        const type = types[best]!;

        if (
            (sums[outside]! + readableMass > entityMass && (entityMass - readableMass) / count < ENTITY_FLOOR) ||
            // rescued identifiers need 2+ digits, ordinary words ("user") gather some mass too
            (sums[outside]! > sums[best]! && kind === 'identifier' && type !== 'CONTACT_HANDLE' && (text.slice(start, end).match(/\p{Nd}/gu)?.length ?? 0) < 2)
        )
        {
            skipped = { start, end, type };
            skippedWords += 1;
            continue;
        }

        const score = sums[best]! / count;
        const previous = spans[spans.length - 1];

        // one "O" word between two spans of its type belongs to the value ("Springs, Suite 668")
        if (
            previous != null &&
            previous.type === type &&
            skippedWords === 1 &&
            skipped?.type === type &&
            isMergeableGap(text.slice(previous.end, skipped.start)) &&
            isMergeableGap(text.slice(skipped.end, start))
        )
        {
            previous.end = skipped.end;
        }

        skipped = undefined;
        skippedWords = 0;

        if (
            previous != null &&
            previous.type === type &&
            isMergeableGap(text.slice(previous.end, start)) &&
            firstBeginMass < 0.5
        )
        {
            previous.end = end;
            previous.score = Math.min(previous.score, score);
        }
        else
        {
            spans.push({ start, end, type, score });
        }
    }

    return spans;
};

const isMergeableGap = (gap: string): boolean =>
{
    if (gap.includes('\n\n'))
    {
        return false;
    }

    for (const character of gap)
    {
        if (!MERGEABLE_GAP_CHARACTERS.includes(character))
        {
            return false;
        }
    }

    return true;
};

const ID_TYPES = new Set([
    'PERSON_IDENTIFIER',
    'BANK_ACCOUNT_IDENTIFIER',
    'PAYMENT_CARD',
    'ACCOUNT_IDENTIFIER',
    'DOCUMENT_IDENTIFIER',
    'VEHICLE_IDENTIFIER',
]);
const WORD_CHARACTER = '[\\p{L}\\p{N}_]';
const URLISH = new RegExp(`(https?://|www\\.|${WORD_CHARACTER}\\.[a-z]{2,}(?!${WORD_CHARACTER})|/${WORD_CHARACTER})`, 'iu');
const EMAIL = new RegExp(
    `(?<![\\p{L}\\p{N}_.+-])[\\p{L}\\p{N}_.+-]+@[\\p{L}\\p{N}_-]+(?:\\.[\\p{L}\\p{N}_-]+)*\\.[A-Za-z]{2,}(?![\\p{L}\\p{N}_-])`,
    'gu',
);

// format checks from the original: links must look like URLs, phones and IDs need digits
export const isPlausible = (text: string, span: TypedSpan): boolean =>
{
    const value = text.slice(span.start, span.end);
    const digits = value.match(/\p{Nd}/gu)?.length ?? 0;

    if (span.type === 'IDENTIFYING_LINK')
    {
        return URLISH.test(value);
    }

    if (span.type === 'PHONE_NUMBER')
    {
        return digits >= 5;
    }

    if (ID_TYPES.has(span.type))
    {
        return digits >= 2;
    }

    return true;
};

// the original returns every regex-matched email as EMAIL_ADDRESS, replacing overlapping spans
export const applyEmailOverride = (text: string, spans: readonly TypedSpan[]): TypedSpan[] =>
{
    const emails: TypedSpan[] = [...text.matchAll(EMAIL)].map((match) =>
    {
        return { start: match.index, end: match.index + match[0].length, type: 'EMAIL_ADDRESS', score: 1 };
    });

    if (emails.length === 0)
    {
        return [...spans];
    }

    return [
        ...spans.filter((span) => !emails.some((email) => span.start < email.end && email.start < span.end)),
        ...emails,
    ].sort((left, right) => left.start - right.start);
};

// the whole decoder: word labels, format checks, email override and category mapping
export const decodeEvidence = (text: string, evidence: TokenEvidence): Detection[] =>
{
    const width = evidence.types.length + 1;
    const accumulator = createCharAccumulator(text, evidence.types.length);

    evidence.offsets.forEach((offset, token) =>
    {
        if (offset != null)
        {
            accumulator.add(
                offset,
                evidence.typeProbabilities.subarray(token * width, (token + 1) * width),
                evidence.beginMass[token]!,
                evidence.windowCounts[token]!,
            );
        }
    });

    const spans = applyEmailOverride(
        text,
        decodeWordSpans(text, accumulator, evidence.types).filter((span) => isPlausible(text, span)),
    );
    const detections: Detection[] = [];

    for (const span of spans)
    {
        const category = BARDSAI_TYPE_CATEGORIES[span.type];

        if (category != null)
        {
            detections.push({
                start: span.start,
                end: span.end,
                category,
                source: 'model',
                detector: 'model:bardsai-v2',
                score: span.score,
                validated: false,
            });
        }
    }

    return detections;
};
