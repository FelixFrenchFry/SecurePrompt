import { findNumbers, parsePhoneNumber } from 'awesome-phonenumber';
import { findPhoneNumbersInText } from 'libphonenumber-js/max';
import { DEFAULT_PHONE_REGION_CODE } from '../../config';
import type { SensitiveItem } from '../../types';

const PHONE_DETECTION_CONFIDENCE = 0.95;
const PHONE_DETECTION_MAX_TRIES = 100;
const PHONE_MIN_DIGIT_COUNT = 8;
const PHONE_CONTEXT_LOOKBEHIND = 80;
const PHONE_LIKE_CANDIDATE_PATTERN = /(?:\+|00|0)\d[\d \t()./-]{6,}\d/g;

const NON_PHONE_CONTEXT_LABELS = [
    'asset tag',
    'batch',
    'building code',
    'customer id',
    'invoice',
    'legacy id',
    'legacy system id',
    'order number',
    'reference',
    'serial',
    'sku',
    'system id',
    'ticket',
    'tracking id',
];

type PhoneCandidate = {
    start: number;
    end: number;
    value: string;
};

// using 'awesome-phonenumber' and 'libphonenumber-js' for phone detection
export const detectPhoneItems = (inputText: string): SensitiveItem[] =>
{
    const candidates = [
        ...detectPhoneCandidatesWithAwesomePhoneNumber(inputText),
        ...detectPhoneCandidatesWithLibPhoneNumber(inputText),
        ...detectNormalizedPhoneLikeCandidates(inputText),
    ];
    const finalCandidates = mergePhoneCandidates(candidates);

    return finalCandidates
        .map((match, index) => ({
            id: `phone-${String(index + 1).padStart(3, '0')}`,
            category: 'PHONE',
            start: match.start,
            end: match.end,
            value: inputText.slice(match.start, match.end),
            confidence: PHONE_DETECTION_CONFIDENCE,
            source: 'rules',
        }));
};

const detectPhoneCandidatesWithAwesomePhoneNumber = (inputText: string): PhoneCandidate[] =>
{
    return findNumbers(inputText, {
        defaultRegionCode: DEFAULT_PHONE_REGION_CODE,
        leniency: 'valid',
        maxTries: PHONE_DETECTION_MAX_TRIES,
    })
        .filter((match) => match.phoneNumber.valid)
        .map((match) => createPhoneCandidate(inputText, match.start, match.end))
        .filter((candidate) => candidate != null);
};

const detectPhoneCandidatesWithLibPhoneNumber = (inputText: string): PhoneCandidate[] =>
{
    return findPhoneNumbersInText(inputText, DEFAULT_PHONE_REGION_CODE)
        .filter((match) => match.number.isValid())
        .map((match) => createPhoneCandidate(inputText, match.startsAt, match.endsAt))
        .filter((candidate) => candidate != null);
};

