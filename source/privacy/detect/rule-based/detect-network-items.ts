import ipRegex from 'ip-regex';
import ipaddr from 'ipaddr.js';
import { find } from 'linkifyjs';
import { parse } from 'tldts';
import type { SensitiveItem } from '../../types';

const NETWORK_DETECTION_CONFIDENCE = 0.95;
const NETWORK_CONTEXT_LOOKBEHIND = 60;
const NETWORK_SCHEME_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}]+/gi;
const MAILTO_PATTERN = /\bmailto:[^\s"'<>()[\]{}]+/gi;
const LOCALHOST_PATTERN = /\blocalhost(?::\d{1,5})?\b/gi;
const PRIVATE_HOST_PATTERN =
    /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:corp|home|internal|intranet|lan|local)(?::\d{1,5})?\b/gi;

const NON_NETWORK_CONTEXT_LABELS = [
    'asset tag',
    'dimension',
    'dimensions',
    'file path',
    'invoice',
    'measurement',
    'price',
    'release',
    'serial',
    'sku',
    'version',
];

const PRIVATE_NETWORK_SUFFIXES = [
    'corp',
    'home',
    'internal',
    'intranet',
    'lan',
    'local',
];

type NetworkCandidate = {
    start: number;
    end: number;
    value: string;
};

// using 'linkifyjs', 'tldts', 'ip-regex', and 'ipaddr.js' for network detection
export const detectNetworkItems = (inputText: string): SensitiveItem[] =>
{
    const candidates = [
        ...detectLinkifyNetworkCandidates(inputText),
        ...detectSchemeNetworkCandidates(inputText),
        ...detectMailtoNetworkCandidates(inputText),
        ...detectEmailNetworkExtensionCandidates(inputText),
        ...detectLocalhostNetworkCandidates(inputText),
        ...detectPrivateHostNetworkCandidates(inputText),
        ...detectIpAddressNetworkCandidates(inputText),
    ];
    const finalCandidates = mergeNetworkCandidates(candidates);

    return finalCandidates.map((match, index) => ({
        id: `network-${String(index + 1).padStart(3, '0')}`,
        category: 'NETWORK',
        start: match.start,
        end: match.end,
        value: inputText.slice(match.start, match.end),
        confidence: NETWORK_DETECTION_CONFIDENCE,
        source: 'rules',
    }));
};

const detectLinkifyNetworkCandidates = (inputText: string): NetworkCandidate[] =>
{
    return find(inputText, 'url')
        .filter((match) => match.type === 'url')
        .map((match) => createNetworkCandidate(inputText, match.start, match.end))
        .filter((candidate) => candidate != null);
};

