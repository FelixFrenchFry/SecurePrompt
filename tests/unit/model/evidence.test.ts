import { describe, expect, it } from 'vitest';
import { decodeEvidence } from '../../../packages/model-runtime/src/bardsai/decode';
import { createLabelSet, poolEvidence } from '../../../packages/model-runtime/src/bardsai/evidence';
import type { ClassifiedTokens } from '../../../packages/model-runtime/src/classifier';

const LABELS = createLabelSet({ 0: 'O', 1: 'B-PERSON_NAME', 2: 'I-PERSON_NAME', 3: 'B-PERSON_ROLE_OR_TITLE', 4: 'B-EMAIL_ADDRESS' });

// one token per word, each with the given label probabilities
const tokensOf = (text: string, probabilities: number[][]): ClassifiedTokens =>
{
    const offsets = [...text.matchAll(/\S+/g)].map((match) => ({ start: match.index, end: match.index + match[0].length }));

    return {
        ids: offsets.map((_, index) => index),
        offsets,
        probabilities: probabilities.map((row) => Float64Array.from(row)),
        windowCounts: new Uint16Array(offsets.length).fill(1),
    };
};

const OUTSIDE = [1, 0, 0, 0, 0];

describe('poolEvidence', () =>
{
    it('adds up B- and I- labels per type and keeps the begin mass apart', () =>
    {
        const evidence = poolEvidence(tokensOf('Anna Berg', [[0.1, 0.6, 0.3, 0, 0], [0.2, 0.1, 0.7, 0, 0]]), LABELS);

        expect(evidence.types).toEqual(['EMAIL_ADDRESS', 'PERSON_NAME', 'PERSON_ROLE_OR_TITLE']);
        expect(evidence.typeProbabilities[1]).toBeCloseTo(0.9);
        expect(evidence.typeProbabilities[3]).toBeCloseTo(0.1);
        expect(evidence.beginMass[0]).toBeCloseTo(0.6);
        expect(evidence.beginMass[1]).toBeCloseTo(0.1);
    });
});

describe('decodeEvidence', () =>
{
    const decoded = (text: string, probabilities: number[][]) =>
    {
        return decodeEvidence(text, poolEvidence(tokensOf(text, probabilities), LABELS))
            .map((detection) => [text.slice(detection.start, detection.end), detection.category, detection.source]);
    };

    it('turns model evidence into detections of our categories', () =>
    {
        expect(decoded('Grüße an Anna', [OUTSIDE, OUTSIDE, [0, 0.9, 0.1, 0, 0]])).toEqual([['Anna', 'PERSON', 'model']]);
    });

    it('never masks titles', () =>
    {
        expect(decoded('Herr Koch', [[0, 0, 0, 1, 0], [0, 0.9, 0.1, 0, 0]])).toEqual([['Koch', 'PERSON', 'model']]);
    });

    it('adds emails the model missed', () =>
    {
        expect(decoded('Mail an anna@example.de bitte', [OUTSIDE, OUTSIDE, OUTSIDE, OUTSIDE])).toEqual([['anna@example.de', 'EMAIL', 'model']]);
    });
});
