import { PipelineCancelledError, type Category, type Span } from '@secureprompt/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { browser } from 'wxt/browser';
import { extractTextFile } from '../documents/extract-text-file';
import { composeInput, type AttachedFile } from '../masking/compose';
import { outputParts, outputText, trimSelection } from '../masking/output';
import { answerParts, restoredText } from '../masking/restore';
import { loadExtensionSettings, saveExtensionSettings } from '../settings/storage';
import { enabledCategorySet, prependPromptHeader, type ExtensionSettings } from '../settings/types';
import { AnswerScreen } from './components/AnswerScreen';
import { Header, SettingsHeader } from './components/Header';
import { PrivacyNote } from './components/PrivacyNote';
import { PromptScreen } from './components/PromptScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SetupScreen } from './components/SetupScreen';
import { Tabs } from './components/Tabs';
import { copyText, createServices, hasModelPermission, insertIntoChat, requestChatTarget, requestModelPermission } from './services';
import { clearStoredSession, loadStoredSession, storeSession } from './session-storage';
import { createInitialState, reducer, selectableCategories, type ModelNote } from './state';

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
    const { settings, review } = state;
    const parts = useMemo(() => (review == null ? [] : outputParts(review.run.input, review.run.result, new Set(review.revealed))), [review]);
    const answer = useMemo(() => answerParts(state.answer, services.masker.originalFor), [state.answer, state.sessionSize, services]);

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
    const finalText = () => prependPromptHeader(outputText(parts), settings);

    const insert = async () =>
    {
        const result = await insertIntoChat(finalText());

        dispatch({ type: 'insertFinished', ok: result.ok, message: result.message });
        dispatch({ type: 'targetChanged', ...(result.target == null ? {} : { target: result.target }) });
    };

    const selectText = (selection: Span | undefined) =>
    {
        const trimmed = selection == null || review == null ? undefined : trimSelection(review.run.input, selection);

        dispatch({ type: 'textSelected', ...(trimmed == null ? {} : { selection: trimmed }) });
    };

    const maskSelection = (category: Category) =>
    {
        if (review?.selection == null)
        {
            return;
        }

        const run = services.masker.addSelection(review.run, { ...review.selection, category }, enabledCategorySet(settings.enabledCategories));

        window.getSelection()?.removeAllRanges();
        sessionUpdated();
        dispatch({ type: 'selectionMasked', run });
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
        <div className="app">
            <Header model={state.model} onOpenSettings={() => dispatch({ type: 'settingsOpened' })} />
            <Tabs active={state.view === 'answer' ? 'answer' : 'prompt'} onSelect={(tab) => dispatch({ type: 'tabSelected', tab })} />
            {state.view === 'answer' ? (
                <AnswerScreen
                    answer={state.answer}
                    parts={answer}
                    sessionSize={state.sessionSize}
                    onAnswerChange={(text) => dispatch({ type: 'answerChanged', answer: text })}
                    onCopy={() => copyText(restoredText(answer))}
                />
            ) : state.view === 'review' && review != null ? (
                <ReviewScreen
                    review={review}
                    parts={parts}
                    target={state.target}
                    categories={selectableCategories(settings)}
                    originalFor={services.masker.originalFor}
                    onEdit={() => dispatch({ type: 'promptEdited' })}
                    onSelectPlaceholder={(placeholder) => dispatch({ type: 'placeholderSelected', ...(placeholder == null ? {} : { placeholder }) })}
                    onTogglePlaceholder={(placeholder) => dispatch({ type: 'placeholderToggled', placeholder })}
                    onSelectText={selectText}
                    onMaskSelection={maskSelection}
                    onCopy={() => copyText(finalText())}
                    onInsert={() => void insert()}
                />
            ) : (
                <PromptScreen
                    prompt={state.prompt}
                    files={state.files}
                    fileError={state.fileError}
                    scan={state.scan}
                    scanError={state.scanError}
                    target={state.target}
                    onPromptChange={(prompt) => dispatch({ type: 'promptChanged', prompt })}
                    onAddFiles={(files) => void addFiles(files)}
                    onRemoveFile={(id) => dispatch({ type: 'fileRemoved', id })}
                    onMask={() => void mask()}
                    onCancel={() => running.current?.abort()}
                />
            )}
            <PrivacyNote />
        </div>
    );
};
