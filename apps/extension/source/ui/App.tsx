import { PipelineCancelledError, type Category, type Span } from '@secureprompt/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { browser } from 'wxt/browser';
import { extractTextFile } from '../documents/extract-text-file';
import { composeInput, type AttachedFile } from '../masking/compose';
import { outputParts, outputText, trimSelection } from '../masking/output';
import { answerParts, knownPlaceholderCount, restoredText } from '../masking/restore';
import { loadExtensionSettings, saveExtensionSettings } from '../settings/storage';
import { enabledCategorySet, prependPromptHeader, type ExtensionSettings } from '../settings/types';
import { AnswerCard } from './components/AnswerCard';
import { AnswerComposer } from './components/AnswerComposer';
import { Composer } from './components/Composer';
import { EmptyAnswers, EmptyPrompts } from './components/EmptySession';
import { Button } from './components/Button';
import { Flash } from './components/Flash';
import { Header, SettingsHeader } from './components/Header';
import { PrivacyNote } from './components/PrivacyNote';
import { PromptCard } from './components/PromptCard';
import { SettingsScreen } from './components/SettingsScreen';
import { SetupScreen } from './components/SetupScreen';
import { Tabs } from './components/Tabs';
import { copyText, createServices, hasModelPermission, insertIntoChat, requestChatTarget, requestModelPermission } from './services';
import { clearStoredSession, loadStoredSession, storeSession } from './session-storage';
import { awaitingAnswer, createInitialState, editBlocker, reducer, selectableCategories, type ModelNote, type PromptEntry } from './state';

// the reviewed output of a prompt entry, with the values the user chose to send as written
const partsOf = (entry: PromptEntry) => outputParts(entry.run.input, entry.run.result, new Set(entry.revealed));

