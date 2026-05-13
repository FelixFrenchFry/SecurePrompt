import {
    Activity,
    ArrowLeft,
    Check,
    Cpu,
    Moon,
    ShieldCheck,
} from 'lucide-react';
import type {
    PrivacyBenchmark,
    PrivacyBenchmarkStageTiming,
} from '../../source/privacy';
import {
    getPromptHeaderText,
    type ExtensionSettings,
    type PromptHeaderMode,
} from '../../source/settings/types';
import { getBenchmarkStageColorStyle } from './theme';

type SettingsPageProps = {
    settings: ExtensionSettings;
    isSaving: boolean;
    status: string;
    latestBenchmark: PrivacyBenchmark | null;
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
                label: 'Local model test',
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

const MIN_BENCHMARK_SEGMENT_PERCENT = 1.5;

const formatBenchmarkDuration = (durationMs: number) =>
{
    return `${(durationMs / 1000).toFixed(3)} s`;
};

const formatBenchmarkShare = (share: number) =>
{
    if (share > 0 && share < 1)
    {
        return '<1%';
    }

    return `${share.toFixed(0)}%`;
};

const getBenchmarkStageShare = (
    stage: PrivacyBenchmarkStageTiming,
    benchmark: PrivacyBenchmark,
) =>
{
    if (benchmark.totalDurationMs <= 0)
    {
        return 0;
    }

    return Math.max(0, (stage.durationMs / benchmark.totalDurationMs) * 100);
};

const getBenchmarkModeLabel = (benchmark: PrivacyBenchmark) =>
{
    if (benchmark.localModelEnabled)
    {
        return benchmark.rulesEnabled ? 'Rules + local model' : 'Local model only';
    }

    return benchmark.rulesEnabled ? 'Rules only' : 'Detection disabled';
};

const getBenchmarkStageTitle = (
    stage: PrivacyBenchmarkStageTiming,
    benchmark: PrivacyBenchmark,
) =>
{
    const share = getBenchmarkStageShare(stage, benchmark);
    const itemCount =
        stage.itemCount == null ? '' : `\n${stage.itemCount} item${stage.itemCount === 1 ? '' : 's'}`;

    return `${stage.label}\n${formatBenchmarkDuration(stage.durationMs)}\n${formatBenchmarkShare(share)} of total${itemCount}`;
};

const renderBenchmarkBarSegment = (
    benchmark: PrivacyBenchmark,
    stage: PrivacyBenchmarkStageTiming,
) =>
{
    const share = getBenchmarkStageShare(stage, benchmark);

    if (stage.durationMs <= 0)
    {
        return null;
    }

    return (
        <span
            key={stage.stage}
            className="benchmark-segment"
            style={{
                ...getBenchmarkStageColorStyle(stage.stage),
                flexBasis: `${Math.max(share, MIN_BENCHMARK_SEGMENT_PERCENT)}%`,
            }}
            title={getBenchmarkStageTitle(stage, benchmark)}
            aria-label={getBenchmarkStageTitle(stage, benchmark)}
        />
    );
};

const renderBenchmarkRow = (
    benchmark: PrivacyBenchmark,
    stage: PrivacyBenchmarkStageTiming,
) =>
{
    const share = getBenchmarkStageShare(stage, benchmark);

    return (
        <div key={stage.stage} className="benchmark-row">
            <span className="benchmark-stage">
                <span
                    className="benchmark-dot"
                    style={getBenchmarkStageColorStyle(stage.stage)}
                    aria-hidden="true"
                />
                {stage.label}
            </span>
            <span>{formatBenchmarkDuration(stage.durationMs)}</span>
            <span>{formatBenchmarkShare(share)}</span>
            <span>{stage.itemCount == null ? '-' : stage.itemCount}</span>
        </div>
    );
};

export const SettingsPage = ({
    settings,
    isSaving,
    status,
    latestBenchmark,
    onBack,
    onChange,
}: SettingsPageProps) =>
{
    const promptHeaderText = getPromptHeaderText(settings);
    const isCustomPromptHeader = settings.promptHeaderMode === 'custom';
    const promptHeaderPreviewText = isCustomPromptHeader
        ? settings.customPromptHeader
        : promptHeaderText;
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

            <section className="panel settings-panel">
                <div className="section-header">
                    <h2 className="label-with-icon">
                        <Activity size={17} aria-hidden="true" />
                        Diagnostics
                    </h2>
                    {latestBenchmark == null ? null : (
                        <span className="scan-detail-count">
                            {formatBenchmarkDuration(latestBenchmark.totalDurationMs)}
                        </span>
                    )}
                </div>

                {latestBenchmark == null ? (
                    <p className="benchmark-empty">
                        Run a scan to record pipeline timing.
                    </p>
                ) : (
                    <div className="benchmark-panel">
                        <div className="benchmark-summary">
                            <span>{getBenchmarkModeLabel(latestBenchmark)}</span>
                            <span>
                                {latestBenchmark.inputCharacters.toLocaleString()} chars
                            </span>
                            <span>
                                {latestBenchmark.itemCount.toLocaleString()} items
                            </span>
                            <span>
                                {latestBenchmark.hardeningItemCount.toLocaleString()} hardened
                            </span>
                        </div>

                        <div
                            className="benchmark-bar"
                            role="img"
                            aria-label={`Pipeline timing, ${formatBenchmarkDuration(
                                latestBenchmark.totalDurationMs,
                            )} total.`}
                        >
                            {latestBenchmark.stages.map((stage) =>
                                renderBenchmarkBarSegment(latestBenchmark, stage),
                            )}
                        </div>

                        <div className="benchmark-table">
                            <div className="benchmark-row benchmark-row-header">
                                <span>Stage</span>
                                <span>Time</span>
                                <span>Share</span>
                                <span>Items</span>
                            </div>
                            {latestBenchmark.stages.map((stage) =>
                                renderBenchmarkRow(latestBenchmark, stage),
                            )}
                        </div>
                    </div>
                )}
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
