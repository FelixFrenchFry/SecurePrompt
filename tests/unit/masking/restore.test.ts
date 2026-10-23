import { describe, expect, it } from 'vitest';
import { answerParts, restoredText } from '../../../apps/extension/source/masking/restore';

const ORIGINALS: Record<string, string> = { PERSON_001: 'Markus Keller', EMAIL_001: 'markus@web.de', OTHER_1000: 'v1000' };
const originalFor = (placeholder: string) => ORIGINALS[placeholder];

describe('answerParts', () =>
{
    it('restores known placeholders with their category and keeps the text around them', () =>
    {
        expect(answerParts('Hallo PERSON_001, siehe EMAIL_001.', originalFor)).toEqual([
            { kind: 'text', text: 'Hallo ' },
            { kind: 'restored', placeholder: 'PERSON_001', category: 'PERSON', text: 'Markus Keller' },
            { kind: 'text', text: ', siehe ' },
            { kind: 'restored', placeholder: 'EMAIL_001', category: 'EMAIL', text: 'markus@web.de' },
            { kind: 'text', text: '.' },
        ]);
    });

    it('flags placeholders this session never gave out', () =>
    {
        expect(answerParts('PERSON_002 hilft', originalFor)).toEqual([
            { kind: 'unknown', placeholder: 'PERSON_002' },
            { kind: 'text', text: ' hilft' },
        ]);
    });

    it('matches whole placeholders only, with letters allowed after but no digits', () =>
    {
        const text = '**PERSON_001**s PERSON_001s XPERSON_001 EMAIL_0011 OTHER_1000';

        expect(restoredText(answerParts(text, originalFor))).toBe('**Markus Keller**s Markus Kellers XPERSON_001 EMAIL_0011 v1000');
    });

    it('leaves an answer without placeholders as it is', () =>
    {
        expect(answerParts('', originalFor)).toEqual([]);
        expect(restoredText(answerParts('Danke!', originalFor))).toBe('Danke!');
    });
});
