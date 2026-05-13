import {
    Activity,
    ChevronDown,
} from 'lucide-react';
import type {
    PrivacyBenchmark,
    PrivacyBenchmarkStageTiming,
} from '../../source/privacy';
import { getBenchmarkStageColorStyle } from './theme';

type DiagnosticsPanelProps = {
    benchmark: PrivacyBenchmark | null;
    isExpanded: boolean;
    onToggle: () => void;
};

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
        stage.itemCount == null
            ? ''
            : `\n${stage.itemCount} item${stage.itemCount === 1 ? '' : 's'}`;

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

const renderDiagnosticsContent = (benchmark: PrivacyBenchmark | null) =>
{
    if (benchmark == null)
    {
        return (
            <p className="benchmark-empty">
                Run a scan to record pipeline timing.
            </p>
        );
    }

    return (
        <div className="benchmark-panel">
            <div className="benchmark-summary">
                <span>{getBenchmarkModeLabel(benchmark)}</span>
                <span>{benchmark.inputCharacters.toLocaleString()} chars</span>
                <span>{benchmark.itemCount.toLocaleString()} items</span>
                <span>{benchmark.hardeningItemCount.toLocaleString()} hardened</span>
            </div>

            <div
                className="benchmark-bar"
                role="img"
                aria-label={`Pipeline timing, ${formatBenchmarkDuration(
                    benchmark.totalDurationMs,
                )} total.`}
            >
                {benchmark.stages.map((stage) =>
                    renderBenchmarkBarSegment(benchmark, stage),
                )}
            </div>

            <div className="benchmark-table">
                <div className="benchmark-row benchmark-row-header">
                    <span>Stage</span>
                    <span>Time</span>
                    <span>Share</span>
                    <span>Items</span>
                </div>
                {benchmark.stages.map((stage) => renderBenchmarkRow(benchmark, stage))}
            </div>
        </div>
    );
};

export const DiagnosticsPanel = ({
    benchmark,
    isExpanded,
    onToggle,
}: DiagnosticsPanelProps) =>
{
    const benchmarkSummary =
        benchmark == null
            ? 'No run yet'
            : `Last run: ${formatBenchmarkDuration(benchmark.totalDurationMs)}`;

    return (
        <div className="diagnostics-panel">
            <button
                className="diagnostics-toggle"
                type="button"
                aria-expanded={isExpanded}
                aria-controls="diagnostics-content"
                onClick={onToggle}
            >
                <span className="diagnostics-title">
                    <Activity size={15} aria-hidden="true" />
                    Diagnostics
                </span>
                <span className="diagnostics-summary">
                    {benchmarkSummary}
                </span>
                <ChevronDown
                    className="diagnostics-chevron"
                    size={16}
                    aria-hidden="true"
                />
            </button>

            {isExpanded ? (
                <div id="diagnostics-content" className="diagnostics-content">
                    {renderDiagnosticsContent(benchmark)}
                </div>
            ) : null}
        </div>
    );
};
