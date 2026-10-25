import { describe, expect, it } from 'vitest';
import { composerHolds } from '../../../apps/extension/source/sites/composer-text';

const INSERTED = 'NOTE: Placeholders like PERSON_001 stand for values.\n\nHallo PERSON_001,\nbitte antworte.';

describe('composerHolds', () =>
{
    it('accepts the text as a rich editor reads it back, with paragraphs instead of blank lines', () =>
    {
        // ChatGPT's ProseMirror input: one <p> per line, an empty <p> for the blank line
        expect(composerHolds('NOTE: Placeholders like PERSON_001 stand for values.\n\n\n\nHallo PERSON_001,\n\nbitte antworte.', INSERTED)).toBe(true);
        expect(composerHolds('NOTE:\u00a0Placeholders like PERSON_001 stand for values. Hallo PERSON_001,\u200b bitte antworte.\n', INSERTED)).toBe(true);
    });

    it('rejects missing, changed or doubled text', () =>
    {
        expect(composerHolds('', INSERTED)).toBe(false);
        expect(composerHolds('Hallo PERSON_001, bitte antworte.', INSERTED)).toBe(false);
        expect(composerHolds(`${INSERTED}\n${INSERTED}`, INSERTED)).toBe(false);
    });
});
