import { browser } from 'wxt/browser';
import { MODEL_HOST_PERMISSIONS } from './protocol';

export const ENSURE_MODEL_HOST_MESSAGE = 'SECUREPROMPT_ENSURE_MODEL_HOST';

export type EnsureModelHostMessage = { type: typeof ENSURE_MODEL_HOST_MESSAGE };
export type EnsureModelHostResponse = { ok: true } | { ok: false; reason: 'permission' | 'failed' };

export class ModelPermissionError extends Error
{
    override name = 'ModelPermissionError';

    constructor()
    {
        super('The model download needs the Hugging Face permission');
    }
}

let creating: Promise<void> | undefined;

// background only: opens the offscreen model host once the user allowed the model download
export const ensureModelHost = async (): Promise<void> =>
{
    // test builds use a local mirror, which needs no permission
    if (import.meta.env.WXT_MODEL_HOST == null && !(await browser.permissions.contains({ origins: MODEL_HOST_PERMISSIONS })))
    {
        throw new ModelPermissionError();
    }

    const open = await browser.runtime.getContexts({ contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT] });

    if (open.length > 0)
    {
        return;
    }

    creating ??= browser.offscreen
        .createDocument({
            url: 'offscreen.html',
            reasons: [browser.offscreen.Reason.WORKERS],
            justification: 'Runs the on-device model that detects personal data in prompts',
        })
        .finally(() =>
        {
            creating = undefined;
        });

    await creating;
};

// for extension pages: asks the background to open the model host
export const requestModelHost = async (): Promise<void> =>
{
    const message = { type: ENSURE_MODEL_HOST_MESSAGE } satisfies EnsureModelHostMessage;
    // no answer at all means the background didn't handle the request
    const response = (await browser.runtime.sendMessage(message)) as EnsureModelHostResponse | undefined;

    if (response?.ok !== true)
    {
        throw response?.reason === 'permission' ? new ModelPermissionError() : new Error('Could not start the model');
    }
};
