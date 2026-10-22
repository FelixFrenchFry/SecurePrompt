import { casual, strict } from 'chrono-node/en';
import type { SensitiveItem } from '../../types';

const DATE_DETECTION_CONFIDENCE = 0.9;
const DATE_PERIOD_DETECTION_CONFIDENCE = 0.88;
const DATE_RELATIVE_DETECTION_CONFIDENCE = 0.78;
const CHRONO_REFERENCE_DATE = new Date(Date.UTC(2026, 4, 13, 12, 0, 0));
const EXISTING_PLACEHOLDER_PATTERN =
    /^(?:EMAIL|PHONE|PERSON|ADDRESS|ACCOUNT|DATE|NETWORK|SECRET|OTHER)_\d{3,}$/;
const FISCAL_YEAR_PATTERN = /\bFY\s?\d{4}\b/gi;
const QUARTER_PATTERN = /\b(?:Q[1-4][ \t-]+\d{4}|\d{4}[ \t-]+Q[1-4])\b/gi;
const ISO_WEEK_PATTERN = /\b\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])\b/gi;
const ISO_ORDINAL_DATE_PATTERN =
    /\b\d{4}-(?:00[1-9]|0[1-9]\d|[12]\d{2}|3[0-5]\d|36[0-6])\b/g;
