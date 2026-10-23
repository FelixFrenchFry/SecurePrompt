import { describe, expect, it } from 'vitest';
import {
    createEngine,
    createPrivatizedPromptPreview,
    createPrivatizedPromptWithManualItem,
    LocalModelFailedError,
} from '../../apps/extension/source/engine/adapter';
import type { LocalModelProgress, MaskingMapping, PrivacyBenchmark, PrivatizedPromptResult } from '../../apps/extension/source/engine/types';
import type { Detector } from '../../packages/core/src/types';
import { fakeDetector } from './../support/detections';

const TEXT = 'Anna Schmidt schreibt an lisa [at] example [dot] de: Termin am 14.03.2025, Gruß Anna Schmidt';

// a model that finds the full name, like bardsai would
const model = fakeDetector([['Anna Schmidt', 'PERSON']], {}, 'model:bardsai-v2');

const failingModel: Detector = {
    id: 'model:bardsai-v2',
    detect: async () =>
    {
        throw new Error('no WASM');
    },
};

// the masked text rebuilt from the segments, which the side panel renders
const fromSegments = (result: Pick<PrivatizedPromptResult, 'segments'>) => result.segments.map((segment) => segment.text).join('');

describe('createPrivatizedPromptAsync', () =>
{
    it('masks with the rules only by default', async () =>
    {
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(TEXT);

        expect(result.privatizedPrompt).toBe('Anna Schmidt schreibt an EMAIL_001: Termin am DATE_001, Gruß Anna Schmidt');
        expect(fromSegments(result)).toBe(result.privatizedPrompt);
        expect(result.items.every((item) => item.source === 'rules')).toBe(true);
        expect(result.safeToInject).toBe(true);
    });

    it('adds the model and lists one mapping per value with all its items', async () =>
    {
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(TEXT, { useLocalModelDetection: true });
        const person = result.maskingMappings.find((mapping) => mapping.category === 'PERSON')!;

        expect(result.privatizedPrompt).toBe('PERSON_001 schreibt an EMAIL_001: Termin am DATE_001, Gruß PERSON_001');
        expect(person).toMatchObject({ id: 'PERSON_001', original: 'Anna Schmidt', mask: 'PERSON_001' });
        expect(person.itemIds).toHaveLength(2);
        expect(result.items.filter((item) => item.source === 'model')).toHaveLength(1);
        expect(result.segments.filter((segment) => segment.type === 'mask').map((segment) => segment.mappingId)).toEqual(['PERSON_001', 'EMAIL_001', 'DATE_001', 'PERSON_001']);
    });

    it('keeps the placeholders of earlier results in the bundle', async () =>
    {
        const engine = createEngine({ modelDetector: model });
        const first = await engine.createPrivatizedPromptAsync('Mail an lisa [at] example [dot] de', {});
        const second = await engine.createPrivatizedPromptAsync('Neu: tom [at] example [dot] de und lisa [at] example [dot] de', {
            preferredMaskingMappings: first.maskingMappings,
        });

        expect(second.privatizedPrompt).toBe('Neu: EMAIL_002 und EMAIL_001');
    });

    it('skips earlier mappings that conflict instead of failing', async () =>
    {
        const conflicting: MaskingMapping[] = [
            { id: 'a', category: 'EMAIL', original: 'lisa [at] example [dot] de', mask: 'EMAIL_001', itemIds: [] },
            { id: 'b', category: 'EMAIL', original: 'tom [at] example [dot] de', mask: 'EMAIL_001', itemIds: [] },
        ];
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync('tom [at] example [dot] de', {
            preferredMaskingMappings: conflicting,
        });

        expect(result.privatizedPrompt).toBe('EMAIL_002');
    });

    it('leaves disabled categories readable and is not safe to send without any category', async () =>
    {
        const engine = createEngine({ modelDetector: model });
        const withoutDates = await engine.createPrivatizedPromptAsync(TEXT, { enabledCategories: { DATE: false } });
        const without = await engine.createPrivatizedPromptAsync(TEXT, {
            enabledCategories: Object.fromEntries(['EMAIL', 'PHONE', 'PERSON', 'ADDRESS', 'ACCOUNT', 'DATE', 'NETWORK', 'SECRET', 'OTHER'].map((category) => [category, false])),
        });

        expect(withoutDates.privatizedPrompt).toContain('14.03.2025');
        expect(without.privatizedPrompt).toBe(TEXT);
        expect(without.safeToInject).toBe(false);
    });

    it('rejects when the model fails, so the side panel falls back to rules', async () =>
    {
        const run = createEngine({ modelDetector: failingModel }).createPrivatizedPromptAsync(TEXT, { useLocalModelDetection: true });

        await expect(run).rejects.toBeInstanceOf(LocalModelFailedError);
    });

    it('reports model progress in percent and loading updates to the running request', async () =>
    {
        const progress: LocalModelProgress[] = [];
        const halfway: Detector = {
            id: 'model:bardsai-v2',
            detect: async (_text, context) =>
            {
                context?.onProgress?.(0.5);
                return [];
            },
        };
        const engine = createEngine({ modelDetector: halfway });

        // updates outside a run reach no one
        engine.handleModelLoading({ status: 'ready' });
        await engine.createPrivatizedPromptAsync('Hallo', { useLocalModelDetection: true, onLocalModelProgress: (update) => progress.push(update) });
        engine.handleModelLoading({ status: 'ready' });

        // only the model's own progress, the rules finishing doesn't move the bar
        expect(progress.map((update) => [update.phase, update.progress])).toEqual([['inference', 50], ['postprocess', undefined]]);
    });

    it('reports the download over all model files, never moving backwards', async () =>
    {
        const progress: LocalModelProgress[] = [];
        const MB = 1024 * 1024;
        let engine: ReturnType<typeof createEngine>;
        // downloads while the request waits: the tokenizer first, then the much larger model joins
        const downloading: Detector = {
            id: 'model:bardsai-v2',
            detect: async () =>
            {
                engine.handleModelLoading({ status: 'progress', file: 'tokenizer.json', loaded: 20 * MB, total: 40 * MB });
                engine.handleModelLoading({ status: 'progress', file: 'onnx/model_quantized.onnx', loaded: 0, total: 300 * MB });
                engine.handleModelLoading({ status: 'progress', file: 'tokenizer.json', loaded: 40 * MB, total: 40 * MB });
                engine.handleModelLoading({ status: 'progress', file: 'onnx/model_quantized.onnx', loaded: 150 * MB, total: 300 * MB });
                engine.handleModelLoading({ status: 'progress', file: 'onnx/model_quantized.onnx', loaded: 300 * MB, total: 300 * MB });
                engine.handleModelLoading({ status: 'ready' });
                return [];
            },
        };

        engine = createEngine({ modelDetector: downloading });
        await engine.createPrivatizedPromptAsync('Hallo', { useLocalModelDetection: true, onLocalModelProgress: (update) => progress.push(update) });

        const downloads = progress.filter((update) => update.phase === 'download');

        expect(downloads.map((update) => Math.round(update.progress!))).toEqual([50, 50, 50, 56, 100]);
        expect(downloads.at(-1)).toMatchObject({ loadedBytes: 340 * MB, totalBytes: 340 * MB });
        expect(progress.some((update) => update.phase === 'load')).toBe(true);
    });

    it('reports timings and counts without any text', async () =>
    {
        let benchmark: PrivacyBenchmark | undefined;

        await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(TEXT, {
            useLocalModelDetection: true,
            onBenchmark: (report) => (benchmark = report),
        });

        expect(benchmark).toMatchObject({ inputCharacters: TEXT.length, inputLines: 1, localModelEnabled: true, itemCount: 4, safeToInject: true });
        expect(benchmark!.stages.map((stage) => stage.stage)).toEqual(['modelDetection', 'resultAssembly', 'finalization']);
        expect(JSON.stringify(benchmark)).not.toMatch(/Anna|lisa|14\.03/);
    });
});

