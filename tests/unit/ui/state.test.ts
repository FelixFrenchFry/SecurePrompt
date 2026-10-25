import { describe, expect, it } from 'vitest';
import type { MaskRun } from '../../../apps/extension/source/masking/masker';
import { DEFAULT_EXTENSION_SETTINGS } from '../../../apps/extension/source/settings/types';
import {
    awaitingAnswer,
    createInitialState,
    editBlocker,
    reducer,
    selectableCategories,
    type Action,
    type PromptEntry,
    type State,
} from '../../../apps/extension/source/ui/state';

const run: MaskRun = { input: 'Anna', result: { maskedText: 'PERSON_001', spans: [], segments: [], failedDetectors: [] }, modelFailed: false, milliseconds: 5 };
const file = { id: 'a', fileName: 'a.txt', format: 'txt', size: 1, text: 'a' } as const;

const after = (...actions: Action[]): State => actions.reduce(reducer, createInitialState());

// a prompt masked from the composer, entry 1
const masked = (...actions: Action[]) => after({ type: 'promptChanged', prompt: 'Anna' }, { type: 'scanStarted' }, { type: 'scanFinished', run }, ...actions);

const prompt = (state: State, index = 0) => state.entries[index] as PromptEntry;

describe('masking from the composer', () =>
{
    it('adds the masked prompt to the timeline and empties the composer', () =>
    {
        const state = masked();

        expect(state.entries).toEqual([{ kind: 'prompt', id: 1, run, source: { prompt: 'Anna', files: [] }, revealed: [], expanded: true }]);
        expect(state).toMatchObject({ prompt: '', files: [], nextId: 2 });
        expect(state).not.toHaveProperty('scan');
    });

    it('shows progress only while scanning', () =>
    {
        const scan = { step: 'scanning', percent: 40 } as const;

        expect(after({ type: 'scanProgressed', scan }).scan).toBeUndefined();
        expect(after({ type: 'scanStarted' }, { type: 'scanProgressed', scan }).scan).toEqual(scan);
    });

    it('keeps the composer when stopped, with an error only if it failed', () =>
    {
        const stopped = after({ type: 'promptChanged', prompt: 'Anna' }, { type: 'scanStarted' }, { type: 'scanStopped' });

        expect(stopped.prompt).toBe('Anna');
        expect(stopped).not.toHaveProperty('scan');
        expect(stopped).not.toHaveProperty('scanError');
        expect(after({ type: 'scanStarted' }, { type: 'scanStopped', error: 'Could not mask' }).scanError).toBe('Could not mask');
        expect(after({ type: 'scanStopped', error: 'x' }, { type: 'scanStarted' }).scanError).toBeUndefined();
    });

    it('keeps why the model did not run', () =>
    {
        expect(prompt(after({ type: 'scanFinished', run, modelNote: 'permission' })).modelNote).toBe('permission');
    });

    it('puts an unsent prompt back into the composer for editing', () =>
    {
        const edited = masked({ type: 'entryEdited', id: 1 });

        expect(edited).toMatchObject({ prompt: 'Anna', entries: [] });
        expect(reducer(edited, { type: 'entryEdited', id: 9 })).toBe(edited);
    });

    it('keeps an unsent prompt in place while a scan runs or the composer holds a draft', () =>
    {
        const scanning = masked({ type: 'promptChanged', prompt: 'Bert' }, { type: 'scanStarted' });
        const drafted = masked({ type: 'promptChanged', prompt: 'Bert' });
        const withFile = masked({ type: 'filesAdded', files: [file] });

        expect(reducer(scanning, { type: 'entryEdited', id: 1 })).toBe(scanning);
        expect(reducer(drafted, { type: 'entryEdited', id: 1 })).toBe(drafted);
        expect(reducer(withFile, { type: 'entryEdited', id: 1 })).toBe(withFile);
        expect(editBlocker(scanning)).toBe('Wait for masking to finish to edit this prompt');
        expect(editBlocker(drafted)).toBe('Clear the input to edit this prompt');
        expect(editBlocker(masked({ type: 'promptChanged', prompt: '  ' }))).toBeUndefined();
    });
});

