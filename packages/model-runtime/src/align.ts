import type { Span } from '@secureprompt/core';

// recovers token character offsets, which transformers.js tokenizers don't return
// tokens are raw UTF-8 bytes of Metaspace pieces ('▁' is a space, '<0xF0>' a single byte)
// all tokens of a split multi-byte character share its span, and placing handles:
// - a leading space the text doesn't have (prepended at the start or after a newline)
// - whitespace the tokenizer dropped (before special tokens such as '<mask>')
// returns one span per token, or null where a token couldn't be placed

const WHITESPACE = /\s/;
// how far ahead to search when a token doesn't match at the cursor
const RESYNC_WINDOW = 32;

const utf8Length = (leadByte: number): number =>
{
    if (leadByte < 0x80 || (leadByte & 0xc0) === 0x80)
    {
        // ASCII, or a stray continuation byte that is decoded on its own
        return 1;
    }

    if (leadByte >= 0xf0)
    {
        return 4;
    }

    return leadByte >= 0xe0 ? 3 : 2;
};

const utf8 = new TextEncoder();

// '▁Köln' → bytes of ' Köln', '<0xF0>' → [0xF0]
export const metaspacePieceBytes = (piece: string): Uint8Array =>
{
    const byte = /^<0x([0-9A-Fa-f]{2})>$/.exec(piece);

    return byte == null ? utf8.encode(piece.replaceAll('▁', ' ')) : Uint8Array.of(Number.parseInt(byte[1]!, 16));
};

export const alignTokens = (text: string, tokens: readonly Uint8Array[]): Array<Span | null> =>
{
    const offsets: Array<Span | null> = new Array(tokens.length).fill(null);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let cursor = 0;
    let pendingBytes: number[] = [];
    // tokens whose bytes are in pendingBytes
    let pendingTokens: number[] = [];

    const place = (surface: string): Span | null =>
    {
        const candidates = surface.startsWith(' ') ? [surface, surface.slice(1)] : [surface];

        // exact, then without a prepended space, then past whitespace the tokenizer dropped
        for (let skip = cursor; skip <= text.length; skip += 1)
        {
            for (const candidate of candidates)
            {
                if (candidate.length > 0 && text.startsWith(candidate, skip))
                {
                    cursor = skip + candidate.length;
                    return { start: skip, end: cursor };
                }
            }

            if (skip >= text.length || !WHITESPACE.test(text[skip]!))
            {
                break;
            }
        }

        // last resort: resynchronize on the next nearby occurrence
        for (const candidate of candidates)
        {
            const found = candidate.length > 0 ? text.indexOf(candidate, cursor) : -1;

            if (found !== -1 && found - cursor <= RESYNC_WINDOW)
            {
                cursor = found + candidate.length;
                return { start: found, end: cursor };
            }
        }

        return null;
    };

    tokens.forEach((bytes, index) =>
    {
        pendingBytes.push(...bytes);
        pendingTokens.push(index);

        // decode only complete characters, a split character waits for its remaining bytes
        let complete = 0;

        while (complete < pendingBytes.length)
        {
            const length = utf8Length(pendingBytes[complete]!);

            if (complete + length > pendingBytes.length)
            {
                break;
            }

            complete += length;
        }

        if (complete === 0)
        {
            return;
        }

        const span = place(decoder.decode(Uint8Array.from(pendingBytes.slice(0, complete))));
        const carried = pendingBytes.slice(complete);

        for (const tokenIndex of pendingTokens)
        {
            offsets[tokenIndex] = span;
        }

        // the current token also holds the start of the next character
        pendingBytes = carried;
        pendingTokens = carried.length > 0 ? [index] : [];
    });

    return offsets;
};
