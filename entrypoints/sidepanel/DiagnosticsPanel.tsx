import {
    Activity,
    ChevronDown,
} from 'lucide-react';
import type {
    PrivacyBenchmark,
    PrivacyBenchmarkStage,
} from '../../source/privacy';
import { getBenchmarkStageColorStyle } from './theme';

type DiagnosticsPanelProps = {
    benchmark: PrivacyBenchmark | null;
    isExpanded: boolean;
    onToggle: () => void;
};

const MIN_BENCHMARK_SEGMENT_PERCENT = 1.5;

type BenchmarkPhaseId =
    | 'itemDetection'
    | 'safetyCheck'
    | 'outputGeneration';

type BenchmarkPhaseSummary = {
    id: BenchmarkPhaseId;
    label: string;
    description: string;
    stages: PrivacyBenchmarkStage[];
    representativeStage: PrivacyBenchmarkStage;
};

type BenchmarkPhaseTiming = BenchmarkPhaseSummary & {
    durationMs: number;
};

const BENCHMARK_PHASES: BenchmarkPhaseSummary[] = [
    {
        id: 'itemDetection',
        label: 'Item detection',
        description:
            'Initial scan of the input. This combines enabled rule-based detectors and the local model when it is enabled.',
        stages: ['rulesDetection', 'modelDetection'],
        representativeStage: 'modelDetection',
    },
    {
        id: 'safetyCheck',
        label: 'Safety check',
        description:
            'Follow-up scan after the first preview is built. This looks for sensitive items that may still be visible in the output.',
        stages: ['rulesHardening', 'modelHardening'],
        representativeStage: 'modelHardening',
    },
    {
        id: 'outputGeneration',
        label: 'Mask output',
        description:
            'Builds the final masked output. This resolves overlaps, assigns stable placeholders, and prepares the preview.',
        stages: ['resultAssembly', 'finalization'],
        representativeStage: 'resultAssembly',
    },
];

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

const getBenchmarkDurationShare = (durationMs: number, benchmark: PrivacyBenchmark) =>
{
    if (benchmark.totalDurationMs <= 0)
    {
        return 0;
    }

    return Math.max(0, (durationMs / benchmark.totalDurationMs) * 100);
};

const getBenchmarkModeLabel = (benchmark: PrivacyBenchmark) =>
{
    if (benchmark.localModelEnabled)
    {
        return benchmark.rulesEnabled ? 'Rules + local model' : 'Local model only';
    }

    return benchmark.rulesEnabled ? 'Rules only' : 'Detection disabled';
};

const getBenchmarkPhaseTimings = (benchmark: PrivacyBenchmark) =>
{
    return BENCHMARK_PHASES.map((phase): BenchmarkPhaseTiming =>
    {
        const stageTimings = benchmark.stages.filter((stage) =>
        {
            return phase.stages.includes(stage.stage);
        });
        const durationMs = stageTimings.reduce((duration, stage) =>
        {
            return duration + stage.durationMs;
        }, 0);

        return {
            ...phase,
            durationMs,
        };
    });
};

const getBenchmarkPhaseTitle = (
    phase: BenchmarkPhaseTiming,
) =>
{
    return phase.description.replace(/\. /g, '.\n');
};

const getBenchmarkSummaryRows = (benchmark: PrivacyBenchmark) =>
{
    return [
        {
            label: 'Detection mode',
            value: getBenchmarkModeLabel(benchmark),
            title: 'Which detectors ran during the last scan.',
        },
        {
            label: 'Input size',
            value: `${benchmark.inputCharacters.toLocaleString()} chars`,
            title: 'Number of characters processed from the original prompt.',
        },
        {
            label: 'Masked items',
            value: benchmark.itemCount.toLocaleString(),
            title:
                'Number of distinct masked items in the final output after overlaps and follow-up checks.',
        },
    ];
};

const renderBenchmarkBarSegment = (
    benchmark: PrivacyBenchmark,
    phase: BenchmarkPhaseTiming,
) =>
{
    const share = getBenchmarkDurationShare(phase.durationMs, benchmark);

    if (phase.durationMs <= 0)
    {
        return null;
    }

    return (
        <span
            key={phase.id}
            className="benchmark-segment"
            style={{
                ...getBenchmarkStageColorStyle(phase.representativeStage),
                flexBasis: `${Math.max(share, MIN_BENCHMARK_SEGMENT_PERCENT)}%`,
            }}
            title={getBenchmarkPhaseTitle(phase)}
            aria-label={getBenchmarkPhaseTitle(phase)}
        />
    );
};

const renderBenchmarkRow = (
    benchmark: PrivacyBenchmark,
    phase: BenchmarkPhaseTiming,
) =>
{
    const share = getBenchmarkDurationShare(phase.durationMs, benchmark);
    const title = getBenchmarkPhaseTitle(phase);

    return (
        <div key={phase.id} className="benchmark-row" title={title}>
            <span className="benchmark-stage" aria-label={phase.description}>
                <span
                    className="benchmark-dot"
                    style={getBenchmarkStageColorStyle(phase.representativeStage)}
                    aria-hidden="true"
                />
                {phase.label}
            </span>
            <span>{formatBenchmarkDuration(phase.durationMs)}</span>
            <span>{formatBenchmarkShare(share)}</span>
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

    const phases = getBenchmarkPhaseTimings(benchmark);

    return (
        <div className="benchmark-panel">
            <div className="benchmark-summary">
                {getBenchmarkSummaryRows(benchmark).map((row) => (
                    <span
                        key={row.label}
                        className="benchmark-summary-row"
                        title={row.title}
                    >
                        <span className="benchmark-summary-label">
                            {row.label}
                        </span>
                        <span className="benchmark-summary-value">
                            {row.value}
                        </span>
                    </span>
                ))}
            </div>

            <div
                className="benchmark-bar"
                role="img"
                aria-label={`Pipeline timing, ${formatBenchmarkDuration(
                    benchmark.totalDurationMs,
                )} total.`}
            >
                {phases.map((phase) =>
                    renderBenchmarkBarSegment(benchmark, phase),
                )}
            </div>

            <div className="benchmark-table">
                <div className="benchmark-row benchmark-row-header">
                    <span>Phase</span>
                    <span>Time</span>
                    <span>Share</span>
                </div>
                {phases.map((phase) => renderBenchmarkRow(benchmark, phase))}
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
