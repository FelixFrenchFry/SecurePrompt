import { describe, expect, it } from 'vitest';
import { findObfuscatedEmails } from '../../../packages/core/src/detect/rules/email';

const found = (text: string) => findObfuscatedEmails(text).map((match) => text.slice(match.start, match.end));

describe('findObfuscatedEmails', () =>
{
    it.each([
        ['oder per Mail an lisa [at] example [dot] de.', 'lisa [at] example [dot] de'],
        ['Kontakt: info(at)firma-mueller.de', 'info(at)firma-mueller.de'],
        ['write to j.doe {at} mail (dot) co (dot) uk now', 'j.doe {at} mail (dot) co (dot) uk'],
        ['E-Mail: anna.schmidt[at]uni-koeln.de, Tel.', 'anna.schmidt[at]uni-koeln.de'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it.each([
        ['the English word at', 'meet lisa at example dot de, look at this.com'],
        ['plain emails, which the model handles', 'lisa@example.de'],
        ['a bracketed at without a domain', 'Preis [at] Anfrage'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});
