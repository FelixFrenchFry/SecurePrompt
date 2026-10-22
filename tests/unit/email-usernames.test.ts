import { describe, expect, it } from 'vitest';
import { detectionOf } from '../support/detections';
import { propagateMentions } from '../../packages/core/src/pipeline/propagate';

const propagated = (text: string, email: string) =>
{
    return propagateMentions(text, [detectionOf(text, email, 'EMAIL')])
        .filter((detection) => detection.source === 'propagated')
        .map((detection) => [text.slice(detection.start, detection.end), detection.category]);
};

describe('email local parts as usernames', () =>
{
    it.each([
        ['dotted local part', 'Mail minho.kim@corp.example, gez. minho.kim', 'minho.kim@corp.example', [['minho.kim', 'ACCOUNT']]],
        ['underscore, other case', 'evgeny_petrov@x.example created by Evgeny_Petrov', 'evgeny_petrov@x.example', [['Evgeny_Petrov', 'ACCOUNT']]],
        ['role address stays a word', 'support@x.example: contact support today', 'support@x.example', []],
        ['no separator stays a word', 'jbrandt@x.example and jbrandt', 'jbrandt@x.example', []],
        ['digits are not a name spelling', 'a.b12@x.example and a.b12', 'a.b12@x.example', []],
        ['only whole words', 'minho.kim@x.example and minho.kimball', 'minho.kim@x.example', []],
    ])('%s', (_name, text, email, expected) =>
    {
        expect(propagated(text, email)).toEqual(expected);
    });
});
