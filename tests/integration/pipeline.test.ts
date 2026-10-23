import { describe, expect, it } from 'vitest';
import { restorePlaceholders } from '../../packages/core/src/pipeline/restore';
import { maskDetections, runPipeline, type PipelineProgress } from '../../packages/core/src/pipeline/run';
import { createSession } from '../../packages/core/src/session';
import { PipelineCancelledError, type Detector } from '../../packages/core/src/types';
import { detectionOf, fakeDetector } from '../support/detections';

describe('runPipeline', () =>
{
    it('returns the text unchanged without detectors', async () =>
    {
        const result = await runPipeline('Hallo Anna', { detectors: [], session: createSession() });

        expect(result).toMatchObject({ maskedText: 'Hallo Anna', spans: [], failedDetectors: [] });
    });

    it('masks detections and later mentions under one placeholder', async () =>
    {
        const text = 'Claudia Neumann (claudia@example.de) kündigt. Frau Neumann bleibt bis Ende Mai.';
        const result = await runPipeline(text, {
            detectors: [fakeDetector([['Claudia Neumann', 'PERSON'], ['claudia@example.de', 'EMAIL']])],
            session: createSession(),
        });

        expect(result.maskedText).toBe('PERSON_001 (EMAIL_001) kündigt. Frau PERSON_001 bleibt bis Ende Mai.');
    });

    it('keeps placeholders stable across prompts of one conversation', async () =>
    {
        const session = createSession();
        const detectors = [fakeDetector([['Anna Berg', 'PERSON'], ['Bob Stein', 'PERSON']])];

        await runPipeline('Schreib Anna Berg', { detectors, session });

        // the second prompt quotes the AI's answer, which already contains a placeholder
        const second = await runPipeline('PERSON_001 hat geantwortet. Jetzt Bob Stein und Anna Berg.', {
            detectors,
            session,
        });

        expect(second.maskedText).toBe('PERSON_001 hat geantwortet. Jetzt PERSON_002 und PERSON_001.');
    });

    it('never assigns a placeholder that appears literally in the text', async () =>
    {
        const session = createSession();
        const text = 'Was bedeutet PERSON_001 im Log von Anna?';
        const result = await runPipeline(text, { detectors: [fakeDetector([['Anna', 'PERSON']])], session });

        expect(result.maskedText).toBe('Was bedeutet PERSON_001 im Log von PERSON_002?');
        expect(restorePlaceholders(result.maskedText, session)).toBe(text);
    });

    it('continues without a failing detector and reports it', async () =>
    {
        const failing: Detector = {
            id: 'model:broken',
            detect: async () =>
            {
                throw new Error('WebGPU device lost');
            },
        };
        const result = await runPipeline('Mail a@b.de', {
            detectors: [failing, fakeDetector([['a@b.de', 'EMAIL']], { source: 'rule' }, 'rule:email')],
            session: createSession(),
        });

        expect(result.maskedText).toBe('Mail EMAIL_001');
        expect(result.failedDetectors).toEqual(['model:broken']);
    });

    it('skips disabled categories, also in propagation and the residual pass', async () =>
    {
        const result = await runPipeline('Anna, a@b.de, Anna', {
            detectors: [fakeDetector([['Anna', 'PERSON'], ['a@b.de', 'EMAIL']])],
            session: createSession(),
            enabledCategories: new Set(['EMAIL']),
        });

        expect(result.maskedText).toBe('Anna, EMAIL_001, Anna');
    });

    it('lets manual selections override detectors', async () =>
    {
        const text = 'Bestellung bei Bäckerei Hoffmann';
        const result = await runPipeline(text, {
            detectors: [fakeDetector([['Hoffmann', 'PERSON']])],
            session: createSession(),
            manualDetections: [detectionOf(text, 'Bäckerei Hoffmann', 'OTHER', { source: 'manual' })],
        });

        expect(result.maskedText).toBe('Bestellung bei OTHER_001');
    });

    it('extends a detection that ends inside a number, so no digit follows a placeholder', async () =>
    {
        const session = createSession();
        const text = 'Ref EMAIL_0023704 und Nummer 0171';
        // detects only the first digit of 0171, as a sloppy detector might
        const partial: Detector = {
            id: 'partial',
            detect: async (input) =>
            {
                const start = input.indexOf('0171');

                return start === -1 ? [] : [{ ...detectionOf(input, '0171', 'EMAIL'), end: start + 1 }];
            },
        };
        const result = await runPipeline(text, { detectors: [partial], session });

        expect(result.maskedText).toBe('Ref EMAIL_0023704 und Nummer EMAIL_001');
        expect(restorePlaceholders(result.maskedText, session)).toBe(text);
    });
});

