import { CATEGORIES, type Category, type Span } from '@secureprompt/core';
import type { AttachedFile } from '../masking/compose';
import type { MaskRun } from '../masking/masker';
import type { DownloadProgress } from '../model/download-progress';
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from '../settings/types';

// the side panel's state, changed only through the reducer below: two pages with the same layout,
// masked prompts on one and unmasked answers on the other, each with its own composer

export type Page = 'prompt' | 'answer';

export type View = Page | 'settings' | 'setup';

// missing: the download permission isn't granted yet; idle: allowed, loads on first use
export type ModelStatus = 'missing' | 'idle' | 'downloading' | 'loading' | 'ready' | 'failed';

export type ScanStep = { step: 'starting' } | ({ step: 'downloading' } & DownloadProgress) | { step: 'loading' } | { step: 'scanning'; percent: number };

export type PromptEntry = {
    kind: 'prompt';
    id: number;
    run: MaskRun;
    // what was in the composer, so Edit can put it back
    source: { prompt: string; files: AttachedFile[] };
    // placeholders the user chose to send as their original values
    revealed: string[];
    selected?: string;
    // text the user selected in the preview, to mask by hand
    selection?: Span;
    insert?: { ok: boolean; message: string };
    // the chat it was inserted into; a sent prompt shows collapsed until opened
    sentTo?: string;
    expanded: boolean;
};

export type AnswerEntry = {
    kind: 'answer';
    id: number;
    // the AI's answer as pasted, with placeholders
    text: string;
    showMasked: boolean;
};

export type Entry = PromptEntry | AnswerEntry;

// pageUrl is the chat tab's address, only for its favicon
export type ChatTarget = { id: string; label: string; pageUrl?: string };

// the first-run screen: the offer, the model download, and how it ended
export type Setup = { step: 'offer' | 'denied' | 'ready' | 'failed' } | { step: 'download'; scan: ScanStep };

export type State = {
    view: View;
    // where settings return to
    page: Page;
    // the prompt composer's text and files
    prompt: string;
    files: AttachedFile[];
    fileError?: string;
    scan?: ScanStep;
    scanError?: string;
    // the answer composer's pasted text
    answerDraft: string;
    entries: Entry[];
    nextId: number;
    // how many masked values this browser session keeps for restoring
    sessionSize: number;
    setup?: Setup;
    model: ModelStatus;
    target?: ChatTarget;
    settings: ExtensionSettings;
};

export type Action =
    | { type: 'settingsLoaded'; settings: ExtensionSettings }
    | { type: 'settingsChanged'; settings: ExtensionSettings }
    | { type: 'settingsOpened' }
    | { type: 'settingsClosed' }
    | { type: 'promptChanged'; prompt: string }
    | { type: 'filesAdded'; files: AttachedFile[] }
    | { type: 'fileRejected'; message: string }
    | { type: 'fileRemoved'; id: string }
    | { type: 'scanStarted' }
    | { type: 'scanProgressed'; scan: ScanStep }
    | { type: 'scanFinished'; run: MaskRun }
    | { type: 'scanStopped'; error?: string }
    | { type: 'pageSelected'; page: Page }
    | { type: 'answerDraftChanged'; text: string }
    | { type: 'answerRestored' }
    | { type: 'promptMovedToAnswer' }
    | { type: 'entryEdited'; id: number }
    | { type: 'entryToggled'; id: number }
    | { type: 'placeholderSelected'; id: number; placeholder?: string }
    | { type: 'placeholderToggled'; id: number; placeholder: string }
    | { type: 'textSelected'; id: number; selection?: Span }
    | { type: 'selectionMasked'; id: number; run: MaskRun }
    | { type: 'insertFinished'; id: number; ok: boolean; message: string; target?: string }
    | { type: 'modelChanged'; model: ModelStatus }
    | { type: 'targetChanged'; target?: ChatTarget }
    | { type: 'sessionChanged'; size: number }
    | { type: 'sessionForgotten' }
    // denied: Mask was clicked but Chrome didn't allow the model download
    | { type: 'setupShown'; step?: 'offer' | 'denied' }
    | { type: 'setupChanged'; setup: Setup }
    | { type: 'setupClosed' };

