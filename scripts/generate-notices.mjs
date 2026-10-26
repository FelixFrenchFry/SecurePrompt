import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// writes apps/extension/public/THIRD_PARTY_NOTICES.txt, which the build packs into the extension
// with --check, fails when the committed file no longer matches the installed packages
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'apps/extension/public/THIRD_PARTY_NOTICES.txt');
const checking = process.argv.includes('--check');

// licenses accepted in the shipped bundle, add one only after reading its terms
const allowedLicenses = new Set(['0BSD', 'Apache-2.0', 'BSD-3-Clause', 'CC0-1.0', 'ISC', 'MIT']);

// licenses whose notice needs no copyright line per package
const copyrightOptional = new Set(['Apache-2.0', 'CC0-1.0']);

// copyright lines for packages whose installed copy has no license file with one
const holders = {
    'onnxruntime-web': ['Copyright (c) Microsoft Corporation'],
    'onnxruntime-common': ['Copyright (c) Microsoft Corporation'],
    'guid-typescript': ['Copyright (c) nicolas'],
};

// license of the detection model, as its model card states it, update when the model changes
const modelLicense = 'Apache License 2.0';

// packages that only run in Node or during install, not in the browser bundle
const excludedPackage = (name) =>
    name.startsWith('@img/') ||
    name.startsWith('@emnapi/') ||
    name.startsWith('@types/') ||
    name.startsWith('@secureprompt/') ||
    ['sharp', 'onnxruntime-node', 'global-agent', 'adm-zip', 'detect-libc', 'undici-types'].includes(name);

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// the license ids in an expression like "(MIT OR CC0-1.0)"
const licenseIds = (license) => license.replace(/[()]/g, '').split(/ OR | AND /);

const installedPackages = () =>
{
    const trees = JSON.parse(
        execSync('pnpm list --prod --depth Infinity --json --filter @secureprompt/extension', {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        }),
    );
    const packages = new Map();

    const walk = (dependencies = {}) =>
    {
        for (const [name, info] of Object.entries(dependencies))
        {
            const key = `${name}@${info.version}`;

            if (!packages.has(key))
            {
                packages.set(key, { name, version: info.version, dir: info.path });
            }

            walk(info.dependencies);
            walk(info.optionalDependencies);
        }
    };

    for (const tree of trees)
    {
        walk(tree.dependencies);
        walk(tree.optionalDependencies);
    }

    return [...packages.values()]
        .filter((pkg) => !excludedPackage(pkg.name))
        .sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version));
};

const licenseFileOf = (dir) =>
{
    const file = fs.readdirSync(dir).find((entry) => /^(LICENSE|LICENCE)(\.[a-z]+)?$/i.test(entry));
    return file == null ? undefined : path.join(dir, file);
};

const licenseOf = (dir) =>
{
    const pj = JSON.parse(readText(path.join(dir, 'package.json')));
    return typeof pj.license === 'string' ? pj.license : 'UNKNOWN';
};

// matches "Copyright (c) 2016 Name" and "Copyright 2014 Name", not template lines like "Copyright [yyyy]"
const copyrightLine = /^Copyright (\([cC]\) )?[0-9A-Z]/;

const copyrightsOf = (name, license, file) =>
{
    const found = file == null ? [] : readText(file).split('\n').map((line) => line.trim()).filter((line) => copyrightLine.test(line));
    const copyrights = [...new Set(found)];

    if (copyrights.length === 0)
    {
        copyrights.push(...(holders[name] ?? []));
    }

    if (copyrights.length === 0 && !licenseIds(license).every((id) => copyrightOptional.has(id)))
    {
        throw new Error(`no copyright line for ${name} (${license}), add its holder to holders in scripts/generate-notices.mjs`);
    }

    return copyrights;
};

// the detection model's id and revision, read from the code that loads it
const modelInfo = () =>
{
    const source = readText(path.join(root, 'packages/model-runtime/src/bardsai/detector.ts'));
    const id = /BARDSAI_MODEL_ID = '([^']+)'/.exec(source)?.[1];
    const revision = /BARDSAI_REVISION = '([0-9a-f]+)'/.exec(source)?.[1];

    if (id == null || revision == null)
    {
        throw new Error('BARDSAI_MODEL_ID or BARDSAI_REVISION not found in detector.ts');
    }

    return { id, revision };
};

const buildNotices = () =>
{
    const rows = [];
    const texts = new Map();

    for (const pkg of installedPackages())
    {
        if (!pkg.dir || !fs.existsSync(pkg.dir))
        {
            throw new Error(`${pkg.name}@${pkg.version} is not installed, run pnpm install`);
        }

        const license = licenseOf(pkg.dir);

        if (!licenseIds(license).every((id) => allowedLicenses.has(id)))
        {
            throw new Error(`${pkg.name}@${pkg.version} is licensed ${license}, which is not in allowedLicenses`);
        }

        const file = licenseFileOf(pkg.dir);
        rows.push({ name: pkg.name, version: pkg.version, license, copyrights: copyrightsOf(pkg.name, license, file) });

        if (file != null && !texts.has(license))
        {
            texts.set(license, { from: `${pkg.name}@${pkg.version}`, body: readText(file).trimEnd() });
        }
    }

    // every license in use needs its text in the file
    for (const row of rows)
    {
        if (!texts.has(row.license))
        {
            throw new Error(`no license text for ${row.name}@${row.version} (${row.license})`);
        }
    }

    const model = modelInfo();
    const lines = [
        'THIRD-PARTY NOTICES',
        '',
        'SECUREPROMPT',
        '',
        readText(path.join(root, 'LICENSE')).trimEnd(),
        '',
        '',
        'THIRD-PARTY PACKAGES',
        '',
        'This extension includes the packages below. Each one keeps its own license, whose text is listed after them.',
        '',
    ];

    for (const row of rows)
    {
        lines.push(`${row.name} ${row.version}`, `  License: ${row.license}`, ...row.copyrights.map((line) => `  ${line}`), '');
    }

    lines.push(
        'The personal-data detection model is not part of this extension. It is downloaded from Hugging Face on first use:',
        `${model.id} (revision ${model.revision}), licensed under the ${modelLicense} as stated on its model card.`,
        '',
        '',
        'LICENSE TEXTS',
        '',
        'Each text below is the license itself. The copyright lines for each package are listed above.',
    );

    for (const [license, { from, body }] of [...texts.entries()].sort(([a], [b]) => compare(a, b)))
    {
        lines.push(
            '',
            '----------------------------------------------------------------',
            `${license} (text from ${from})`,
            '----------------------------------------------------------------',
            '',
            body,
        );
    }

    lines.push('');
    return lines.join('\n');
};

const content = buildNotices();

if (checking)
{
    const current = fs.existsSync(output) ? readText(output) : '';

    if (current !== content)
    {
        console.error('THIRD_PARTY_NOTICES.txt is out of date, run pnpm notices and commit the result');
        process.exitCode = 1;
    }
    else
    {
        console.log('THIRD_PARTY_NOTICES.txt is up to date');
    }
}
else
{
    fs.writeFileSync(output, content, 'utf8');
    console.log(`wrote ${path.relative(root, output)}`);
}
