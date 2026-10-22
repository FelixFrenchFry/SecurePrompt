import { describe, expect, it } from 'vitest';
import { createWindows } from '../../../packages/model-runtime/src/windows';

describe('createWindows', () =>
{
    it('uses one window for short inputs', () =>
    {
        expect(createWindows(100, 510, 128)).toEqual([{ start: 0, end: 100 }]);
    });

    it('overlaps windows by 128 tokens and covers every token', () =>
    {
        const windows = createWindows(1200, 510, 128);

        expect(windows).toEqual([
            { start: 0, end: 510 },
            { start: 382, end: 892 },
            { start: 764, end: 1200 },
        ]);
    });

    it('rejects an overlap as large as the window', () =>
    {
        expect(() => createWindows(100, 10, 10)).toThrow(RangeError);
    });
});
