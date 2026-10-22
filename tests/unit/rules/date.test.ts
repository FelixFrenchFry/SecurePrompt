import { describe, expect, it } from 'vitest';
import { findDates } from '../../../packages/core/src/detect/rules/date';

const found = (text: string) => findDates(text).map((match) => text.slice(match.start, match.end));

describe('findDates', () =>
{
    it.each([
        ['geb. 03.07.1981, wohnhaft', '03.07.1981'],
        ['Mietbeginn: 1.6.2025.', '1.6.2025'],
        ['[12.01.25, 19:42] Mama:', '12.01.25, 19:42'],
        ['Termin 10.02.2025, 14:00 Uhr per Video', '10.02.2025, 14:00 Uhr'],
        ['2025-02-11 08:15:02 INFO', '2025-02-11 08:15:02'],
        ['[2025-03-14T09:22:51Z] Failed', '2025-03-14T09:22:51Z'],
        ['"dob": "1990-11-02"', '1990-11-02'],
        ['DOB: 04/17/1968', '04/17/1968'],
        ['bis Freitag, 14. März 2025 schicken', 'Freitag, 14. März 2025'],
        ['Sie wird am 20. Januar 80!', '20. Januar'],
        ['Mietbeginn: 1. Juni 2025.', '1. Juni 2025'],
        ['admitted on March 3, 2025 and', 'March 3, 2025'],
        ['Due: 30 April 2025', '30 April 2025'],
        ['issued 12 Jan 2019, expires', '12 Jan 2019'],
        ['gegen 17:30 Uhr auf der A9', '17:30 Uhr'],
        ['call at 9:15 am please', '9:15 am'],
        ['born on the 29.02.2024', '29.02.2024'],
        ['du 26 juillet 1989 au', '26 juillet 1989'],
        ['au novembre 23, 1992, le', 'novembre 23, 1992'],
        ['del julio 13º, 2009 al', 'julio 13º, 2009'],
        ['el 12 de marzo de 2023 en', '12 de marzo de 2023'],
        ['le 1er janvier 2020', '1er janvier 2020'],
        ['ordernummer: 21e september 2025)', '21e september 2025'],
        ['dnia 3 marca 2024 r.', '3 marca 2024'],
        ['dne 3. března 2024', '3. března 2024'],
        ['scheduled for 1st November 1963.', '1st November 1963'],
        ['on the 3rd of March 2024', '3rd of March 2024'],
        ['am August 23., 2000 in Wien', 'August 23., 2000'],
        ['Settembre 23º, 1938', 'Settembre 23º, 1938'],
        ['Date: 15-08-2024\n', '15-08-2024'],
        ['effective 08-15-2024.', '08-15-2024'],
        ['am 3-7-2021 um 14:00 Uhr', '3-7-2021 um 14:00 Uhr'],
        ['will occur at 19:45:22.', '19:45:22'],
        ['born on 25-Jun-2020, and', '25-Jun-2020'],
        ['le 15 févr. 2022 à Paris', '15 févr. 2022'],
        ['birthdate: 22 de ago. de 1963', '22 de ago. de 1963'],
        ['nacida el 31 lip 1951. Por', '31 lip 1951'],
        ['datum 2022/03/15 en', '2022/03/15'],
        ['- **Date**: June 15-17, 2024 ', 'June 15-17, 2024'],
        ['vom 15.–17. März 2025 in', '15.–17. März 2025'],
        ['Messe 12.-14.03.2025 in Köln', '12.-14.03.2025'],
        ['fecha de nacimiento es 05\u200f/05\u200f/1910 y', '05\u200f/05\u200f/1910'],
        ['anniversario il 27 Μαΐ 1974, volevo', '27 Μαΐ 1974'],
        ['geboren op 1921. 5. 16., en', '1921. 5. 16.'],
        ['syntynyt 14. tammikuuta 2024 Helsingissä', '14. tammikuuta 2024'],
        ['rođen 3. siječnja 1990. u', '3. siječnja 1990'],
        ['született 2024. január 14. Budapesten', '2024. január 14.'],
        ['gimė 2024 m. sausio 14 d. Vilniuje', '2024 m. sausio 14 d.'],
        ['dzimis 2024. gada 14. janvārī Rīgā', '2024. gada 14. janvārī'],
        ['роден на 14 януари 2024 г.', '14 януари 2024'],
        ['DTM*20230314 N1', '20230314'],
        ['|122=20220322-123015|', '20220322-123015'],
        ['conducted at 08:15 GMT on', '08:15 GMT'],
        ['at 10:15 AM CST on my', '10:15 AM CST'],
        ['um 9:30 Uhr (UTC+2) online', '9:30 Uhr (UTC+2)'],
        ['on 2025-05-27 at 15:10:00, using', '2025-05-27 at 15:10:00'],
        ['| 19:45:30+01:00 |', '19:45:30+01:00'],
        ['at 02:01:20 PM (GMT) at', '02:01:20 PM (GMT)'],
        ['<Time>14:30:00.123Z</Time>', '14:30:00.123Z'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it.each([
        ['bare years and months', 'Im Jahr 1990, im März 2025 und in Q3 2024'],
        ['relative words', 'morgen, gestern, nächste Woche'],
        ['impossible dates', '31.02.2025, 2025-13-01, 00.01.2020'],
        ['version numbers', 'Version 2.4.1 und 3.11.4, Release 2.4.12, Build 1.2.3.4'],
        ['IP addresses', '192.168.178.24 und 10.0.0.1'],
        ['scores and ratios', 'Endstand 2:1, Verhältnis 16:9, Johannes 3:16'],
        ['bare clock times, which stay readable by policy', 'by 18:25 to ensure, à 10h30, 08:00 - 10:00'],
        ['two-part numbers outside clock ranges', '24:00, 25:30, 12:60, 123:45'],
        ['prices and quantities', '1.240,00 €, 3,7 Millionen, 180 °C'],
        ['the modal verb may', 'you may 5 times'],
        ['years outside 1800-2199', '01.01.1066'],
        ['months without a day in other languages', 'en mars 2024, en julio, w listopadzie'],
        ['lowercase English month words', 'you may 5 times, march 3 times'],
        ['three-part numbers outside clock ranges', 'Verhältnis 1:2:3, 25:61:00, 12:30:75'],
        ['8-digit numbers that are no calendar day', 'Konto 20231345, Kunde 12345678, PLZ 20251, 1990123456'],
        ['year-first numbers that are no calendar day', 'Version 2024.13.1 und 2024. 2. 30.'],
        ['abbreviations without a year', 'il 5 set, 2 ago e 3 gen'],
        ['mixed year-first separators', '2022/03-15'],
        ['month words joined with a dash but no year', 'am 3-Mai, die 5-Jun-Variante'],
        ['dashed number groups', 'Tel. 030-12-3456, Seiten 10-12-24, 15-08-20245, 32-01-2024'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });

    it('accepts day/month/year when only the US reading is valid, and vice versa', () =>
    {
        expect(found('04/17/1968 und 17/04/1968')).toEqual(['04/17/1968', '17/04/1968']);
    });

    it('marks every match as validated by the calendar check', () =>
    {
        expect(findDates('am 03.07.1981')).toEqual([{ start: 3, end: 13, category: 'DATE', validated: true }]);
    });
});
