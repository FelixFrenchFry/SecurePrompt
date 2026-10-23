import { describe, expect, it } from 'vitest';
import type { MaskRun } from '../../../apps/extension/source/masking/masker';
import { DEFAULT_EXTENSION_SETTINGS } from '../../../apps/extension/source/settings/types';
import { createInitialState, reducer, selectableCategories, type Action, type State } from '../../../apps/extension/source/ui/state';

const run: MaskRun = { input: 'Anna', result: { maskedText: 'PERSON_001', spans: [], segments: [], failedDetectors: [] }, modelFailed: false, milliseconds: 5 };

const after = (...actions: Action[]): State => actions.reduce(reducer, createInitialState());

const reviewing = (...actions: Action[]) => after({ type: 'scanStarted' }, { type: 'scanFinished', run }, ...actions);

describe('scanning', () =>
{
    it('moves from the prompt to the review once the scan finishes', () =>
    {
        const state = reviewing();

        expect(state.view).toBe('review');
        expect(state.scan).toBeUndefined();
        expect(state.review).toEqual({ run, revealed: [] });
    });

    it('shows progress only while scanning', () =>
    {
        const scan = { step: 'scanning', percent: 40 } as const;

        expect(after({ type: 'scanProgressed', scan }).scan).toBeUndefined();
        expect(after({ type: 'scanStarted' }, { type: 'scanProgressed', scan }).scan).toEqual(scan);
    });

    it('stays on the prompt when stopped, with an error only if it failed', () =>
    {
        const stopped = after({ type: 'scanStarted' }, { type: 'scanStopped' });

        expect(stopped.view).toBe('prompt');
        expect(stopped).not.toHaveProperty('scan');
        expect(stopped).not.toHaveProperty('scanError');
        expect(after({ type: 'scanStarted' }, { type: 'scanStopped', error: 'Could not mask' }).scanError).toBe('Could not mask');
        expect(after({ type: 'scanStopped', error: 'x' }, { type: 'scanStarted' }).scanError).toBeUndefined();
    });

    it('keeps why the model did not run', () =>
    {
        expect(after({ type: 'scanFinished', run, modelNote: 'permission' }).review?.modelNote).toBe('permission');
    });

    it('drops the review when the prompt is edited', () =>
    {
        const edited = reviewing({ type: 'promptEdited' });

        expect(edited.view).toBe('prompt');
        expect(edited).not.toHaveProperty('review');
    });
});

describe('reviewing', () =>
{
    it('opens a placeholder instead of a text selection, and closes it', () =>
    {
        const opened = reviewing({ type: 'textSelected', selection: { start: 0, end: 4 } }, { type: 'placeholderSelected', placeholder: 'PERSON_001' });

        expect(opened.review?.selected).toBe('PERSON_001');
        expect(opened.review).not.toHaveProperty('selection');
        expect(reducer(opened, { type: 'placeholderSelected' }).review).not.toHaveProperty('selected');
    });

    it('reveals a placeholder and masks it again', () =>
    {
        const revealed = reviewing({ type: 'placeholderToggled', placeholder: 'PERSON_001' });

        expect(revealed.review?.revealed).toEqual(['PERSON_001']);
        expect(reducer(revealed, { type: 'placeholderToggled', placeholder: 'PERSON_001' }).review?.revealed).toEqual([]);
    });

    it('swaps an open placeholder for a text selection, then masks it', () =>
    {
        const selected = reviewing({ type: 'placeholderSelected', placeholder: 'PERSON_001' }, { type: 'textSelected', selection: { start: 0, end: 4 } });
        const masked = reducer(selected, { type: 'selectionMasked', run: { ...run, milliseconds: 9 } });

        expect(selected.review?.selection).toEqual({ start: 0, end: 4 });
        expect(selected.review).not.toHaveProperty('selected');
        expect(masked.review?.run.milliseconds).toBe(9);
        expect(masked.review).not.toHaveProperty('selection');
        expect(reducer(selected, { type: 'textSelected' }).review?.selection).toBeUndefined();
    });

    it('shows the insert result until the output changes', () =>
    {
        const inserted = reviewing({ type: 'insertFinished', ok: true, message: 'Inserted' });

        expect(inserted.review?.insert).toEqual({ ok: true, message: 'Inserted' });
        expect(reducer(inserted, { type: 'placeholderToggled', placeholder: 'PERSON_001' }).review?.insert).toBeUndefined();
    });

    it('ignores review actions without a review', () =>
    {
        const state = createInitialState();

        expect(reducer(state, { type: 'placeholderToggled', placeholder: 'PERSON_001' })).toBe(state);
    });
});

