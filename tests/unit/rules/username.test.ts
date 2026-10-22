import { describe, expect, it } from 'vitest';
import { findUsernames } from '../../../packages/core/src/detect/rules/username';

const found = (text: string) => findUsernames(text).map((match) => text.slice(match.start, match.end));

describe('findUsernames', () =>
{
    it.each([
        ['User Name: ethan.lamoureux\n', 'ethan.lamoureux'],
        ['| 10:30 AM | carlos.rojas    | Running', 'carlos.rojas'],
        ['submitted by user name: ramy.khalil, on', 'ramy.khalil'],
        ['The account holder, r.muniz, has', 'r.muniz'],
        ['**Document Prepared By:** ali.aljabiri', 'ali.aljabiri'],
        ['**By:** ali.aljabiri\n\n**Contact Email:**', 'ali.aljabiri'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it.each([
        ['file names and domains', 'open main.py, package.json and example.com or wikipedia.org'],
        ['dotted chains', 'os.path.join and entity.dxf.start'],
        ['method calls and assignments', 'items.reduce(fn) and x = self.layer and sum + item.price'],
        ['code blocks', '```py\nprint(user.address)\n```\nand `config.timeout` here'],
        ['email addresses', 'carlos.rojas@example.com'],
        ['capitalized words', 'Carlos.Rojas and Mr.Smith'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});
