import { describe, expect, it } from 'vitest';
import { applyEmailOverride, createCharAccumulator, decodeWordSpans, isPlausible, type CharAccumulator } from '../../../packages/model-runtime/src/bardsai/decode';
import { createLabelSet } from '../../../packages/model-runtime/src/bardsai/evidence';

// a tiny label set: O, B-/I- for two types
const LABELS = createLabelSet({
    0: 'O',
    1: 'B-PERSON_NAME',
    2: 'I-PERSON_NAME',
    3: 'B-PHONE_NUMBER',
    4: 'I-PHONE_NUMBER',
});

// pools per-label probabilities per type, as evidence.ts does for real model output
const addLabelProbabilities = (accumulator: CharAccumulator, offset: { start: number; end: number }, probabilities: number[]) =>
{
    const typeProbabilities = new Array(LABELS.types.length + 1).fill(0);
    let beginMass = 0;

    probabilities.forEach((probability, label) =>
    {
        typeProbabilities[LABELS.typeOfLabel[label]!] += probability;
        beginMass += LABELS.beginsEntity[label] === 1 ? probability : 0;
    });

    accumulator.add(offset, typeProbabilities, beginMass);
};

// probabilities for one token: mostly the given label
const token = (label: number, confidence = 0.9) =>
{
    const probabilities = new Array(5).fill((1 - confidence) / 4);

    probabilities[label] = confidence;
    return probabilities;
};

const decode = (text: string, tokens: Array<[string, number[]]>) =>
{
    const accumulator = createCharAccumulator(text, LABELS.types.length);
    let cursor = 0;

    for (const [surface, probabilities] of tokens)
    {
        // like the tokenizer, a leading space may be one the text doesn't have (at the start)
        const withSpace = text.indexOf(surface, cursor);
        const start = withSpace === cursor || !surface.startsWith(' ') ? withSpace : text.indexOf(surface.slice(1), cursor);

        if (start === -1)
        {
            throw new Error(`token '${surface}' not found`);
        }

        const length = start === withSpace ? surface.length : surface.length - 1;

        addLabelProbabilities(accumulator, { start, end: start + length }, probabilities);
        cursor = start + length;
    }

    return decodeWordSpans(text, accumulator, LABELS.types).map((span) => [text.slice(span.start, span.end), span.type]);
};

describe('createLabelSet', () =>
{
    it('pools B- and I- labels per type, sorted by name', () =>
    {
        expect(LABELS.types).toEqual(['PERSON_NAME', 'PHONE_NUMBER']);
        expect([...LABELS.typeOfLabel]).toEqual([2, 0, 0, 1, 1]);
        expect([...LABELS.beginsEntity]).toEqual([0, 1, 0, 1, 0]);
    });
});

