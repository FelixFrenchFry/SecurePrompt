import { describe, expect, it } from 'vitest';
import { findSecrets } from '../../../packages/core/src/detect/rules/secret';

// test values are assembled at runtime so the source holds no complete key-shaped strings
const fake = (prefix: string, length: number, alphabet = 'aB3') => prefix + alphabet.repeat(length).slice(0, length);

const found = (text: string) => findSecrets(text).map((match) => text.slice(match.start, match.end));

const JWT = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJzdWIiOiIxMjM0NSIsIm5hbWUiOiJNIEtvY2gifQ',
    'dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
].join('.');
const SLACK_WEBHOOK = ['https://hooks.slack.com', 'services', 'T00000000', 'B00000000', 'X'.repeat(24)].join('/');
const pem = (label: string, body: string) => [`-----BEGIN ${label}-----`, body, `-----END ${label}-----`].join('\n');

describe('findSecrets', () =>
{
    it.each([
        ['AWS access key id', `aws_access_key_id = ${fake('AKIA', 16, 'IOSFODNN7EXAMPLE')}`, fake('AKIA', 16, 'IOSFODNN7EXAMPLE')],
        ['GitHub token', `token ${fake('ghp_', 36)} here`, fake('ghp_', 36)],
        ['OpenAI key', `OPENAI_API_KEY=${fake('sk-proj-', 40)}`, fake('sk-proj-', 40)],
        ['Anthropic key', `key: ${fake('sk-ant-', 30)}`, fake('sk-ant-', 30)],
        ['Stripe secret key', `${fake('sk_test_', 24)} `, fake('sk_test_', 24)],
        ['Slack token', `SLACK=${fake('xoxb-', 24)}`, fake('xoxb-', 24)],
        ['Google API key', `key=${fake('AIza', 35)}`, fake('AIza', 35)],
        ['JWT', `token rejected: ${JWT}`, JWT],
        ['bearer token, value only', 'curl -H "Authorization: Bearer 9f8e7d6c5b4a3928170" https://x', '9f8e7d6c5b4a3928170'],
        ['AWS secret, value only', `aws_secret_access_key = ${fake('', 40, 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')}`, fake('', 40, 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')],
        [
            'connection string with password',
            'DATABASE_URL=postgres://app_user:Xk9#mPq2vL@db.internal.example.com:5432/shop',
            'postgres://app_user:Xk9#mPq2vL@db.internal.example.com:5432/shop',
        ],
        ['Slack webhook', `posts to ${SLACK_WEBHOOK} but`, SLACK_WEBHOOK],
        ['generated password', 'parola mea este G9U(gS5g_z, numărul', 'G9U(gS5g_z'],
        ['password in brackets', 'mot de passe (*vw8IIqz4$) ou', '*vw8IIqz4$'],
        ['password after a colon', 'Passwort: Sommer2024!Ostsee', 'Sommer2024!Ostsee'],
        ['password in an attribute', '<input value="k3UY0fv_&n" readonly>', 'k3UY0fv_&n'],
        ['password glued to a closing tag', '<p>w1LC)@Vc!*</p>', 'w1LC)@Vc!*'],
    ])('finds a %s', (_, text, expected) =>
    {
        expect(found(text)).toEqual([expected]);
    });

    it('reports a password-shaped value of another secret once, as the validated secret', () =>
    {
        const text = 'Authorization: Bearer Ab3+cd5~Ef7gh';

        expect(findSecrets(text).map((match) => [text.slice(match.start, match.end), match.validated])).toEqual([['Ab3+cd5~Ef7gh', true]]);
    });

    it('finds a whole private key block', () =>
    {
        const key = pem('OPENSSH PRIVATE KEY', 'b3BlbnNzaC1rZXktdjEAAAAA');

        expect(found(`Is this correct?\n${key}\nthanks`)).toEqual([key]);
    });

    it.each([
        ['certificates and public keys', pem('CERTIFICATE', 'MIIB')],
        ['publishable Stripe keys', fake('pk_live_', 24)],
        ['short sk- words', 'pip install sk-learn and sk-1234'],
        ['keys inside longer identifiers', `my${fake('ghp_', 36)}`],
        ['JWT-shaped text whose header has no alg', 'eyJ4IjoxfQ.eyJhYmMiOjF9.abcdefghijkl'],
        ['JWT-shaped text whose header is not JSON', 'eyJhbGci.eyJhYmMiOjF9.abcdefghijkl'],
        ['URLs with a user but no password', 'https://user@example.com/path and https://host:8080/a@b'],
        ['password words without a value format', 'Passwort: sommerostsee'],
        ['identifiers, file names and versions', 'my_Var2 Report_2024-Final.pdf v2.1.0-RC1 src/Main3.ts'],
        ['tokens missing a character class', 'Sommer2024 sommer2024! SOMMER2024! Sommer!Ostsee'],
        ['URLs and emails', 'https://Example.com/a?b=C1 Max.Muster1+x@Firma.de'],
        ['markup and attributes', '<?xml version="1.0" encoding="UTF-8"?> <h1>Report2</h1> <meta charset=UTF-8>'],
        ['field tags and lists', ':88C:/Account2 IdBatch,t3.Descrizione Years/36,000'],
    ])('ignores %s', (_, text) =>
    {
        expect(found(text)).toEqual([]);
    });
});
