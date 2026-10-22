import { createRuleDetector, keepLongest, type RuleMatch } from './rule';

// secrets with a published or structural format, without entropy or keyword guessing

type TokenFormat = { name: string; pattern: RegExp };

// provider token formats (prefix + alphabet + length), from the providers' documentation
const TOKEN_FORMATS: TokenFormat[] = [
    { name: 'aws-access-key-id', pattern: /(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}/g },
    { name: 'github-token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}/g },
    { name: 'github-fine-grained-token', pattern: /github_pat_[A-Za-z0-9_]{82}/g },
    { name: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
    { name: 'openai-key', pattern: /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
    // sk_/rk_ only: pk_ keys are publishable
    { name: 'stripe-key', pattern: /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g },
    { name: 'slack-token', pattern: /xox[abposr]-[A-Za-z0-9-]{10,}/g },
    { name: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'hugging-face-token', pattern: /hf_[A-Za-z0-9]{34}/g },
];

// the private half of a key pair (certificates and public keys aren't secret)
const PRIVATE_KEY = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?-----END \1-----/g;
// header.payload.signature in base64url, with a JSON header containing "alg"
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}/g;
// HTTP auth header value: "Authorization: Bearer <token>"
const AUTH_HEADER = /\b(?:Proxy-)?Authorization:\s*(?:Bearer|Basic|Token|Digest)\s+([A-Za-z0-9._~+/=-]{8,})/gi;
// the AWS CLI config line, whose value has no prefix of its own
const AWS_SECRET = /\baws_secret_access_key\s*[=:]\s*([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/gi;
// URLs with a password in them: postgres://user:pass@host/db
const URL_WITH_PASSWORD = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/"'<>]+:[^\s@/"'<>]+@[^\s"'<>]+/gi;
// URLs that are themselves credentials: anyone with the link can post
const WEBHOOK_URL =
    /https:\/\/(?:hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+|(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+|[a-z0-9-]+\.webhook\.office\.com\/[^\s"'<>]+)/gi;

// a generated password: one token mixing all four character classes ("#fF5*(tc1Q", "G9U(gS5g_z")
// tokens end at spaces, markup and quotes, and joining characters like . _ / - = aren't symbols
const PASSWORD_TOKEN = /(?<![^\s<>"`{}\|])[^\s<>"`{}\|]{8,40}(?![^\s<>"`{}\|])/gu;
const WRAPPING = /^[(['«„“]+|[)\]'»“”.,;:!?]+$/gu;
const CHARACTER_CLASSES = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}._/:,;='-]/u];
const NOT_A_PASSWORD = /:\/\/|^[^@\s]+@[^@\s]+\.\p{L}{2,}$/u;

const TOKEN_BOUNDARY = /[A-Za-z0-9_-]/;

// whole tokens only: not part of a longer word or identifier
const isDelimited = (text: string, start: number, end: number): boolean =>
{
    return (start === 0 || !TOKEN_BOUNDARY.test(text[start - 1]!)) && (end >= text.length || !TOKEN_BOUNDARY.test(text[end]!));
};

// base64url decoding without platform APIs (core has no atob/Buffer)
const decodeBase64Url = (value: string): string | null =>
{
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let bits = 0;
    let buffer = 0;
    let result = '';

    for (const character of value)
    {
        const index = alphabet.indexOf(character);

        if (index === -1)
        {
            return null;
        }

        buffer = (buffer << 6) | index;
        bits += 6;

        if (bits >= 8)
        {
            bits -= 8;
            result += String.fromCharCode((buffer >> bits) & 0xff);
        }
    }

    return result;
};

const isJwtHeader = (encoded: string): boolean =>
{
    const header = decodeBase64Url(encoded);

    if (header == null)
    {
        return false;
    }

    try
    {
        const parsed: unknown = JSON.parse(header);

        return typeof parsed === 'object' && parsed != null && 'alg' in parsed;
    }
    catch
    {
        return false;
    }
};

export const findSecrets = (text: string): RuleMatch[] =>
{
    const matches: RuleMatch[] = [];
    const add = (start: number, end: number, validated: boolean) =>
    {
        matches.push({ start, end, category: 'SECRET', validated });
    };

    for (const { pattern } of TOKEN_FORMATS)
    {
        for (const match of text.matchAll(pattern))
        {
            if (isDelimited(text, match.index, match.index + match[0].length))
            {
                add(match.index, match.index + match[0].length, true);
            }
        }
    }

    for (const match of text.matchAll(PRIVATE_KEY))
    {
        add(match.index, match.index + match[0].length, true);
    }

    for (const match of text.matchAll(JWT))
    {
        if (isDelimited(text, match.index, match.index + match[0].length) && isJwtHeader(match[0].split('.')[0]!))
        {
            add(match.index, match.index + match[0].length, true);
        }
    }

    // only the value after the header name or config key is secret
    for (const pattern of [AUTH_HEADER, AWS_SECRET])
    {
        for (const match of text.matchAll(pattern))
        {
            const start = match.index + match[0].length - match[1]!.length;

            add(start, match.index + match[0].length, true);
        }
    }

    for (const pattern of [URL_WITH_PASSWORD, WEBHOOK_URL])
    {
        for (const match of text.matchAll(pattern))
        {
            const value = match[0].replace(/[.,;:!?)'"]+$/, '');

            add(match.index, match.index + value.length, true);
        }
    }

    for (const match of text.matchAll(PASSWORD_TOKEN))
    {
        const leading = /^[(['«„“]*/u.exec(match[0])![0].length;
        const value = match[0].replace(WRAPPING, '');
        const start = match.index + leading;
        const end = start + value.length;

        if (
            value.length >= 8 &&
            CHARACTER_CLASSES.every((characterClass) => characterClass.test(value)) &&
            !NOT_A_PASSWORD.test(value) &&
            !matches.some((other) => other.start < end && start < other.end)
        )
        {
            add(start, end, false);
        }
    }

    return keepLongest(matches);
};

export const secretRule = createRuleDetector('secret', findSecrets);
