import { describe, expect, it } from 'vitest';
import { createMasker, DetectorFailedError, ModelFailedError } from '../../../apps/extension/source/masking/masker';
import { CATEGORIES, PipelineCancelledError, type Category, type Detector } from '../../../packages/core/src/types';
import { detectionOf, fakeDetector } from '../../support/detections';

const ALL: ReadonlySet<Category> = new Set(CATEGORIES);
const TEXT = 'Anna Schmidt schreibt an anna@example.de. Gruß, Schmidt';

const rules = [fakeDetector([['anna@example.de', 'EMAIL'], ['tom@example.de', 'EMAIL']], { source: 'rule', validated: true }, 'rule:email')];
const model = fakeDetector([['Anna Schmidt', 'PERSON']], {}, 'model:bardsai-v2');

const failing: Detector = {
    id: 'model:bardsai-v2',
    detect: async () =>
    {
        throw new Error('no WASM');
    },
};

const pausedDetector = (detector: Detector) =>
{
    let start = () => {};
    let resume = () => {};
    const started = new Promise<void>((resolve) => { start = resolve; });
    const waiting = new Promise<void>((resolve) => { resume = resolve; });

    return {
        started,
        resume,
        detector: {
            id: detector.id,
            detect: async (text, context) =>
            {
                start();
                await waiting;
                return detector.detect(text, context);
            },
        } satisfies Detector,
    };
};

const seededMasker = async (detector: Detector) =>
{
    const previous = createMasker({ rules, model });
    const first = await previous.mask(TEXT, { categories: ALL });
    const masker = createMasker({ rules, model: detector });

    masker.load(previous.snapshot());

    return { masker, first };
};