const detectSchemeNetworkCandidates = (inputText: string): NetworkCandidate[] =>
{
    return [...inputText.matchAll(NETWORK_SCHEME_PATTERN)]
        .map((match) =>
        {
            return createNetworkCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectMailtoNetworkCandidates = (inputText: string): NetworkCandidate[] =>
{
    return [...inputText.matchAll(MAILTO_PATTERN)]
        .map((match) =>
        {
            return createNetworkCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectEmailNetworkExtensionCandidates = (
    inputText: string,
): NetworkCandidate[] =>
{
    return find(inputText, 'email')
        .filter((match) => match.type === 'email')
        .filter((match) => isEmailNetworkExtensionStart(inputText[match.end]))
        .map((match) =>
        {
            return createNetworkCandidate(
                inputText,
                match.start,
                getNetworkTokenEnd(inputText, match.end),
            );
        })
        .filter((candidate) => candidate != null);
};

const detectIpAddressNetworkCandidates = (inputText: string): NetworkCandidate[] =>
{
    return [...inputText.matchAll(ipRegex())]
        .map((match) =>
        {
            return createNetworkCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectLocalhostNetworkCandidates = (inputText: string): NetworkCandidate[] =>
{
    return [...inputText.matchAll(LOCALHOST_PATTERN)]
        .map((match) =>
        {
            return createNetworkCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectPrivateHostNetworkCandidates = (inputText: string): NetworkCandidate[] =>
{
    return [...inputText.matchAll(PRIVATE_HOST_PATTERN)]
        .map((match) =>
        {
            return createNetworkCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
            );
        })
        .filter((candidate) => candidate != null);
};

const createNetworkCandidate = (
    inputText: string,
    start: number,
    end: number,
): NetworkCandidate | null =>
{
    const trimmedRange = trimNetworkCandidateRange(inputText, start, end);
    const value = inputText.slice(trimmedRange.start, trimmedRange.end);

    if (!isValidNetworkValue(value))
    {
        return null;
    }

    const candidate = {
        start: trimmedRange.start,
        end: trimmedRange.end,
        value,
    };

    if (
        !hasValidNetworkBoundaries(inputText, candidate) ||
        isRejectedNetworkContext(inputText, candidate)
    )
    {
        return null;
    }

    return candidate;
};

const trimNetworkCandidateRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let trimmedStart = start;
    let trimmedEnd = end;

    while (
        trimmedStart < trimmedEnd &&
        isLeadingNetworkPunctuation(inputText[trimmedStart])
    )
    {
        trimmedStart += 1;
    }

    while (
        trimmedEnd > trimmedStart &&
        isTrailingNetworkPunctuation(inputText[trimmedEnd - 1])
    )
    {
        trimmedEnd -= 1;
    }

    return {
        start: trimmedStart,
        end: trimmedEnd,
    };
};

const isValidNetworkValue = (value: string) =>
{
    if (value.length === 0)
    {
        return false;
    }

    if (isValidMailtoValue(value))
    {
        return true;
    }

    if (isValidEmailNetworkExtensionValue(value))
    {
        return true;
    }

    if (isValidIpAddress(value))
    {
        return true;
    }

    if (hasExplicitNetworkScheme(value))
    {
        return isValidExplicitUrl(value);
    }

    return isValidHostValue(value);
};

const isValidMailtoValue = (value: string) =>
{
    if (!value.toLowerCase().startsWith('mailto:'))
    {
        return false;
    }

    const emailPart = value
        .slice('mailto:'.length)
        .split(/[?#]/)[0];

    return find(emailPart, 'email').some((match) =>
    {
        return match.type === 'email' && match.start === 0 && match.end === emailPart.length;
    });
};

const isValidEmailNetworkExtensionValue = (value: string) =>
{
    const extensionStart = value.search(/[?#\/]/);

    if (extensionStart === -1)
    {
        return false;
    }

    const emailPart = value.slice(0, extensionStart);
    const suffix = value.slice(extensionStart);

    return (
        suffix.length > 1 &&
        find(emailPart, 'email').some((match) =>
        {
            return (
                match.type === 'email' &&
                match.start === 0 &&
                match.end === emailPart.length
            );
        })
    );
};

const isValidIpAddress = (value: string) =>
{
    const withoutBrackets = value.replace(/^\[/, '').replace(/\]$/, '');

    return ipaddr.isValid(withoutBrackets);
};

const hasExplicitNetworkScheme = (value: string) =>
{
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
};

const isValidExplicitUrl = (value: string) =>
{
    try
    {
        const url = new URL(value);
        const protocol = url.protocol.toLowerCase();

        if (protocol === 'http:' || protocol === 'https:')
        {
            return isValidUrlHostname(url.hostname);
        }

        return url.protocol.length > 1 && url.hostname.length > 0;
    }
    catch
    {
        return false;
    }
};

const isValidHostValue = (value: string) =>
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
        isValidPublicHostname(hostname, parsed.domain, parsed.publicSuffix) ||
        isValidPrivateHostname(hostname)
    );
};

const isLocalhostValue = (value: string) =>
{
    return /^localhost(?::\d{1,5})?$/i.test(value);
};

const isValidUrlHostname = (hostname: string) =>
{
    const normalizedHostname = hostname.replace(/^\[/, '').replace(/\]$/, '');

    if (ipaddr.isValid(normalizedHostname) || /^localhost$/i.test(normalizedHostname))
    {
        return true;
    }

    const parsed = parse(normalizedHostname);

    return (
        isValidPublicHostname(
            normalizedHostname,
            parsed.domain,
            parsed.publicSuffix,
        ) || isValidPrivateHostname(normalizedHostname)
    );
};

const isValidPublicHostname = (
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

const isValidPrivateHostname = (hostname: string) =>
{
    const labels = hostname.toLowerCase().split('.');
    const suffix = labels.at(-1) ?? '';

    return (
        labels.length >= 2 &&
        PRIVATE_NETWORK_SUFFIXES.includes(suffix) &&
        labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    );
};

const hasValidNetworkBoundaries = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    const previousCharacter = inputText[candidate.start - 1];

    return (
        !isPreviousNetworkBoundaryBlockingCharacter(previousCharacter) &&
        !isNextNetworkBoundaryBlockingCharacter(inputText, candidate.end)
    );
};

const isRejectedNetworkContext = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    return (
        isInsideFilePathContext(inputText, candidate) ||
        hasNonNetworkContextLabel(inputText, candidate) ||
        hasSeparatedAtSignContext(inputText, candidate) ||
        hasAdjacentEmailAtSignContext(inputText, candidate) ||
        isInsidePackagePathContext(inputText, candidate)
    );
};

const isInsideFilePathContext = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    const token = getSurroundingToken(inputText, candidate);

    return (
        /^[a-z]:\\/i.test(token) ||
        token.includes('\\') ||
        (token.includes('/') && !token.includes('://') && token.startsWith('/'))
    );
};

const hasNonNetworkContextLabel = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    const lineStart = inputText.lastIndexOf('\n', candidate.start - 1) + 1;
    const beforeCandidate = inputText
        .slice(Math.max(lineStart, candidate.start - NETWORK_CONTEXT_LOOKBEHIND), candidate.start)
        .toLowerCase();
    const normalizedLineContext = beforeCandidate.replace(/[^a-z0-9]+/g, ' ').trim();

    return NON_NETWORK_CONTEXT_LABELS.some((label) =>
    {
        return new RegExp(`\\b${label}$`).test(normalizedLineContext);
    });
};

const hasSeparatedAtSignContext = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    const beforeCandidate = inputText.slice(Math.max(0, candidate.start - 8), candidate.start);

    return /@\s*["'(<[]*$/.test(beforeCandidate);
};

const hasAdjacentEmailAtSignContext = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    const afterCandidate = inputText.slice(candidate.end, candidate.end + 8);

    return /^["')>\]]*\s*@/.test(afterCandidate);
};

const isInsidePackagePathContext = (
    inputText: string,
    candidate: NetworkCandidate,
) =>
{
    const token = getSurroundingToken(inputText, candidate);

    return token.includes('/') && !token.includes('://') && token.startsWith('@');
};

const getNetworkTokenEnd = (inputText: string, start: number) =>
{
    let end = start;

    while (end < inputText.length && !isTokenBoundary(inputText[end]))
    {
        end += 1;
    }

    return end;
};

const getSurroundingToken = (
    inputText: string,
    candidate: NetworkCandidate,
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

const mergeNetworkCandidates = (candidates: NetworkCandidate[]) =>
{
    const sortedCandidates = [...candidates].sort(compareNetworkCandidates);
    const finalCandidates: NetworkCandidate[] = [];

    for (const candidate of sortedCandidates)
    {
        const overlapIndex = finalCandidates.findIndex((finalCandidate) =>
        {
            return networkCandidatesOverlap(candidate, finalCandidate);
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

const compareNetworkCandidates = (left: NetworkCandidate, right: NetworkCandidate) =>
{
    return left.start - right.start || right.end - left.end;
};

const networkCandidatesOverlap = (
    left: NetworkCandidate,
    right: NetworkCandidate,
) =>
{
    return left.start < right.end && right.start < left.end;
};

const isLeadingNetworkPunctuation = (character: string | undefined) =>
{
    return character != null && /[<([{]/.test(character);
};

const isEmailNetworkExtensionStart = (character: string | undefined) =>
{
    return character != null && /[?#\/]/.test(character);
};

const isTrailingNetworkPunctuation = (character: string | undefined) =>
{
    return character != null && /[.,;:!?)}\]]/.test(character);
};

const isPreviousNetworkBoundaryBlockingCharacter = (
    character: string | undefined,
) =>
{
    return character != null && /[a-z0-9_.:/#-]/i.test(character);
};

const isNextNetworkBoundaryBlockingCharacter = (
    inputText: string,
    nextIndex: number,
) =>
{
    const character = inputText[nextIndex];

    if (character == null)
    {
        return false;
    }

    if (/[a-z0-9_:-]/i.test(character))
    {
        return true;
    }

    // a dot followed by text means the detector probably found a partial value
    if (character === '.')
    {
        return /[a-z0-9]/i.test(inputText[nextIndex + 1]);
    }

    return false;
};

const isTokenBoundary = (character: string | undefined) =>
{
    return character == null || /[\s"'<>[\](){}]/.test(character);
};
