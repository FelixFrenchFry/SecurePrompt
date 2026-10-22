import type { Category, Detection, Detector } from '../../packages/core/src/types';

// a rule-like detection of the nth occurrence (default first) of value in text
export const detectionOf = (
    text: string,
    value: string,
    category: Category,
    overrides: Partial<Detection> & { occurrence?: number } = {},
): Detection =>
{
    const { occurrence = 0, ...rest } = overrides;
    let start = -1;

    for (let index = 0; index <= occurrence; index += 1)
    {
        start = text.indexOf(value, start + 1);
    }

    if (start === -1)
    {
        throw new Error(`'${value}' not found in test text`);
    }

    return {
        start,
        end: start + value.length,
        category,
        source: 'rule',
        detector: 'test',
        score: 1,
        validated: false,
        ...rest,
    };
};

// detects the first occurrence of each listed value, like a model that spots a value once
export const fakeDetector = (
    values: ReadonlyArray<readonly [string, Category]>,
    overrides: Partial<Detection> = {},
    id = 'fake',
): Detector =>
{
    return {
        id,
        detect: async (text) =>
        {
            return values
                .filter(([value]) => text.includes(value))
                .map(([value, category]) => detectionOf(text, value, category, { source: 'model', ...overrides }));
        },
    };
};
