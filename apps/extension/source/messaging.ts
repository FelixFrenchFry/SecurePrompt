import type { AiChatProviderId } from './chat-targets';

export const OPEN_SIDEPANEL_MESSAGE = 'SECUREPROMPT_OPEN_SIDEPANEL';
export const INJECT_PROMPT_MESSAGE = 'SECUREPROMPT_INJECT_PROMPT';
export const GET_CHAT_TARGET_MESSAGE = 'SECUREPROMPT_GET_CHAT_TARGET';

export type OpenSidePanelMessage = {
    type: typeof OPEN_SIDEPANEL_MESSAGE;
};

// windowId is the side panel's own window, whose active tab is the chat to insert into
export type InjectPromptMessage = {
    type: typeof INJECT_PROMPT_MESSAGE;
    text: string;
    windowId?: number;
};

export type GetChatTargetMessage = {
    type: typeof GET_CHAT_TARGET_MESSAGE;
    windowId?: number;
};

export type RuntimeMessage =
    | OpenSidePanelMessage
    | InjectPromptMessage
    | GetChatTargetMessage;

export type RuntimeResponse = {
    ok: boolean;
    provider?: AiChatProviderId;
    providerLabel?: string;
    // the chat tab's address without query or hash, only to look up its icon in the browser's favicon cache
    pageUrl?: string;
    error?: string;
};
