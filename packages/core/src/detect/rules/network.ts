import { createRuleDetector, keepLongest, type RuleMatch } from './rule';

// URLs, IPv4/IPv6 and MAC addresses, each structurally validated (emails are left to the model)
// URLs with credentials and webhooks also match the secret rule, which wins the overlap

const URL_PATTERN = /(?<![\p{L}\p{N}_])(?:https?|ftp|wss?):\/\/[^\s<>"'`]+|(?<![\p{L}\p{N}_.@/])www\.[^\s<>"'`]+/giu;
// characters that end a sentence rather than the URL
const TRAILING = /[.,;:!?'"»]+$/;
const HOST_LABEL = /^(?!-)[\p{L}\p{N}-]{1,63}(?<!-)$/u;

// drops trailing punctuation and an unbalanced closing bracket: "(see https://x.de/a)." → x.de/a
const trimUrl = (url: string): string =>
{
    let trimmed = url.replace(TRAILING, '');

    while (/[)\]}]$/.test(trimmed))
    {
        const closing = trimmed.at(-1)!;
        const opening = { ')': '(', ']': '[', '}': '{' }[closing]!;

        if (trimmed.split(opening).length >= trimmed.split(closing).length)
        {
            break;
        }

        trimmed = trimmed.slice(0, -1).replace(TRAILING, '');
    }

    return trimmed;
};

const hostOf = (url: string): string | null =>
{
    const match = /^(?:[a-z]+:\/\/)?(?:[^@/?#\s]*@)?(\[[^\]]+\]|[^:/?#\s]+)/i.exec(url);

    return match?.[1] ?? null;
};

export const isValidIpv4 = (value: string): boolean =>
{
    const parts = value.split('.');

    return (
        parts.length === 4 &&
        parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && (part === '0' || !part.startsWith('0')))
    );
};

export const isValidIpv6 = (value: string): boolean =>
{
    let address = value;
    const groupsNeeded = 8;

    // an embedded IPv4 tail (::ffff:192.0.2.1) counts as two groups
    const ipv4Tail = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);

    if (ipv4Tail != null)
    {
        if (!isValidIpv4(ipv4Tail[1]!))
        {
            return false;
        }

        address = `${address.slice(0, -ipv4Tail[1]!.length)}0:0`;
    }

    const halves = address.split('::');

    if (halves.length > 2)
    {
        return false;
    }

    const groups = halves.flatMap((half) => (half === '' ? [] : half.split(':')));

    if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group)))
    {
        return false;
    }

    // with '::' some groups are implied, so fewer may be written
    return halves.length === 2 ? groups.length < groupsNeeded : groups.length === groupsNeeded;
};

const isValidHost = (host: string): boolean =>
{
    if (host.startsWith('['))
    {
        return isValidIpv6(host.slice(1, -1));
    }

    if (/^[\d.]+$/.test(host))
    {
        return isValidIpv4(host);
    }

    const labels = host.split('.');

    // a dotted name with a letter-only top-level label, or a single-label host like localhost
    return labels.every((label) => HOST_LABEL.test(label)) && (labels.length === 1 || /^\p{L}{2,}$/u.test(labels.at(-1)!));
};

const IPV4 = /(?<![\p{L}\p{N}_.])\d{1,3}(?:\.\d{1,3}){3}(?![\p{L}\p{N}_]|\.\d)/gu;
// hex groups with at least two colons, the IPv4 tail first so '::ffff:192.0.2.1' stays whole
const IPV6 = /(?<![\p{L}\p{N}_:])(?:[0-9a-f]{0,4}:){2,7}(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]{0,4})(?![\p{L}\p{N}_:]|\.\d)/giu;
const MAC = /(?<![\p{L}\p{N}_:-])[0-9a-f]{2}([:-])(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}(?![\p{L}\p{N}_:-])/giu;

export const findNetwork = (text: string): RuleMatch[] =>
{
    const matches: RuleMatch[] = [];

    for (const match of text.matchAll(URL_PATTERN))
    {
        const url = trimUrl(match[0]);
        const host = hostOf(url);

        if (host != null && isValidHost(host))
        {
            matches.push({ start: match.index, end: match.index + url.length, category: 'NETWORK', validated: true });
        }
    }

    for (const match of text.matchAll(IPV4))
    {
        if (isValidIpv4(match[0]))
        {
            matches.push({ start: match.index, end: match.index + match[0].length, category: 'NETWORK', validated: true });
        }
    }

    for (const match of text.matchAll(IPV6))
    {
        // needs a decimal digit, like real addresses ("fe80::1") and unlike code ("dead::beef")
        if (/\d/.test(match[0]) && isValidIpv6(match[0]))
        {
            matches.push({ start: match.index, end: match.index + match[0].length, category: 'NETWORK', validated: true });
        }
    }

    for (const match of text.matchAll(MAC))
    {
        matches.push({ start: match.index, end: match.index + match[0].length, category: 'NETWORK', validated: true });
    }

    return keepLongest(matches);
};

export const networkRule = createRuleDetector('network', findNetwork);
