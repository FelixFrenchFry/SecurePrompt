import { createRuleDetector, keepLongest, type RuleMatch } from './rule';

// specific calendar dates and clock times in EU notations, each a real calendar day (no 31.02.)
// not matched: bare years ("1990"), months ("März 2025"), quarters ("Q3"), relative words

const MONTHS: Record<string, number> = {};
const MONTH_NAMES: string[] = [];

const addMonths = (names: string[][], alsoCapitalized = false) =>
{
    names.forEach((variants, index) =>
    {
        for (const name of variants)
        {
            // the first language wins a shared spelling, affecting only the days-in-month check
            MONTHS[name.toLowerCase()] ??= index + 1;
            MONTH_NAMES.push(name);

            // names written lowercase mid-sentence are capitalized at a sentence start
            if (alsoCapitalized)
            {
                MONTH_NAMES.push(name[0]!.toUpperCase() + name.slice(1));
            }
        }
    });
};

// full names and common abbreviations, 'mai'/'may' only count next to a day number
addMonths([
    ['Januar', 'Jänner', 'Jan', 'January'],
    ['Februar', 'Feb', 'February'],
    ['März', 'Mär', 'Mrz', 'March', 'Mar'],
    ['April', 'Apr'],
    ['Mai', 'May'],
    ['Juni', 'Jun', 'June'],
    ['Juli', 'Jul', 'July'],
    ['August', 'Aug'],
    ['September', 'Sep', 'Sept'],
    ['Oktober', 'Okt', 'October', 'Oct'],
    ['November', 'Nov'],
    ['Dezember', 'Dez', 'December', 'Dec'],
]);

// full names in other EU languages (fr, es, it, nl, pt, pl, cs, sk, ro, sv/da), plus genitives
addMonths(
    [
        ['janvier', 'enero', 'gennaio', 'januari', 'janeiro', 'styczeń', 'stycznia', 'leden', 'ledna', 'január', 'januára', 'ianuarie'],
        ['février', 'febrero', 'febbraio', 'februari', 'fevereiro', 'luty', 'lutego', 'únor', 'února', 'február', 'februára', 'februarie'],
        ['mars', 'marzo', 'maart', 'março', 'marzec', 'marca', 'březen', 'března', 'marec', 'martie', 'marts'],
        ['avril', 'abril', 'aprile', 'kwiecień', 'kwietnia', 'duben', 'dubna', 'apríl', 'apríla', 'aprilie'],
        ['mayo', 'maggio', 'mei', 'maio', 'maj', 'maja', 'květen', 'května', 'máj', 'mája'],
        ['juin', 'junio', 'giugno', 'junho', 'czerwiec', 'czerwca', 'červen', 'června', 'jún', 'júna', 'iunie'],
        ['juillet', 'julio', 'luglio', 'julho', 'lipiec', 'lipca', 'červenec', 'července', 'júl', 'júla', 'iulie'],
        ['août', 'agosto', 'augustus', 'sierpień', 'sierpnia', 'srpen', 'srpna', 'augusti', 'augusta'],
        ['septembre', 'septiembre', 'settembre', 'setembro', 'wrzesień', 'września', 'září', 'septembra', 'septembrie'],
        ['octobre', 'octubre', 'ottobre', 'outubro', 'październik', 'października', 'říjen', 'října', 'október', 'októbra', 'octombrie'],
        ['novembre', 'noviembre', 'novembro', 'listopad', 'listopada', 'listopadu', 'novembra', 'noiembrie'],
        ['décembre', 'diciembre', 'dicembre', 'december', 'dezembro', 'grudzień', 'grudnia', 'prosinec', 'prosince', 'decembra', 'decembrie'],
    ],
    true,
);