describe('tabs, answer and session', () =>
{
    it('switches between the prompt, its review and the answer', () =>
    {
        expect(after({ type: 'tabSelected', tab: 'answer' }).view).toBe('answer');
        expect(after({ type: 'tabSelected', tab: 'answer' }, { type: 'tabSelected', tab: 'prompt' }).view).toBe('prompt');
        expect(reviewing({ type: 'tabSelected', tab: 'answer' }, { type: 'tabSelected', tab: 'prompt' }).view).toBe('review');
    });

    it('returns from settings to the answer', () =>
    {
        expect(after({ type: 'tabSelected', tab: 'answer' }, { type: 'settingsOpened' }, { type: 'settingsClosed' }).view).toBe('answer');
    });

    it('keeps the answer and the session size', () =>
    {
        const state = after({ type: 'answerChanged', answer: 'Hallo PERSON_001' }, { type: 'sessionChanged', size: 3 });

        expect(state).toMatchObject({ answer: 'Hallo PERSON_001', sessionSize: 3 });
    });

    it('drops the review and the answer when the session is forgotten', () =>
    {
        const forgotten = reviewing({ type: 'answerChanged', answer: 'x' }, { type: 'settingsOpened' }, { type: 'sessionForgotten' });

        expect(forgotten).toMatchObject({ view: 'settings', previousView: 'prompt', answer: '', sessionSize: 0 });
        expect(forgotten).not.toHaveProperty('review');
        expect(reviewing({ type: 'sessionForgotten' }).view).toBe('prompt');
        expect(after({ type: 'tabSelected', tab: 'answer' }, { type: 'settingsOpened' }, { type: 'sessionForgotten' }).previousView).toBe('answer');
    });
});

describe('first run', () =>
{
    it('shows the offer, follows the download and closes', () =>
    {
        const shown = after({ type: 'setupShown' });
        const downloading = reducer(shown, { type: 'setupChanged', setup: { step: 'download', scan: { step: 'starting' } } });
        const progressed = reducer(downloading, { type: 'scanProgressed', scan: { step: 'loading' } });

        expect(shown).toMatchObject({ view: 'setup', setup: { step: 'offer' } });
        expect(progressed.setup).toEqual({ step: 'download', scan: { step: 'loading' } });
        expect(reducer(shown, { type: 'scanProgressed', scan: { step: 'loading' } })).toBe(shown);
        expect(reducer(progressed, { type: 'settingsOpened' })).toBe(progressed);

        const closed = reducer(progressed, { type: 'setupClosed' });

        expect(closed.view).toBe('prompt');
        expect(closed).not.toHaveProperty('setup');
        expect(reducer(closed, { type: 'setupChanged', setup: { step: 'ready' } })).toBe(closed);
    });
});

describe('files', () =>
{
    const file = { id: 'a', fileName: 'a.txt', format: 'txt', size: 1, text: 'a' } as const;

    it('adds and removes files, clearing an earlier error', () =>
    {
        const added = after({ type: 'fileRejected', message: 'too big' }, { type: 'filesAdded', files: [file] });

        expect(added.files).toEqual([file]);
        expect(added).not.toHaveProperty('fileError');
        expect(reducer(added, { type: 'fileRemoved', id: 'a' }).files).toEqual([]);
    });
});

describe('settings and model', () =>
{
    const withoutModel = { ...DEFAULT_EXTENSION_SETTINGS, localModelDetectionEnabled: false };

    it('returns from settings to the review, or to the prompt without one', () =>
    {
        expect(reviewing({ type: 'settingsOpened' }, { type: 'settingsOpened' }, { type: 'settingsClosed' }).view).toBe('review');
        expect(after({ type: 'settingsOpened' }, { type: 'settingsClosed' }).view).toBe('prompt');
    });

    it('shows the model as off while it is switched off', () =>
    {
        const off = after({ type: 'settingsChanged', settings: withoutModel }, { type: 'modelChanged', model: 'ready' });

        expect(off.model).toBe('off');
        expect(reducer(off, { type: 'settingsChanged', settings: DEFAULT_EXTENSION_SETTINGS }).model).toBe('idle');
        expect(after({ type: 'modelChanged', model: 'ready' }, { type: 'settingsLoaded', settings: DEFAULT_EXTENSION_SETTINGS }).model).toBe('ready');
        expect(createInitialState(withoutModel).model).toBe('off');
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
