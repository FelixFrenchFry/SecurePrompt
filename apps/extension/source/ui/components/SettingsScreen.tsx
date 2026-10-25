import { ChevronDownIcon, ChevronUpIcon, QuestionIcon } from '@primer/octicons-react';
import { CATEGORIES } from '@secureprompt/core';
import { useState } from 'react';
import { PROMPT_HEADER, type ExtensionSettings, type PromptHeaderMode, type ThemeSetting } from '../../settings/types';
import { CATEGORY_INFO } from '../categories';
import { Button, IconButton } from './Button';
import { CategoryIcon } from './CategoryIcon';
import { Select } from './Select';

const HEADER_MODES: Array<{ mode: PromptHeaderMode; label: string }> = [
    { mode: 'none', label: 'No note' },
    { mode: 'note', label: 'Explaining note' },
    { mode: 'custom', label: 'Custom note' },
];

const THEMES: Array<{ theme: ThemeSetting; label: string }> = [
    { theme: 'system', label: 'System' },
    { theme: 'light', label: 'Light' },
    { theme: 'dark', label: 'Dark' },
];

const HELP = {
    mask: 'Kinds of personal data replaced with placeholders before your prompt is sent. Unchecked kinds are sent as they are.',
    detection:
        'Rules find fixed formats like emails, phone numbers and IBANs. The local AI model also finds names, addresses and other context. Both run only on this device.',
    note: 'Text added before your masked prompt, telling the AI to keep the placeholders exactly as they are, so they can be swapped back in its answer.',
    theme: 'Light or dark look of the side panel.',
    session:
        'Masked values stay in memory only, so placeholders in AI answers can be swapped back. They are deleted when the browser closes or when you click Forget now.',
};

// a settings heading with a question mark that explains the setting on hover or keyboard focus
const SectionTitle = ({ help, children }: { help: string; children: string }) =>
{
    return (
        <h2 className="section-title">
            {children}
            <button type="button" className="help-button" aria-label={`About ${children}`} data-tooltip={help} data-tooltip-help="">
                <QuestionIcon size={16} />
            </button>
        </h2>
    );
};

type SettingsScreenProps = {
    settings: ExtensionSettings;
    sessionSize: number;
    onChange: (settings: ExtensionSettings) => void;
    onForget: () => void;
};

export const SettingsScreen = ({ settings, sessionSize, onChange, onForget }: SettingsScreenProps) =>
{
    const change = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => onChange({ ...settings, [key]: value });
    // notes whose text is shown, opened only by their arrow
    const [expanded, setExpanded] = useState<ReadonlySet<PromptHeaderMode>>(() => new Set());
    const toggle = (mode: PromptHeaderMode) =>
    {
        const next = new Set(expanded);

        if (!next.delete(mode))
        {
            next.add(mode);
        }

        setExpanded(next);
    };

    return (
        <main className="screen settings">
            <section>
                <SectionTitle help={HELP.mask}>What to mask</SectionTitle>
                <div className="list">
                    {CATEGORIES.map((category) => (
                        <label key={category} className="list-item">
                            <input
                                type="checkbox"
                                checked={settings.enabledCategories[category]}
                                onChange={(event) => change('enabledCategories', { ...settings.enabledCategories, [category]: event.target.checked })}
                            />
                            <span className="category-name">
                                <CategoryIcon category={category} size={16} />
                                {CATEGORY_INFO[category].label}
                            </span>
                            <span className="small muted">{CATEGORY_INFO[category].description}</span>
                        </label>
                    ))}
                </div>
            </section>
            <section>
                <SectionTitle help={HELP.detection}>Detection model</SectionTitle>
                <div className="list">
                    <label className="list-item list-item-top">
                        <input
                            type="checkbox"
                            checked={settings.localModelDetectionEnabled}
                            onChange={(event) => change('localModelDetectionEnabled', event.target.checked)}
                        />
                        <span>
                            <span className="block">Use the local AI model</span>
                            <span className="small muted">
                                Finds names, addresses and other context. Downloads about 330 MB once from Hugging Face, then runs on this device. Rules always run.
                            </span>
                        </span>
                    </label>
                </div>
            </section>
            <section>
                <SectionTitle help={HELP.note}>Note for the AI</SectionTitle>
                <div className="list">
                    {HEADER_MODES.map(({ mode, label }) =>
                    {
                        const open = mode !== 'none' && expanded.has(mode);

                        return (
                            <div key={mode} className="note-option">
                                <label className="list-item">
                                    <input
                                        type="radio"
                                        name="prompt-header"
                                        checked={settings.promptHeaderMode === mode}
                                        onChange={() => change('promptHeaderMode', mode)}
                                    />
                                    <span className="grow">{label}</span>
                                    {mode === 'none' ? null : (
                                        <IconButton
                                            className="note-toggle"
                                            icon={open ? ChevronUpIcon : ChevronDownIcon}
                                            label={open ? 'Hide note' : 'Show note'}
                                            aria-expanded={open}
                                            onClick={() => toggle(mode)}
                                        />
                                    )}
                                </label>
                                {open && mode === 'note' ? (
                                    <textarea className="input note-text" aria-label="Explaining note" value={PROMPT_HEADER} readOnly />
                                ) : null}
                                {open && mode === 'custom' ? (
                                    <textarea
                                        className="input note-text"
                                        aria-label="Custom note"
                                        placeholder="Write your own note for the AI…"
                                        value={settings.customPromptHeader}
                                        onChange={(event) => change('customPromptHeader', event.target.value)}
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </section>
            <section>
                <SectionTitle help={HELP.theme}>Color theme</SectionTitle>
                <Select aria-label="Color theme" value={settings.theme} onChange={(event) => change('theme', event.target.value as ThemeSetting)}>
                    {THEMES.map(({ theme, label }) => (
                        <option key={theme} value={theme}>
                            {label}
                        </option>
                    ))}
                </Select>
            </section>
            <section>
                <SectionTitle help={HELP.session}>This browser session</SectionTitle>
                <div className="list list-row">
                    <span className="small muted grow">
                        {sessionSize === 0
                            ? 'No masked values kept.'
                            : `${sessionSize} masked ${sessionSize === 1 ? 'value is' : 'values are'} kept in memory to restore answers, until the browser closes.`}
                    </span>
                    <Button small disabled={sessionSize === 0} onClick={onForget}>
                        Forget now
                    </Button>
                </div>
            </section>
        </main>
    );
};