describe('reviewing a prompt', () =>
{
    it('opens one placeholder at a time across the timeline, and closes it', () =>
    {
        const two = masked({ type: 'scanFinished', run });
        const first = reducer(two, { type: 'placeholderSelected', id: 1, placeholder: 'PERSON_001' });
        const second = reducer(first, { type: 'placeholderSelected', id: 2, placeholder: 'PERSON_001' });

        expect(prompt(first).selected).toBe('PERSON_001');
        expect(prompt(second)).not.toHaveProperty('selected');
        expect(prompt(second, 1).selected).toBe('PERSON_001');
        expect(prompt(reducer(second, { type: 'placeholderSelected', id: 2 }), 1)).not.toHaveProperty('selected');
    });

    it('reveals a placeholder and masks it again', () =>
    {
        const revealed = masked({ type: 'placeholderToggled', id: 1, placeholder: 'PERSON_001' });

        expect(prompt(revealed).revealed).toEqual(['PERSON_001']);
        expect(prompt(reducer(revealed, { type: 'placeholderToggled', id: 1, placeholder: 'PERSON_001' })).revealed).toEqual([]);
    });

    it('swaps an open placeholder for a text selection, then masks it', () =>
    {
        const selected = masked({ type: 'placeholderSelected', id: 1, placeholder: 'PERSON_001' }, { type: 'textSelected', id: 1, selection: { start: 0, end: 4 } });
        const done = reducer(selected, { type: 'selectionMasked', id: 1, run: { ...run, milliseconds: 9 } });

        expect(prompt(selected).selection).toEqual({ start: 0, end: 4 });
        expect(prompt(selected)).not.toHaveProperty('selected');
        expect(prompt(done).run.milliseconds).toBe(9);
        expect(prompt(done)).not.toHaveProperty('selection');
        expect(prompt(reducer(selected, { type: 'textSelected', id: 1 }))).not.toHaveProperty('selection');
    });

    it('ignores actions for entries that are not there', () =>
    {
        const state = masked();

        expect(reducer(state, { type: 'placeholderToggled', id: 7, placeholder: 'PERSON_001' })).toBe(state);
    });
});

describe('sending and answers', () =>
{
    it('folds a sent prompt and waits for its answer', () =>
    {
        const sent = masked({ type: 'insertFinished', id: 1, ok: true, message: 'Inserted', target: 'ChatGPT' });

        expect(prompt(sent)).toMatchObject({ sentTo: 'ChatGPT', expanded: false, insert: { ok: true } });
        expect(awaitingAnswer(sent.entries)?.id).toBe(1);
        expect(prompt(reducer(sent, { type: 'entryToggled', id: 1 })).expanded).toBe(true);
        expect(reducer(sent, { type: 'entryEdited', id: 1 })).toBe(sent);
    });

    it('keeps a failed insert open with its message, until the output changes', () =>
    {
        const failed = masked({ type: 'insertFinished', id: 1, ok: false, message: 'Refresh ChatGPT' });

        expect(prompt(failed)).toMatchObject({ expanded: true, insert: { ok: false, message: 'Refresh ChatGPT' } });
        expect(prompt(failed)).not.toHaveProperty('sentTo');
        expect(prompt(reducer(failed, { type: 'placeholderToggled', id: 1, placeholder: 'PERSON_001' }))).not.toHaveProperty('insert');
    });

    it('restores the pasted answer as its own entry', () =>
    {
        const sent = masked({ type: 'insertFinished', id: 1, ok: true, message: 'Inserted', target: 'ChatGPT' });
        const answered = reducer(reducer(sent, { type: 'answerDraftChanged', text: 'Hallo PERSON_001' }), { type: 'answerRestored' });

        expect(answered.entries[1]).toEqual({ kind: 'answer', id: 2, text: 'Hallo PERSON_001', showMasked: false });
        expect(answered.answerDraft).toBe('');
        expect(awaitingAnswer(answered.entries)).toBeUndefined();
        expect(reducer(answered, { type: 'entryToggled', id: 2 }).entries[1]).toMatchObject({ showMasked: true });
    });

    it('moves an answer pasted into the prompt composer to the Answer page', () =>
    {
        const moved = after({ type: 'promptChanged', prompt: 'Hallo PERSON_001' }, { type: 'promptMovedToAnswer' });

        expect(moved).toMatchObject({ view: 'answer', page: 'answer', prompt: '', answerDraft: 'Hallo PERSON_001' });
    });

    it('adds a moved answer after an answer already pasted, instead of replacing it', () =>
    {
        const moved = after(
            { type: 'answerDraftChanged', text: 'Erste Antwort' },
            { type: 'promptChanged', prompt: 'Hallo PERSON_001' },
            { type: 'promptMovedToAnswer' },
        );

        expect(moved.answerDraft).toBe('Erste Antwort\n\nHallo PERSON_001');
    });

    it('switches between the Prompt and Answer pages', () =>
    {
        expect(after({ type: 'pageSelected', page: 'answer' })).toMatchObject({ view: 'answer', page: 'answer' });
        expect(after({ type: 'pageSelected', page: 'answer' }, { type: 'pageSelected', page: 'prompt' }).view).toBe('prompt');
    });

    it('clears the timeline when the session is forgotten', () =>
    {
        expect(masked({ type: 'sessionChanged', size: 3 }, { type: 'sessionForgotten' })).toMatchObject({ entries: [], sessionSize: 0 });
    });
});

