import { CATEGORIES, type Category, type Span } from '@secureprompt/core';
import type { AttachedFile } from '../masking/compose';
import type { MaskRun } from '../masking/masker';
import type { DownloadProgress } from '../model/download-progress';
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from '../settings/types';

// the side panel's state, changed only through the reducer below

export type View = 'prompt' | 'review' | 'answer' | 'settings' | 'setup';

export type ModelStatus = 'off' | 'idle' | 'downloading' | 'loading' | 'ready' | 'failed';

export type ScanStep = { step: 'starting' } | ({ step: 'downloading' } & DownloadProgress) | { step: 'loading' } | { step: 'scanning'; percent: number };

// why the model didn't run on a reviewed prompt
export type ModelNote = 'permission' | 'failed';

export type Review = {
    run: MaskRun;
    modelNote?: ModelNote;
    // placeholders the user chose to send as their original values
    revealed: string[];
    selected?: string;
    // text the user selected in the preview, to mask by hand
    selection?: Span;
    insert?: { ok: boolean; message: string };
};

export type ChatTarget = { id: string; label: string };

// the first-run screen: the offer, the model download, and how it ended
export type Setup = { step: 'offer' | 'denied' | 'ready' | 'failed' } | { step: 'download'; scan: ScanStep };

export type State = {
    view: View;
    // where settings return to
    previousView: Exclude<View, 'settings' | 'setup'>;
    prompt: string;
    files: AttachedFile[];
    fileError?: string;
    scan?: ScanStep;
    scanError?: string;
    review?: Review;
    // the pasted AI answer, restored in the Answer tab
    answer: string;
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
    | { type: 'scanFinished'; run: MaskRun; modelNote?: ModelNote }
    | { type: 'scanStopped'; error?: string }
    | { type: 'promptEdited' }
    | { type: 'placeholderSelected'; placeholder?: string }
    | { type: 'placeholderToggled'; placeholder: string }
    | { type: 'textSelected'; selection?: Span }
    | { type: 'selectionMasked'; run: MaskRun }
    | { type: 'insertFinished'; ok: boolean; message: string }
    | { type: 'modelChanged'; model: ModelStatus }
    | { type: 'targetChanged'; target?: ChatTarget }
    | { type: 'tabSelected'; tab: 'prompt' | 'answer' }
    | { type: 'answerChanged'; answer: string }
    | { type: 'sessionChanged'; size: number }
    | { type: 'sessionForgotten' }
    | { type: 'setupShown' }
    | { type: 'setupChanged'; setup: Setup }
    | { type: 'setupClosed' };

export const createInitialState = (settings: ExtensionSettings = DEFAULT_EXTENSION_SETTINGS): State =>
{
    return { view: 'prompt', previousView: 'prompt', prompt: '', files: [], answer: '', sessionSize: 0, model: settings.localModelDetectionEnabled ? 'idle' : 'off', settings };
};

// a model switched on stays in its last known state, switched off it's 'off'
const modelFor = (settings: ExtensionSettings, current: ModelStatus): ModelStatus =>
{
    if (!settings.localModelDetectionEnabled)
    {
        return 'off';
    }

    return current === 'off' ? 'idle' : current;
};

const updateReview = (state: State, change: (review: Review) => Review): State =>
{
    return state.review == null ? state : { ...state, review: change(state.review) };
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

export const reducer = (state: State, action: Action): State =>
{
    switch (action.type)
    {
        case 'settingsLoaded':
        case 'settingsChanged':
            return { ...state, settings: action.settings, model: modelFor(action.settings, state.model) };
        case 'settingsOpened':
            return state.view === 'settings' || state.view === 'setup' ? state : { ...state, view: 'settings', previousView: state.view };
        case 'settingsClosed':
            return { ...state, view: state.previousView === 'review' && state.review == null ? 'prompt' : state.previousView };
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
            return {
                ...without(state, 'scan'),
                view: 'review',
                review: { run: action.run, revealed: [], ...(action.modelNote == null ? {} : { modelNote: action.modelNote }) },
            };
        case 'scanStopped':
            return { ...without(state, 'scan'), ...(action.error == null ? {} : { scanError: action.error }) };
        case 'promptEdited':
            return { ...without(state, 'review'), view: 'prompt' };
        case 'placeholderSelected':
            return updateReview(state, (review) =>
            {
                return action.placeholder == null ? without(review, 'selected') : { ...without(review, 'selection'), selected: action.placeholder };
            });
        case 'placeholderToggled':
            return updateReview(state, (review) =>
            {
                const revealed = review.revealed.includes(action.placeholder)
                    ? review.revealed.filter((placeholder) => placeholder !== action.placeholder)
                    : [...review.revealed, action.placeholder];

                return { ...without(review, 'insert'), revealed };
            });
        case 'textSelected':
            return updateReview(state, (review) =>
            {
                const rest = without(review, 'selection');

                return action.selection == null ? rest : { ...without(rest, 'selected'), selection: action.selection };
            });
        case 'selectionMasked':
            return updateReview(state, (review) => ({ ...without(review, 'selection', 'insert'), run: action.run }));
        case 'insertFinished':
            return updateReview(state, (review) => ({ ...review, insert: { ok: action.ok, message: action.message } }));
        case 'modelChanged':
            return { ...state, model: state.settings.localModelDetectionEnabled ? action.model : 'off' };
        case 'targetChanged':
            return action.target == null ? without(state, 'target') : { ...state, target: action.target };
        case 'tabSelected':
            return { ...state, view: action.tab === 'answer' ? 'answer' : state.review == null ? 'prompt' : 'review' };
        case 'answerChanged':
            return { ...state, answer: action.answer };
        case 'sessionChanged':
            return { ...state, sessionSize: action.size };
        case 'sessionForgotten':
            // a review without its originals can't be checked anymore
            return {
                ...without(state, 'review'),
                answer: '',
                sessionSize: 0,
                view: state.view === 'settings' ? 'settings' : 'prompt',
                previousView: state.previousView === 'answer' ? 'answer' : 'prompt',
            };
        case 'setupShown':
            return { ...state, view: 'setup', setup: { step: 'offer' } };
        case 'setupChanged':
            return state.setup == null ? state : { ...state, setup: action.setup };
        case 'setupClosed':
            return { ...without(state, 'setup'), view: 'prompt' };
    }
};

// the categories a hand-made selection may use: the enabled ones
export const selectableCategories = (settings: ExtensionSettings): Category[] =>
{
    return CATEGORIES.filter((category) => settings.enabledCategories[category]);
};
