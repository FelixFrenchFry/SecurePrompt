import { createRuleDetector, keepLongest, type RuleMatch } from './rule';

// account numbers and identifiers, validated by checksum:
// - IBAN: ISO 13616, mod-97 check digits
// - payment cards: issuer prefix, length (ISO/IEC 7812) and Luhn, plus a following MM/YY expiry
// unvalidated, structure only:
// - BIC/SWIFT codes: ISO 9362 structure with an ISO 3166 country code
// - US social security numbers within the SSA's assignable ranges
// - ID-shaped tokens: capitals and digits mixed, 8+ characters ("ZM3544247")
// - bare numeric IDs of 9-19 digits, including order and tracking numbers
// context-dependent IDs (customer numbers in prose, passports) are left to the model

// country code, check digits, then the account part, optionally grouped in fours
const IBAN = /(?<![\p{L}\p{N}_])[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}(?![\p{L}\p{N}_])/gu;
// 12-19 digits in optional space or dash groups, not after '+' like phone numbers
const CARD = /(?<![\p{L}\p{N}_.,+-])\d(?:[ -]?\d){11,18}(?![\p{L}\p{N}_]|[.,-]\d)/gu;
// the first MM/YY or MM/YYYY within reach after a card number, on the same line
const CARD_EXPIRY = /^[^\n\d]*?(?<![\d/])((?:0[1-9]|1[0-2])\/(?:\d{2}|20\d{2}))(?![\d/])/u;
const EXPIRY_REACH = 40;

// bank (4 letters), country (2), location (2), optional branch (3), in capitals only
const BIC = /(?<![\p{L}\p{N}_])[A-Z]{4}(?<country>[A-Z]{2})[A-Z0-9]{2}(?:[A-Z0-9]{3})?(?![\p{L}\p{N}_])/gu;

// ISO 3166-1 alpha-2, plus XK (Kosovo), which SWIFT uses
const COUNTRIES = new Set(
    (
        'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW ' +
        'BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET ' +
        'FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL ' +
        'IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA ' +
        'MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
        'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN ' +
        'SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG ' +
        'VI VN VU WF WS XK YE YT ZA ZM ZW'
    ).split(' '),
);

// document, customer and device IDs: capitals and digits mixed, 8+ characters ("BIO-7425983610")
const ID = /(?<![\p{L}\p{N}_-])[A-Z0-9]+(?:-[A-Z0-9]+)*(?![\p{L}\p{N}_]|-[\p{L}\p{N}])/gu;
const MIN_ID_LENGTH = 8;
// US social security number: area 001-899 except 666, group 01-99, serial 0001-9999
const SSN = /(?<![\p{L}\p{N}_-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\p{L}\p{N}_]|-\d)/gu;
// bare numeric IDs of 9-19 digits, unlike grouped amounts, decimals, years and postcodes
const NUMERIC_ID = /(?<![\p{L}\p{N}_+]|\d[.,])\d{9,19}(?![\p{L}\p{N}_]|[.,]\d)/gu;

// countries in the IBAN registry (SWIFT, ISO 13616)
const IBAN_COUNTRIES = new Set(
    (
        'AD AE AL AT AZ BA BE BG BH BI BR BY CH CR CY CZ DE DJ DK DO EE EG ES FI FK FO FR GB GE GI GL GR GT ' +
        'HR HU IE IL IQ IS IT JO KW KZ LB LC LI LT LU LV LY MC MD ME MK MN MR MT MU NI NL NO OM PK PL PS PT ' +
        'QA RO RS RU SA SC SD SE SI SK SM SO ST SV TL TN TR UA VA VG XK YE'
    ).split(' '),
);

export const isValidIban = (value: string): boolean =>
{
    const compact = value.replace(/ /g, '');

    if (compact.length < 15 || compact.length > 34 || !IBAN_COUNTRIES.has(compact.slice(0, 2)))
    {
        return false;
    }

    // move country code and check digits to the end, letters become 10-35, then mod 97
    const rearranged = compact.slice(4) + compact.slice(0, 4);
    let remainder = 0;

    for (const character of rearranged)
    {
        const digits = /\d/.test(character) ? character : String(character.charCodeAt(0) - 55);

        for (const digit of digits)
        {
            remainder = (remainder * 10 + Number(digit)) % 97;
        }
    }

    return remainder === 1;
};