const detectNormalizedPhoneLikeCandidates = (inputText: string): PhoneCandidate[] =>
{
    return [...inputText.matchAll(PHONE_LIKE_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createPhoneCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const createPhoneCandidate = (
    inputText: string,
    start: number,
    end: number,
): PhoneCandidate | null =>
{
    const expandedRange = expandPhoneCandidateRange(inputText, start, end);
    const value = inputText.slice(expandedRange.start, expandedRange.end);

    if (!isPlausiblePhoneCandidate(value))
    {
        return null;
    }

    const validationValue = normalizePhoneCandidateForValidation(value);
    const phoneNumber = parsePhoneNumber(validationValue, {
        regionCode: DEFAULT_PHONE_REGION_CODE,
    });

    if (!phoneNumber.valid)
    {
        return null;
    }

    const candidate = {
        start: expandedRange.start,
        end: expandedRange.end,
        value,
    };

    if (isRejectedPhoneContext(inputText, candidate))
    {
        return null;
    }

    return candidate;
};

const expandPhoneCandidateRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let expandedStart = start;
    let expandedEnd = end;

    // pull in adjacent phone-like characters to avoid partial masking
    while (expandedStart > 0 && isPhoneCandidateCharacter(inputText[expandedStart - 1]))
    {
        expandedStart -= 1;
    }

    while (
        expandedEnd < inputText.length &&
        isPhoneCandidateCharacter(inputText[expandedEnd])
    )
    {
        expandedEnd += 1;
    }

    while (
        expandedStart < expandedEnd &&
        !isPhoneStartCharacter(inputText[expandedStart])
    )
    {
        expandedStart += 1;
    }

    while (
        expandedEnd > expandedStart &&
        !isDigit(inputText[expandedEnd - 1])
    )
    {
        expandedEnd -= 1;
    }

    return {
        start: expandedStart,
        end: expandedEnd,
    };
};

const isPlausiblePhoneCandidate = (value: string) =>
{
    const digitCount = countDigits(value);

    return (
        digitCount >= PHONE_MIN_DIGIT_COUNT &&
        (value.startsWith('+') || value.startsWith('00') || value.startsWith('0'))
    );
};

const normalizePhoneCandidateForValidation = (value: string) =>
{
    return value
        .replace(/[\t/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const isRejectedPhoneContext = (inputText: string, candidate: PhoneCandidate) =>
{
    return (
        isInsideNetworkContext(inputText, candidate) ||
        isInsideFilePathContext(inputText, candidate) ||
        hasNonPhoneContextLabel(inputText, candidate) ||
        hasIdentifierContinuation(inputText, candidate)
    );
};

const isInsideNetworkContext = (inputText: string, candidate: PhoneCandidate) =>
{
    const token = getSurroundingToken(inputText, candidate);
    const lowerToken = token.toLowerCase();

    return (
        lowerToken.includes('://') ||
        lowerToken.startsWith('mailto:') ||
        lowerToken.includes('?') ||
        lowerToken.includes('&') ||
        lowerToken.includes('=')
    );
};

const isInsideFilePathContext = (inputText: string, candidate: PhoneCandidate) =>
{
    const token = getSurroundingToken(inputText, candidate);

    return (
        /^[a-z]:\\/i.test(token) ||
        token.includes('\\') ||
        (token.includes('/') && /\.[a-z0-9]{1,8}$/i.test(token))
    );
};

const hasNonPhoneContextLabel = (inputText: string, candidate: PhoneCandidate) =>
{
    const beforeCandidate = inputText
        .slice(Math.max(0, candidate.start - PHONE_CONTEXT_LOOKBEHIND), candidate.start)
        .toLowerCase();
    const normalizedContext = beforeCandidate.replace(/[^a-z0-9]+/g, ' ').trim();

    return NON_PHONE_CONTEXT_LABELS.some((label) =>
    {
        return new RegExp(`\\b${label}\\b`).test(normalizedContext);
    });
};

const hasIdentifierContinuation = (inputText: string, candidate: PhoneCandidate) =>
{
    const nextCharacters = inputText.slice(candidate.end, candidate.end + 8);

    return /^[-_][a-z]/i.test(nextCharacters);
};

const getSurroundingToken = (inputText: string, candidate: PhoneCandidate) =>
{
    let tokenStart = candidate.start;
    let tokenEnd = candidate.end;

    while (tokenStart > 0 && !isTokenBoundary(inputText[tokenStart - 1]))
    {
        tokenStart -= 1;
    }

    while (tokenEnd < inputText.length && !isTokenBoundary(inputText[tokenEnd]))
    {
        tokenEnd += 1;
    }

    return inputText.slice(tokenStart, tokenEnd);
};

const mergePhoneCandidates = (candidates: PhoneCandidate[]) =>
{
    const sortedCandidates = [...candidates].sort(comparePhoneCandidates);
    const finalCandidates: PhoneCandidate[] = [];

    for (const candidate of sortedCandidates)
    {
        const overlapIndex = finalCandidates.findIndex((finalCandidate) =>
        {
            return phoneCandidatesOverlap(candidate, finalCandidate);
        });

        if (overlapIndex === -1)
        {
            finalCandidates.push(candidate);
            continue;
        }

        if (candidate.value.length > finalCandidates[overlapIndex].value.length)
        {
            finalCandidates[overlapIndex] = candidate;
        }
    }

    return finalCandidates.sort((left, right) => left.start - right.start);
};

const comparePhoneCandidates = (left: PhoneCandidate, right: PhoneCandidate) =>
{
    return left.start - right.start || right.end - left.end;
};

const phoneCandidatesOverlap = (left: PhoneCandidate, right: PhoneCandidate) =>
{
    return left.start < right.end && right.start < left.end;
};

const isPhoneCandidateCharacter = (character: string | undefined) =>
{
    return character != null && /[+\d \t()./-]/.test(character);
};

const isPhoneStartCharacter = (character: string | undefined) =>
{
    return character != null && /[+\d]/.test(character);
};

const isDigit = (character: string | undefined) =>
{
    return character != null && /\d/.test(character);
};

const isTokenBoundary = (character: string | undefined) =>
{
    return character == null || /[\s"'<>[\](){}]/.test(character);
};

const countDigits = (value: string) =>
{
    return value.replace(/\D/g, '').length;
};