const ISO_DATE_TIME_VALUE_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})(?:[tT]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const LOCAL_NUMERIC_DATE_VALUE_PATTERN =
    /^(\d{1,2})([./-])(\d{1,2})\2(\d{2}|\d{4})$/;
const BROAD_ISO_WEEK_VALUE_PATTERN = /^(\d{4})-W(\d{2})$/;
const BROAD_ISO_ORDINAL_DATE_VALUE_PATTERN = /^(\d{4})-(\d{3})$/;
const DATE_SIGNAL_PATTERN =
    /\b(?:today|tomorrow|yesterday|tonight|next|last|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|q[1-4]|fy\s?\d{4})\b|\b\d{4}-\d{2}-\d{2}(?:[tT]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-W\d{2}\b|\b\d{4}-\d{3}\b|\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:UTC|GMT|[AP]M)?\b/i;
const MONTH_NAME_PATTERN =
    '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const STARTS_WITH_MONTH_NAME_PATTERN = new RegExp(`^${MONTH_NAME_PATTERN}\\b`, 'i');
const BARE_MONTH_PATTERN =
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;
const DAY_MONTH_NAME_VALUE_PATTERN = new RegExp(
    `^(\\d{1,3})(?:st|nd|rd|th)?\\s+${MONTH_NAME_PATTERN}(?:\\s*,?\\s*(\\d{2,4}))?$`,
    'i',
);
const MONTH_DAY_NAME_VALUE_PATTERN = new RegExp(
    `^${MONTH_NAME_PATTERN}\\s+(\\d{1,3})(?:st|nd|rd|th)?(?:,?\\s*(\\d{2,4}))?$`,
    'i',
);
const DURATION_ONLY_PATTERN =
    /^for\s+\d+\s+(?:milliseconds?|seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i;
const NON_DATE_CONTEXT_LABEL_PATTERN =
    /\b(?:build|commit|model|release|sku|version)\s*$/i;
const INVALID_DAY_BEFORE_MONTH_PATTERN =
    /(?:^|[^\d])(?:3[2-9]|[4-9]\d|\d{3,})\s+$/;

type ChronoParsedResult = ReturnType<typeof strict.parse>[number];

type DateCandidate = {
    start: number;
    end: number;
    value: string;
    confidence: number;
};

// using chrono-node plus small local rules for calendar periods it does not parse
export const detectDateItems = (inputText: string): SensitiveItem[] =>
{
    const candidates = [
        ...detectChronoStrictDateCandidates(inputText),
        ...detectChronoCasualDateCandidates(inputText),
        ...detectCalendarPeriodCandidates(inputText),
    ];
    const finalCandidates = mergeDateCandidates(candidates);

    return finalCandidates.map((candidate, index) => ({
        id: `date-${String(index + 1).padStart(3, '0')}`,
        category: 'DATE',
        start: candidate.start,
        end: candidate.end,
        value: candidate.value,
        confidence: candidate.confidence,
        source: 'rules',
    }));
};

export const isClearlyInvalidDateValue = (value: string) =>
{
    const normalizedValue = value.trim();

    return (
        isInvalidNumericDateValue(normalizedValue) ||
        isInvalidIsoWeekValue(normalizedValue) ||
        isInvalidIsoOrdinalDateValue(normalizedValue) ||
        isInvalidMonthNameDateValue(normalizedValue)
    );
};

export const isClearlyInvalidDateItem = (
    inputText: string,
    item: Pick<SensitiveItem, 'start' | 'end' | 'value'>,
) =>
{
    const trimmedRange = trimDateCandidateRange(inputText, item.start, item.end);
    const value = inputText.slice(trimmedRange.start, trimmedRange.end);

    return (
        isClearlyInvalidDateValue(value.length > 0 ? value : item.value) ||
        hasInvalidDayBeforeMonthContext(inputText, trimmedRange.start, value)
    );
};

const detectChronoStrictDateCandidates = (inputText: string): DateCandidate[] =>
{
    return strict
        .parse(inputText, CHRONO_REFERENCE_DATE, { forwardDate: true })
        .map((result) =>
        {
            return createChronoDateCandidate(
                inputText,
                result,
                DATE_DETECTION_CONFIDENCE,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectChronoCasualDateCandidates = (inputText: string): DateCandidate[] =>
{
    return casual
        .parse(inputText, CHRONO_REFERENCE_DATE, { forwardDate: true })
        .map((result) =>
        {
            return createChronoDateCandidate(
                inputText,
                result,
                DATE_RELATIVE_DETECTION_CONFIDENCE,
            );
        })
        .filter((candidate) => candidate != null);
};

const detectCalendarPeriodCandidates = (inputText: string): DateCandidate[] =>
{
    return [
        ...detectPatternDateCandidates(inputText, FISCAL_YEAR_PATTERN),
        ...detectPatternDateCandidates(inputText, QUARTER_PATTERN),
        ...detectPatternDateCandidates(inputText, ISO_WEEK_PATTERN),
        ...detectPatternDateCandidates(
            inputText,
            ISO_ORDINAL_DATE_PATTERN,
            isValidIsoOrdinalDate,
        ),
    ];
};

const detectPatternDateCandidates = (
    inputText: string,
    pattern: RegExp,
    isValidValue: (value: string) => boolean = () => true,
): DateCandidate[] =>
{
    return [...inputText.matchAll(pattern)]
        .filter((match) => isValidValue(match[0]))
        .map((match) =>
        {
            return createDateCandidate(
                inputText,
                match.index,
                match.index + match[0].length,
                DATE_PERIOD_DETECTION_CONFIDENCE,
            );
        })
        .filter((candidate) => candidate != null);
};

const createChronoDateCandidate = (
    inputText: string,
    result: ChronoParsedResult,
    confidence: number,
): DateCandidate | null =>
{
    return createDateCandidate(
        inputText,
        result.index,
        result.index + result.text.length,
        confidence,
    );
};

const createDateCandidate = (
    inputText: string,
    start: number,
    end: number,
    confidence: number,
): DateCandidate | null =>
{
    const trimmedRange = trimDateCandidateRange(inputText, start, end);
    const value = inputText.slice(trimmedRange.start, trimmedRange.end);

    if (!isValidDateValue(value))
    {
        return null;
    }

    const candidate = {
        start: trimmedRange.start,
        end: trimmedRange.end,
        value,
        confidence,
    };

    if (
        !hasValidDateBoundaries(inputText, candidate) ||
        isRejectedDateContext(inputText, candidate)
    )
    {
        return null;
    }

    return candidate;
};

const trimDateCandidateRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /[\s"'`<([{]/.test(inputText[trimmedStart]))
    {
        trimmedStart += 1;
    }

    while (
        trimmedEnd > trimmedStart &&
        /[\s"'`>.,;!?)}\]]/.test(inputText[trimmedEnd - 1])
    )
    {
        trimmedEnd -= 1;
    }

    return {
        start: trimmedStart,
        end: trimmedEnd,
    };
};

const isValidDateValue = (value: string) =>
{
    return (
        value.length > 0 &&
        !EXISTING_PLACEHOLDER_PATTERN.test(value) &&
        DATE_SIGNAL_PATTERN.test(value) &&
        !BARE_MONTH_PATTERN.test(value) &&
        !DURATION_ONLY_PATTERN.test(value) &&
        !isClearlyInvalidDateValue(value)
    );
};

const hasValidDateBoundaries = (
    inputText: string,
    candidate: DateCandidate,
) =>
{
    const previousCharacter = inputText[candidate.start - 1];
    const nextCharacter = inputText[candidate.end];

    return (
        !isDateBoundaryBlockingCharacter(previousCharacter) &&
        !isDateBoundaryBlockingCharacter(nextCharacter)
    );
};

const isRejectedDateContext = (
    inputText: string,
    candidate: DateCandidate,
) =>
{
    const lineStart = inputText.lastIndexOf('\n', candidate.start - 1) + 1;
    const beforeCandidate = inputText.slice(lineStart, candidate.start);

    return (
        NON_DATE_CONTEXT_LABEL_PATTERN.test(beforeCandidate) ||
        hasInvalidDayBeforeMonthContext(
            inputText,
            candidate.start,
            candidate.value,
        )
    );
};

const mergeDateCandidates = (candidates: DateCandidate[]) =>
{
    const sortedCandidates = [...candidates].sort(compareDateCandidates);
    const finalCandidates: DateCandidate[] = [];

    for (const candidate of sortedCandidates)
    {
        const overlapIndex = finalCandidates.findIndex((finalCandidate) =>
        {
            return dateCandidatesOverlap(candidate, finalCandidate);
        });

        if (overlapIndex === -1)
        {
            finalCandidates.push(candidate);
            continue;
        }

        if (compareDateCandidatePriority(candidate, finalCandidates[overlapIndex]) < 0)
        {
            finalCandidates[overlapIndex] = candidate;
        }
    }

    return finalCandidates.sort((left, right) => left.start - right.start);
};

const compareDateCandidates = (left: DateCandidate, right: DateCandidate) =>
{
    return left.start - right.start || right.end - left.end;
};

const compareDateCandidatePriority = (
    left: DateCandidate,
    right: DateCandidate,
) =>
{
    const lengthDifference = right.value.length - left.value.length;

    if (lengthDifference !== 0)
    {
        return lengthDifference;
    }

    return right.confidence - left.confidence;
};

const dateCandidatesOverlap = (left: DateCandidate, right: DateCandidate) =>
{
    return left.start < right.end && right.start < left.end;
};

const isDateBoundaryBlockingCharacter = (character: string | undefined) =>
{
    return character != null && /[a-z0-9_]/i.test(character);
};

const hasInvalidDayBeforeMonthContext = (
    inputText: string,
    start: number,
    value: string,
) =>
{
    if (!STARTS_WITH_MONTH_NAME_PATTERN.test(value))
    {
        return false;
    }

    const lineStart = inputText.lastIndexOf('\n', start - 1) + 1;
    const beforeCandidate = inputText.slice(lineStart, start);

    return INVALID_DAY_BEFORE_MONTH_PATTERN.test(beforeCandidate);
};

const isValidIsoOrdinalDate = (value: string) =>
{
    const [yearText, dayText] = value.split('-');
    const year = Number(yearText);
    const day = Number(dayText);

    return day >= 1 && day <= getDaysInYear(year);
};

const getDaysInYear = (year: number) =>
{
    return isLeapYear(year) ? 366 : 365;
};

const isLeapYear = (year: number) =>
{
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
};

const isInvalidNumericDateValue = (value: string) =>
{
    if (ISO_DATE_TIME_VALUE_PATTERN.test(value))
    {
        return !isValidIsoDateTimeValue(value);
    }

    if (LOCAL_NUMERIC_DATE_VALUE_PATTERN.test(value))
    {
        return !isValidLocalNumericDateValue(value);
    }

    return false;
};

const isValidIsoDateTimeValue = (value: string) =>
{
    const match = ISO_DATE_TIME_VALUE_PATTERN.exec(value);

    if (match == null)
    {
        return false;
    }

    return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
};

const isValidLocalNumericDateValue = (value: string) =>
{
    const match = LOCAL_NUMERIC_DATE_VALUE_PATTERN.exec(value);

    if (match == null)
    {
        return false;
    }

    const left = Number(match[1]);
    const separator = match[2];
    const right = Number(match[3]);
    const year = normalizeDateYear(Number(match[4]));

    if (separator === '.')
    {
        return isValidCalendarDate(year, right, left);
    }

    return (
        isValidCalendarDate(year, right, left) ||
        isValidCalendarDate(year, left, right)
    );
};

const normalizeDateYear = (year: number) =>
{
    return year < 100 ? 2000 + year : year;
};

const isInvalidIsoWeekValue = (value: string) =>
{
    const match = BROAD_ISO_WEEK_VALUE_PATTERN.exec(value);

    if (match == null)
    {
        return false;
    }

    const week = Number(match[2]);

    return week < 1 || week > 53;
};

const isInvalidIsoOrdinalDateValue = (value: string) =>
{
    const match = BROAD_ISO_ORDINAL_DATE_VALUE_PATTERN.exec(value);

    if (match == null)
    {
        return false;
    }

    return !isValidIsoOrdinalDate(value);
};

const isInvalidMonthNameDateValue = (value: string) =>
{
    const dayMonthMatch = DAY_MONTH_NAME_VALUE_PATTERN.exec(value);

    if (dayMonthMatch != null)
    {
        return !isValidMonthDay(
            Number(dayMonthMatch[1]),
            dayMonthMatch[2],
            dayMonthMatch[3],
        );
    }

    const monthDayMatch = MONTH_DAY_NAME_VALUE_PATTERN.exec(value);

    if (monthDayMatch != null)
    {
        return !isValidMonthDay(
            Number(monthDayMatch[2]),
            monthDayMatch[1],
            monthDayMatch[3],
        );
    }

    return false;
};

const isValidMonthDay = (
    day: number,
    monthName: string,
    yearText: string | undefined,
) =>
{
    const month = getMonthNumber(monthName);
    const year = yearText == null ? CHRONO_REFERENCE_DATE.getUTCFullYear() : Number(yearText);

    if (month == null)
    {
        return false;
    }

    return isValidCalendarDate(normalizeDateYear(year), month, day);
};

const isValidCalendarDate = (year: number, month: number, day: number) =>
{
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        month < 1 ||
        month > 12 ||
        day < 1
    )
    {
        return false;
    }

    return day <= getDaysInMonth(year, month);
};

const getDaysInMonth = (year: number, month: number) =>
{
    if (month === 2)
    {
        return isLeapYear(year) ? 29 : 28;
    }

    if ([4, 6, 9, 11].includes(month))
    {
        return 30;
    }

    return 31;
};

const getMonthNumber = (monthName: string) =>
{
    const normalizedMonthName = monthName.toLowerCase();

    if (normalizedMonthName.startsWith('jan'))
    {
        return 1;
    }

    if (normalizedMonthName.startsWith('feb'))
    {
        return 2;
    }

    if (normalizedMonthName.startsWith('mar'))
    {
        return 3;
    }

    if (normalizedMonthName.startsWith('apr'))
    {
        return 4;
    }

    if (normalizedMonthName === 'may')
    {
        return 5;
    }

    if (normalizedMonthName.startsWith('jun'))
    {
        return 6;
    }

    if (normalizedMonthName.startsWith('jul'))
    {
        return 7;
    }

    if (normalizedMonthName.startsWith('aug'))
    {
        return 8;
    }

    if (
        normalizedMonthName.startsWith('sep') ||
        normalizedMonthName.startsWith('sept')
    )
    {
        return 9;
    }

    if (normalizedMonthName.startsWith('oct'))
    {
        return 10;
    }

    if (normalizedMonthName.startsWith('nov'))
    {
        return 11;
    }

    if (normalizedMonthName.startsWith('dec'))
    {
        return 12;
    }

    return null;
};