// the remaining EU languages (el, bg, fi, et, lv, lt, hu, hr, sl, mt), with inflected forms
addMonths(
    [
        ['Ιανουαρίου', 'Ιανουάριος', 'Ιαν', 'януари', 'tammikuuta', 'tammikuu', 'jaanuar', 'janvāris', 'janvārī', 'sausio', 'sausis', 'siječnja', 'siječanj', 'januar', 'Jannar'],
        ['Φεβρουαρίου', 'Φεβρουάριος', 'Φεβ', 'февруари', 'helmikuuta', 'helmikuu', 'veebruar', 'februāris', 'februārī', 'vasario', 'vasaris', 'veljače', 'veljača', 'február', 'Frar'],
        ['Μαρτίου', 'Μάρτιος', 'Μαρ', 'март', 'maaliskuuta', 'maaliskuu', 'märts', 'marts', 'martā', 'kovo', 'kovas', 'ožujka', 'ožujak', 'március', 'Marzu'],
        ['Απριλίου', 'Απρίλιος', 'Απρ', 'април', 'huhtikuuta', 'huhtikuu', 'aprill', 'aprīlis', 'aprīlī', 'balandžio', 'balandis', 'travnja', 'travanj', 'április', 'April'],
        ['Μαΐου', 'Μάιος', 'Μαΐ', 'май', 'toukokuuta', 'toukokuu', 'maijs', 'maijā', 'gegužės', 'gegužė', 'svibnja', 'svibanj', 'május', 'Mejju'],
        ['Ιουνίου', 'Ιούνιος', 'Ιουν', 'юни', 'kesäkuuta', 'kesäkuu', 'juuni', 'jūnijs', 'jūnijā', 'birželio', 'birželis', 'lipnja', 'lipanj', 'junij', 'június', 'Ġunju'],
        ['Ιουλίου', 'Ιούλιος', 'Ιουλ', 'юли', 'heinäkuuta', 'heinäkuu', 'juuli', 'jūlijs', 'jūlijā', 'liepos', 'liepa', 'srpnja', 'srpanj', 'julij', 'július', 'Lulju'],
        ['Αυγούστου', 'Αύγουστος', 'Αυγ', 'август', 'elokuuta', 'elokuu', 'augusts', 'augustā', 'rugpjūčio', 'rugpjūtis', 'kolovoza', 'kolovoz', 'avgust', 'augusztus', 'Awwissu'],
        ['Σεπτεμβρίου', 'Σεπτέμβριος', 'Σεπ', 'септември', 'syyskuuta', 'syyskuu', 'septembris', 'septembrī', 'rugsėjo', 'rugsėjis', 'rujna', 'rujan', 'szeptember', 'Settembru'],
        ['Οκτωβρίου', 'Οκτώβριος', 'Οκτ', 'октомври', 'lokakuuta', 'lokakuu', 'oktoober', 'oktobris', 'oktobrī', 'spalio', 'spalis', 'listopada', 'listopad', 'október', 'Ottubru'],
        ['Νοεμβρίου', 'Νοέμβριος', 'Νοε', 'ноември', 'marraskuuta', 'marraskuu', 'novembris', 'novembrī', 'lapkričio', 'lapkritis', 'studenoga', 'studenog', 'studeni', 'Novembru'],
        ['Δεκεμβρίου', 'Δεκέμβριος', 'Δεκ', 'декември', 'joulukuuta', 'joulukuu', 'detsember', 'decembris', 'decembrī', 'gruodžio', 'gruodis', 'prosinca', 'prosinac', 'Diċembru'],
    ],
    true,
);

const WEEKDAYS = [
    'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
    'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'Mon', 'Tue', 'Tues', 'Wed', 'Thu', 'Thur', 'Thurs', 'Fri', 'Sat', 'Sun',
];

// longest first so 'September' isn't read as 'Sep' + 'tember'
const MONTH = `(?<month>${[...new Set(MONTH_NAMES)].sort((left, right) => right.length - left.length).join('|')})\\.?`;

// abbreviated month names in EU languages (CLDR), only between a day number and a 4-digit year
const MONTH_ABBREVIATIONS = [
    ['janv', 'ene', 'gen', 'sty', 'led', 'ian', 'tammik'],
    ['févr', 'fév', 'fev', 'lut', 'úno', 'febr', 'helmik'],
    ['mrt', 'bře', 'márc', 'maalisk'],
    ['avr', 'abr', 'kwi', 'dub', 'ápr', 'huhtik'],
    ['mag', 'kvě', 'máj', 'toukok'],
    ['juin', 'giu', 'cze', 'čvn', 'iun', 'jún', 'kesäk'],
    ['juil', 'lug', 'lip', 'čvc', 'iul', 'júl', 'heinäk'],
    ['août', 'ago', 'sie', 'srp', 'elok'],
    ['set', 'wrz', 'zář', 'szept', 'syysk'],
    ['ott', 'out', 'paź', 'říj', 'lokak'],
    ['lis', 'marrask'],
    ['déc', 'dic', 'dez', 'gru', 'pro', 'jouluk'],
];
const ABBREVIATION_NAMES: string[] = [];

MONTH_ABBREVIATIONS.forEach((variants, index) =>
{
    for (const name of variants)
    {
        MONTHS[name] ??= index + 1;
        ABBREVIATION_NAMES.push(name);
    }
});

