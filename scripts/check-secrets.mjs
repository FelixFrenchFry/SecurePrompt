import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// scans text files for secrets in known formats, --staged checks the index for the pre-commit hook
const staged = process.argv.includes('--staged');

const patterns = [
    { name: 'Private key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'OpenAI API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'Anthropic API key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
    { name: 'GitHub token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
    { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
    { name: 'AWS access key', regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
    { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
    { name: 'Stripe live secret key', regex: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
    { name: 'JWT', regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
    {
        name: 'Sensitive assignment',
        regex: /\b(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Z0-9_]*|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret|password|passwd|pwd|private[_-]?key)\b\s*[:=]\s*["']?[^"'\s,;]{8,}/,
    },
];

const textExtensions = new Set([
    '.css',
    '.env',
    '.html',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.mjs',
    '.ps1',
    '.sh',
    '.ts',
    '.tsx',
    '.txt',
    '.toml',
    '.yaml',
    '.yml',
]);

const textFileNames = new Set(['.gitignore', 'package.json', 'pnpm-workspace.yaml', 'tsconfig.json', 'wxt.config.ts']);

// the detector's own patterns and test fixtures, which look like secrets by design
const allowedFiles = new Set([
    'packages/core/src/detect/rules/index.ts',
    'packages/core/src/detect/rules/secret.ts',
    'tests/unit/rules/secret.test.ts',
]);

const isScannable = (file) => textExtensions.has(path.extname(file).toLowerCase()) || textFileNames.has(path.basename(file));

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

const listFiles = () =>
    staged
        ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
        : git(['ls-files', '--cached', '--others', '--exclude-standard']);

// the staged version of a file, not the working copy, so a commit is checked as it will be recorded
const contentOf = (file) =>
{
    if (staged)
    {
        return execFileSync('git', ['cat-file', 'blob', `:${file}`], { encoding: 'utf8' });
    }

    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
};

const findings = [];

for (const file of listFiles().filter((candidate) => isScannable(candidate) && !allowedFiles.has(candidate)))
{
    const content = contentOf(file);

    if (content == null)
    {
        continue;
    }

    content.split(/\r?\n/).forEach((line, index) =>
    {
        for (const pattern of patterns)
        {
            if (pattern.regex.test(line))
            {
                findings.push(`${file}:${index + 1} matched ${pattern.name}`);
            }
        }
    });
}

if (findings.length > 0)
{
    console.error('Potential secrets found. Commit blocked.');

    for (const finding of findings)
    {
        console.error(`  ${finding}`);
    }

    console.error('');
    console.error('If this is a false positive, move the value out of the repo or adjust scripts/check-secrets.mjs deliberately.');
    process.exitCode = 1;
}
else
{
    console.log('No obvious secrets found.');
}
