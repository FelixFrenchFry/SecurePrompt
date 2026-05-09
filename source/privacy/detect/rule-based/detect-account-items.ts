import cardValidator from 'card-validator';
import germanTaxIdValidator from 'german-tax-id-validator';
import { isValidBIC, isValidIBAN } from 'ibantools';
import { checkVAT, countries } from 'jsvat';
import type { SensitiveItem } from '../../types';

const ACCOUNT_DETECTION_CONFIDENCE = 0.95;
const ACCOUNT_CONTEXT_LOOKBEHIND = 80;
const IBAN_START_PATTERN = /\b[A-Z]{2}\d{2}/g;
const BIC_CANDIDATE_PATTERN = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;
const CARD_CANDIDATE_PATTERN = /\b\d(?:[ -]?\d){12,18}\b/g;
const GERMAN_TAX_ID_CANDIDATE_PATTERN = /\b\d(?:[ -]?\d){10}\b/g;
const VAT_ID_CANDIDATE_PATTERN = /\b[A-Z]{2}[A-Z0-9](?:[.-]?[A-Z0-9]){3,13}\b/g;
const US_SSN_CANDIDATE_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const US_TAX_COMPACT_CANDIDATE_PATTERN = /\b\d{9}\b/g;
const US_EIN_CANDIDATE_PATTERN = /\b\d{2}-\d{7}\b/g;

const US_SSN_CONTEXT_LABELS = [
    'itin',
    'social security',
    'social security number',
    'ssn',
    'taxpayer identification',
    'tin',
];

const US_EIN_CONTEXT_LABELS = [
    'ein',
    'employer id',
    'employer identification',
    'employer identification number',
    'federal tax id',
    'federal tax identification',
    'fein',
];

const US_ROUTING_CONTEXT_LABELS = [
    'aba',
    'aba routing',
    'ach',
    'routing',
    'routing number',
    'wire routing',
];

type AccountCandidate = {
    start: number;
    end: number;
    value: string;
};

// using 'ibantools', 'card-validator', 'german-tax-id-validator', and 'jsvat' for account detection
export const detectAccountItems = (inputText: string): SensitiveItem[] =>
{
    const candidates = [
        ...detectIbanAccountCandidates(inputText),
        ...detectBicAccountCandidates(inputText),
        ...detectCardAccountCandidates(inputText),
        ...detectGermanTaxIdAccountCandidates(inputText),
        ...detectVatIdAccountCandidates(inputText),
        ...detectUsSsnAccountCandidates(inputText),
        ...detectUsEinAccountCandidates(inputText),
        ...detectUsRoutingAccountCandidates(inputText),
    ];
    const finalCandidates = mergeAccountCandidates(candidates);

    return finalCandidates.map((match, index) => ({
        id: `account-${String(index + 1).padStart(3, '0')}`,
        category: 'ACCOUNT',
        start: match.start,
        end: match.end,
        value: inputText.slice(match.start, match.end),
        confidence: ACCOUNT_DETECTION_CONFIDENCE,
        source: 'rules',
    }));
};

const detectIbanAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(IBAN_START_PATTERN)]
        .map((match) =>
        {
            return createIbanAccountCandidate(inputText, match.index);
        })
        .filter((candidate) => candidate != null);
};

const createIbanAccountCandidate = (
    inputText: string,
    start: number,
): AccountCandidate | null =>
{
    let end = start;
    let normalizedValue = '';

    while (end < inputText.length)
    {
        const character = inputText[end];

        if (/[A-Z0-9]/.test(character))
        {
            normalizedValue += character;

            if (normalizedValue.length > 34)
            {
                break;
            }

            if (isValidIBAN(normalizedValue))
            {
                return createAccountCandidate(
                    inputText,
                    start,
                    end + 1,
                    isValidIbanValue,
                );
            }
        }
        else if (character !== ' ' && character !== '\t')
        {
            break;
        }

        end += 1;
    }

    return null;
};

const detectBicAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(BIC_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidBicValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectCardAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(CARD_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidCardValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectGermanTaxIdAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(GERMAN_TAX_ID_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidGermanTaxIdValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectVatIdAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(VAT_ID_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidVatIdValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectUsSsnAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    const strictFormatCandidates = [...inputText.matchAll(US_SSN_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidUsSsnOrItinValue,
            );
        })
        .filter((candidate) => candidate != null);
    const compactCandidates = [...inputText.matchAll(US_TAX_COMPACT_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createContextRequiredAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidUsSsnOrItinValue,
                US_SSN_CONTEXT_LABELS,
            );
        })
        .filter((candidate) => candidate != null);

    return [...strictFormatCandidates, ...compactCandidates];
};

const detectUsEinAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(US_EIN_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createContextRequiredAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidUsEinValue,
                US_EIN_CONTEXT_LABELS,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectUsRoutingAccountCandidates = (inputText: string): AccountCandidate[] =>
{
    return [...inputText.matchAll(US_TAX_COMPACT_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createContextRequiredAccountCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidUsRoutingNumberValue,
                US_ROUTING_CONTEXT_LABELS,
            );
        })
        .filter((candidate) => candidate != null);
};

const createContextRequiredAccountCandidate = (
    inputText: string,
    start: number,
    end: number,
    isValidValue: (value: string) => boolean,
    contextLabels: string[],
): AccountCandidate | null =>
{
    if (!hasAccountContextLabel(inputText, start, contextLabels))
    {
        return null;
    }

    return createAccountCandidate(inputText, start, end, isValidValue);
};

const createAccountCandidate = (
    inputText: string,
    start: number,
    end: number,
    isValidValue: (value: string) => boolean,
): AccountCandidate | null =>
{
    const trimmedRange = trimAccountCandidateRange(inputText, start, end);
    const value = inputText.slice(trimmedRange.start, trimmedRange.end);

    if (!isValidValue(value))
    {
        return null;
    }

    const candidate = {
        start: trimmedRange.start,
        end: trimmedRange.end,
        value,
    };

    if (
        !hasValidAccountBoundaries(inputText, candidate) ||
        isRejectedAccountContext(inputText, candidate)
    )
    {
        return null;
    }

    return candidate;
};

const trimAccountCandidateRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let trimmedStart = start;
    let trimmedEnd = end;

    while (
        trimmedStart < trimmedEnd &&
        isLeadingAccountPunctuation(inputText[trimmedStart])
    )
    {
        trimmedStart += 1;
    }

    while (
        trimmedEnd > trimmedStart &&
        isTrailingAccountPunctuation(inputText[trimmedEnd - 1])
    )
    {
        trimmedEnd -= 1;
    }

    return {
        start: trimmedStart,
        end: trimmedEnd,
    };
};

const isValidIbanValue = (value: string) =>
{
    return isValidIBAN(normalizeAccountIdentifier(value));
};

const isValidBicValue = (value: string) =>
{
    return isValidBIC(value.toUpperCase());
};

const isValidCardValue = (value: string) =>
{
    const normalizedValue = normalizeDigits(value);
    const validation = cardValidator.number(normalizedValue);

    return validation.isValid === true;
};

const isValidGermanTaxIdValue = (value: string) =>
{
    return germanTaxIdValidator.validate(normalizeDigits(value));
};

const isValidVatIdValue = (value: string) =>
{
    const normalizedValue = normalizeVatIdentifier(value);

    if (!/^[A-Z]{2}[A-Z0-9]+$/.test(normalizedValue))
    {
        return false;
    }

    return checkVAT(normalizedValue, countries).isValid;
};

const isValidUsSsnOrItinValue = (value: string) =>
{
    const digits = normalizeDigits(value);

    return isValidUsSsnValue(digits) || isValidUsItinValue(digits);
};

const isValidUsSsnValue = (digits: string) =>
{
    if (!/^\d{9}$/.test(digits))
    {
        return false;
    }

    const area = Number(digits.slice(0, 3));
    const group = Number(digits.slice(3, 5));
    const serial = Number(digits.slice(5, 9));

    return (
        area > 0 &&
        area < 900 &&
        area !== 666 &&
        group > 0 &&
        serial > 0 &&
        digits !== '078051120' &&
        digits !== '219099999'
    );
};

const isValidUsItinValue = (digits: string) =>
{
    if (!/^9\d{8}$/.test(digits))
    {
        return false;
    }

    const group = Number(digits.slice(3, 5));
    const serial = Number(digits.slice(5, 9));

    return (
        isValidUsItinGroup(group) &&
        serial > 0
    );
};

const isValidUsEinValue = (value: string) =>
{
    const digits = normalizeDigits(value);

    return /^\d{9}$/.test(digits) && digits.slice(0, 2) !== '00';
};

const isValidUsRoutingNumberValue = (value: string) =>
{
    const digits = normalizeDigits(value);

    if (!/^\d{9}$/.test(digits) || digits === '000000000')
    {
        return false;
    }

    const checksum =
        3 * (Number(digits[0]) + Number(digits[3]) + Number(digits[6])) +
        7 * (Number(digits[1]) + Number(digits[4]) + Number(digits[7])) +
        Number(digits[2]) +
        Number(digits[5]) +
        Number(digits[8]);

    return checksum % 10 === 0;
};