describe('createMasker', () =>
{
    it('masks with the rules and the model, and repeats of a name share its placeholder', async () =>
    {
        const run = await createMasker({ rules, model }).mask(TEXT, { categories: ALL });

        expect(run.result.maskedText).toBe('PERSON_001 schreibt an EMAIL_001. Gruß, PERSON_001');
    });

    it('masks nothing when the model fails, and keeps the session unchanged', async () =>
    {
        const masker = createMasker({ rules, model: failing });

        await expect(masker.mask(TEXT, { categories: ALL })).rejects.toThrow(ModelFailedError);
        expect(masker.size()).toBe(0);
        expect(masker.originalFor('EMAIL_001')).toBeUndefined();
    });

    it('masks nothing when a rule fails, and keeps the session unchanged', async () =>
    {
        const broken: Detector = {
            id: 'rule:broken',
            detect: async () =>
            {
                throw new Error('no rule');
            },
        };
        const previous = createMasker({ rules, model });

        await previous.mask(TEXT, { categories: ALL });

        const masker = createMasker({ rules: [...rules, broken], model });

        masker.load(previous.snapshot());

        const before = masker.snapshot();

        await expect(masker.mask('tom@example.de', { categories: ALL })).rejects.toThrow(DetectorFailedError);
        expect(masker.snapshot()).toEqual(before);
    });

    it('keeps placeholders across prompts and knows their originals', async () =>
    {
        const masker = createMasker({ rules, model });

        await masker.mask('Mail an tom@example.de', { categories: ALL });

        const second = await masker.mask(`Neu: ${TEXT} und tom@example.de`, { categories: ALL });

        expect(second.result.maskedText).toBe('Neu: PERSON_001 schreibt an EMAIL_002. Gruß, PERSON_001 und EMAIL_001');
        expect(masker.originalFor('EMAIL_001')).toBe('tom@example.de');
    });

    it('reports only the model\'s progress and measures the run', async () =>
    {
        let now = 0;
        const progress: number[] = [];
        const halfway: Detector = {
            id: 'model:bardsai-v2',
            detect: async (_text, context) =>
            {
                context?.onProgress?.(0.5);
                now += 250;
                return [];
            },
        };
        const run = await createMasker({ rules, model: halfway, now: () => now }).mask(TEXT, {
            categories: ALL,
            onModelProgress: (fraction) => progress.push(fraction),
        });

        expect(progress).toEqual([0.5]);
        expect(run.milliseconds).toBe(250);
    });

    it('continues a stored session, ignores broken data and forgets on request', async () =>
    {
        const first = createMasker({ rules, model });

        await first.mask(TEXT, { categories: ALL });

        const reopened = createMasker({ rules, model });

        expect(reopened.load(JSON.parse(JSON.stringify(first.snapshot())))).toBe(true);
        expect(reopened.size()).toBe(2);
        expect((await reopened.mask('tom@example.de, Anna Schmidt', { categories: ALL })).result.maskedText).toBe('EMAIL_002, PERSON_001');
        expect(reopened.load({ entries: 'broken' })).toBe(false);
        expect(reopened.originalFor('PERSON_001')).toBe('Anna Schmidt');

        reopened.forget();

        expect(reopened.size()).toBe(0);
        expect(reopened.originalFor('PERSON_001')).toBeUndefined();
    });

    it('moves every mention of a placeholder to another category under one new placeholder', async () =>
    {
        const masker = createMasker({ rules, model });
        const run = await masker.mask(TEXT, { categories: ALL });
        const relabeled = masker.relabel(run, 'PERSON_001', 'ACCOUNT', ALL);
        const again = masker.relabel(relabeled, 'ACCOUNT_001', 'OTHER', ALL);

        expect(relabeled.result.maskedText).toBe('ACCOUNT_001 schreibt an EMAIL_001. Gruß, ACCOUNT_001');
        expect(masker.originalFor('ACCOUNT_001')).toBe('Anna Schmidt');
        expect(again.result.maskedText).toBe('OTHER_001 schreibt an EMAIL_001. Gruß, OTHER_001');
        expect(masker.relabel(run, 'PERSON_404', 'DATE', ALL)).toBe(run);
    });

    it('adds a selection that wins over detections and keeps earlier selections', async () =>
    {
        const masker = createMasker({ rules, model });
        const run = await masker.mask(TEXT, { categories: ALL });
        const greeting = detectionOf(TEXT, 'Gruß', 'OTHER');
        const withGreeting = masker.addSelection(run, greeting, ALL);
        const withName = masker.addSelection(withGreeting, detectionOf(TEXT, 'Anna Schmidt', 'ACCOUNT'), ALL);

        expect(withGreeting.result.maskedText).toBe('PERSON_001 schreibt an EMAIL_001. OTHER_001, PERSON_001');
        expect(withName.result.maskedText).toBe('ACCOUNT_001 schreibt an EMAIL_001. OTHER_001, PERSON_001');
        expect(withName.input).toBe(TEXT);
    });

    it('keeps manual selections made while another prompt is being scanned', async () =>
    {
        const paused = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const { masker, first } = await seededMasker(paused.detector);
        const pending = masker.mask('Bert Fischer', { categories: ALL });

        await paused.started;

        const edited = masker.addSelection(first, detectionOf(TEXT, 'Gruß', 'PERSON'), ALL);

        paused.resume();

        const second = await pending;

        expect(edited.result.maskedText).toBe('PERSON_001 schreibt an EMAIL_001. PERSON_002, PERSON_001');
        expect(masker.originalFor('PERSON_002')).toBe('Gruß');
        expect(second.result.maskedText).toBe('PERSON_003');
        expect(masker.originalFor('PERSON_003')).toBe('Bert Fischer');
    });

    it('keeps category changes made while another prompt is being scanned', async () =>
    {
        const paused = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const { masker, first } = await seededMasker(paused.detector);
        const pending = masker.mask('Bert Fischer', { categories: ALL });

        await paused.started;
        masker.relabel(first, 'PERSON_001', 'ACCOUNT', ALL);
        paused.resume();
        await pending;

        expect(masker.originalFor('ACCOUNT_001')).toBe('Anna Schmidt');
        expect(masker.originalFor('PERSON_002')).toBe('Bert Fischer');
    });

    it('discards a scan when the session was forgotten while detecting', async () =>
    {
        const paused = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const { masker } = await seededMasker(paused.detector);
        const pending = masker.mask('Bert Fischer', { categories: ALL });

        await paused.started;
        masker.forget();

        const rejected = expect(pending).rejects.toBeInstanceOf(PipelineCancelledError);

        paused.resume();
        await rejected;

        expect(masker.snapshot()).toEqual({ entries: [] });
    });

    it('discards a scan when another session was loaded while detecting', async () =>
    {
        const paused = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const { masker } = await seededMasker(paused.detector);
        const pending = masker.mask('Bert Fischer', { categories: ALL });
        const replacement = { entries: [{ category: 'PERSON', value: 'Claudia Neumann', placeholder: 'PERSON_001' }] };

        await paused.started;
        expect(masker.load(replacement)).toBe(true);

        const rejected = expect(pending).rejects.toBeInstanceOf(PipelineCancelledError);

        paused.resume();
        await rejected;

        expect(masker.snapshot()).toEqual(replacement);
    });

    it('continues a scan when a broken session load was rejected', async () =>
    {
        const paused = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const { masker } = await seededMasker(paused.detector);
        const pending = masker.mask('Bert Fischer', { categories: ALL });

        await paused.started;
        expect(masker.load({ entries: 'broken' })).toBe(false);
        paused.resume();

        expect((await pending).result.maskedText).toBe('PERSON_002');
        expect(masker.originalFor('PERSON_001')).toBe('Anna Schmidt');
        expect(masker.originalFor('PERSON_002')).toBe('Bert Fischer');
    });

    it('keeps existing mappings when the model fails on a later prompt', async () =>
    {
        const paused = pausedDetector(failing);
        const { masker } = await seededMasker(paused.detector);
        const before = masker.snapshot();
        const pending = masker.mask('tom@example.de', { categories: ALL });

        await paused.started;

        const rejected = expect(pending).rejects.toThrow(ModelFailedError);

        paused.resume();
        await rejected;

        expect(masker.snapshot()).toEqual(before);
    });

    it('keeps existing mappings when a scan is cancelled', async () =>
    {
        const paused = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const { masker } = await seededMasker(paused.detector);
        const before = masker.snapshot();
        const controller = new AbortController();
        const pending = masker.mask('Bert Fischer', { categories: ALL, signal: controller.signal });

        await paused.started;
        controller.abort();

        const rejected = expect(pending).rejects.toBeInstanceOf(PipelineCancelledError);

        paused.resume();
        await rejected;

        expect(masker.snapshot()).toEqual(before);
    });

    it('keeps both prompts when concurrent scans finish in reverse order', async () =>
    {
        const bert = pausedDetector(fakeDetector([['Bert Fischer', 'PERSON']], {}, model.id));
        const claudia = pausedDetector(fakeDetector([['Claudia Neumann', 'PERSON']], {}, model.id));
        const { masker } = await seededMasker({
            id: model.id,
            detect: (text, context) => (text.includes('Bert') ? bert.detector : claudia.detector).detect(text, context),
        });
        const first = masker.mask('Bert Fischer', { categories: ALL });
        const second = masker.mask('Claudia Neumann', { categories: ALL });

        await Promise.all([bert.started, claudia.started]);
        claudia.resume();

        expect((await second).result.maskedText).toBe('PERSON_002');

        bert.resume();

        expect((await first).result.maskedText).toBe('PERSON_003');
        expect(masker.originalFor('PERSON_001')).toBe('Anna Schmidt');
        expect(masker.originalFor('PERSON_002')).toBe('Claudia Neumann');
        expect(masker.originalFor('PERSON_003')).toBe('Bert Fischer');
    });
});
