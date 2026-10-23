import { describe, expect, it } from 'vitest';
import { createMasker } from '../../../apps/extension/source/masking/masker';
import { CATEGORIES, type Category, type Detector } from '../../../packages/core/src/types';
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

describe('createMasker', () =>
{
    it('masks with the rules and the model, and repeats of a name share its placeholder', async () =>
    {
        const run = await createMasker({ rules, model }).mask(TEXT, { useModel: true, categories: ALL });

        expect(run.result.maskedText).toBe('PERSON_001 schreibt an EMAIL_001. Gruß, PERSON_001');
        expect(run.modelFailed).toBe(false);
    });

    it('leaves the model out when it is not used', async () =>
    {
        const run = await createMasker({ rules, model }).mask(TEXT, { useModel: false, categories: ALL });

        expect(run.result.maskedText).toBe('Anna Schmidt schreibt an EMAIL_001. Gruß, Schmidt');
    });

    it('falls back to the rules and says so when the model fails', async () =>
    {
        const run = await createMasker({ rules, model: failing }).mask(TEXT, { useModel: true, categories: ALL });

        expect(run.result.maskedText).toBe('Anna Schmidt schreibt an EMAIL_001. Gruß, Schmidt');
        expect(run.modelFailed).toBe(true);
    });

    it('keeps placeholders across prompts and knows their originals', async () =>
    {
        const masker = createMasker({ rules, model });

        await masker.mask('Mail an tom@example.de', { useModel: false, categories: ALL });

        const second = await masker.mask(`Neu: ${TEXT} und tom@example.de`, { useModel: false, categories: ALL });

        expect(second.result.maskedText).toBe('Neu: Anna Schmidt schreibt an EMAIL_002. Gruß, Schmidt und EMAIL_001');
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
            useModel: true,
            categories: ALL,
            onModelProgress: (fraction) => progress.push(fraction),
        });

        expect(progress).toEqual([0.5]);
        expect(run.milliseconds).toBe(250);
    });

    it('continues a stored session, ignores broken data and forgets on request', async () =>
    {
        const first = createMasker({ rules, model });

        await first.mask(TEXT, { useModel: true, categories: ALL });

        const reopened = createMasker({ rules, model });

        expect(reopened.load(JSON.parse(JSON.stringify(first.snapshot())))).toBe(true);
        expect(reopened.size()).toBe(2);
        expect((await reopened.mask('tom@example.de, Anna Schmidt', { useModel: true, categories: ALL })).result.maskedText).toBe('EMAIL_002, PERSON_001');
        expect(reopened.load({ entries: 'broken' })).toBe(false);
        expect(reopened.originalFor('PERSON_001')).toBe('Anna Schmidt');

        reopened.forget();

        expect(reopened.size()).toBe(0);
        expect(reopened.originalFor('PERSON_001')).toBeUndefined();
    });

    it('adds a selection that wins over detections and keeps earlier selections', async () =>
    {
        const masker = createMasker({ rules, model });
        const run = await masker.mask(TEXT, { useModel: true, categories: ALL });
        const greeting = detectionOf(TEXT, 'Gruß', 'OTHER');
        const withGreeting = masker.addSelection(run, greeting, ALL);
        const withName = masker.addSelection(withGreeting, detectionOf(TEXT, 'Anna Schmidt', 'ACCOUNT'), ALL);

        expect(withGreeting.result.maskedText).toBe('PERSON_001 schreibt an EMAIL_001. OTHER_001, PERSON_001');
        expect(withName.result.maskedText).toBe('ACCOUNT_001 schreibt an EMAIL_001. OTHER_001, PERSON_001');
        expect(withName.input).toBe(TEXT);
    });
});