export const passesLuhn = (digits: string): boolean =>
{
    let sum = 0;

    for (let index = 0; index < digits.length; index += 1)
    {
        let digit = Number(digits[digits.length - 1 - index]);

        if (index % 2 === 1)
        {
            digit *= 2;
            digit = digit > 9 ? digit - 9 : digit;
        }

        sum += digit;
    }

    return sum % 10 === 0;
};

// issuer prefixes and lengths of the major networks
const CARD_NETWORKS: Array<{ prefix: RegExp; lengths: number[] }> = [
    { prefix: /^4/, lengths: [13, 16, 19] }, // Visa
    { prefix: /^(?:5[1-5]|2(?:2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/, lengths: [16] }, // Mastercard
    { prefix: /^3[47]/, lengths: [15] }, // American Express
    { prefix: /^(?:6011|65|64[4-9])/, lengths: [16, 17, 18, 19] }, // Discover
    { prefix: /^35(?:2[89]|[3-8]\d)/, lengths: [16, 17, 18, 19] }, // JCB
    { prefix: /^3(?:0[0-5]|[689])/, lengths: [14, 15, 16, 17, 18, 19] }, // Diners Club
    { prefix: /^(?:5018|5020|5038|6304|6759|676[1-3])/, lengths: [12, 13, 14, 15, 16, 17, 18, 19] }, // Maestro
    { prefix: /^62/, lengths: [16, 17, 18, 19] }, // UnionPay
];

export const isValidCardNumber = (value: string): boolean =>
{
    const digits = value.replace(/[ -]/g, '');

    // a mix of spaces and dashes is not how card numbers are written
    if (/ /.test(value) && /-/.test(value))
    {
        return false;
    }

    return (
        CARD_NETWORKS.some((network) => network.prefix.test(digits) && network.lengths.includes(digits.length)) &&
        passesLuhn(digits)
    );
};

export const findAccounts = (text: string): RuleMatch[] =>
{
    const matches: RuleMatch[] = [];

    for (const match of text.matchAll(IBAN))
    {
        // try the whole match, then cut at spaces from the end, never character by character
        const cuts = [match[0].length, ...[...match[0].matchAll(/ /g)].map((space) => space.index).reverse()];
        const length = cuts.find((cut) => isValidIban(match[0].slice(0, cut)));

        if (length != null)
        {
            matches.push({ start: match.index, end: match.index + length, category: 'ACCOUNT', validated: true });
        }
    }

    for (const match of text.matchAll(CARD))
    {
        if (isValidCardNumber(match[0]))
        {
            const end = match.index + match[0].length;

            matches.push({ start: match.index, end, category: 'ACCOUNT', validated: true });

            // an MM/YY right after a card number is its expiry date
            const expiry = CARD_EXPIRY.exec(text.slice(end, end + EXPIRY_REACH));

            if (expiry != null)
            {
                const start = end + expiry.index + expiry[0].length - expiry[1]!.length;

                matches.push({ start, end: start + expiry[1]!.length, category: 'ACCOUNT', validated: true });
            }
        }
    }

    for (const match of text.matchAll(ID))
    {
        const compact = match[0].replace(/-/g, '');

        if (compact.length >= MIN_ID_LENGTH && /\d/.test(compact) && /[A-Z]/.test(compact))
        {
            matches.push({ start: match.index, end: match.index + match[0].length, category: 'ACCOUNT', validated: false });
        }
    }

    for (const match of text.matchAll(NUMERIC_ID))
    {
        matches.push({ start: match.index, end: match.index + match[0].length, category: 'ACCOUNT', validated: false });
    }

    for (const match of text.matchAll(SSN))
    {
        matches.push({ start: match.index, end: match.index + match[0].length, category: 'ACCOUNT', validated: true });
    }

    for (const match of text.matchAll(BIC))
    {
        if (COUNTRIES.has(match.groups!.country!))
        {
            matches.push({ start: match.index, end: match.index + match[0].length, category: 'ACCOUNT', validated: false });
        }
    }

    return keepLongest(matches);
};

export const accountRule = createRuleDetector('account', findAccounts);