describe('createPrivatizedPromptPreview', () =>
{
    it('shows the values of ignored mappings as plain text', async () =>
    {
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(TEXT, { useLocalModelDetection: true });
        const preview = createPrivatizedPromptPreview(TEXT, result, { ignoredMappingIds: ['PERSON_001'] });

        expect(preview.privatizedPrompt).toBe('Anna Schmidt schreibt an EMAIL_001: Termin am DATE_001, Gruß Anna Schmidt');
        expect(fromSegments(preview)).toBe(preview.privatizedPrompt);
        expect(preview.segments.filter((segment) => segment.type === 'text')).toHaveLength(3);
        expect(createPrivatizedPromptPreview(TEXT, result).privatizedPrompt).toBe(result.privatizedPrompt);
    });
});

describe('createPrivatizedPromptWithManualItem', () =>
{
    it('masks a selected name and its other mentions, keeping earlier placeholders', async () =>
    {
        const text = 'Frau Hoffmann, lisa [at] example [dot] de, wieder Frau Hoffmann';
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(text);
        const start = text.indexOf('Hoffmann');
        const next = createPrivatizedPromptWithManualItem(text, { ...result, safeToInject: false }, { category: 'PERSON', start, end: start + 'Hoffmann'.length });

        expect(next.privatizedPrompt).toBe('Frau PERSON_001, EMAIL_001, wieder Frau PERSON_001');
        expect(next.items.find((item) => item.source === 'manual')).toMatchObject({ value: 'Hoffmann' });
        expect(next.safeToInject).toBe(false);
    });

    it('masks a selected OTHER value only where it was selected, as OTHER values are not repeated', async () =>
    {
        const text = 'Bäckerei Hoffmann und wieder Bäckerei Hoffmann';
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(text);
        const next = createPrivatizedPromptWithManualItem(text, result, { category: 'OTHER', start: 0, end: 'Bäckerei Hoffmann'.length });

        expect(next.privatizedPrompt).toBe('OTHER_001 und wieder Bäckerei Hoffmann');
    });

    it('lets a selection win over an overlapping detected value', async () =>
    {
        const result = await createEngine({ modelDetector: model }).createPrivatizedPromptAsync(TEXT, { useLocalModelDetection: true });
        const start = TEXT.indexOf('Schmidt');
        const next = createPrivatizedPromptWithManualItem(TEXT, result, { category: 'OTHER', start, end: start + 'Schmidt'.length });

        expect(next.privatizedPrompt.startsWith('OTHER_001 schreibt')).toBe(true);
    });

    it('keeps a surname under the full name\'s placeholder when another value is selected', async () =>
    {
        const text = 'Claudia Neumann kündigt. Frau Neumann bleibt bis Mai. Bestellung bei Bäckerei Hoffmann.';
        const fullName = fakeDetector([['Claudia Neumann', 'PERSON']], {}, 'model:bardsai-v2');
        const result = await createEngine({ modelDetector: fullName }).createPrivatizedPromptAsync(text, { useLocalModelDetection: true });
        const start = text.indexOf('Bäckerei Hoffmann');
        const next = createPrivatizedPromptWithManualItem(text, result, { category: 'OTHER', start, end: start + 'Bäckerei Hoffmann'.length });

        expect(result.privatizedPrompt).toBe('PERSON_001 kündigt. Frau PERSON_001 bleibt bis Mai. Bestellung bei Bäckerei Hoffmann.');
        expect(next.privatizedPrompt).toBe('PERSON_001 kündigt. Frau PERSON_001 bleibt bis Mai. Bestellung bei OTHER_001.');
        expect(next.maskingMappings.find((mapping) => mapping.mask === 'PERSON_001')).toMatchObject({ original: 'Claudia Neumann' });
    });
});
