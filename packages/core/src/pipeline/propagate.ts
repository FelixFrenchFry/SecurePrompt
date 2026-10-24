import { ignoresCase } from '../session';
import { compareSpans, overlaps } from '../spans';
import type { Category, Detection, Span } from '../types';

// later mentions of a detected value get its placeholder ("Claudia Neumann … Frau Neumann"):
// - every whole-word repeat of a detected value (names from 2 characters, others from 4)
// - for people, each capitalized part of the name on its own ("Neumann", "Claudia")
// case-insensitive only where the session is, and capitalized names match capitalized words only

const MIN_VALUE_LENGTH = 4;
const MIN_NAME_PART_LENGTH = 2;
// age, country and similar values are too short and common to repeat-match safely
const NOT_PROPAGATED: ReadonlySet<Category> = new Set(['OTHER']);
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;
const STARTS_UPPERCASE = /^\p{Lu}/u;

type Term = {
    // the exact spelling, matched case-sensitively unless the category ignores case
    value: string;
    category: Category;
    // the canonical value whose placeholder the mention reuses, none for ambiguous name parts
    aliasOf: string | undefined;
    score: number;
    requiresUppercase: boolean;
};

// name parts matched on their own, without initials ("J.") and particles ("von", "de")
const nameParts = (value: string): string[] =>
{
    return value.split(/[\s,]+/).filter((part) => part.length >= MIN_NAME_PART_LENGTH && STARTS_UPPERCASE.test(part) && !part.endsWith('.'));
};

// a lone detected part like "Keller" reuses its full name, unless two full names share it
const linkNameParts = (text: string, detections: readonly Detection[]): Detection[] =>
{
    const fullNamesOfPart = new Map<string, Map<string, string>>();

    for (const detection of detections)
    {
        const value = detection.aliasOf ?? text.slice(detection.start, detection.end);
        const parts = nameParts(value);

        if (detection.category !== 'PERSON' || parts.length < 2)
        {
            continue;
        }

        for (const part of parts)
        {
            const owners = fullNamesOfPart.get(part.toLowerCase()) ?? new Map<string, string>();

            owners.set(value.toLowerCase(), value);
            fullNamesOfPart.set(part.toLowerCase(), owners);
        }
    }

    return detections.map((detection) =>
    {
        const value = text.slice(detection.start, detection.end);
        const owners = fullNamesOfPart.get(value.toLowerCase());

        if (detection.category !== 'PERSON' || detection.aliasOf != null || owners?.size !== 1 || nameParts(value).length !== 1)
        {
            return detection;
        }

        return { ...detection, aliasOf: [...owners.values()][0]! };
    });
};

export const propagateMentions = (
    text: string,
    found: readonly Detection[],
    protectedRanges: readonly Span[] = [],
): Detection[] =>
{
    const detections = linkNameParts(text, found);
    const terms = collectTerms(text, detections);

    if (terms.size === 0)
    {
        return [...detections].sort(compareSpans);
    }

    // longest terms first, so "Claudia Neumann" wins over "Neumann" at the same position
    const pattern = new RegExp(
        [...new Set([...terms.values()].map((term) => term.value))]
            .sort((left, right) => right.length - left.length)
            .map(escapeRegExp)
            .join('|'),
        'giu',
    );
    // distinct term lengths, longest first, for retrying shorter terms at a rejected position
    const lengths = [...new Set([...terms.values()].map((term) => term.value.length))].sort((left, right) => right - left);
    const blocked: Span[] = [...detections, ...protectedRanges];
    const added: Detection[] = [];
    const replaced = new Set<Span>();

    // the pattern finds the longest term at a position; if it's rejected, shorter terms starting
    // there are tried ("Claudia" in "Claudia Neumanns"), then the search moves one character on,
    // so a shorter term inside still matches
    for (let match = pattern.exec(text); match != null; match = pattern.exec(text))
    {
        const start = match.index;

        // skip whole surrogate pairs, the u flag would rewind lastIndex and loop on emoji
        pattern.lastIndex = start + (text.codePointAt(start)! > 0xffff ? 2 : 1);

        for (const length of lengths)
        {
            if (length > match[0].length)
            {
                continue;
            }

            const detection = mentionAt(text, start, start + length, terms, blocked, replaced);

            if (detection != null)
            {
                added.push(detection);
                blocked.push(detection);
                pattern.lastIndex = detection.end;
                break;
            }
        }
    }

    return [...detections, ...added].filter((detection) => !replaced.has(detection)).sort(compareSpans);
};

// the propagated detection for text[start, end) if a term fits there, marking the partial
// detections it replaces; null if no term fits or something else has priority
const mentionAt = (
    text: string,
    start: number,
    end: number,
    terms: ReadonlyMap<string, Term>,
    blocked: readonly Span[],
    replaced: Set<Span>,
): Detection | null =>
{
    const value = text.slice(start, end);
    const term = terms.get(termKey(value, true)) ?? terms.get(termKey(value, false));

    if (term == null || !isWholeWord(text, start, end) || (term.requiresUppercase && !STARTS_UPPERCASE.test(value)))
    {
        return null;
    }

    const span = { start, end };
    const overlapping = blocked.filter((range) => !replaced.has(range) && overlaps(range, span));

    // a partly tagged mention takes the full term, anything else in the way keeps priority
    const replaceable = overlapping.every((range) =>
    {
        return (
            isDetection(range) &&
            range.category === term.category &&
            range.source !== 'manual' &&
            range.start >= start &&
            range.end <= end &&
            range.end - range.start < end - start
        );
    });

    if (!replaceable)
    {
        return null;
    }

    for (const range of overlapping)
    {
        replaced.add(range);
    }

    return {
        start,
        end,
        category: term.category,
        source: 'propagated',
        detector: 'propagate',
        score: term.score,
        validated: false,
        ...(term.aliasOf == null ? {} : { aliasOf: term.aliasOf }),
    };
};