// full names and abbreviations, for the patterns that require a year
const MONTH_OR_ABBREVIATION = `(?<month>${[...new Set([...MONTH_NAMES, ...ABBREVIATION_NAMES])].sort((left, right) => right.length - left.length).join('|')})\\.?`;
const WEEKDAY = `(?:(?:${WEEKDAYS.sort((left, right) => right.length - left.length).join('|')})\\.?,?\\s+)?`;
const DAY = '(?<day>\\d{1,2})';
// ordinal markers after a day: 3rd, 1er, 21e, 13º, and the German period (23.)
const ORDINAL = '(?:st|nd|rd|th|er|e|º|°|ª|\\.)?';
// the end of a day range: "15-17 June", "June 15–17", "12.–14.03."
const RANGE_END = `(?:\\s?[-–]\\s?\\d{1,2}${ORDINAL})?`;
const YEAR = '(?<year>\\d{4}|\\d{2})';
const YEAR4 = '(?<year>\\d{4})';
// a time-zone abbreviation or UTC offset after a time: "08:15 GMT", "10:15 AM CST", "(UTC+2)"
const ZONE_NAMES = 'UTC|GMT|CET|CEST|EET|EEST|WET|WEST|BST|IST|MSK|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AKST|AKDT|HST|AEST|AEDT|JST|KST';
const ZONE_OFFSET = '(?:[+-]\\d{1,2}(?::?\\d{2})?)?';
const ZONE_REQUIRED = `(?:\\s*(?:${ZONE_NAMES})${ZONE_OFFSET}|\\s*\\((?:${ZONE_NAMES})${ZONE_OFFSET}\\))`;
const ZONE = `${ZONE_REQUIRED}?`;
// an optional clock time after a date: "14.02.2025, 14:00 Uhr", "2025-03-14T09:22:51Z"
const TIME_SUFFIX = `(?:,?\\s*(?:um\\s+|at\\s+)?\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*(?:Uhr|h|[AaPp]\\.?[Mm]\\.?))?${ZONE})?`;
// invisible direction marks around separators in right-to-left text ("03\u200f/12\u200f/1928")
const BIDI = '[\\u200E\\u200F]?';
// not glued to letters, digits or another dot-number (version numbers like 2.4.12.1)
const BEFORE = '(?<![\\p{L}\\p{N}_]|\\d[.:/-])';
const AFTER = '(?![\\p{L}\\p{N}_]|[.:/-]\\d)';

const PATTERNS: Array<{ pattern: RegExp; order: 'dmy' | 'mdy' | 'ymd' | 'dmy-or-mdy' }> = [
    // 14.03.2025, 1.6.25, 14.03.2025 14:00
    { pattern: new RegExp(`${BEFORE}${DAY}\\.(?:\\s?[-–]\\s?\\d{1,2}\\.)?(?<monthNumber>\\d{1,2})\\.${YEAR}${TIME_SUFFIX}${AFTER}`, 'gu'), order: 'dmy' },
    // 2025-03-14, 2025/03/14, 2025-03-14T09:22:51Z, 2025-02-11 08:15:02
    {
        pattern: new RegExp(
            `${BEFORE}${YEAR4}(?<separator>[-/])(?<monthNumber>\\d{2})\\k<separator>${DAY}(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?${TIME_SUFFIX}${AFTER}`,
            'gu',
        ),
        order: 'ymd',
    },
    // ISO 8601 basic format (20230312, 20220322-123015, 20230312T0930), years 1900-2099 only
    {
        pattern: new RegExp(`${BEFORE}(?<year>(?:19|20)\\d{2})(?<monthNumber>\\d{2})(?<day>\\d{2})(?:[T-]\\d{6}|T\\d{4})?${AFTER}`, 'gu'),
        order: 'ymd',
    },
    // 04/17/1968 or 17/04/1968: valid if either reading is a real date
    { pattern: new RegExp(`${BEFORE}${DAY}${BIDI}/${BIDI}(?<monthNumber>\\d{1,2})${BIDI}/${BIDI}${YEAR}${AFTER}`, 'gu'), order: 'dmy-or-mdy' },
    // 15-08-2024 or 08-15-2024, four-digit years only so "10-12-24" ranges don't match
    { pattern: new RegExp(`${BEFORE}${DAY}-(?<monthNumber>\\d{1,2})-${YEAR4}${TIME_SUFFIX}${AFTER}`, 'gu'), order: 'dmy-or-mdy' },
    // written out: Freitag, 14. März 2025 · 20. Januar · 30 April 2025 · 12 Jan 2019
    {
        pattern: new RegExp(`${BEFORE}${WEEKDAY}${DAY}${ORDINAL}${RANGE_END}\\s+(?:de\\s+|of\\s+)?${MONTH}(?:,?\\s+(?:de\\s+)?${YEAR4})?${TIME_SUFFIX}${AFTER}`, 'giu'),
        order: 'dmy',
    },
    // abbreviations need the year: 15 févr. 2022 · 22 de ago. de 1963 · 31 lip 1951
    {
        pattern: new RegExp(`${BEFORE}${WEEKDAY}${DAY}${ORDINAL}\\s+(?:de\\s+)?${MONTH_OR_ABBREVIATION},?\\s+(?:de\\s+)?${YEAR4}${TIME_SUFFIX}${AFTER}`, 'giu'),
        order: 'dmy',
    },
    // year first (hu, lt), case-sensitive (2024. január 14. · 2024 m. sausio 14 d.)
    {
        pattern: new RegExp(`${BEFORE}${YEAR4}(?:\\.|\\s+m\\.)?\\s+${MONTH}\\s+${DAY}(?:\\s+d\\.|\\.)?${AFTER}`, 'gu'),
        order: 'dmy',
    },
    // year first with "gada" (lv, "of the year"): 2024. gada 14. janvārī
    { pattern: new RegExp(`${BEFORE}${YEAR4}\\.\\s+gada\\s+${DAY}\\.\\s+${MONTH}${AFTER}`, 'giu'), order: 'dmy' },
    // numeric year first, as in Hungarian (2024. 01. 14. · 1921. 5. 16.)
    { pattern: new RegExp(`${BEFORE}${YEAR4}\\.\\s?(?<monthNumber>\\d{1,2})\\.\\s?${DAY}\\.?${AFTER}`, 'gu'), order: 'ymd' },
    // 25-Jun-2020 · 03-März-2021: both dashes, so word joins like "3-Mai" don't count
    { pattern: new RegExp(`${BEFORE}${DAY}-${MONTH}-${YEAR4}${TIME_SUFFIX}${AFTER}`, 'giu'), order: 'dmy' },
    // month first: March 3, 2025 · Monday, March 3rd · May 5, case-sensitive ("you may 5 times")
    {
        pattern: new RegExp(`${BEFORE}${WEEKDAY}${MONTH}\\s+${DAY}${ORDINAL}${RANGE_END}(?:,?\\s+${YEAR4})?${TIME_SUFFIX}${AFTER}`, 'gu'),
        order: 'mdy',
    },
];

