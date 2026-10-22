import { find } from 'linkifyjs';
import type { SensitiveItem } from '../../types';

const EMAIL_DETECTION_CONFIDENCE = 0.95;
const STRICT_EMAIL_PATTERN =
    /\b[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z]{2,63})+\b/gi;
const QUOTED_EMAIL_PATTERN =
    /"[^"\r\n]{1,64}"@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z]{2,63})+\b/gi;
const DOMAIN_LITERAL_EMAIL_PATTERN =
    /\b[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@\[(?:\d{1,3}\.){3}\d{1,3}\]/gi;

type EmailCandidate = {
    start: number;
    end: number;
    value: string;
};

// using 'linkifyjs' and a strict local fallback for email detection
export const detectEmailItems = (inputText: string): SensitiveItem[] =>
{
    const candidates = [
        ...detectLinkifyEmailCandidates(inputText),
        ...detectStrictEmailCandidates(inputText),
        ...detectQuotedEmailCandidates(inputText),
        ...detectDomainLiteralEmailCandidates(inputText),
    ];
    const finalCandidates = mergeEmailCandidates(candidates);

    return finalCandidates.map((match, index) => ({
        id: `email-${String(index + 1).padStart(3, '0')}`,
        category: 'EMAIL',
        start: match.start,
        end: match.end,
        value: match.value,
        confidence: EMAIL_DETECTION_CONFIDENCE,
        source: 'rules',
    }));
};

const detectLinkifyEmailCandidates = (inputText: string): EmailCandidate[] =>
{
    return find(inputText, 'email')
        .filter((match) => match.type === 'email')
        .map((match) => createEmailCandidate(inputText, match.start, match.end))
        .filter((candidate) => candidate != null);
};

const detectStrictEmailCandidates = (inputText: string): EmailCandidate[] =>
{
    return [...inputText.matchAll(STRICT_EMAIL_PATTERN)]
        .map((match) =>
        {
            return createEmailCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectQuotedEmailCandidates = (inputText: string): EmailCandidate[] =>
{
    return [...inputText.matchAll(QUOTED_EMAIL_PATTERN)]
        .map((match) =>
        {
            return createEmailCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectDomainLiteralEmailCandidates = (inputText: string): EmailCandidate[] =>
{
    return [...inputText.matchAll(DOMAIN_LITERAL_EMAIL_PATTERN)]
        .filter((match) => isValidEmailDomainLiteral(match[0]))
        .map((match) =>
        {
            return createEmailCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const createEmailCandidate = (
    inputText: string,
    start: number,
    end: number,
): EmailCandidate | null =>
{
    const candidate = {
        start,
        end,
        value: inputText.slice(start, end),
    };

    if (!hasValidEmailBoundaries(inputText, candidate))
    {
        return null;
    }

    return candidate;
};

const hasValidEmailBoundaries = (
    inputText: string,
    candidate: EmailCandidate,
) =>
{
    const previousCharacter = inputText[candidate.start - 1];
    const nextCharacter = inputText[candidate.end];

    return (
        !isEmailBoundaryBlockingCharacter(previousCharacter) &&
        !isEmailBoundaryBlockingCharacter(nextCharacter)
    );
};

const mergeEmailCandidates = (candidates: EmailCandidate[]) =>
{
    const sortedCandidates = [...candidates].sort(compareEmailCandidates);
    const finalCandidates: EmailCandidate[] = [];

    for (const candidate of sortedCandidates)
    {
        const overlapIndex = finalCandidates.findIndex((finalCandidate) =>
        {
            return emailCandidatesOverlap(candidate, finalCandidate);
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

const compareEmailCandidates = (left: EmailCandidate, right: EmailCandidate) =>
{
    return left.start - right.start || right.end - left.end;
};

const emailCandidatesOverlap = (left: EmailCandidate, right: EmailCandidate) =>
{
    return left.start < right.end && right.start < left.end;
};

const isValidEmailDomainLiteral = (value: string) =>
{
    const address = value.slice(value.lastIndexOf('@[') + 2, -1);
    const octets = address.split('.');

    return (
        octets.length === 4 &&
        octets.every((octet) =>
        {
            return /^\d{1,3}$/.test(octet) && Number(octet) <= 255;
        })
    );
};

const isEmailBoundaryBlockingCharacter = (character: string | undefined) =>
{
    return character != null && /[a-z0-9._%+-]/i.test(character);
};