export const App = () =>
{
    const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState());
    const services = useMemo(
        () => createServices({ onModel: (model) => dispatch({ type: 'modelChanged', model }), onScan: (scan) => dispatch({ type: 'scanProgressed', scan }) }),
        [],
    );
    const running = useRef<AbortController | undefined>(undefined);
    // masking waits for the stored session, so values keep their placeholders after a reopen
    const sessionLoaded = useRef<Promise<void>>(Promise.resolve());
    const timeline = useRef<HTMLElement>(null);
    const { settings, entries } = state;
    const originalFor = services.masker.originalFor;
    const knownPlaceholders = useMemo(() => knownPlaceholderCount(state.prompt, originalFor), [state.prompt, state.sessionSize, originalFor]);
    const knownInAnswer = useMemo(() => knownPlaceholderCount(state.answerDraft, originalFor), [state.answerDraft, state.sessionSize, originalFor]);
    const page = state.view === 'answer' ? 'answer' : 'prompt';
    const pageEntries = entries.filter((entry) => entry.kind === page);
    const waitingFor = awaitingAnswer(entries);

    useEffect(() =>
    {
        sessionLoaded.current = loadStoredSession().then((stored) =>
        {
            if (stored != null)
            {
                services.masker.load(stored);
            }

            dispatch({ type: 'sessionChanged', size: services.masker.size() });
        });

        void loadExtensionSettings()
            .then(async (loaded) =>
            {
                dispatch({ type: 'settingsLoaded', settings: loaded });

                // the first run explains the model download before Chrome asks for it
                if (loaded.localModelDetectionEnabled && !loaded.modelSetupDone && !(await hasModelPermission()))
                {
                    dispatch({ type: 'setupShown' });
                }
            })
            .catch(() => undefined);
    }, [services]);

    useEffect(() =>
    {
        document.documentElement.dataset.colorMode = settings.theme === 'system' ? 'auto' : settings.theme;
    }, [settings.theme]);

    // a new card, or switching pages, shows the newest card at the bottom
    useEffect(() =>
    {
        timeline.current?.scrollTo({ top: timeline.current.scrollHeight });
    }, [pageEntries.length, page]);

    // the chat page to insert into follows the active tab
    useEffect(() =>
    {
        const refresh = () =>
        {
            void requestChatTarget().then((target) => dispatch({ type: 'targetChanged', ...(target == null ? {} : { target }) }));
        };
        const onUpdated = (_tabId: number, change: { status?: string; url?: string }) =>
        {
            if (change.status === 'complete' || change.url != null)
            {
                refresh();
            }
        };

        refresh();
        browser.tabs.onActivated.addListener(refresh);
        browser.tabs.onUpdated.addListener(onUpdated);
        window.addEventListener('focus', refresh);

        return () =>
        {
            browser.tabs.onActivated.removeListener(refresh);
            browser.tabs.onUpdated.removeListener(onUpdated);
            window.removeEventListener('focus', refresh);
        };
    }, []);

    const changeSettings = (next: ExtensionSettings) =>
    {
        dispatch({ type: 'settingsChanged', settings: next });
        void saveExtensionSettings(next).catch(() => undefined);
    };

    // keeps the placeholders for restoring answers, in memory only
    const sessionUpdated = () =>
    {
        void storeSession(services.masker.snapshot());
        dispatch({ type: 'sessionChanged', size: services.masker.size() });
    };

    const forgetSession = () =>
    {
        services.masker.forget();
        void clearStoredSession();
        dispatch({ type: 'sessionForgotten' });
    };

    const addFiles = async (files: File[]) =>
    {
        const added: AttachedFile[] = [];

        for (const file of files)
        {
            try
            {
                const document = await extractTextFile(file);

                added.push({ id: document.id, fileName: document.fileName, format: document.format, size: document.size, text: document.text });
            }
            catch (error)
            {
                dispatch({ type: 'fileRejected', message: `${file.name}: ${error instanceof Error ? error.message : 'Could not read the file.'}` });
            }
        }

        dispatch({ type: 'filesAdded', files: added });
    };

    const mask = async () =>
    {
        const useModel = settings.localModelDetectionEnabled;
        // asked first, as Chrome shows the permission prompt only right after a click
        const allowed = useModel && (await requestModelPermission());
        const controller = new AbortController();

        running.current?.abort();
        running.current = controller;
        dispatch({ type: 'scanStarted' });

        try
        {
            await sessionLoaded.current;

            const run = await services.masker.mask(composeInput(state.prompt, state.files), {
                useModel: allowed,
                categories: enabledCategorySet(settings.enabledCategories),
                signal: controller.signal,
                onModelProgress: (fraction) => dispatch({ type: 'scanProgressed', scan: { step: 'scanning', percent: Math.round(fraction * 100) } }),
            });
            const modelNote: ModelNote | undefined = !useModel ? undefined : !allowed ? 'permission' : run.modelFailed ? 'failed' : undefined;

            if (allowed)
            {
                dispatch({ type: 'modelChanged', model: run.modelFailed ? 'failed' : 'ready' });
            }

            sessionUpdated();
            dispatch({ type: 'scanFinished', run, ...(modelNote == null ? {} : { modelNote }) });
        }
        catch (error)
        {
            dispatch({ type: 'scanStopped', ...(error instanceof PipelineCancelledError ? {} : { error: 'Could not mask the prompt. Nothing was sent.' }) });
        }
        finally
        {
            if (running.current === controller)
            {
                running.current = undefined;
            }
        }
    };

    // the first run: asks for the download, then loads the model ahead of the first prompt
    const downloadModel = async () =>
    {
        const allowed = await requestModelPermission();

        if (!allowed)
        {
            dispatch({ type: 'setupChanged', setup: { step: 'denied' } });
            return;
        }

        const controller = new AbortController();

        running.current = controller;
        dispatch({ type: 'setupChanged', setup: { step: 'download', scan: { step: 'starting' } } });

        try
        {
            await services.warmUp(controller.signal);
            dispatch({ type: 'modelChanged', model: 'ready' });
            dispatch({ type: 'setupChanged', setup: { step: 'ready' } });
            changeSettings({ ...settings, localModelDetectionEnabled: true, modelSetupDone: true });
        }
        catch (error)
        {
            const cancelled = error instanceof PipelineCancelledError;

            dispatch({ type: 'setupChanged', setup: { step: cancelled ? 'offer' : 'failed' } });

            if (!cancelled)
            {
                dispatch({ type: 'modelChanged', model: 'failed' });
            }
        }
        finally
        {
            if (running.current === controller)
            {
                running.current = undefined;
            }
        }
    };

    // what copy and insert hand over: the reviewed output with the note for the AI
    const finalText = (entry: PromptEntry) => prependPromptHeader(outputText(partsOf(entry)), settings);

    const insert = async (entry: PromptEntry) =>
    {
        const result = await insertIntoChat(finalText(entry));

        dispatch({ type: 'insertFinished', id: entry.id, ok: result.ok, message: result.message, ...(result.target == null ? {} : { target: result.target.label }) });
        dispatch({ type: 'targetChanged', ...(result.target == null ? {} : { target: result.target }) });
    };

    const selectText = (entry: PromptEntry, selection: Span | undefined) =>
    {
        const trimmed = selection == null ? undefined : trimSelection(entry.run.input, selection);

        dispatch({ type: 'textSelected', id: entry.id, ...(trimmed == null ? {} : { selection: trimmed }) });
    };

    const maskSelection = (entry: PromptEntry, category: Category) =>
    {
        if (entry.selection == null)
        {
            return;
        }

        const run = services.masker.addSelection(entry.run, { ...entry.selection, category }, enabledCategorySet(settings.enabledCategories));

        window.getSelection()?.removeAllRanges();
        sessionUpdated();
        dispatch({ type: 'selectionMasked', id: entry.id, run });
    };

    // every mention of a placeholder under another category the user picked
    const changeCategory = (entry: PromptEntry, placeholder: string, category: Category) =>
    {
        const run = services.masker.relabel(entry.run, placeholder, category, enabledCategorySet(settings.enabledCategories));

        sessionUpdated();
        dispatch({ type: 'selectionMasked', id: entry.id, run });
    };

    if (state.view === 'settings')
    {
        return (
            <div className="app">
                <SettingsHeader onBack={() => dispatch({ type: 'settingsClosed' })} />
                <SettingsScreen settings={settings} sessionSize={state.sessionSize} onChange={changeSettings} onForget={forgetSession} />
            </div>
        );
    }

    if (state.view === 'setup' && state.setup != null)
    {
        return (
            <div className="app">
                <Header model={state.model} />
                <SetupScreen
                    setup={state.setup}
                    onDownload={() => void downloadModel()}
                    onCancel={() => running.current?.abort()}
                    onRulesOnly={() =>
                    {
                        changeSettings({ ...settings, localModelDetectionEnabled: false, modelSetupDone: true });
                        dispatch({ type: 'setupClosed' });
                    }}
                    onDone={() => dispatch({ type: 'setupClosed' })}
                />
                <PrivacyNote />
            </div>
        );
    }

    return (
        <div className={pageEntries.length === 0 ? 'app is-empty' : 'app'}>
            <Header model={state.model} onOpenSettings={() => dispatch({ type: 'settingsOpened' })} />
            <Tabs
                active={page}
                counts={{ prompt: entries.filter((entry) => entry.kind === 'prompt').length, answer: entries.filter((entry) => entry.kind === 'answer').length }}
                onSelect={(selected) => dispatch({ type: 'pageSelected', page: selected })}
            />
            <main ref={timeline} className="screen timeline" aria-label={page === 'prompt' ? 'Prompt history' : 'Answer history'}>
                {pageEntries.length > 0 ? null : page === 'prompt' ? <EmptyPrompts /> : <EmptyAnswers />}
                {pageEntries.map((entry) =>
                    entry.kind === 'prompt' ? (
                        <PromptCard
                            key={entry.id}
                            entry={entry}
                            parts={partsOf(entry)}
                            target={state.target}
                            categories={selectableCategories(settings)}
                            originalFor={originalFor}
                            onEdit={() => dispatch({ type: 'entryEdited', id: entry.id })}
                            editBlocked={editBlocker(state)}
                            onToggle={() => dispatch({ type: 'entryToggled', id: entry.id })}
                            onSelectPlaceholder={(placeholder) => dispatch({ type: 'placeholderSelected', id: entry.id, ...(placeholder == null ? {} : { placeholder }) })}
                            onTogglePlaceholder={(placeholder) => dispatch({ type: 'placeholderToggled', id: entry.id, placeholder })}
                            onSelectText={(selection) => selectText(entry, selection)}
                            onMaskSelection={(category) => maskSelection(entry, category)}
                            onChangeCategory={(placeholder, category) => changeCategory(entry, placeholder, category)}
                            onCopyText={copyText}
                            onCopy={() => copyText(finalText(entry))}
                            onInsert={() => void insert(entry)}
                        />
                    ) : (
                        <AnswerCard
                            key={entry.id}
                            entry={entry}
                            parts={answerParts(entry.text, originalFor)}
                            onToggle={() => dispatch({ type: 'entryToggled', id: entry.id })}
                            onCopy={() => copyText(restoredText(answerParts(entry.text, originalFor)))}
                        />
                    ),
                )}
                {page === 'prompt' && waitingFor != null ? (
                    <div className="waiting-hint">
                        <span className="grow">When {waitingFor.sentTo} answers, unmask the answer on the Answer page.</span>
                        <Button small onClick={() => dispatch({ type: 'pageSelected', page: 'answer' })}>
                            Go to Answer
                        </Button>
                    </div>
                ) : null}
            </main>
            <div className="composer-area">
                {page === 'answer' ? (
                    <AnswerComposer
                        text={state.answerDraft}
                        knownPlaceholders={knownInAnswer}
                        onTextChange={(text) => dispatch({ type: 'answerDraftChanged', text })}
                        onUnmask={() => dispatch({ type: 'answerRestored' })}
                    />
                ) : (
                    <>
                        {state.fileError == null ? null : <Flash tone="danger">{state.fileError}</Flash>}
                        {state.scanError == null ? null : <Flash tone="danger">{state.scanError}</Flash>}
                        <Composer
                            prompt={state.prompt}
                            files={state.files}
                            scan={state.scan}
                            target={state.target}
                            knownPlaceholders={knownPlaceholders}
                            onPromptChange={(prompt) => dispatch({ type: 'promptChanged', prompt })}
                            onAddFiles={(files) => void addFiles(files)}
                            onRemoveFile={(id) => dispatch({ type: 'fileRemoved', id })}
                            onMask={() => void mask()}
                            onMoveToAnswer={() => dispatch({ type: 'promptMovedToAnswer' })}
                            onCancel={() => running.current?.abort()}
                        />
                    </>
                )}
            </div>
            <PrivacyNote />
        </div>
    );
};
