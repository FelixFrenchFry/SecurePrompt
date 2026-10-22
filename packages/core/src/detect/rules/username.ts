import { overlaps } from '../../spans';
import { createRuleDetector, type RuleMatch } from './rule';

// usernames of the "first.last" shape ("carlos.rojas", "h.alfaham"), unvalidated, skipping:
// - file names and domains, by requiring 5+ letters after the dot ("main.py", "example.com")
// - code member access in chains, calls or next to operators, and code blocks entirely
// - email addresses, which continue with "@"
const USERNAME = /(?<![\p{L}\p{N}_.@/#$-])\p{Ll}+\.\p{Ll}{5,}(?![\p{L}\p{N}_@-]|\.[\p{L}\p{N}])/gu;
// code markers around a username, excluding "|" (table cells) and "**" (markdown bold)
const CODE_BEFORE = /(?:[=(+/<>!&;[{]|(?<!\*)\*)\s*$/u;
const CODE_AFTER = /^\s*(?:[=(+/<>!&;[{]|\*(?!\*))/u;
// enough characters to see past whitespace and a doubled "**"
const CONTEXT_REACH = 8;
// fenced blocks and inline code spans
const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]+`/gu;

export const findUsernames = (text: string): RuleMatch[] =>
{
    const code = [...text.matchAll(CODE)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
    const matches: RuleMatch[] = [];

    for (const match of text.matchAll(USERNAME))
    {
        const span = { start: match.index, end: match.index + match[0].length };
        const before = text.slice(Math.max(0, span.start - CONTEXT_REACH), span.start);
        const after = text.slice(span.end, span.end + CONTEXT_REACH);

        if (CODE_BEFORE.test(before) || CODE_AFTER.test(after) || code.some((range) => overlaps(range, span)))
        {
            continue;
        }

        matches.push({ ...span, category: 'ACCOUNT', validated: false });
    }

    return matches;
};

export const usernameRule = createRuleDetector('username', findUsernames);
