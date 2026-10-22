import { describe, expect, it } from 'vitest';
import { RULE_NAMES, RULES } from '../../../packages/core/src/detect/rules';

describe('RULES', () =>
{
    it('wraps each rule as a detector named after it', () =>
    {
        expect(RULE_NAMES.map((name) => RULES[name].id)).toEqual(RULE_NAMES.map((name) => `rule:${name}`));
    });

    it('reports rule matches as full-confidence rule detections', async () =>
    {
        const text = 'Mail lisa [at] example [dot] de or call +49 30 1234 5678 on 14.03.2025';
        const detections = (await Promise.all(RULE_NAMES.map((name) => RULES[name].detect(text)))).flat();

        expect(detections.map((detection) => [text.slice(detection.start, detection.end), detection.detector])).toEqual([
            ['14.03.2025', 'rule:date'],
            ['+49 30 1234 5678', 'rule:phone'],
            ['lisa [at] example [dot] de', 'rule:email'],
        ]);
        expect(detections.every((detection) => detection.source === 'rule' && detection.score === 1)).toBe(true);
    });
});
