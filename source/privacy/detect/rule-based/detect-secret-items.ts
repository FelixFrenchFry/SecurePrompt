import type { SensitiveItem } from '../../types';

const SECRET_DETECTION_CONFIDENCE = 0.95;
const GENERIC_SECRET_MIN_ENTROPY = 3;
const PASSWORD_MIN_LENGTH = 6;
const GENERIC_SECRET_MIN_LENGTH = 12;

const PRIVATE_KEY_PATTERN =
    /-----BEGIN ([A-Z ]*PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?-----END \1-----/g;
const JWT_CANDIDATE_PATTERN =
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const AUTH_HEADER_PATTERN =
    /\b(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic|token)\s+([A-Za-z0-9._~+/-]{12,}=*)/gi;
const CONNECTION_STRING_PATTERN =
    /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^\s"'<>()[\]{}]+/gi;
const GENERIC_SECRET_ASSIGNMENT_PATTERN =
    /\b(api[\s_-]*key|access[\s_-]*token|auth[\s_-]*token|refresh[\s_-]*token|aws[\s_-]*secret[\s_-]*access[\s_-]*key|azure[\s_-]*client[\s_-]*secret|cf[\s_-]*api[\s_-]*token|client[\s_-]*secret|docker[\s_-]*auth|private[\s_-]*key|registry[\s_-]*auth|secret[\s_-]*key|secret|token|password|passwd|pwd)\b\s*[:=]\s*(["'`]?)([^"'`\s,;]{6,})\2/gi;

const PROVIDER_TOKEN_PATTERNS = [
    /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    /\bAIza[0-9A-Za-z_-]{30,60}\b/g,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{22,}_[A-Za-z0-9_]{59,}\b/g,
    /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    /\bnpm_[A-Za-z0-9]{36}\b/g,
    /\blin_api_[A-Za-z0-9]{32,}\b/g,
    /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    /\bSK[0-9a-fA-F]{32}\b/g,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\bhf_[A-Za-z0-9]{30,}\b/g,
];

const WEBHOOK_PATTERNS = [
    /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{8,}\/[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/g,
    /https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{40,}/g,
];

const PASSWORD_KEYWORDS = [
    'password',
    'passwd',
    'pwd',
];

const IGNORED_GENERIC_SECRET_VALUES = [
    'changeme',
    'example',
    'example_secret',
    'masked',
    'none',
    'not_set',
    'null',
    'password',
    'placeholder',
    'redacted',
    'secret',
    'todo',
    'undefined',
    'your_api_key',
    'your_token_here',
];

type SecretCandidate = {
    start: number;
    end: number;
    value: string;
};

// using local provider rules, structured token checks, and generic secret assignments for secret detection
export const detectSecretItems = (inputText: string): SensitiveItem[] =>
{
    const candidates = [
        ...detectProviderTokenItems(inputText),
        ...detectPrivateKeyItems(inputText),
        ...detectJwtItems(inputText),
        ...detectAuthHeaderItems(inputText),
        ...detectConnectionStringItems(inputText),
        ...detectWebhookItems(inputText),
        ...detectGenericSecretAssignmentItems(inputText),
    ];
    const finalCandidates = mergeSecretCandidates(candidates);

    return finalCandidates.map((match, index) => ({
        id: `secret-${String(index + 1).padStart(3, '0')}`,
        category: 'SECRET',
        start: match.start,
        end: match.end,
        value: inputText.slice(match.start, match.end),
        confidence: SECRET_DETECTION_CONFIDENCE,
        source: 'rules',
    }));
};

const detectProviderTokenItems = (inputText: string): SecretCandidate[] =>
{
    return PROVIDER_TOKEN_PATTERNS.flatMap((pattern) =>
    {
        return [...inputText.matchAll(pattern)]
            .map((match) =>
            {
                return createSecretCandidate(
                    inputText,
                    match.index,
                    match.index + match[0].length,
                    () => true,
                );
            })
            .filter((candidate) => candidate != null);
    });
};

const detectPrivateKeyItems = (inputText: string): SecretCandidate[] =>
{
    return [...inputText.matchAll(PRIVATE_KEY_PATTERN)]
        .map((match) =>
        {
            return createSecretCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                () => true,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectJwtItems = (inputText: string): SecretCandidate[] =>
{
    return [...inputText.matchAll(JWT_CANDIDATE_PATTERN)]
        .map((match) =>
        {
            return createSecretCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidJwtValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectAuthHeaderItems = (inputText: string): SecretCandidate[] =>
{
    return [...inputText.matchAll(AUTH_HEADER_PATTERN)]
        .map((match) =>
        {
            const token = match[1];

            return createSecretCandidate(
                inputText,
                match.index + match[0].lastIndexOf(token),
                match.index + match[0].lastIndexOf(token) + token.length,
                isValidAuthHeaderTokenValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectConnectionStringItems = (inputText: string): SecretCandidate[] =>
{
    return [...inputText.matchAll(CONNECTION_STRING_PATTERN)]
        .map((match) =>
        {
            return createSecretCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                isValidConnectionStringValue,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectWebhookItems = (inputText: string): SecretCandidate[] =>
{
    return WEBHOOK_PATTERNS.flatMap((pattern) =>
    {
        return [...inputText.matchAll(pattern)]
            .map((match) =>
            {
                return createSecretCandidate(
                    inputText,
                    match.index,
                    match.index + match[0].length,
                    () => true,
                );
            })
            .filter((candidate) => candidate != null);
    });
};

const detectGenericSecretAssignmentItems = (inputText: string): SecretCandidate[] =>
{
    return [...inputText.matchAll(GENERIC_SECRET_ASSIGNMENT_PATTERN)]
        .map((match) =>
        {
            const keyword = match[1];
            const value = match[3];

            return createSecretCandidate(
                inputText,
                match.index + match[0].lastIndexOf(value),
                match.index + match[0].lastIndexOf(value) + value.length,
                (candidateValue) => isValidGenericSecretValue(keyword, candidateValue),
            );
        })
        .filter((candidate) => candidate != null);
};

const createSecretCandidate = (
    inputText: string,
    start: number,
    end: number,
    isValidValue: (value: string) => boolean,
): SecretCandidate | null =>
{
    const trimmedRange = trimSecretCandidateRange(inputText, start, end);
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

    if (!hasValidSecretBoundaries(inputText, candidate))
    {
        return null;
    }

    return candidate;
};

const trimSecretCandidateRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let trimmedStart = start;
    let trimmedEnd = end;

    while (
        trimmedStart < trimmedEnd &&
        isLeadingSecretPunctuation(inputText[trimmedStart])
    )
    {
        trimmedStart += 1;
    }

    while (
        trimmedEnd > trimmedStart &&
        isTrailingSecretPunctuation(inputText[trimmedEnd - 1])
    )
    {
        trimmedEnd -= 1;
    }

    return {
        start: trimmedStart,
        end: trimmedEnd,
    };
};

const isValidJwtValue = (value: string) =>
{
    const parts = value.split('.');

    if (parts.length !== 3)
    {
        return false;
    }

    const header = parseBase64UrlJson(parts[0]);
    const payload = parseBase64UrlJson(parts[1]);

    return (
        header != null &&
        payload != null &&
        typeof header.alg === 'string' &&
        header.alg.toLowerCase() !== 'none'
    );
};

const isValidConnectionStringValue = (value: string) =>
{
    try
    {
        const url = new URL(value);

        return (
            url.protocol.length > 1 &&
            url.hostname.length > 0 &&
            (url.username.length > 0 || url.password.length > 0) &&
            value.includes('@')
        );
    }
    catch
    {
        return false;
    }
};

const isValidAuthHeaderTokenValue = (value: string) =>
{
    if (isJwtLikeValue(value))
    {
        return isValidJwtValue(value);
    }

    return (
        value.length >= GENERIC_SECRET_MIN_LENGTH &&
        calculateShannonEntropy(value) >= GENERIC_SECRET_MIN_ENTROPY
    );
};

const isValidGenericSecretValue = (keyword: string, value: string) =>
{
    const normalizedKeyword = keyword.toLowerCase().replace(/[\s-]+/g, '_');
    const normalizedValue = value.toLowerCase().replace(/-/g, '_');

    if (
        IGNORED_GENERIC_SECRET_VALUES.includes(normalizedValue) ||
        /^[A-Z]+_\d{3}$/.test(value)
    )
    {
        return false;
    }

    if (PASSWORD_KEYWORDS.includes(normalizedKeyword))
    {
        return value.length >= PASSWORD_MIN_LENGTH;
    }

    return (
        value.length >= GENERIC_SECRET_MIN_LENGTH &&
        calculateShannonEntropy(value) >= GENERIC_SECRET_MIN_ENTROPY
    );
};

const isJwtLikeValue = (value: string) =>
{
    return value.startsWith('eyJ') && value.split('.').length === 3;
};

const parseBase64UrlJson = (value: string) =>
{
    try
    {
        const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/');
        const paddedValue = normalizedValue.padEnd(
            normalizedValue.length + ((4 - (normalizedValue.length % 4)) % 4),
            '=',
        );

        return JSON.parse(atob(paddedValue)) as Record<string, unknown>;
    }
    catch
    {
        return null;
    }
};

const calculateShannonEntropy = (value: string) =>
{
    const characterCounts = new Map<string, number>();

    for (const character of value)
    {
        characterCounts.set(character, (characterCounts.get(character) ?? 0) + 1);
    }

    return [...characterCounts.values()].reduce((entropy, count) =>
    {
        const probability = count / value.length;

        return entropy - probability * Math.log2(probability);
    }, 0);
};

const mergeSecretCandidates = (candidates: SecretCandidate[]) =>
{
    const sortedCandidates = [...candidates].sort(compareSecretCandidates);
    const finalCandidates: SecretCandidate[] = [];

    for (const candidate of sortedCandidates)
    {
        const overlapIndex = finalCandidates.findIndex((finalCandidate) =>
        {
            return secretCandidatesOverlap(candidate, finalCandidate);
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

const compareSecretCandidates = (left: SecretCandidate, right: SecretCandidate) =>
{
    return left.start - right.start || right.end - left.end;
};

const secretCandidatesOverlap = (
    left: SecretCandidate,
    right: SecretCandidate,
) =>
{
    return left.start < right.end && right.start < left.end;
};

const hasValidSecretBoundaries = (
    inputText: string,
    candidate: SecretCandidate,
) =>
{
    const previousCharacter = inputText[candidate.start - 1];
    const nextCharacter = inputText[candidate.end];

    return (
        !isSecretBoundaryBlockingCharacter(previousCharacter) &&
        !isSecretBoundaryBlockingCharacter(nextCharacter)
    );
};

const isLeadingSecretPunctuation = (character: string | undefined) =>
{
    return character != null && /[<([{]/.test(character);
};

const isTrailingSecretPunctuation = (character: string | undefined) =>
{
    return character != null && /[.,;:!?)}\]]/.test(character);
};

const isSecretBoundaryBlockingCharacter = (character: string | undefined) =>
{
    return character != null && /[a-z0-9_]/i.test(character);
};
