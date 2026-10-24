import { describe, expect, it } from 'vitest';
import { createSession } from '../../packages/core/src/session';
import { detectionOf } from '../support/detections';
import { mergeDetections } from '../../packages/core/src/pipeline/merge';
import { propagateMentions } from '../../packages/core/src/pipeline/propagate';
import { excludeProtected, findProtectedRanges, findReservedPlaceholders } from '../../packages/core/src/pipeline/protect';
import { assignPlaceholders, maskedToSource, renderMaskedText } from '../../packages/core/src/pipeline/render';
import { resolveOverlaps } from '../../packages/core/src/pipeline/resolve';
import { restorePlaceholders } from '../../packages/core/src/pipeline/restore';

const valuesOf = (text: string, spans: ReadonlyArray<{ start: number; end: number }>) =>
{
    return spans.map((span) => text.slice(span.start, span.end));
};

describe('protect', () =>
{
    it('finds placeholder tokens and session placeholders glued to other text', () =>
    {
        const session = createSession();

        session.placeholderFor('ACCOUNT', '123');

        const text = 'Hi PERSON_001, ref IDACCOUNT_001, not PERSON_01 or XPERSON_002';

        expect(valuesOf(text, findProtectedRanges(text, session))).toEqual(['PERSON_001', 'ACCOUNT_001']);
    });

    it('reserves every placeholder-shaped token in the text', () =>
    {
        expect(findReservedPlaceholders('see PERSON_001 and xEMAIL_002y')).toEqual(
            new Set(['PERSON_001', 'EMAIL_002']),
        );
    });

    it('cuts protected ranges out of detections and trims the rest', () =>
    {
        const text = 'Herr PERSON_001 Müller';
        const detection = detectionOf(text, text, 'PERSON');
        const parts = excludeProtected(text, [detection], findProtectedRanges(text, createSession()));

        expect(valuesOf(text, parts)).toEqual(['Herr', 'Müller']);
    });
});

describe('merge', () =>
{
    it('drops disabled categories, invalid ranges and whitespace-only spans', () =>
    {
        const text = 'Anna  a@b.de';
        const merged = mergeDetections(
            text,
            [
                [detectionOf(text, 'Anna ', 'PERSON'), detectionOf(text, 'a@b.de', 'EMAIL')],
                [{ ...detectionOf(text, 'Anna', 'PERSON'), end: 99 }, detectionOf(text, '  ', 'OTHER')],
            ],
            new Set(['PERSON', 'OTHER']),
        );

        expect(valuesOf(text, merged)).toEqual(['Anna']);
    });
});

describe('resolveOverlaps', () =>
{
    it('unions overlapping spans and takes the most trusted category', () =>
    {
        const text = 'Mail anna.schmidt@example.de now';
        const resolved = resolveOverlaps([
            detectionOf(text, 'anna.schmidt', 'PERSON', { source: 'model', score: 0.9 }),
            detectionOf(text, 'anna.schmidt@example.de', 'EMAIL', { validated: true }),
        ]);

        expect(resolved).toHaveLength(1);
        expect(resolved[0]).toMatchObject({ category: 'EMAIL', score: 1 });
        expect(valuesOf(text, resolved)).toEqual(['anna.schmidt@example.de']);
    });

    it('extends to the union when the trusted span is shorter', () =>
    {
        const text = 'Ruf 0171 2345678 an';
        const resolved = resolveOverlaps([
            detectionOf(text, '0171 2345678', 'PHONE', { source: 'model', score: 0.8 }),
            detectionOf(text, '2345678', 'ACCOUNT'),
        ]);

        expect(resolved[0]?.category).toBe('PHONE');
        expect(valuesOf(text, resolved)).toEqual(['0171 2345678']);
    });

    it('lets manual selections win', () =>
    {
        const text = 'Bäckerei Hoffmann';
        const resolved = resolveOverlaps([
            detectionOf(text, 'Hoffmann', 'PERSON', { source: 'model', score: 0.99 }),
            detectionOf(text, 'Bäckerei Hoffmann', 'OTHER', { source: 'manual' }),
        ]);

        expect(resolved).toMatchObject([{ category: 'OTHER', source: 'manual' }]);
    });

    it('chains transitive overlaps into one span and keeps separate spans apart', () =>
    {
        const text = 'aaaa bbbb cccc dddd';
        const resolved = resolveOverlaps([
            detectionOf(text, 'aaaa bb', 'OTHER'),
            detectionOf(text, 'bbbb cc', 'OTHER'),
            detectionOf(text, 'cccc', 'OTHER'),
            detectionOf(text, 'dddd', 'OTHER'),
        ]);

        expect(valuesOf(text, resolved)).toEqual(['aaaa bbbb cccc', 'dddd']);
    });
});