describe('decodeWordSpans', () =>
{
    it('labels whole words from their sub-tokens and merges continuing words', () =>
    {
        expect(
            decode('Herr Sabine Krüger ruft', [
                [' Herr', token(0)],
                [' Sab', token(1)],
                ['ine', token(2)],
                [' Krüger', token(2)],
                [' ruft', token(0)],
            ]),
        ).toEqual([['Sabine Krüger', 'PERSON_NAME']]);
    });

    it('starts a new entity when the next word begins one', () =>
    {
        expect(decode('Anna Bob', [[' Anna', token(1)], [' Bob', token(1)]])).toEqual([
            ['Anna', 'PERSON_NAME'],
            ['Bob', 'PERSON_NAME'],
        ]);
    });

    it('merges across separators like dashes but not across other text', () =>
    {
        expect(
            decode('0171 - 2345678 und 030', [
                [' 0171', token(3)],
                [' -', token(4)],
                [' 2345678', token(4)],
                [' und', token(0)],
                [' 030', token(4)],
            ]),
        ).toEqual([
            ['0171 - 2345678', 'PHONE_NUMBER'],
            ['030', 'PHONE_NUMBER'],
        ]);
    });

    it('trims edge punctuation from words', () =>
    {
        expect(
            decode('("Anna").', [
                ['(', token(0)],
                ['"', token(0)],
                ['Anna', token(1)],
                ['"', token(0)],
                [')', token(0)],
                ['.', token(0)],
            ]),
        ).toEqual([['Anna', 'PERSON_NAME']]);
    });

    it('averages overlapping windows that saw the same token', () =>
    {
        const text = 'Anna';
        const accumulator = createCharAccumulator(text, LABELS.types.length);

        addLabelProbabilities(accumulator, { start: 0, end: 4 }, token(1, 0.2));
        addLabelProbabilities(accumulator, { start: 0, end: 4 }, token(0, 0.9));

        expect(decodeWordSpans(text, accumulator, LABELS.types)).toEqual([]);
    });

    it.each([
        // entity type mass vs "O"
        ['masks when an entity type reaches the floor though O wins', 0.3, [['Anna', 'PERSON_NAME']]],
        ['keeps the word when the entity type stays below the floor', 0.2, []],
    ])('%s', (_name, personMass, expected) =>
    {
        const text = 'Anna';
        const accumulator = createCharAccumulator(text, LABELS.types.length);

        accumulator.add({ start: 0, end: 4 }, [personMass, 0, 1 - personMass], personMass);
        expect(decodeWordSpans(text, accumulator, LABELS.types).map((span) => [text.slice(span.start, span.end), span.type])).toEqual(expected);
    });

    it.each([
        // types: LOCATION, PHONE_NUMBER, POSTAL_ADDRESS, then O
        ['pools types of one kind against O', [0.2, 0, 0.18, 0.62], [['Boston', 'LOCATION']]],
        ['does not pool types of different kinds', [0.2, 0.18, 0, 0.62], []],
        ['pools PROPER_NAME with a top PERSON_NAME', [0.2, 0, 0.18, 0.62], [['Boston', 'PERSON_NAME']], ['PERSON_NAME', 'PHONE_NUMBER', 'PROPER_NAME']],
    ])('%s', (_name, probabilities, expected, types = ['LOCATION', 'PHONE_NUMBER', 'POSTAL_ADDRESS']) =>
    {
        const text = 'Boston';
        const accumulator = createCharAccumulator(text, types.length);

        accumulator.add({ start: 0, end: 6 }, probabilities, 0.38);
        expect(decodeWordSpans(text, accumulator, types).map((span) => [text.slice(span.start, span.end), span.type])).toEqual(expected);
    });

    it.each([
        // types: PERSON_NAME, PERSON_ROLE_OR_TITLE, PROPER_NAME, then O (the real model's "Herr")
        ['keeps a word the model also reads as a title', [0.22, 0.15, 0.04, 0.59], []],
        ['masks the same name evidence without a title reading', [0.22, 0, 0.04, 0.74], [['Herr', 'PERSON_NAME']]],
        ['masks a name that beats O and the title together', [0.5, 0.15, 0.04, 0.31], [['Herr', 'PERSON_NAME']]],
    ])('%s', (_name, probabilities, expected) =>
    {
        const text = 'Herr';
        const types = ['PERSON_NAME', 'PERSON_ROLE_OR_TITLE', 'PROPER_NAME'];
        const accumulator = createCharAccumulator(text, types.length);

        accumulator.add({ start: 0, end: 4 }, probabilities, 0.26);
        expect(decodeWordSpans(text, accumulator, types).map((span) => [text.slice(span.start, span.end), span.type])).toEqual(expected);
    });

    it.each([
        // per word: [PERSON_NAME, PHONE_NUMBER, O] and begin mass
        ['bridges one O word whose best type matches both sides', 'Anna von Berg', [[0.9, 0, 0.1, 0.9], [0.2, 0.05, 0.75, 0], [0.9, 0, 0.1, 0.1]], ['Anna von Berg']],
        ['keeps a word whose best type differs', 'Anna von Berg', [[0.9, 0, 0.1, 0.9], [0.05, 0.2, 0.75, 0], [0.9, 0, 0.1, 0.1]], ['Anna', 'Berg']],
        ['never bridges two O words', 'Anna und von Berg', [[0.9, 0, 0.1, 0.9], [0.2, 0.05, 0.75, 0], [0.2, 0.05, 0.75, 0], [0.9, 0, 0.1, 0.1]], ['Anna', 'Berg']],
    ])('%s', (_name, text, words, expected) =>
    {
        const accumulator = createCharAccumulator(text, LABELS.types.length);
        let cursor = 0;

        for (const [word, probabilities] of text.split(' ').map((word, index) => [word, words[index]!] as const))
        {
            const start = text.indexOf(word, cursor);

            accumulator.add({ start, end: start + word.length }, probabilities.slice(0, 3), probabilities[3]!);
            cursor = start + word.length;
        }

        expect(decodeWordSpans(text, accumulator, LABELS.types).map((span) => text.slice(span.start, span.end))).toEqual(expected);
    });

    it.each([
        // types: DOCUMENT_REFERENCE, VEHICLE_IDENTIFIER, then O
        ['rescues an identifier with digits', 'HR-0012', [['HR-0012', 'DOCUMENT_REFERENCE']]],
        ['does not rescue a plain word as an identifier', 'License', []],
        ['rescues a handle without digits', 'jbrandt', [['jbrandt', 'CONTACT_HANDLE']], ['CONTACT_HANDLE', 'VEHICLE_IDENTIFIER']],
    ])('%s', (_name, text, expected, types = ['DOCUMENT_REFERENCE', 'VEHICLE_IDENTIFIER']) =>
    {
        const accumulator = createCharAccumulator(text, types.length);

        accumulator.add({ start: 0, end: text.length }, [0.2, 0.18, 0.62], 0.38);
        expect(decodeWordSpans(text, accumulator, types).map((span) => [text.slice(span.start, span.end), span.type])).toEqual(expected);
    });
});

describe('format checks', () =>
{
    it('requires digits for phones and IDs and URL shape for links', () =>
    {
        const check = (value: string, type: string) => isPlausible(value, { start: 0, end: value.length, type, score: 1 });

        expect(check('0171 23', 'PHONE_NUMBER')).toBe(true);
        expect(check('0171', 'PHONE_NUMBER')).toBe(false);
        expect(check('A1', 'DOCUMENT_IDENTIFIER')).toBe(false);
        expect(check('www.example.de', 'IDENTIFYING_LINK')).toBe(true);
        expect(check('example', 'IDENTIFYING_LINK')).toBe(false);
    });

    it('replaces spans overlapping a regex-matched email', () =>
    {
        const text = 'Mail an anna.schmidt@example.de.';
        const spans = applyEmailOverride(text, [{ start: 8, end: 20, type: 'PERSON_NAME', score: 0.9 }]);

        expect(spans.map((span) => [text.slice(span.start, span.end), span.type])).toEqual([
            ['anna.schmidt@example.de', 'EMAIL_ADDRESS'],
        ]);
    });
});
