import { describe, expect, it } from 'vitest';
import { findNetwork, isValidIpv4, isValidIpv6 } from '../../../packages/core/src/detect/rules/network';

const found = (text: string) => findNetwork(text).map((match) => text.slice(match.start, match.end));

describe('findNetwork', () =>
{
    it.each([
        ['per Video: https://meet.example.com/abc-defg-hij', 'https://meet.example.com/abc-defg-hij'],
        ['(see https://docs.example.de/a/b?x=1).', 'https://docs.example.de/a/b?x=1'],
        ['Wiki: https://de.example.org/wiki/Foo_(Bar).', 'https://de.example.org/wiki/Foo_(Bar)'],
        ['Web: www.example-kanzlei.de.', 'www.example-kanzlei.de'],
        ['curl http://localhost:8080/health', 'http://localhost:8080/health'],
        ['IP laut Logs: 84.152.37.201.', '84.152.37.201'],
        ['ip=192.168.178.24 port', '192.168.178.24'],
        ['IPv6 2001:db8::8a2e:370:7334 here', '2001:db8::8a2e:370:7334'],
        ['link-local fe80::1 only', 'fe80::1'],
        ['mapped ::ffff:192.0.2.1', '::ffff:192.0.2.1'],
        ['(MAC 00:1A:2B:3C:4D:5E)', '00:1A:2B:3C:4D:5E'],
        ['MAC 00-1a-2b-3c-4d-5e', '00-1a-2b-3c-4d-5e'],
    ])('finds %j', (text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it.each([
        ['invalid octets', '999.1.1.1 and 256.0.0.1'],
        ['version numbers', 'Version 3.11.4 and 2.4.1'],
        ['clock times', 'um 10:30:45 Uhr'],
        ['C++ scope operators and hex words', 'std::vector and dead::beef'],
        ['mixed MAC separators', '00:1A-2B:3C-4D:5E'],
        ['emails', 'mail anna@example.com'],
        ['a scheme without a valid host', 'http://-bad-.example'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});

describe('address validation', () =>
{
    it('checks IPv4 octets and leading zeros', () =>
    {
        expect(isValidIpv4('10.0.0.1')).toBe(true);
        expect(isValidIpv4('10.0.0.256')).toBe(false);
        expect(isValidIpv4('10.0.0.01')).toBe(false);
    });

    it('checks IPv6 group counts with and without ::', () =>
    {
        expect(isValidIpv6('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe(true);
        expect(isValidIpv6('2001:db8::ff00:42:8329')).toBe(true);
        expect(isValidIpv6('2001:db8:ff00:42:8329')).toBe(false);
        expect(isValidIpv6('1::2::3')).toBe(false);
    });

    it('checks IPv6 hex groups and an embedded IPv4 tail', () =>
    {
        expect(isValidIpv6('::ffff:192.0.2.1')).toBe(true);
        expect(isValidIpv6('::ffff:999.0.2.1')).toBe(false);
        expect(isValidIpv6('2001:db8::12g4')).toBe(false);
    });

    it('validates IP hosts inside URLs', () =>
    {
        expect(found('open http://[2001:db8::1]:8080/x now')).toEqual(['http://[2001:db8::1]:8080/x']);
        expect(found('open http://192.168.0.10/admin now')).toEqual(['http://192.168.0.10/admin']);
        expect(found('open http://[2001:zz8::1]/x or http://192.168.0.300/admin')).toEqual([]);
    });
});

describe('findNetwork at sentence ends', () =>
{
    it('keeps an IPv6 address before a full stop', () =>
    {
        expect(findNetwork('Server: fe80::1.').map((match) => match.end - match.start)).toEqual([7]);
    });
});