describe('files', () =>
{
    it('adds and removes files, clearing an earlier error', () =>
    {
        const added = after({ type: 'fileRejected', message: 'too big' }, { type: 'filesAdded', files: [file] });

        expect(added.files).toEqual([file]);
        expect(added).not.toHaveProperty('fileError');
        expect(reducer(added, { type: 'fileRemoved', id: 'a' }).files).toEqual([]);
    });
});

describe('settings, model and first run', () =>
{
    const withoutModel = { ...DEFAULT_EXTENSION_SETTINGS, localModelDetectionEnabled: false };

    it('opens settings from either page and returns to it', () =>
    {
        expect(after({ type: 'settingsOpened' }).view).toBe('settings');
        expect(after({ type: 'settingsOpened' }, { type: 'settingsClosed' }).view).toBe('prompt');
        expect(after({ type: 'pageSelected', page: 'answer' }, { type: 'settingsOpened' }, { type: 'settingsClosed' }).view).toBe('answer');
        expect(after({ type: 'setupShown' }, { type: 'settingsOpened' }).view).toBe('setup');
    });

    it('shows the model as off while it is switched off', () =>
    {
        const off = after({ type: 'settingsChanged', settings: withoutModel }, { type: 'modelChanged', model: 'ready' });

        expect(off.model).toBe('off');
        expect(reducer(off, { type: 'settingsChanged', settings: DEFAULT_EXTENSION_SETTINGS }).model).toBe('idle');
        expect(after({ type: 'modelChanged', model: 'ready' }, { type: 'settingsLoaded', settings: DEFAULT_EXTENSION_SETTINGS }).model).toBe('ready');
        expect(createInitialState(withoutModel).model).toBe('off');
    });

    it('shows the first-run offer, follows the download and closes', () =>
    {
        const shown = after({ type: 'setupShown' });
        const downloading = reducer(shown, { type: 'setupChanged', setup: { step: 'download', scan: { step: 'starting' } } });
        const progressed = reducer(downloading, { type: 'scanProgressed', scan: { step: 'loading' } });
        const closed = reducer(progressed, { type: 'setupClosed' });

        expect(shown).toMatchObject({ view: 'setup', setup: { step: 'offer' } });
        expect(progressed.setup).toEqual({ step: 'download', scan: { step: 'loading' } });
        expect(reducer(shown, { type: 'scanProgressed', scan: { step: 'loading' } })).toBe(shown);
        expect(closed.view).toBe('prompt');
        expect(closed).not.toHaveProperty('setup');
        expect(reducer(closed, { type: 'setupChanged', setup: { step: 'ready' } })).toBe(closed);
    });

    it('offers the enabled categories for selections', () =>
    {
        expect(selectableCategories(DEFAULT_EXTENSION_SETTINGS)).not.toContain('OTHER');
        expect(selectableCategories(DEFAULT_EXTENSION_SETTINGS)[0]).toBe('EMAIL');
    });

    it('sets and clears the chat target', () =>
    {
        const target = { id: 'chatgpt', label: 'ChatGPT' };

        expect(after({ type: 'targetChanged', target }).target).toEqual(target);
        expect(after({ type: 'targetChanged', target }, { type: 'targetChanged' }).target).toBeUndefined();
    });
});
