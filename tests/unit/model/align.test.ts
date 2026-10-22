import { describe, expect, it } from 'vitest';
import { alignTokens, metaspacePieceBytes } from '../../../packages/model-runtime/src/align';

const surfaces = (text: string, pieces: string[], toBytes = metaspacePieceBytes) =>
{
    return alignTokens(text, pieces.map(toBytes)).map((span) => (span == null ? null : text.slice(span.start, span.end)));
};

describe('alignTokens with Metaspace pieces (bardsai)', () =>
{
    it('maps pieces with leading spaces, including a prepended one at the start', () =>
    {
        expect(surfaces('Herr Koch', ['▁Herr', '▁Koch'])).toEqual(['Herr', ' Koch']);
    });

    it('handles double spaces and pieces without a space', () =>
    {
        expect(surfaces('Koch  wohnt', ['▁Koch', '▁▁', 'wohnt'])).toEqual(['Koch', '  ', 'wohnt']);
    });

    it('handles a prepended space after a newline', () =>
    {
        expect(surfaces('😀\nTel.', ['▁😀', '\n', '▁Tel', '.'])).toEqual(['😀', '\n', 'Tel', '.']);
    });

    it('skips whitespace the tokenizer dropped before special tokens', () =>
    {
        expect(surfaces('5678 <mask> Grüße', ['5', '6', '7', '8', '<mask>', '▁Grüße'])).toEqual([
            '5', '6', '7', '8', '<mask>', ' Grüße',
        ]);
    });

    it('gives all byte tokens of a character that character', () =>
    {
        // '🦜' is F0 9F A6 9C in UTF-8
        expect(surfaces('a🦜b', ['▁a', '<0xF0>', '<0x9F>', '<0xA6>', '<0x9C>', 'b'])).toEqual([
            'a', '🦜', '🦜', '🦜', '🦜', 'b',
        ]);
    });

    it('resynchronizes after a piece it cannot place', () =>
    {
        expect(surfaces('abc def', ['▁abc', '▁xyz', '▁def'])).toEqual(['abc', null, ' def']);
    });
});
