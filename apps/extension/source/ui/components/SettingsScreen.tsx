import { CATEGORIES } from '@secureprompt/core';
import type { ExtensionSettings, PromptHeaderMode, ThemeSetting } from '../../settings/types';
import { CATEGORY_INFO, categoryClass } from '../categories';
import { Button } from './Button';
import { Select } from './Select';

const HEADER_MODES: Array<{ mode: PromptHeaderMode; label: string }> = [
    { mode: 'basic', label: 'Short note' },
    { mode: 'detailed', label: 'Detailed note' },
    { mode: 'custom', label: 'My own note' },
    { mode: 'none', label: 'No note' },
];

const THEMES: Array<{ theme: ThemeSetting; label: string }> = [
    { theme: 'system', label: 'Same as system' },
    { theme: 'light', label: 'Light' },
    { theme: 'dark', label: 'Dark' },
];

type SettingsScreenProps = {
    settings: ExtensionSettings;
    sessionSize: number;
    onChange: (settings: ExtensionSettings) => void;
    onForget: () => void;
};

export const SettingsScreen = ({ settings, sessionSize, onChange, onForget }: SettingsScreenProps) =>
{
    const change = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => onChange({ ...settings, [key]: value });

    return (
        <main className="screen settings">
            <section>
                <h2 className="section-title">What to mask</h2>
                <div className="list">
                    {CATEGORIES.map((category) => (
                        <label key={category} className="list-item">
                            <input
                                type="checkbox"
                                checked={settings.enabledCategories[category]}
                                onChange={(event) => change('enabledCategories', { ...settings.enabledCategories, [category]: event.target.checked })}
                            />
                            <span className={`label label-fixed ${categoryClass(category)}`}>{CATEGORY_INFO[category].label}</span>
                            <span className="small muted">{CATEGORY_INFO[category].description}</span>
                        </label>
                    ))}
                </div>
                <p className="small muted">Titles like "Herr" and vague times like "morgen" always stay readable.</p>
            </section>
            <section>
                <h2 className="section-title">Detection</h2>
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
                <h2 className="section-title">Note for the AI</h2>
                <p className="small muted">Added before your prompt, so the AI keeps the placeholders intact.</p>
                <div className="list">
                    {HEADER_MODES.map(({ mode, label }) => (
                        <label key={mode} className="list-item">
                            <input
                                type="radio"
                                name="prompt-header"
                                checked={settings.promptHeaderMode === mode}
                                onChange={() => change('promptHeaderMode', mode)}
                            />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
                {settings.promptHeaderMode === 'custom' ? (
                    <textarea
                        className="input custom-header"
                        aria-label="Your note for the AI"
                        value={settings.customPromptHeader}
                        onChange={(event) => change('customPromptHeader', event.target.value)}
                    />
                ) : null}
            </section>
            <section>
                <h2 className="section-title">Theme</h2>
                <Select aria-label="Theme" value={settings.theme} onChange={(event) => change('theme', event.target.value as ThemeSetting)}>
                    {THEMES.map(({ theme, label }) => (
                        <option key={theme} value={theme}>
                            {label}
                        </option>
                    ))}
                </Select>
            </section>
            <section>
                <h2 className="section-title">This browser session</h2>
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
