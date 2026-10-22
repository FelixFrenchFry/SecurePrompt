import { describe, expect, it } from 'vitest';
import { findAccounts, isValidCardNumber, isValidIban, passesLuhn } from '../../../packages/core/src/detect/rules/account';

const found = (text: string) => findAccounts(text).map((match) => text.slice(match.start, match.end));

describe('findAccounts', () =>
{
    it.each([
        ['IBAN: DE89 3704 0044 0532 0130 00\nBIC', 'DE89 3704 0044 0532 0130 00'],
        ['IBAN GB82 WEST 1234 5698 7654 32', 'GB82 WEST 1234 5698 7654 32'],
        ['iban=DE89370400440532013000;', 'DE89370400440532013000'],
        ['Karte 4111 1111 1111 1111 (gültig', '4111 1111 1111 1111'],
        ['card 5555-5555-5555-4444.', '5555-5555-5555-4444'],
        ['Amex 378282246310005', '378282246310005'],
        ['SWIFT DEUTDEFF500, bitte', 'DEUTDEFF500'],
        ['BIC: COBADEFFXXX', 'COBADEFFXXX'],
        ['swift code BNCYCZJ0 for', 'BNCYCZJ0'],
        ['ID kartes nr.: ZM3544247', 'ZM3544247'],
        ['licences nr.: HH5Y3SYMLP', 'HH5Y3SYMLP'],
        ['identifier is BIO-7425983610.', 'BIO-7425983610'],
        ['CUST:CID-169805:', 'CID-169805'],
        ['Social Security Number: 123-45-6789 3.', '123-45-6789'],
        ['the SSN provided (406-65-7874).', '406-65-7874'],
        ['Field ID: 709793402', '709793402'],
        ['Maksukood: 99773140659', '99773140659'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it('finds the expiry date right after a card number', () =>
    {
        expect(found('Karte 4111 1111 1111 1111 (gültig bis 09/27, Prüfnummer 123)')).toEqual(['4111 1111 1111 1111', '09/27']);
        expect(found('card 5555-5555-5555-4444 exp 12/2029')).toEqual(['5555-5555-5555-4444', '12/2029']);
        expect(found('Karte 4111 1111 1111 1111, Termin am 15. Mai, Rate 1/3')).toEqual(['4111 1111 1111 1111']);
    });

    it.each([
        ['IBANs with a wrong check digit', 'DE89 3704 0044 0532 0130 01'],
        ['IBAN-shaped strings from non-IBAN countries', 'US64 SVBK US6S 3300 9673 86'],
        ['card-length numbers failing Luhn', '4111 1111 1111 1112'],
        ['numbers without a card issuer prefix', '0171 2345 6789 0123'],
        ['international phone numbers', 'Tel. +49 151 23456789 and +4915123456789'],
        ['short numbers, grouped amounts and decimals', 'Bestellung 12345678, 1.234.567.890 und 0,123456789'],
        ['amounts and decimals', '1.234.567.890.123,45 €'],
        ['BIC-shaped words without a country code', 'ABCDXXYZ and WXLMXQZJ'],
        ['lowercase words of BIC length', 'deutdeff and cobadeffxxx'],
        ['short codes and words without digits', 'COVID-19, MP3, ISO-9001, Q3-2024, TERMINATIONS'],
        ['SSN-shaped numbers outside the SSA ranges', '000-12-3456, 666-12-3456, 912-34-5678, 123-00-4567, 123-45-0000'],
        ['IDs with lowercase letters', 'Ye-6177 und iPhone15Pro'],
        ['BIC-shaped parts of longer tokens', 'DEUTDEFFA and XDEUTDEFF'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});

describe('checksums', () =>
{
    it('validates IBAN mod-97', () =>
    {
        expect(isValidIban('DE89370400440532013000')).toBe(true);
        expect(isValidIban('DE89370400440532013001')).toBe(false);
    });

    it('validates Luhn and issuer rules', () =>
    {
        expect(passesLuhn('79927398713')).toBe(true);
        expect(passesLuhn('79927398710')).toBe(false);
        expect(isValidCardNumber('6011111111111117')).toBe(true);
        expect(isValidCardNumber('4111 1111-1111 1111')).toBe(false);
    });
});
