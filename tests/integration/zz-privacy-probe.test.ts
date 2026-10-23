import { resolve } from 'node:path';
import { it } from 'vitest';
import { RULE_NAMES, RULES } from '../../packages/core/src/detect/rules';
import { runPipeline } from '../../packages/core/src/pipeline/run';
import { createSession } from '../../packages/core/src/session';
import { createBardsaiDetector } from '../../packages/model-runtime/src/bardsai/detector';

const MODELS_DIR = resolve(import.meta.dirname, '../../.models');

const TEXTS = [
    "Settings > Account > Privacy > Data controls",
    "Profile | Account | Privacy | Notifications | Billing",
    "Account: Privacy\nUser: Privacy\nID: Privacy",
    "username: Privacy, password: hunter2",
    "Account settings\n- Privacy\n- Security\n- Sessions",
    "Privacy-ID: 4471-2290, Privacy number KD44712290",
    "ChatGPT\nNew chat\nSearch chats\nLibrary\nSora\nGPTs\nSettings\nGeneral\nNotifications\nPersonalization\nConnected apps\nData controls\nSecurity\nAccount\nPrivacy\nLog out",
    "Login: claudia.neumann, Privacy: enabled, 2FA: on",
    "@Privacy please review the Privacy section",
    "The Privacy team (privacy@example.com) owns Privacy reviews."
];

it('probe', async () =>
{
    const model = createBardsaiDetector({ localModelPath: `${MODELS_DIR}/` });

    for (const text of TEXTS)
    {
        const found = await model.detect(text);
        const result = await runPipeline(text, {
            detectors: [...RULE_NAMES.map((name) => RULES[name]), model],
            session: createSession(),
            residualPasses: 0,
        });

        console.log(JSON.stringify(text.slice(0, 60)));
        console.log('  model:', found.map((d) => `${text.slice(d.start, d.end)}=${d.category}@${d.score.toFixed(2)}`).join(' | ') || '-');
        console.log('  masked:', JSON.stringify(result.maskedText.slice(0, 120)));
    }
}, 300_000);
