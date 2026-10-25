import { describe, expect, it } from 'vitest';
import { createDownloadProgress } from '../../../apps/extension/source/model/download-progress';

const progress = (file: string, loaded: number, total: number) => ({ type: 'loading', status: 'progress', file, loaded, total }) as const;

describe('createDownloadProgress', () =>
{
    it('sums the bytes of all files and never moves backwards when a file starts later', () =>
    {
        const update = createDownloadProgress();

        expect(update(progress('model.onnx', 50, 100))).toEqual({ loaded: 50, total: 100, percent: 50 });
        expect(update(progress('tokenizer.json', 0, 100))).toEqual({ loaded: 50, total: 200, percent: 50 });
        expect(update(progress('tokenizer.json', 100, 100))?.percent).toBe(75);
    });

    it('measures against the expected size, so a small first file does not fill the bar', () =>
    {
        const update = createDownloadProgress(1000);

        expect(update(progress('tokenizer.json', 100, 100))).toEqual({ loaded: 100, total: 1000, percent: 10 });
        expect(update(progress('model.onnx', 400, 900))).toEqual({ loaded: 500, total: 1000, percent: 50 });
        expect(update(progress('model.onnx', 1000, 1000))).toEqual({ loaded: 1100, total: 1100, percent: 100 });
    });

    it('ignores other loading updates', () =>
    {
        const update = createDownloadProgress();

        expect(update({ type: 'loading', status: 'ready' })).toBeUndefined();
        expect(update({ type: 'loading', status: 'progress', file: 'model.onnx', loaded: 0, total: 0 })).toBeUndefined();
    });
});
