export const OPEN_SIDEPANEL_MESSAGE = 'SECUREPROMPT_OPEN_SIDEPANEL';
export const INJECT_PROMPT_MESSAGE = 'SECUREPROMPT_INJECT_PROMPT';

export type OpenSidePanelMessage = {
    type: typeof OPEN_SIDEPANEL_MESSAGE;
};

export type InjectPromptMessage = {
    type: typeof INJECT_PROMPT_MESSAGE;
    text: string;
};

export type RuntimeMessage = OpenSidePanelMessage | InjectPromptMessage;

export type RuntimeResponse = {
    ok: boolean;
    error?: string;
};
