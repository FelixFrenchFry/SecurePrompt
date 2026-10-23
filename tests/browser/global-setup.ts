import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startModelMirror } from './support/model-mirror';
import { MIRROR_URL, MODEL_FILE } from './support/paths';

// builds the test extension and starts the model mirror, unless the model files are missing
export default async () =>
{
    if (!existsSync(MODEL_FILE))
    {
        return undefined;
    }

    const build = spawnSync('pnpm --filter @secureprompt/extension build', {
        shell: true,
        stdio: 'inherit',
        env: { ...process.env, WXT_MODEL_HOST: MIRROR_URL },
    });

    if (build.status !== 0)
    {
        throw new Error('The test build of the extension failed');
    }

    // tests read this log in their own processes
    process.env.SECUREPROMPT_MIRROR_LOG = join(mkdtempSync(join(tmpdir(), 'secureprompt-mirror-')), 'requests.jsonl');

    const mirror = await startModelMirror(process.env.SECUREPROMPT_MIRROR_LOG);

    return () => new Promise<void>((done) => mirror.close(() => done()));
};
