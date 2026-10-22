import { trimSpan } from '../spans';
import type { Category, Detection } from '../types';

// the model often tags a value but skips a short part next to it that still identifies:
// - a house number directly before or after a street ("5740 Brett Park", "Hauptstraße 5a")
// - an initial before or after a name part ("J. Allen", "Carla J.")
// - email characters it cut off ("o'connor@…", "…@health.com.au")
// same line only, a number or letter on the next line counts as a list item
const ADJACENT_PARTS: Partial<Record<Category, { before: RegExp; after: RegExp }>> = {
    ADDRESS: {
        before: /(?<![\p{L}\p{N}])\d{1,6}[a-zA-Z]?[ \t]$/u,
        after: /^[ \t]\d{1,6}[a-zA-Z]?(?![\p{L}\p{N}])/u,
    },
    PERSON: {
        before: /(?<![\p{L}\p{N}])\p{Lu}\.[ \t]$/u,
        after: /^[ \t]\p{Lu}\.(?![\p{L}\p{N}])/u,
    },
    EMAIL: {
        before: /[\p{L}\p{N}._%+'-]+$/u,
        after: /^(?:\.[\p{L}\p{N}-]+)+/u,
    },
};
const ADJACENT_REACH = 64;

const extendOverAdjacentParts = (text: string, detection: Detection): Detection =>
{
    const parts = ADJACENT_PARTS[detection.category];

    if (parts == null)
    {
        return detection;
    }

    const before = parts.before.exec(text.slice(Math.max(0, detection.start - ADJACENT_REACH), detection.start));
    const after = parts.after.exec(text.slice(detection.end, detection.end + ADJACENT_REACH));
    const start = before == null ? detection.start : detection.start - before[0].length;
    const end = after == null ? detection.end : detection.end + after[0].length;

    return start === detection.start && end === detection.end ? detection : { ...detection, start, end };
};

// combines detector outputs, drops disabled categories and invalid ranges, trims whitespace
export const mergeDetections = (
    text: string,
    detectionLists: ReadonlyArray<readonly Detection[]>,
    enabledCategories?: ReadonlySet<Category>,
): Detection[] =>
{
    const merged: Detection[] = [];

    for (const detections of detectionLists)
    {
        for (const detection of detections)
        {
            if (enabledCategories != null && !enabledCategories.has(detection.category))
            {
                continue;
            }

            if (
                !Number.isInteger(detection.start) ||
                !Number.isInteger(detection.end) ||
                detection.start < 0 ||
                detection.end > text.length
            )
            {
                continue;
            }

            const trimmed = extendOverAdjacentParts(text, trimSpan(text, detection));

            if (trimmed.end > trimmed.start)
            {
                merged.push(trimmed);
            }
        }
    }

    return merged;
};
