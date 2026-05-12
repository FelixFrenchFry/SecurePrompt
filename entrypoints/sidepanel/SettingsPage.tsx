import {
    ArrowLeft,
    Check,
    Cpu,
    Moon,
    ShieldCheck,
} from 'lucide-react';
import type { ExtensionSettings } from '../../source/settings/types';

type SettingsPageProps = {
    settings: ExtensionSettings;
    isSaving: boolean;
    status: string;
    onBack: () => void;
    onChange: (key: keyof ExtensionSettings, value: boolean) => void;
};

type SettingsRow = {
    key: keyof ExtensionSettings;
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
                label: 'Local model test',
                Icon: Cpu,
            },
        ],
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

            {status.length > 0 ? (
                <p className="status-message" role="status">
                    {status}
                </p>
            ) : null}

            <footer className="footer">Stored locally</footer>
        </main>
    );
};
