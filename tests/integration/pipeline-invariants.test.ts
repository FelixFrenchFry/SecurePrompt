import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createSession, normalizeValue } from '../../packages/core/src/session';
import { CATEGORIES, type Category, type Detection, type DetectionSource, type Detector } from '../../packages/core/src/types';
import { findProtectedRanges } from '../../packages/core/src/pipeline/protect';
import { restorePlaceholders } from '../../packages/core/src/pipeline/restore';
import { runPipeline } from '../../packages/core/src/pipeline/run';

// invariants that must hold for any text and any detector output, checked on random inputs

const WORDS = [
    'Anna', 'anna', 'Neumann', 'Rosa', 'rosa', 'Koch', 'gekocht', 'Grüße', 'Straße', '😀', '🌷',
    'a@b.de', 'DE89', '3704', '0171', '-', '.', ',', '(', ')', '\n', '"', '\\', 'x',
    // placeholder-shaped words, which must stay untouched
    'PERSON_001', 'EMAIL_002', 'XACCOUNT_001', 'OTHER_1000',
];

const textArbitrary = fc
    .array(fc.tuple(fc.constantFrom(...WORDS), fc.constantFrom(' ', '', '  ', '\n')), { maxLength: 40 })
    .map((parts) => parts.map(([word, separator]) => word + separator).join(''));

const SOURCES: DetectionSource[] = ['rule', 'model', 'manual'];

const detectionsArbitrary = (length: number) =>
{
    const position = fc.integer({ min: 0, max: length });

    return fc.array(
        fc.record({
            start: position,
            end: position,
            category: fc.constantFrom(...CATEGORIES),
            source: fc.constantFrom(...SOURCES),
            score: fc.double({ min: 0, max: 1, noNaN: true }),
            validated: fc.boolean(),
        }),
        { maxLength: 12 },
    ).map((items) =>
    {
        return items.map((item): Detection =>
        {
            return {
                ...item,
                start: Math.min(item.start, item.end),
                end: Math.max(item.start, item.end),
                detector: 'random',
            };
        });
    });
};

const scenarioArbitrary = textArbitrary.chain((text) =>
{
    return fc.record({
        text: fc.constant(text),
        detections: detectionsArbitrary(text.length),
        enabled: fc.subarray([...CATEGORIES], { minLength: 1 }),
        residualPasses: fc.integer({ min: 0, max: 2 }),
    });
});

// returns the fixed detections on the original text and nothing on any other text
const fixedDetector = (text: string, detections: Detection[]): Detector =>
{
    return { id: 'fixed', detect: async (input) => (input === text ? detections : []) };
};

describe('pipeline invariants', () =>
{
    it('produces sorted, non-overlapping, in-bounds spans and contiguous segments', async () =>
    {
        await fc.assert(
            fc.asyncProperty(scenarioArbitrary, async ({ text, detections, enabled, residualPasses }) =>
            {
                const result = await runPipeline(text, {
                    detectors: [fixedDetector(text, detections)],
                    session: createSession(),
                    enabledCategories: new Set(enabled),
                    residualPasses,
                });
                let previousEnd = 0;

                for (const span of result.spans)
                {
                    expect(span.start).toBeGreaterThanOrEqual(previousEnd);
                    expect(span.end).toBeGreaterThan(span.start);
                    expect(span.end).toBeLessThanOrEqual(text.length);
                    previousEnd = span.end;
                }

                let sourceCursor = 0;
                let maskedCursor = 0;

                for (const segment of result.segments)
                {
                    expect(segment.sourceStart).toBe(sourceCursor);
                    expect(segment.maskedStart).toBe(maskedCursor);
                    sourceCursor = segment.sourceEnd;
                    maskedCursor = segment.maskedEnd;
                }

                expect(sourceCursor).toBe(text.length);
                expect(maskedCursor).toBe(result.maskedText.length);
            }),
            { numRuns: 500 },
        );
    });

    it('restores every placeholder to its value, up to the documented normalization', async () =>
    {
        // formatting variants restore to the first spelling seen ('anna' → 'Anna')
        await fc.assert(
            fc.asyncProperty(scenarioArbitrary, async ({ text, detections, enabled, residualPasses }) =>
            {
                const session = createSession();
                const result = await runPipeline(text, {
                    detectors: [fixedDetector(text, detections)],
                    session,
                    enabledCategories: new Set(enabled),
                    residualPasses,
                });
                let expected = '';
                let spanIndex = 0;

                for (const segment of result.segments)
                {
                    const source = text.slice(segment.sourceStart, segment.sourceEnd);

                    if (segment.kind === 'text')
                    {
                        expected += source;
                        continue;
                    }

                    const original = session.originalFor(segment.placeholder)!;
                    // name parts restore to the full name ("Neumann" → "Claudia Neumann")
                    const aliasOf = result.spans[spanIndex]!.aliasOf;

                    spanIndex += 1;

                    expect(normalizeValue(segment.category, original)).toBe(normalizeValue(segment.category, aliasOf ?? source));
                    expected += original;
                }

                expect(restorePlaceholders(result.maskedText, session)).toBe(expected);
            }),
            { numRuns: 500 },
        );
    });

    it('masks every detected character of an enabled category outside protected text', async () =>
    {
        await fc.assert(
            fc.asyncProperty(scenarioArbitrary, async ({ text, detections, enabled }) =>
            {
                const session = createSession();
                const enabledSet = new Set<Category>(enabled);
                const protectedRanges = findProtectedRanges(text, session);
                const result = await runPipeline(text, {
                    detectors: [fixedDetector(text, detections)],
                    session,
                    enabledCategories: enabledSet,
                });
                const isProtected = (index: number) =>
                {
                    return protectedRanges.some((range) => range.start <= index && index < range.end);
                };
                const isMasked = (index: number) =>
                {
                    return result.spans.some((span) => span.start <= index && index < span.end);
                };

                for (const detection of detections)
                {
                    if (!enabledSet.has(detection.category))
                    {
                        continue;
                    }

                    for (let index = detection.start; index < detection.end; index += 1)
                    {
                        if (!/\s/.test(text[index]!) && !isProtected(index))
                        {
                            expect(isMasked(index), `character ${index} of ${JSON.stringify(text)}`).toBe(true);
                        }
                    }
                }
            }),
            { numRuns: 500 },
        );
    });

    it('leaves placeholders and disabled categories unmasked', async () =>
    {
        await fc.assert(
            fc.asyncProperty(scenarioArbitrary, async ({ text, detections, enabled }) =>
            {
                const session = createSession();
                const protectedRanges = findProtectedRanges(text, session);
                const result = await runPipeline(text, {
                    detectors: [fixedDetector(text, detections)],
                    session,
                    enabledCategories: new Set(enabled),
                });

                for (const span of result.spans)
                {
                    expect(enabled).toContain(span.category);
                    expect(protectedRanges.some((range) => range.start < span.end && span.start < range.end)).toBe(
                        false,
                    );
                }
            }),
            { numRuns: 500 },
        );
    });

    it('changes nothing when masking already masked text again', async () =>
    {
        await fc.assert(
            fc.asyncProperty(scenarioArbitrary, async ({ text, detections }) =>
            {
                const session = createSession();
                const first = await runPipeline(text, { detectors: [fixedDetector(text, detections)], session });
                const second = await runPipeline(first.maskedText, { detectors: [], session });

                expect(second.maskedText).toBe(first.maskedText);
            }),
            { numRuns: 300 },
        );
    });
});