const isValidUsItinGroup = (group: number) =>
{
    return (
        (group >= 50 && group <= 65) ||
        (group >= 70 && group <= 88) ||
        group === 90 ||
        group === 91 ||
        group === 92 ||
        (group >= 94 && group <= 99)
    );
};

const hasAccountContextLabel = (
    inputText: string,
    candidateStart: number,
    contextLabels: string[],
) =>
{
    const lineStart = inputText.lastIndexOf('\n', candidateStart - 1) + 1;
    const beforeCandidate = inputText
        .slice(Math.max(lineStart, candidateStart - ACCOUNT_CONTEXT_LOOKBEHIND), candidateStart)
        .toLowerCase();
    const normalizedLineContext = beforeCandidate.replace(/[^a-z0-9]+/g, ' ').trim();

    return contextLabels.some((label) =>
    {
        return new RegExp(`\\b${label}$`).test(normalizedLineContext);
    });
};

const hasValidAccountBoundaries = (
    inputText: string,
    candidate: AccountCandidate,
) =>
{
    const previousCharacter = inputText[candidate.start - 1];
    const nextCharacter = inputText[candidate.end];

    return (
        !isAccountBoundaryBlockingCharacter(previousCharacter) &&
        !isAccountBoundaryBlockingCharacter(nextCharacter)
    );
};

const isRejectedAccountContext = (
    inputText: string,
    candidate: AccountCandidate,
) =>
{
    return (
        isInsideNetworkContext(inputText, candidate) ||
        isInsideFilePathContext(inputText, candidate) ||
        isInsidePackagePathContext(inputText, candidate) ||
        hasIdentifierContinuation(inputText, candidate)
    );
};

const isInsideNetworkContext = (
    inputText: string,
    candidate: AccountCandidate,
) =>
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

const isInsideFilePathContext = (
    inputText: string,
    candidate: AccountCandidate,
) =>
{
    const token = getSurroundingToken(inputText, candidate);

    return (
        /^[a-z]:\\/i.test(token) ||
        token.includes('\\') ||
        (token.includes('/') && !token.includes('://') && token.startsWith('/'))
    );
};

const isInsidePackagePathContext = (
    inputText: string,
    candidate: AccountCandidate,
) =>
{
    const token = getSurroundingToken(inputText, candidate);

    return token.includes('/') && !token.includes('://') && token.startsWith('@');
};

const hasIdentifierContinuation = (
    inputText: string,
    candidate: AccountCandidate,
) =>
{
    const nextCharacters = inputText.slice(candidate.end, candidate.end + 8);

    return /^[-_][a-z]/i.test(nextCharacters);
};

const getSurroundingToken = (
    inputText: string,
    candidate: AccountCandidate,
) =>
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

const mergeAccountCandidates = (candidates: AccountCandidate[]) =>
{
    const sortedCandidates = [...candidates].sort(compareAccountCandidates);
    const finalCandidates: AccountCandidate[] = [];

    for (const candidate of sortedCandidates)
    {
        const overlapIndex = finalCandidates.findIndex((finalCandidate) =>
        {
            return accountCandidatesOverlap(candidate, finalCandidate);
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

const compareAccountCandidates = (left: AccountCandidate, right: AccountCandidate) =>
{
    return left.start - right.start || right.end - left.end;
};

const accountCandidatesOverlap = (
    left: AccountCandidate,
    right: AccountCandidate,
) =>
{
    return left.start < right.end && right.start < left.end;
};

const normalizeAccountIdentifier = (value: string) =>
{
    return value.replace(/[\s-]/g, '').toUpperCase();
};

const normalizeVatIdentifier = (value: string) =>
{
    return value.replace(/[\s.-]/g, '').toUpperCase();
};

const normalizeDigits = (value: string) =>
{
    return value.replace(/\D/g, '');
};

const isLeadingAccountPunctuation = (character: string | undefined) =>
{
    return character != null && /[<([{]/.test(character);
};

const isTrailingAccountPunctuation = (character: string | undefined) =>
{
    return character != null && /[.,;:!?)}\]]/.test(character);
};

const isAccountBoundaryBlockingCharacter = (character: string | undefined) =>
{
    return character != null && /[a-z0-9_:/#@-]/i.test(character);
};

const isTokenBoundary = (character: string | undefined) =>
{
    return character == null || /[\s"'<>[\](){}.,;:!?]/.test(character);
};