const collectTerms = (text: string, detections: readonly Detection[]): Map<string, Term> =>
{
    const terms = new Map<string, Term>();
    // name parts that belong to several different people are ambiguous
    const ambiguous = new Set<string>();

    const addTerm = (term: string, info: Term, isNamePart: boolean) =>
    {
        const key = termKey(term, ignoresCase(info.category));
        const existing = terms.get(key);

        if (existing == null)
        {
            terms.set(key, info);
            return;
        }

        // a full value always beats a name part with the same spelling
        if (isNamePart && existing.aliasOf?.toLowerCase() !== info.aliasOf?.toLowerCase())
        {
            ambiguous.add(key);
        }
    };

    for (const detection of detections)
    {
        if (NOT_PROPAGATED.has(detection.category))
        {
            continue;
        }

        const value = text.slice(detection.start, detection.end);
        const info: Term = {
            value,
            category: detection.category,
            aliasOf: detection.aliasOf ?? value,
            score: detection.score,
            // only names and places can collide with ordinary lowercase words
            requiresUppercase:
                (detection.category === 'PERSON' || detection.category === 'ADDRESS') &&
                STARTS_UPPERCASE.test(value),
        };

        // names are short ("Li", "max") but rarely collide as whole words, unlike '123'
        const minLength = detection.category === 'PERSON' ? MIN_NAME_PART_LENGTH : MIN_VALUE_LENGTH;

        if (value.length >= minLength)
        {
            addTerm(value, info, false);
        }

        if (detection.category !== 'PERSON')
        {
            continue;
        }

        for (const part of nameParts(value))
        {
            addTerm(part, { ...info, value: part, requiresUppercase: true }, true);
        }
    }

    // an ambiguous part ("Neumann" for two Neumanns) still gets masked, under its own placeholder
    for (const key of ambiguous)
    {
        terms.set(key, { ...terms.get(key)!, aliasOf: undefined });
    }

    // usernames spelled from a name ("jane.sim", "ljohnson") get their own ACCOUNT placeholder
    for (const detection of detections)
    {
        if (detection.category !== 'PERSON')
        {
            continue;
        }

        for (const variant of usernameVariants(text.slice(detection.start, detection.end)))
        {
            const key = termKey(variant, false);

            if (!terms.has(key) && !terms.has(termKey(variant, true)))
            {
                terms.set(key, { value: variant, category: 'ACCOUNT', aliasOf: undefined, score: detection.score, requiresUppercase: false });
            }
        }
    }

    // an email's local part like "minho.kim@…" counts as a username if it has a separator
    for (const detection of detections)
    {
        if (detection.category !== 'EMAIL')
        {
            continue;
        }

        const local = text.slice(detection.start, detection.end).split('@')[0]!;

        if (local.length < MIN_USERNAME_LENGTH || !/^\p{L}+(?:[._-]\p{L}+)+$/u.test(local))
        {
            continue;
        }

        const key = termKey(local, true);

        if (!terms.has(key) && !terms.has(termKey(local, false)))
        {
            terms.set(key, { value: local, category: 'ACCOUNT', aliasOf: undefined, score: detection.score, requiresUppercase: false });
        }
    }

    return terms;
};

const MIN_USERNAME_LENGTH = 5;

// first.last, first_last, firstlast, f.last, f_last, flast, in lowercase and as written
const usernameVariants = (name: string): string[] =>
{
    const parts = name.replace(/['’]s$/u, '').split(/\s+/).filter((part) => /^\p{L}+$/u.test(part));

    if (parts.length < 2)
    {
        return [];
    }

    const first = parts[0]!;
    const last = parts.at(-1)!;
    const spellings = [first + '.' + last, first + '_' + last, first + last, first[0] + '.' + last, first[0] + '_' + last, first[0] + last];

    return [...new Set([...spellings, ...spellings.map((spelling) => spelling.toLowerCase())])].filter(
        (spelling) => spelling.length >= MIN_USERNAME_LENGTH,
    );
};

// protected ranges are plain spans, detections carry a category
const isDetection = (range: Span): range is Detection =>
{
    return 'category' in range;
};

// case-insensitive terms are keyed lowercase, case-sensitive ones by exact spelling
const termKey = (value: string, caseInsensitive: boolean): string =>
{
    return caseInsensitive ? `i:${value.toLowerCase()}` : `s:${value}`;
};

const isWholeWord = (text: string, start: number, end: number): boolean =>
{
    const before = start > 0 ? text[start - 1]! : '';
    const after = end < text.length ? text[end]! : '';

    return !WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after);
};

const escapeRegExp = (value: string): string =>
{
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