describe('residual pass', () =>
{
    // finds Bob only once Anna is no longer in the text, like a model whose context changed
    const contextSensitive: Detector = {
        id: 'model:context',
        detect: async (text) =>
        {
            if (text.includes('Anna'))
            {
                return [detectionOf(text, 'Anna', 'PERSON', { source: 'model' })];
            }

            return text.includes('Bob') ? [detectionOf(text, 'Bob', 'PERSON', { source: 'model' })] : [];
        },
    };

    it('catches values found only in the masked text', async () =>
    {
        const result = await runPipeline('Anna trifft Bob', { detectors: [contextSensitive], session: createSession() });

        expect(result.maskedText).toBe('PERSON_001 trifft PERSON_002');
    });

    it('can be switched off', async () =>
    {
        const result = await runPipeline('Anna trifft Bob', {
            detectors: [contextSensitive],
            session: createSession(),
            residualPasses: 0,
        });

        expect(result.maskedText).toBe('PERSON_001 trifft Bob');
    });

    it('does not register placeholders from the trial rendering', async () =>
    {
        const session = createSession();

        await runPipeline('Anna trifft Bob', { detectors: [contextSensitive], session });

        expect(session.placeholders()).toEqual(['PERSON_001', 'PERSON_002']);
    });
});

describe('timing', () =>
{
    it('records each stage it runs, with the injected clock', async () =>
    {
        const recorded: string[] = [];
        let now = 0;

        await runPipeline('Anna', {
            detectors: [fakeDetector([['Anna', 'PERSON']])],
            session: createSession(),
            residualPasses: 0,
            timing: { now: () => (now += 1), record: (stage, milliseconds) => recorded.push(`${stage} ${milliseconds}`) },
        });

        expect(recorded).toEqual(['detect 1', 'prepare 1', 'render 1']);
    });
});

describe('progress', () =>
{
    // reports half its work before finishing, like a model going through windows
    const halfway: Detector = {
        id: 'model:halfway',
        detect: async (text, context) =>
        {
            context?.onProgress?.(0.5);
            await Promise.resolve();

            return text.includes('Anna') ? [detectionOf(text, 'Anna', 'PERSON', { source: 'model' })] : [];
        },
    };

    it('reports the mean of all detectors per pass, never moving backwards', async () =>
    {
        const progress: PipelineProgress[] = [];

        await runPipeline('Anna, a@b.de', {
            detectors: [halfway, fakeDetector([['a@b.de', 'EMAIL']], { source: 'rule' })],
            session: createSession(),
            residualPasses: 0,
            onProgress: (update) => progress.push(update),
        });

        const fractions = progress.map((update) => update.fraction);

        expect(progress.every((update) => update.stage === 'detect')).toBe(true);
        expect(fractions[0]).toBe(0.25);
        expect(fractions.at(-1)).toBe(1);
        expect(fractions).toEqual([...fractions].sort((left, right) => left - right));
    });

    it('reports the residual pass as its own stage', async () =>
    {
        const stages = new Set<string>();

        await runPipeline('Anna trifft Bob', {
            detectors: [halfway],
            session: createSession(),
            onProgress: (update) => stages.add(update.stage),
        });

        expect([...stages]).toEqual(['detect', 'residualDetect']);
    });
});

