import { describe, expect, it } from 'vitest';
import { findCoordinates } from '../../../packages/core/src/detect/rules/location';

const found = (text: string) => findCoordinates(text).map((match) => text.slice(match.start, match.end));

describe('findCoordinates', () =>
{
    it.each([
        ['**Property Coordinates:** 22.1551, -80.4359\n', '22.1551, -80.4359'],
        ['at 52.5200,13.4050 (Berlin)', '52.5200,13.4050'],
        ['-33.8688, 151.2093.', '-33.8688, 151.2093'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it.each([
        ['single decimals', 'pi is 3.14159 and e is 2.71828'],
        ['pairs with too few decimals', '1.5, 2.25 and 12.34, 56.78'],
        ['values out of range', '95.1234, 10.1234 and 45.1234, 190.1234'],
        ['decimal lists', 'values 0.1234, 0.5678, 0.9012'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});
