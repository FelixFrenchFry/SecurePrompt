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

    it('ignores other loading updates', () =>
    {
        const update = createDownloadProgress();

        expect(update({ type: 'loading', status: 'ready' })).toBeUndefined();
        expect(update({ type: 'loading', status: 'progress', file: 'model.onnx', loaded: 0, total: 0 })).toBeUndefined();
    });
});
