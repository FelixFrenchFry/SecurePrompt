import { PipelineCancelledError, type Category, type Span } from '@secureprompt/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { browser } from 'wxt/browser';
import { extractTextFile } from '../documents/extract-text-file';
import { composeInput, type AttachedFile } from '../masking/compose';
import { outputParts, outputText, trimSelection } from '../masking/output';
import { loadExtensionSettings, saveExtensionSettings } from '../settings/storage';
import { enabledCategorySet, prependPromptHeader, type ExtensionSettings } from '../settings/types';
import { Header, SettingsHeader } from './components/Header';
import { PrivacyNote } from './components/PrivacyNote';
import { PromptScreen } from './components/PromptScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { copyText, createServices, insertIntoChat, requestChatTarget, requestModelPermission } from './services';
import { createInitialState, reducer, selectableCategories, type ModelNote } from './state';

export const App = () =>
{
    const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState());
    const services = useMemo(
        () => createServices({ onModel: (model) => dispatch({ type: 'modelChanged', model }), onScan: (scan) => dispatch({ type: 'scanProgressed', scan }) }),
        [],
    );
    const running = useRef<AbortController | undefined>(undefined);
    const { settings, review } = state;
    const parts = useMemo(() => (review == null ? [] : outputParts(review.run.input, review.run.result, new Set(review.revealed))), [review]);

    useEffect(() =>
    {
        void loadExtensionSettings()
            .then((loaded) => dispatch({ type: 'settingsLoaded', settings: loaded }))
            .catch(() => undefined);
    }, []);

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
        dispatch({ type: 'selectionMasked', run });
    };

    if (state.view === 'settings')
    {
        return (
            <div className="app">
                <SettingsHeader onBack={() => dispatch({ type: 'settingsClosed' })} />
                <SettingsScreen settings={settings} onChange={changeSettings} />
            </div>
        );
    }

    return (
        <div className="app">
            <Header model={state.model} onOpenSettings={() => dispatch({ type: 'settingsOpened' })} />
            {state.view === 'review' && review != null ? (
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