describe('propagateMentions', () =>
{
    const propagatedValues = (text: string, detections: Parameters<typeof propagateMentions>[1]) =>
    {
        return propagateMentions(text, detections)
            .filter((detection) => detection.source === 'propagated')
            .map((detection) => [text.slice(detection.start, detection.end), detection.aliasOf]);
    };

    it('masks surname-only and first-name-only mentions under the full name', () =>
    {
        const text = 'Claudia Neumann hat gekündigt. Frau Neumann bleibt, sagt Claudia.';

        expect(propagatedValues(text, [detectionOf(text, 'Claudia Neumann', 'PERSON')])).toEqual([
            ['Neumann', 'Claudia Neumann'],
            ['Claudia', 'Claudia Neumann'],
        ]);
    });

    it('masks repeats of the full value, ignoring case for non-names', () =>
    {
        const text = 'Mail a.b@example.de oder A.B@EXAMPLE.DE';

        expect(propagatedValues(text, [detectionOf(text, 'a.b@example.de', 'EMAIL')])).toEqual([
            ['A.B@EXAMPLE.DE', 'a.b@example.de'],
        ]);
    });

    it('only matches capitalized words for capitalized names', () =>
    {
        const text = 'Rosa fand die rosa Tischdecke schön.';

        expect(propagatedValues(text, [detectionOf(text, 'Rosa', 'PERSON')])).toEqual([]);
    });

    it('only matches whole words', () =>
    {
        const text = 'Herr Koch hat gekocht, Kochbuch von Koch.';

        expect(propagatedValues(text, [detectionOf(text, 'Koch', 'PERSON')])).toEqual([['Koch', 'Koch']]);
    });

    it('matches lowercase names written in lowercase chats', () =>
    {
        const text = 'frag max ob er kann, max hat zeit';

        expect(propagatedValues(text, [detectionOf(text, 'max', 'PERSON')])).toEqual([['max', 'max']]);
    });

    it('gives a surname shared by two people its own placeholder', () =>
    {
        const text = 'Claudia Neumann und Peter Neumann. Neumann kommt später.';
        const detections = [
            detectionOf(text, 'Claudia Neumann', 'PERSON'),
            detectionOf(text, 'Peter Neumann', 'PERSON'),
        ];

        expect(propagatedValues(text, detections)).toEqual([['Neumann', undefined]]);
    });

    it('skips initials, particles, short values and OTHER', () =>
    {
        const text = 'Robert J. Thompson, Ludwig van Beethoven, 80, J. und van, 80 und ab ab';
        const detections = [
            detectionOf(text, 'Robert J. Thompson', 'PERSON'),
            detectionOf(text, 'Ludwig van Beethoven', 'PERSON'),
            detectionOf(text, '80', 'OTHER'),
            detectionOf(text, 'ab', 'ACCOUNT'),
        ];

        expect(propagatedValues(text, detections)).toEqual([]);
    });

    it('does not mask inside protected ranges or existing detections', () =>
    {
        const text = 'Anna Berg, Anna@example.de, Anna';
        const detections = [
            detectionOf(text, 'Anna Berg', 'PERSON'),
            detectionOf(text, 'Anna@example.de', 'EMAIL'),
        ];

        expect(propagatedValues(text, detections)).toEqual([['Anna', 'Anna Berg']]);
    });
});

describe('render and restore', () =>
{
    it('replaces spans with placeholders and records both coordinate systems', () =>
    {
        const session = createSession();
        const text = 'Hallo Anna, mail a@b.de';
        const spans = assignPlaceholders(
            text,
            [detectionOf(text, 'Anna', 'PERSON'), detectionOf(text, 'a@b.de', 'EMAIL')],
            session,
            new Set(),
        );
        const { maskedText, segments } = renderMaskedText(text, spans);

        expect(maskedText).toBe('Hallo PERSON_001, mail EMAIL_001');
        expect(segments.map((segment) => segment.kind)).toEqual(['text', 'mask', 'text', 'mask']);
        expect(segments[1]).toMatchObject({ sourceStart: 6, sourceEnd: 10, maskedStart: 6, maskedEnd: 16 });
        expect(restorePlaceholders(maskedText, session)).toBe(text);
    });

    it('gives aliases the placeholder of their canonical value', () =>
    {
        const session = createSession();
        const text = 'Claudia Neumann, Frau Neumann';
        const spans = assignPlaceholders(
            text,
            [
                detectionOf(text, 'Claudia Neumann', 'PERSON'),
                detectionOf(text, 'Neumann', 'PERSON', { occurrence: 1, aliasOf: 'Claudia Neumann' }),
            ],
            session,
            new Set(),
        );

        expect(renderMaskedText(text, spans).maskedText).toBe('PERSON_001, Frau PERSON_001');
    });

    it('refuses overlapping spans', () =>
    {
        const text = 'abcdef';
        const spans = assignPlaceholders(
            text,
            [detectionOf(text, 'abcd', 'OTHER'), detectionOf(text, 'cdef', 'PERSON')],
            createSession(),
            new Set(),
        );

        expect(() => renderMaskedText(text, spans)).toThrow(RangeError);
    });

    it('maps masked-text ranges back to the source, dropping parts over placeholders', () =>
    {
        const session = createSession();
        const text = 'Anna und Bob';
        const { maskedText, segments } = renderMaskedText(
            text,
            assignPlaceholders(text, [detectionOf(text, 'Anna', 'PERSON')], session, new Set()),
        );
        const residual = detectionOf(maskedText, 'PERSON_001 und Bob', 'PERSON');

        expect(valuesOf(text, maskedToSource(residual, segments))).toEqual([' und Bob']);
    });

    it('restores the longest placeholder first and leaves unknown ones alone', () =>
    {
        const session = createSession();

        for (let index = 0; index < 1000; index += 1)
        {
            session.placeholderFor('OTHER', `v${index}`);
        }

        expect(restorePlaceholders('OTHER_1000 OTHER_100 PERSON_001', session)).toBe('v999 v99 PERSON_001');
    });
});

