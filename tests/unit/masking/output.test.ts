import { describe, expect, it } from 'vitest';
import { composeInput, type AttachedFile } from '../../../apps/extension/source/masking/compose';
import { categoryCounts, excerptOf, outputParts, outputText, placeholderDetails, trimSelection } from '../../../apps/extension/source/masking/output';
import { maskDetections } from '../../../packages/core/src/pipeline/run';
import { createSession } from '../../../packages/core/src/session';
import { detectionOf } from '../../support/detections';

const TEXT = 'Anna Schmidt (anna@example.de), Gruß Schmidt';
const result = maskDetections(
    TEXT,
    [detectionOf(TEXT, 'Anna Schmidt', 'PERSON', { source: 'model', detector: 'model:bardsai-v2' }), detectionOf(TEXT, 'anna@example.de', 'EMAIL', { detector: 'rule:email' })],
    { session: createSession() },
);

const file = (text: string, overrides: Partial<AttachedFile> = {}): AttachedFile => ({ id: 'f', fileName: 'kündigung_schmidt.txt', format: 'txt', size: text.length, text, ...overrides });

describe('composeInput', () =>
{
    it('appends files by number in code fences, never by name', () =>
    {
        const input = composeInput('Fass zusammen:', [file('Hallo'), file('# Titel', { format: 'md' })]);

        expect(input).toBe('Fass zusammen:\n\nAttached file 1 (txt):\n\n```txt\nHallo\n```\n\nAttached file 2 (md):\n\n```markdown\n# Titel\n```');
        expect(input).not.toContain('schmidt');
    });

    it('uses a longer fence than any in the file and skips empty files and prompts', () =>
    {
        expect(composeInput('  ', [file('a ```` b'), file(' \n')])).toBe('Attached file 1 (txt):\n\n`````txt\na ```` b\n`````');
    });
});

describe('outputParts and outputText', () =>
{
    it('shows placeholders, with the source positions of kept text', () =>
    {
        const parts = outputParts(TEXT, result, new Set());

        expect(outputText(parts)).toBe('PERSON_001 (EMAIL_001), Gruß PERSON_001');
        expect(parts[1]).toEqual({ kind: 'text', text: ' (', start: 12 });
    });

    it('keeps each masked mention\'s original for the review tooltip', () =>
    {
        const parts = outputParts(TEXT, result, new Set());

        expect(parts[0]).toEqual({ kind: 'mask', placeholder: 'PERSON_001', category: 'PERSON', text: 'Anna Schmidt' });
        expect(parts.at(-1)).toEqual({ kind: 'mask', placeholder: 'PERSON_001', category: 'PERSON', text: 'Schmidt' });
    });

    it('sends every mention of a revealed placeholder as written', () =>
    {
        const parts = outputParts(TEXT, result, new Set(['PERSON_001']));

        expect(outputText(parts)).toBe('Anna Schmidt (EMAIL_001), Gruß Schmidt');
        expect(parts.filter((part) => part.kind === 'revealed')).toHaveLength(2);
    });
});

describe('excerptOf', () =>
{
    it('shortens long values to 40 characters', () =>
    {
        expect(excerptOf('L01X00T47')).toBe('L01X00T47');
        expect(excerptOf('x'.repeat(41))).toBe(`${'x'.repeat(39)}…`);
    });
});

describe('categoryCounts', () =>
{
    it('counts values, not mentions, in category order', () =>
    {
        expect(categoryCounts(result)).toEqual([
            { category: 'EMAIL', count: 1 },
            { category: 'PERSON', count: 1 },
        ]);
    });
});

describe('placeholderDetails', () =>
{
    it('describes a placeholder by its first non-repeated mention', () =>
    {
        expect(placeholderDetails(result, 'PERSON_001')).toEqual({ placeholder: 'PERSON_001', category: 'PERSON', mentions: 2, source: 'model', detector: 'model:bardsai-v2' });
        expect(placeholderDetails(result, 'PERSON_404')).toBeUndefined();
    });
});

describe('trimSelection', () =>
{
    it('drops surrounding whitespace and empty selections', () =>
    {
        expect(trimSelection('a  Gruß \nb', { start: 1, end: 9 })).toEqual({ start: 3, end: 7 });
        expect(trimSelection('a  \n b', { start: 1, end: 5 })).toBeUndefined();
    });
});
