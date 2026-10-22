import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PipelineCancelledError } from '../../packages/core/src/types';
import { BARDSAI_MODEL_ID, createBardsaiDetector } from '../../packages/model-runtime/src/bardsai/detector';

// runs the real model from .models/ (gitignored), skipped without it as in CI
const MODELS_DIR = resolve(import.meta.dirname, '../../.models');
const available = existsSync(resolve(MODELS_DIR, BARDSAI_MODEL_ID, 'onnx/model_quantized.onnx'));

describe.skipIf(!available)('bardsai detector (real model)', () =>
{
    const detector = createBardsaiDetector({ localModelPath: `${MODELS_DIR}/` });

    const found = async (text: string) =>
    {
        return (await detector.detect(text)).map((detection) => [text.slice(detection.start, detection.end), detection.category]);
    };

    it('finds German names, phones and addresses and leaves titles outside', async () =>
    {
        const result = await found('Sehr geehrter Herr Koch, bitte rufen Sie Frau Dr. Sabine Krüger unter 0221 9876543 an.');

        expect(result).toContainEqual(['Koch', 'PERSON']);
        expect(result).toContainEqual(['Sabine Krüger', 'PERSON']);
        expect(result).toContainEqual(['0221 9876543', 'PHONE']);
        expect(result.flat()).not.toContain('Herr');
    }, 60_000);

    it('handles text longer than one window and reports progress per batch', async () =>
    {
        const filler = 'Das Wetter ist heute schön und wir gehen spazieren. '.repeat(120);
        const text = `${filler}Kontakt: Petra Lange, Telefon 0176 55512345.`;
        const progress: number[] = [];
        const result = (await detector.detect(text, { onProgress: (fraction) => progress.push(fraction) }))
            .map((detection) => [text.slice(detection.start, detection.end), detection.category]);

        expect(result).toContainEqual(['Petra Lange', 'PERSON']);
        expect(result).toContainEqual(['0176 55512345', 'PHONE']);
        expect(progress.at(-1)).toBe(1);
        expect(progress).toEqual([...progress].sort((left, right) => left - right));
    }, 60_000);

    it('stops when cancelled', async () =>
    {
        const controller = new AbortController();

        controller.abort();

        await expect(detector.detect('Petra Lange', { signal: controller.signal })).rejects.toBeInstanceOf(PipelineCancelledError);
    }, 60_000);

    it('returns nothing for empty text', async () =>
    {
        expect(await detector.detect('   ')).toEqual([]);
    });
});