describe('propagateMentions and case', () =>
{
    it('matches case-sensitive categories exactly, so restoring never changes a value', () =>
    {
        const text = 'Token Rosa1234 and rosa1234';
        const propagated = propagateMentions(text, [detectionOf(text, 'Rosa1234', 'SECRET')]).filter(
            (detection) => detection.source === 'propagated',
        );

        expect(propagated).toEqual([]);
    });
});

describe('merge: adjacent parts the model skipped', () =>
{
    const merged = (text: string, value: string, category: Parameters<typeof detectionOf>[2]) =>
    {
        return valuesOf(text, mergeDetections(text, [[detectionOf(text, value, category, { source: 'model' })]]));
    };

    it('gives a street its house number, before or after', () =>
    {
        expect(merged('Mailing address: 5740 Brett Park, Cityville', 'Brett Park', 'ADDRESS')).toEqual(['5740 Brett Park']);
        expect(merged('wohnhaft Hauptstraße 5a in Köln', 'Hauptstraße', 'ADDRESS')).toEqual(['Hauptstraße 5a']);
    });

    it('gives a name its initial', () =>
    {
        expect(merged('Contact: J. Allen, Sales', 'Allen', 'PERSON')).toEqual(['J. Allen']);
    });

    it('does not reach across a line break', () =>
    {
        expect(merged('Item 5\nBrett Park', 'Brett Park', 'ADDRESS')).toEqual(['Brett Park']);
    });
});

describe('propagate: completing partial mentions and username spellings', () =>
{
    it('lets a partly tagged mention take the full propagated term', () =>
    {
        const text = 'Lindsay Swindler called. Later Lindsay Swindler wrote again.';
        const result = propagateMentions(text, [
            detectionOf(text, 'Lindsay Swindler', 'PERSON', { source: 'model' }),
            detectionOf(text, 'Lindsay', 'PERSON', { source: 'model', occurrence: 1 }),
        ]);

        expect(valuesOf(text, result)).toEqual(['Lindsay Swindler', 'Lindsay Swindler']);
    });

    it('keeps a manual selection inside a mention', () =>
    {
        const text = 'Lindsay Swindler called. Later Lindsay Swindler wrote again.';
        const result = propagateMentions(text, [
            detectionOf(text, 'Lindsay Swindler', 'PERSON', { source: 'model' }),
            detectionOf(text, 'Lindsay', 'PERSON', { source: 'manual', occurrence: 1 }),
        ]);

        expect(valuesOf(text, result)).toEqual(['Lindsay Swindler', 'Lindsay', 'Swindler']);
    });

    it('masks username spellings of a detected name as accounts', () =>
    {
        const text = 'Sandra Harris (login sandra_harris, alias sharris) wrote.';
        const result = propagateMentions(text, [detectionOf(text, 'Sandra Harris', 'PERSON', { source: 'model' })]);

        expect(result.filter((detection) => detection.category === 'ACCOUNT').map((detection) => text.slice(detection.start, detection.end))).toEqual([
            'sandra_harris',
            'sharris',
        ]);
    });
});

describe('propagate: terms starting with an emoji', () =>
{
    it('finishes and masks repeats of a value that starts with an astral character', () =>
    {
        const text = '😀Anna und 😀Anna';
        const result = propagateMentions(text, [detectionOf(text, '😀Anna', 'OTHER'), detectionOf(text, '😀Anna', 'PERSON')]);

        expect(result.length).toBeGreaterThan(0);
    });
});

describe('propagate: shorter terms where the longest one is rejected', () =>
{
    it.each([
        ['genitive of the full name', 'Claudia Neumann ruft an. Später: Claudia Neumanns Antrag.', ['Claudia']],
        ['digit glued to the surname', 'Claudia Neumann ruft an. Claudia Neumann2 und Claudia.', ['Claudia', 'Claudia']],
        ['surname with a suffix after the first name', 'Anna Berg kam. Dann Anna Bergmann.', ['Anna']],
        ['the detected mention itself stays one span', 'Claudia Neumann ruft an.', []],
    ])('%s', (_name, text, expected) =>
    {
        const detected = text.split(' ').slice(0, 2).join(' ');
        const masked = propagateMentions(text, [detectionOf(text, detected, 'PERSON', { source: 'model' })])
            .filter((detection) => detection.source === 'propagated')
            .map((detection) => text.slice(detection.start, detection.end));

        expect(masked).toEqual(expected);
    });
});
