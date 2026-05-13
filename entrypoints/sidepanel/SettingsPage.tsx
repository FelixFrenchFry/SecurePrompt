import {
    ArrowLeft,
    Check,
    Cpu,
    Moon,
    ShieldCheck,
} from 'lucide-react';
import type { SensitiveItemCategory } from '../../source/privacy';
import {
    getPromptHeaderText,
    isSensitiveItemCategoryEnabled,
    type ExtensionSettings,
    type PromptHeaderMode,
} from '../../source/settings/types';
import { PRIVACY_SCAN_CATEGORIES } from './privacy-categories';
import { getCategoryColorStyle } from './theme';

type SettingsPageProps = {
    settings: ExtensionSettings;
    isSaving: boolean;
    status: string;
    onBack: () => void;
    onChange: <K extends keyof ExtensionSettings>(
        key: K,
        value: ExtensionSettings[K],
    ) => void;
};

type BooleanSettingKey =
    | 'darkModeEnabled'
    | 'rulesDetectionEnabled'
    | 'localModelDetectionEnabled';

type SettingsRow = {
    key: BooleanSettingKey;
    label: string;
    Icon: typeof ShieldCheck;
};

type SettingsGroup = {
    title: string;
    rows: SettingsRow[];
};

const SETTINGS_GROUPS: SettingsGroup[] = [
    {
        title: 'Appearance',
        rows: [
            {
                key: 'darkModeEnabled',
                label: 'Dark mode',
                Icon: Moon,
            },
        ],
    },
    {
        title: 'Detection',
        rows: [
            {
                key: 'rulesDetectionEnabled',
                label: 'Rules detection',
                Icon: ShieldCheck,
            },
            {
                key: 'localModelDetectionEnabled',
                label: 'Local model detection',
                Icon: Cpu,
            },
        ],
    },
];

const PROMPT_HEADER_OPTIONS: Array<{
    mode: PromptHeaderMode;
    label: string;
}> = [
    {
        mode: 'none',
        label: 'None',
    },
    {
        mode: 'basic',
        label: 'Basic',
    },
    {
        mode: 'detailed',
        label: 'Detailed',
    },
    {
        mode: 'custom',
        label: 'Custom',
    },
];

export const SettingsPage = ({
    settings,
    isSaving,
    status,
    onBack,
    onChange,
}: SettingsPageProps) =>
{
    const promptHeaderText = getPromptHeaderText(settings);
    const isCustomPromptHeader = settings.promptHeaderMode === 'custom';
    const promptHeaderPreviewText = isCustomPromptHeader
        ? settings.customPromptHeader
        : promptHeaderText;
    const enabledCategoryCount = PRIVACY_SCAN_CATEGORIES.filter(({ category }) =>
    {
        return isSensitiveItemCategoryEnabled(settings.enabledCategories, category);
    }).length;
    const toggleDetectionCategory = (category: SensitiveItemCategory) =>
    {
        onChange('enabledCategories', {
            ...settings.enabledCategories,
            [category]: !isSensitiveItemCategoryEnabled(
                settings.enabledCategories,
                category,
            ),
        });
    };
    const renderSettingsRow = ({ key, label, Icon }: SettingsRow) =>
    {
        const isEnabled = settings[key];

        return (
            <div key={key} className="settings-row">
                <span className="settings-row-label">
                    <Icon size={17} aria-hidden="true" />
                    {label}
                </span>
                <button
                    className={`settings-toggle${isEnabled ? ' is-enabled' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`${label} ${isEnabled ? 'enabled' : 'disabled'}`}
                    onClick={() => onChange(key, !isEnabled)}
                >
                    <span className="settings-toggle-thumb" />
                </button>
            </div>
        );
    };
    const renderDetectionCategory = ({
        category,
        label,
        description,
        Icon,
    }: (typeof PRIVACY_SCAN_CATEGORIES)[number]) =>
    {
        const isEnabled = isSensitiveItemCategoryEnabled(
            settings.enabledCategories,
            category,
        );

        return (
            <div
                key={category}
                className={`category-setting-row${isEnabled ? ' is-enabled' : ''}`}
                style={getCategoryColorStyle(category)}
            >
                <div className="category-setting-main">
                    <span className="category-setting-label">
                        <Icon size={17} aria-hidden="true" />
                        {label}
                    </span>
                    <p>{description}</p>
                </div>
                <button
                    className={`settings-toggle${isEnabled ? ' is-enabled' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`${label} detection ${isEnabled ? 'enabled' : 'disabled'}`}
                    onClick={() => toggleDetectionCategory(category)}
                >
                    <span className="settings-toggle-thumb" />
                </button>
            </div>
        );
    };

    return (
        <main
            className={`app-shell settings-shell${
                settings.darkModeEnabled ? ' is-dark' : ''
            }`}
        >
            <header className="app-header">
                <button
                    className="icon-button"
                    type="button"
                    title="Back"
                    aria-label="Back"
                    onClick={onBack}
                >
                    <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <div className="brand-lockup">
                    <h1>Settings</h1>
                </div>
                <span className="status-pill">
                    <Check size={12} aria-hidden="true" />
                    {isSaving ? 'Saving' : 'Saved'}
                </span>
            </header>

            {SETTINGS_GROUPS.map((group) => (
                <section key={group.title} className="panel settings-panel">
                    <div className="section-header">
                        <h2>{group.title}</h2>
                    </div>
                    <div className="settings-list">
                        {group.rows.map(renderSettingsRow)}
                    </div>
                </section>
            ))}

            <section className="panel settings-panel">
                <div className="section-header">
                    <h2>Detection categories</h2>
                    <span className="scan-detail-count">
                        {enabledCategoryCount}/{PRIVACY_SCAN_CATEGORIES.length} active
                    </span>
                </div>
                <p className="settings-help">
                    Disabled categories are not detected, masked, shown in the scan
                    grid, or offered for manual masking in future scans.
                </p>
                <div className="category-settings-list">
                    {PRIVACY_SCAN_CATEGORIES.map(renderDetectionCategory)}
                </div>
            </section>

            <section className="panel settings-panel">
                <div className="section-header">
                    <h2>Prompt header</h2>
                </div>
                <div
                    className="prompt-header-options"
                    role="radiogroup"
                    aria-label="Prompt header"
                >
                    {PROMPT_HEADER_OPTIONS.map(({ mode, label }) =>
                    {
                        const isActive = settings.promptHeaderMode === mode;

                        return (
                            <button
                                key={mode}
                                className={`prompt-header-option${
                                    isActive ? ' is-active' : ''
                                }`}
                                type="button"
                                role="radio"
                                aria-checked={isActive}
                                onClick={() => onChange('promptHeaderMode', mode)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <textarea
                    className="prompt-header-preview"
                    value={promptHeaderPreviewText}
                    placeholder="No prompt header will be added."
                    readOnly={!isCustomPromptHeader}
                    aria-label={
                        isCustomPromptHeader
                            ? 'Custom prompt header'
                            : 'Selected prompt header preview'
                    }
                    onChange={(event) =>
                    {
                        onChange('customPromptHeader', event.target.value);
                    }}
                />
            </section>

            {status.length > 0 ? (
                <p className="status-message" role="status">
                    {status}
                </p>
            ) : null}

            <footer className="footer">Stored locally</footer>
        </main>
    );
};
