import { createRuleDetector, type RuleMatch } from './rule';

// obfuscated emails with a bracketed "at" and optional "dot" ("lisa [at] example [dot] de")
// plain addresses are left to the model, and the English word "at" never matches

const AT = '\\s?[[({<]at[\\])}>]\\s?';
const DOT = '(?:\\.|\\s?[[({<]dot[\\])}>]\\s?)';
const OBFUSCATED_EMAIL = new RegExp(
    `(?<![\\p{L}\\p{N}._%+-])[\\p{L}\\p{N}._%+-]+${AT}[\\p{L}\\p{N}-]+(?:${DOT}[\\p{L}\\p{N}-]+)*${DOT}\\p{L}{2,}(?![\\p{L}\\p{N}])`,
    'giu',
);

export const findObfuscatedEmails = (text: string): RuleMatch[] =>
{
    return [...text.matchAll(OBFUSCATED_EMAIL)].map((match): RuleMatch =>
    {
        return { start: match.index, end: match.index + match[0].length, category: 'EMAIL', validated: false };
    });
};

export const emailRule = createRuleDetector('email', findObfuscatedEmails);
