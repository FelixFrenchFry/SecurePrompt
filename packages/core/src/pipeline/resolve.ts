import { compareSpans } from '../spans';
import type { Category, Detection } from '../types';

// one policy for all overlaps, without per-category special cases:
// - overlapping detections become one span covering all of them
// - its category comes from the most trusted detection:
//   manual > validated rule > model > propagated > unvalidated rule,
//   then higher score, longer span, more sensitive category (SECRET over NETWORK)
const SENSITIVITY: readonly Category[] = [
    'SECRET',
    'ACCOUNT',
    'EMAIL',
    'PHONE',
    'PERSON',
    'ADDRESS',
    'DATE',
    'NETWORK',
    'OTHER',
];

const TRUST: Record<string, number> = {
    manual: 4,
    validatedRule: 3,
    model: 2,
    propagated: 1,
    rule: 0,
};

const trustOf = (detection: Detection): number =>
{
    if (detection.source === 'rule')
    {
        return detection.validated ? TRUST.validatedRule! : TRUST.rule!;
    }

    return TRUST[detection.source]!;
};

const compareTrust = (left: Detection, right: Detection): number =>
{
    return (
        trustOf(right) - trustOf(left) ||
        right.score - left.score ||
        right.end - right.start - (left.end - left.start) ||
        left.start - right.start ||
        SENSITIVITY.indexOf(left.category) - SENSITIVITY.indexOf(right.category)
    );
};

// returns non-overlapping detections sorted by position
export const resolveOverlaps = (detections: readonly Detection[]): Detection[] =>
{
    const sorted = [...detections].sort(compareSpans);
    const resolved: Detection[] = [];
    let group: Detection[] = [];
    let groupEnd = -1;

    const flush = () =>
    {
        if (group.length === 0)
        {
            return;
        }

        const winner = [...group].sort(compareTrust)[0]!;
        const start = group[0]!.start;

        resolved.push({
            ...winner,
            start,
            end: groupEnd,
            score: Math.max(...group.map((detection) => detection.score)),
        });
        group = [];
    };

    for (const detection of sorted)
    {
        if (detection.start >= groupEnd)
        {
            flush();
        }

        group.push(detection);
        groupEnd = Math.max(groupEnd, detection.end);
    }

    flush();

    return resolved;
};