// a clock time with a marker ("17:30 Uhr", "9:15 am", "08:15 GMT") or seconds ("19:45:22")
// bare times ("14:00", "10h30") stay readable, times next to a date go with it (TIME_SUFFIX)
const CLOCK = '(?:[01]?\\d|2[0-3]):[0-5]\\d';
const MERIDIEM = '\\s*(?:Uhr|[AaPp]\\.?[Mm]\\.?)';
const SECONDS = ':[0-5]\\d(?:\\.\\d{1,9})?(?:Z|[+-](?:[01]\\d|2[0-3]):?[0-5]\\d)?';
const TIME = new RegExp(
    `${BEFORE}(?:${CLOCK}(?:${SECONDS}(?:${MERIDIEM})?|${MERIDIEM})${ZONE}|${CLOCK}${ZONE_REQUIRED})${AFTER}`,
    'gu',
);

const daysInMonth = (month: number, year: number | null): number =>
{
    if (month === 2)
    {
        // without a year, allow the 29th
        return year == null || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;
    }

    return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const isRealDate = (day: number, month: number, year: number | null): boolean =>
{
    if (year != null && (year < 1800 || year > 2199))
    {
        return false;
    }

    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month, year);
};

const toYear = (value: string | undefined): number | null =>
{
    if (value == null)
    {
        return null;
    }

    const year = Number.parseInt(value, 10);

    // two-digit years: 00-69 → 2000s, 70-99 → 1900s
    return value.length === 2 ? (year < 70 ? 2000 + year : 1900 + year) : year;
};

export const findDates = (text: string): RuleMatch[] =>
{
    const matches: RuleMatch[] = [];

    for (const { pattern, order } of PATTERNS)
    {
        for (const match of text.matchAll(pattern))
        {
            const groups = match.groups!;
            const day = Number.parseInt(groups.day!, 10);
            const year = toYear(groups.year);
            const month = groups.monthNumber != null ? Number.parseInt(groups.monthNumber, 10) : MONTHS[groups.month!.toLowerCase()]!;
            // two-digit years need two-digit day and month ("01.06.25"), unlike versions ("2.4.12")
            const versionLike =
                groups.monthNumber != null && groups.year?.length === 2 && (groups.day!.length < 2 || groups.monthNumber.length < 2);
            const valid =
                !versionLike &&
                (order === 'dmy-or-mdy'
                    ? isRealDate(day, month, year) || isRealDate(month, day, year)
                    : isRealDate(day, month, year));

            if (valid)
            {
                matches.push({ start: match.index, end: match.index + match[0].length, category: 'DATE', validated: true });
            }
        }
    }

    for (const match of text.matchAll(TIME))
    {
        matches.push({ start: match.index, end: match.index + match[0].length, category: 'DATE', validated: true });
    }

    return keepLongest(matches);
};

export const dateRule = createRuleDetector('date', findDates);
