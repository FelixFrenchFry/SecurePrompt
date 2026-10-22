import { describe, expect, it } from 'vitest';
import { createSession, formatPlaceholder, restoreSession, type SessionSnapshot } from '../../packages/core/src/session';

describe('formatPlaceholder', () =>
{
    it('pads to three digits and grows beyond', () =>
    {
        expect(formatPlaceholder('PERSON', 1)).toBe('PERSON_001');
        expect(formatPlaceholder('EMAIL', 1234)).toBe('EMAIL_1234');
    });
});

describe('MaskSession', () =>
{
    it('numbers placeholders per category', () =>
    {
        const session = createSession();

        expect(session.placeholderFor('PERSON', 'Anna')).toBe('PERSON_001');
        expect(session.placeholderFor('PERSON', 'Bob')).toBe('PERSON_002');
        expect(session.placeholderFor('EMAIL', 'a@b.de')).toBe('EMAIL_001');
    });

    it('keeps the placeholder for a repeated value and restores the first spelling', () =>
    {
        const session = createSession();

        session.placeholderFor('PERSON', 'Anna Schmidt');

        expect(session.placeholderFor('PERSON', 'anna  schmidt')).toBe('PERSON_001');
        expect(session.originalFor('PERSON_001')).toBe('Anna Schmidt');
    });

    it('treats formatting in phone and account numbers as insignificant', () =>
    {
        const session = createSession();

        session.placeholderFor('ACCOUNT', 'DE89 3704 0044 0532 0130 00');
        session.placeholderFor('PHONE', '+49 (30) 123-456');

        expect(session.placeholderFor('ACCOUNT', 'DE89370400440532013000')).toBe('ACCOUNT_001');
        expect(session.placeholderFor('PHONE', '+4930123456')).toBe('PHONE_001');
    });

    it('keeps secrets that differ only in case apart', () =>
    {
        const session = createSession();

        expect(session.placeholderFor('SECRET', 'Passwort1')).toBe('SECRET_001');
        expect(session.placeholderFor('SECRET', 'passwort1')).toBe('SECRET_002');
    });

    it('keeps the same value in different categories apart', () =>
    {
        const session = createSession();

        expect(session.placeholderFor('PERSON', 'Rosa')).toBe('PERSON_001');
        expect(session.placeholderFor('ADDRESS', 'Rosa')).toBe('ADDRESS_001');
    });

    it('skips reserved placeholders', () =>
    {
        const session = createSession();

        expect(session.placeholderFor('PERSON', 'Anna', new Set(['PERSON_001', 'PERSON_002']))).toBe('PERSON_003');
        expect(session.placeholderFor('PERSON', 'Bob')).toBe('PERSON_004');
    });

    it('forks into an independent copy', () =>
    {
        const session = createSession();

        session.placeholderFor('PERSON', 'Anna');

        const fork = session.fork();

        fork.placeholderFor('PERSON', 'Bob');

        expect(fork.placeholders()).toEqual(['PERSON_001', 'PERSON_002']);
        expect(session.placeholders()).toEqual(['PERSON_001']);
        expect(session.placeholderFor('PERSON', 'Carl')).toBe('PERSON_002');
    });
});

describe('restoreSession', () =>
{
    // a session with a gap from a reserved placeholder, so numbering must continue after it
    const filled = () =>
    {
        const session = createSession();

        session.placeholderFor('PERSON', 'Anna', new Set(['PERSON_001']));
        session.placeholderFor('EMAIL', 'anna@example.de');

        return session;
    };

    it('restores values, placeholders and numbering from a snapshot', () =>
    {
        const restored = restoreSession(filled().snapshot());

        expect(restored.placeholders()).toEqual(['PERSON_002', 'EMAIL_001']);
        expect(restored.originalFor('PERSON_002')).toBe('Anna');
        expect(restored.placeholderFor('PERSON', 'anna')).toBe('PERSON_002');
        expect(restored.placeholderFor('PERSON', 'Bob')).toBe('PERSON_003');
    });

    it('survives a JSON round trip, like chrome.storage.session', () =>
    {
        const snapshot = JSON.parse(JSON.stringify(filled().snapshot())) as SessionSnapshot;

        expect(restoreSession(snapshot).snapshot()).toEqual(filled().snapshot());
    });

    it('returns a snapshot that later changes to the session do not affect', () =>
    {
        const session = filled();
        const snapshot = session.snapshot();

        session.placeholderFor('PERSON', 'Bob');

        expect(snapshot.entries).toHaveLength(2);
    });

    it.each([
        ['no entries list', {}],
        ['an unknown category', { entries: [{ category: 'NAME', value: 'Anna', placeholder: 'NAME_001' }] }],
        ['an empty value', { entries: [{ category: 'PERSON', value: ' ', placeholder: 'PERSON_001' }] }],
        ['a placeholder of another category', { entries: [{ category: 'PERSON', value: 'Anna', placeholder: 'EMAIL_001' }] }],
        ['a malformed placeholder', { entries: [{ category: 'PERSON', value: 'Anna', placeholder: 'PERSON_1' }] }],
        ['a placeholder used twice', { entries: [
            { category: 'PERSON', value: 'Anna', placeholder: 'PERSON_001' },
            { category: 'PERSON', value: 'Bob', placeholder: 'PERSON_001' },
        ] }],
        ['a value listed twice', { entries: [
            { category: 'PERSON', value: 'Anna', placeholder: 'PERSON_001' },
            { category: 'PERSON', value: 'anna', placeholder: 'PERSON_002' },
        ] }],
    ])('rejects a snapshot with %s, without quoting it', (_name, snapshot) =>
    {
        expect(() => restoreSession(snapshot as SessionSnapshot)).toThrow(/^Invalid session snapshot$/);
    });
});
