import { describe, expect, it } from 'vitest';
import { findPhones } from '../../../packages/core/src/detect/rules/phone';

const found = (text: string) => findPhones(text).map((match) => text.slice(match.start, match.end));

describe('findPhones', () =>
{
    it.each([
        ['Tel: +1 713-555-1212\n', '+1 713-555-1212'],
        ['call +44 20 1234 5678 now', '+44 20 1234 5678'],
        ['Contact: [+1 (800) 123-4567]', '+1 (800) 123-4567'],
        ['Telefonas: +37063.857.3611', '+37063.857.3611'],
        ['Tel. +49 151 23456789 und', '+49 151 23456789'],
        ['+4915123456789', '+4915123456789'],
        ['Contact: (416) 123-4567\n', '(416) 123-4567'],
        ['call us at 1-800-123-4567.', '1-800-123-4567'],
        ['Phone: (712)424-2016x493\n', '(712)424-2016x493'],
        ['at 415.555.0100 today', '415.555.0100'],
        ['nummer: 038 921 8742.', '038 921 8742'],
        ['mobil 0171-2345678, oder', '0171-2345678'],
        ['Telefon: 0131-36.307-5487', '0131-36.307-5487'],
        ['llamando al 02 25 24 15 91.', '02 25 24 15 91'],
        ['Tel. 030 1234567 2021', '030 1234567'],
        ['support +49 30 1234567, 2021', '+49 30 1234567'],
        ['+49 151 2345678 1234 5678 9', '+49 151 2345678'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it.each([
        ['short numbers after a plus', 'Wachstum +12 %, +39 06, +1234'],
        ['more than 15 digits', '+1234567890123456789'],
        ['dates and SSNs', '2024-01-15, 123-45-6789, 15.08.2024, 01.02.2024 14'],
        ['short national numbers and plain digit runs', '030 12345, 0123456789'],
        ['NANP area codes starting with 0 or 1', '123-456-7890 und 199-345-6789'],
        ['amounts and plain numbers', '1.234.567,89 € und 12345678'],
        ['numbers inside IBANs and cards', 'DE89370400440532013000 4111 1111 1111 1111'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});