describe('cancellation', () =>
{
    it('rejects before detecting when the signal is already aborted', async () =>
    {
        const controller = new AbortController();
        let called = false;
        const detector: Detector = {
            id: 'model:never',
            detect: async () =>
            {
                called = true;
                return [];
            },
        };

        controller.abort();

        await expect(runPipeline('Anna', { detectors: [detector], session: createSession(), signal: controller.signal }))
            .rejects.toBeInstanceOf(PipelineCancelledError);
        expect(called).toBe(false);
    });

    it('drops partial results and leaves the session untouched when aborted during detection', async () =>
    {
        const controller = new AbortController();
        const session = createSession();
        // stops early on abort and returns what it has, as a model would after some windows
        const stopping: Detector = {
            id: 'model:stopping',
            detect: async (text, context) =>
            {
                controller.abort();

                return context?.signal?.aborted === true ? [detectionOf(text, 'Anna', 'PERSON')] : [];
            },
        };

        await expect(runPipeline('Anna', { detectors: [stopping], session, signal: controller.signal }))
            .rejects.toBeInstanceOf(PipelineCancelledError);
        expect(session.placeholders()).toEqual([]);
    });
});

describe('maskDetections', () =>
{
    it('masks known detections like the pipeline without a second pass', async () =>
    {
        const text = 'Claudia Neumann (claudia@example.de) kündigt. Frau Neumann bleibt, PERSON_001 ist ein Logwert.';
        const detector = fakeDetector([['Claudia Neumann', 'PERSON'], ['claudia@example.de', 'EMAIL']]);
        const piped = await runPipeline(text, { detectors: [detector], session: createSession(), residualPasses: 0 });
        const masked = maskDetections(text, await detector.detect(text), { session: createSession() });

        expect(masked).toEqual(piped);
    });

    it('lets manual selections win and skips disabled categories', () =>
    {
        const text = 'Bestellung bei Bäckerei Hoffmann, Mail a@b.de';
        const masked = maskDetections(text, [detectionOf(text, 'Hoffmann', 'PERSON'), detectionOf(text, 'a@b.de', 'EMAIL')], {
            session: createSession(),
            enabledCategories: new Set(['OTHER', 'PERSON']),
            manualDetections: [detectionOf(text, 'Bäckerei Hoffmann', 'OTHER', { source: 'manual' })],
        });

        expect(masked.maskedText).toBe('Bestellung bei OTHER_001, Mail a@b.de');
    });
});

describe('name parts the model found on its own', () =>
{
    // tags each listed value where it occurs, like a model that also tags a later surname
    const tagging = (text: string, values: ReadonlyArray<readonly [string, number]>): Detector =>
    {
        return { id: 'model', detect: async () => values.map(([value, occurrence]) => detectionOf(text, value, 'PERSON', { source: 'model', occurrence })) };
    };

    it('masks a surname with the full name\'s placeholder', async () =>
    {
        const text = 'Herr Markus Keller hat sich gemeldet. Herr Keller wohnt in Berlin, Markus ruft an.';
        const result = await runPipeline(text, {
            detectors: [tagging(text, [['Markus Keller', 0], ['Keller', 1], ['Markus', 1]])],
            session: createSession(),
            residualPasses: 0,
        });

        expect(result.maskedText).toBe('Herr PERSON_001 hat sich gemeldet. Herr PERSON_001 wohnt in Berlin, PERSON_001 ruft an.');
    });

    it('keeps a surname shared by two people apart from both', async () =>
    {
        const text = 'Markus Keller und Anna Keller kamen. Herr Keller blieb.';
        const result = await runPipeline(text, {
            detectors: [tagging(text, [['Markus Keller', 0], ['Anna Keller', 0], ['Keller', 2]])],
            session: createSession(),
            residualPasses: 0,
        });

        expect(result.maskedText).toBe('PERSON_001 und PERSON_002 kamen. Herr PERSON_003 blieb.');
    });

    it('restores the full name for a linked surname', async () =>
    {
        const session = createSession();
        const text = 'Markus Keller schrieb, Keller wartet.';
        const result = await runPipeline(text, { detectors: [tagging(text, [['Markus Keller', 0], ['Keller', 1]])], session, residualPasses: 0 });

        expect(result.maskedText).toBe('PERSON_001 schrieb, PERSON_001 wartet.');
        expect(restorePlaceholders(result.maskedText, session)).toBe('Markus Keller schrieb, Markus Keller wartet.');
    });
});