export const createInitialState = (settings: ExtensionSettings = DEFAULT_EXTENSION_SETTINGS): State =>
{
    return {
        view: 'prompt',
        page: 'prompt',
        prompt: '',
        answerDraft: '',
        files: [],
        entries: [],
        nextId: 1,
        sessionSize: 0,
        model: 'idle',
        settings,
    };
};

// drops optional keys set to undefined, as the state never holds them
const without = <T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> =>
{
    const copy = { ...value };

    for (const key of keys)
    {
        delete copy[key];
    }

    return copy;
};

// changes one prompt entry; with closeOthers, any open placeholder or selection elsewhere closes
const updatePrompt = (state: State, id: number, change: (entry: PromptEntry) => PromptEntry, closeOthers = false): State =>
{
    if (!state.entries.some((entry) => entry.kind === 'prompt' && entry.id === id))
    {
        return state;
    }

    return {
        ...state,
        entries: state.entries.map((entry) =>
        {
            if (entry.kind !== 'prompt')
            {
                return entry;
            }

            if (entry.id === id)
            {
                return change(entry);
            }

            return closeOthers ? without(entry, 'selected', 'selection') : entry;
        }),
    };
};

export const reducer = (state: State, action: Action): State =>
{
    switch (action.type)
    {
        case 'settingsLoaded':
        case 'settingsChanged':
            return { ...state, settings: action.settings };
        case 'settingsOpened':
            return state.view === 'prompt' || state.view === 'answer' ? { ...state, view: 'settings', page: state.view } : state;
        case 'settingsClosed':
            return { ...state, view: state.page };
        case 'pageSelected':
            return { ...state, view: action.page, page: action.page };
        case 'answerDraftChanged':
            return { ...state, answerDraft: action.text };
        case 'promptChanged':
            return { ...state, prompt: action.prompt };
        case 'filesAdded':
            return { ...without(state, 'fileError'), files: [...state.files, ...action.files] };
        case 'fileRejected':
            return { ...state, fileError: action.message };
        case 'fileRemoved':
            return { ...without(state, 'fileError'), files: state.files.filter((file) => file.id !== action.id) };
        case 'scanStarted':
            return { ...without(state, 'scanError'), scan: { step: 'starting' } };
        case 'scanProgressed':
            if (state.scan != null)
            {
                return { ...state, scan: action.scan };
            }

            // the first-run download reports like a scan
            return state.setup?.step === 'download' ? { ...state, setup: { step: 'download', scan: action.scan } } : state;
        case 'scanFinished':
        {
            const entry: PromptEntry = {
                kind: 'prompt',
                id: state.nextId,
                run: action.run,
                source: { prompt: state.prompt, files: state.files },
                revealed: [],
                expanded: true,
            };

            return { ...without(state, 'scan'), prompt: '', files: [], entries: [...closeAll(state.entries), entry], nextId: state.nextId + 1 };
        }
        case 'scanStopped':
            return { ...without(state, 'scan'), ...(action.error == null ? {} : { scanError: action.error }) };
        case 'answerRestored':
        {
            const entry: AnswerEntry = { kind: 'answer', id: state.nextId, text: state.answerDraft, showMasked: false };

            return { ...state, answerDraft: '', entries: [...closeAll(state.entries), entry], nextId: state.nextId + 1 };
        }
        case 'promptMovedToAnswer':
        {
            // a pasted answer in the prompt composer moves to where it gets unmasked, after any answer already there
            const answerDraft = state.answerDraft.trim().length === 0 ? state.prompt : `${state.answerDraft}\n\n${state.prompt}`;

            return { ...state, view: 'answer', page: 'answer', prompt: '', answerDraft };
        }
        case 'entryEdited':
        {
            const entry = state.entries.find((candidate) => candidate.id === action.id);

            if (entry?.kind !== 'prompt' || entry.sentTo != null || editBlocker(state) != null)
            {
                return state;
            }

            return { ...state, prompt: entry.source.prompt, files: entry.source.files, entries: state.entries.filter((candidate) => candidate !== entry) };
        }
        case 'entryToggled':
            return {
                ...state,
                entries: state.entries.map((entry) =>
                {
                    if (entry.id !== action.id)
                    {
                        return entry;
                    }

                    return entry.kind === 'prompt' ? without({ ...entry, expanded: !entry.expanded }, 'selected', 'selection') : { ...entry, showMasked: !entry.showMasked };
                }),
            };
        case 'placeholderSelected':
            return updatePrompt(
                state,
                action.id,
                (entry) => (action.placeholder == null ? without(entry, 'selected') : { ...without(entry, 'selection'), selected: action.placeholder }),
                action.placeholder != null,
            );
        case 'placeholderToggled':
            return updatePrompt(state, action.id, (entry) =>
            {
                const revealed = entry.revealed.includes(action.placeholder)
                    ? entry.revealed.filter((placeholder) => placeholder !== action.placeholder)
                    : [...entry.revealed, action.placeholder];

                return { ...without(entry, 'insert'), revealed };
            });
        case 'textSelected':
            return updatePrompt(
                state,
                action.id,
                (entry) => (action.selection == null ? without(entry, 'selection') : { ...without(entry, 'selected'), selection: action.selection }),
                action.selection != null,
            );
        case 'selectionMasked':
            return updatePrompt(state, action.id, (entry) => ({ ...without(entry, 'selection', 'insert'), run: action.run }));
        case 'insertFinished':
            return updatePrompt(state, action.id, (entry) =>
            {
                const insert = { ok: action.ok, message: action.message };

                // a sent prompt folds away, its answer comes next
                return action.ok && action.target != null
                    ? { ...without(entry, 'selected', 'selection'), insert, sentTo: action.target, expanded: false }
                    : { ...entry, insert };
            });
        case 'modelChanged':
            return { ...state, model: action.model };
        case 'targetChanged':
            return action.target == null ? without(state, 'target') : { ...state, target: action.target };
        case 'sessionChanged':
            return { ...state, sessionSize: action.size };
        case 'sessionForgotten':
            // prompts and answers without their originals can't be checked or restored anymore
            return { ...state, entries: [], sessionSize: 0 };
        case 'setupShown':
            // the model counts as missing until a download starts
            return { ...state, view: 'setup', setup: { step: action.step ?? 'offer' }, model: state.model === 'idle' ? 'missing' : state.model };
        case 'setupChanged':
            return state.setup == null ? state : { ...state, setup: action.setup };
        case 'setupClosed':
            return { ...without(state, 'setup'), view: state.page };
    }
};

// open placeholders and selections close when something new joins the timeline
const closeAll = (entries: readonly Entry[]): Entry[] =>
{
    return entries.map((entry) => (entry.kind === 'prompt' ? without(entry, 'selected', 'selection') : entry));
};

// the categories a hand-made selection may use: the enabled ones
export const selectableCategories = (settings: ExtensionSettings): Category[] =>
{
    return CATEGORIES.filter((category) => settings.enabledCategories[category]);
};

// why an unsent prompt can't go back into the composer now: a running scan clears the composer,
// and a draft there would be replaced
export const editBlocker = (state: Pick<State, 'scan' | 'prompt' | 'files'>): string | undefined =>
{
    if (state.scan != null)
    {
        return 'Wait for masking to finish to edit this prompt';
    }

    return state.prompt.trim().length > 0 || state.files.length > 0 ? 'Clear the input to edit this prompt' : undefined;
};

// the last prompt was sent and no answer followed yet
export const awaitingAnswer = (entries: readonly Entry[]): PromptEntry | undefined =>
{
    const last = entries.at(-1);

    return last?.kind === 'prompt' && last.sentTo != null ? last : undefined;
};
