import type { MaskSession } from '../session';
import { trimSpan } from '../spans';
import {
    CATEGORIES,
    PipelineCancelledError,
    type CancelSignal,
    type Category,
    type Detection,
    type Detector,
    type PipelineResult,
} from '../types';
import { mergeDetections } from './merge';
import { propagateMentions } from './propagate';
import { excludeProtected, findProtectedRanges, findReservedPlaceholders } from './protect';
import { assignPlaceholders, maskedToSource, renderMaskedText } from './render';
import { resolveOverlaps } from './resolve';

export type PipelineStage =
    | 'detect' // all detectors on the input
    | 'prepare' // protect, merge, resolve overlaps, propagate
    | 'residualDetect' // all detectors again, on the masked text
    | 'residualMap' // trial rendering and mapping residual finds back
    | 'render'; // placeholders and masked text

export type PipelineTiming = {
    // injected so core needs no platform API: performance.now in browsers and Node
    now: () => number;
    // called once per stage run, residual stages may run several times
    record: (stage: PipelineStage, milliseconds: number) => void;
};

// progress of a detection pass: the mean of its detectors' progress, 0 to 1
export type PipelineProgress = {
    stage: 'detect' | 'residualDetect';
    fraction: number;
};

export type PipelineOptions = {
    detectors: readonly Detector[];
    session: MaskSession;
    enabledCategories?: ReadonlySet<Category>;
    // user selections in the preview, which always win overlaps
    manualDetections?: readonly Detection[];
    // times to rescan the masked text for values the first pass missed (0 disables)
    residualPasses?: number;
    timing?: PipelineTiming;
    // aborting rejects the run with PipelineCancelledError at the next stage boundary
    signal?: CancelSignal;
    onProgress?: (progress: PipelineProgress) => void;
};

const ALL_CATEGORIES: ReadonlySet<Category> = new Set(CATEGORIES);

// a detection ending inside a number extends to its end, so no digit follows a placeholder
const extendOverGluedDigits = (text: string, detections: readonly Detection[]): Detection[] =>
{
    return detections.map((detection) =>
    {
        let end = detection.end;

        while (end < text.length && /\d/.test(text[end]!))
        {
            end += 1;
        }

        return end === detection.end ? detection : { ...detection, end };
    });
};

// the steps after detection, shared by runPipeline and maskDetections
const createMasking = (text: string, session: MaskSession, enabledCategories: ReadonlySet<Category>) =>
{
    const reserved = findReservedPlaceholders(text);
    const protectedRanges = findProtectedRanges(text, session);

    // protect, extend over glued digits, resolve overlaps, propagate to other mentions
    const prepare = (detections: readonly Detection[]) =>
    {
        const kept = extendOverGluedDigits(text, excludeProtected(text, detections, protectedRanges));

        return propagateMentions(text, resolveOverlaps(kept), protectedRanges);
    };

    const merge = (found: ReadonlyArray<readonly Detection[]>) => mergeDetections(text, found, enabledCategories);

    const render = (detections: readonly Detection[], failedDetectors: readonly string[]): PipelineResult =>
    {
        const spans = assignPlaceholders(text, detections, session, reserved);

        return { ...renderMaskedText(text, spans), spans, failedDetectors: [...failedDetectors] };
    };

    return { reserved, prepare, merge, render };
};

export type MaskOptions = Pick<PipelineOptions, 'session' | 'enabledCategories' | 'manualDetections'>;

// masks detections that are already known, such as an earlier result with a manual selection added
export const maskDetections = (text: string, detections: readonly Detection[], options: MaskOptions): PipelineResult =>
{
    const masking = createMasking(text, options.session, options.enabledCategories ?? ALL_CATEGORIES);

    return masking.render(masking.prepare(masking.merge([detections, options.manualDetections ?? []])), []);
};

export const runPipeline = async (text: string, options: PipelineOptions): Promise<PipelineResult> =>
{
    const { detectors, session, timing, signal, onProgress } = options;
    const enabledCategories = options.enabledCategories ?? ALL_CATEGORIES;
    const residualPasses = options.residualPasses ?? 1;
    const failedDetectors = new Set<string>();

    const checkCancelled = () =>
    {
        if (signal?.aborted === true)
        {
            throw new PipelineCancelledError();
        }
    };

    checkCancelled();

    const masking = createMasking(text, session, enabledCategories);

    const timed = async <T>(stage: PipelineStage, run: () => T | Promise<T>): Promise<T> =>
    {
        if (timing == null)
        {
            return run();
        }

        const startedAt = timing.now();
        const result = await run();

        timing.record(stage, timing.now() - startedAt);
        return result;
    };

    const detectAll = async (input: string, stage: PipelineProgress['stage']) =>
    {
        // per detector, never moving backwards
        const fractions = detectors.map(() => 0);

        const report = (index: number, fraction: number) =>
        {
            fractions[index] = Math.max(fractions[index]!, Math.min(1, fraction));

            if (onProgress != null)
            {
                onProgress({ stage, fraction: fractions.reduce((sum, value) => sum + value, 0) / fractions.length });
            }
        };

        const found = await Promise.all(
            detectors.map(async (detector, index) =>
            {
                try
                {
                    return await detector.detect(input, {
                        ...(signal == null ? {} : { signal }),
                        onProgress: (fraction) => report(index, fraction),
                    });
                }
                catch
                {
                    // continue with the others, never logging the error since it may quote text
                    failedDetectors.add(detector.id);
                    return [];
                }
                finally
                {
                    report(index, 1);
                }
            }),
        );

        // a detector stopped by the signal may return partial results, so they're never used
        checkCancelled();

        return found;
    };

    const found = await timed('detect', () => detectAll(text, 'detect'));
    let detections = await timed('prepare', () => masking.prepare(masking.merge([...found, options.manualDetections ?? []])));

    for (let pass = 0; pass < residualPasses && detections.length > 0; pass += 1)
    {
        // a trial rendering on a copy of the session, so unused placeholders aren't registered
        const trialSession = session.fork();
        const trial = await timed('residualMap', () =>
        {
            return renderMaskedText(text, assignPlaceholders(text, detections, trialSession, masking.reserved));
        });
        const residualFound = await timed('residualDetect', () => detectAll(trial.maskedText, 'residualDetect'));
        const additions = await timed('residualMap', () =>
        {
            const maskedProtected = findProtectedRanges(trial.maskedText, trialSession);
            const residual = excludeProtected(
                trial.maskedText,
                mergeDetections(trial.maskedText, residualFound, enabledCategories),
                maskedProtected,
            )
                .flatMap((detection) => maskedToSource(detection, trial.segments))
                .map((detection) => trimSpan(text, detection))
                .filter((detection) => detection.end > detection.start);

            return residual.filter((candidate) =>
            {
                return !detections.some((detection) => detection.start <= candidate.start && candidate.end <= detection.end);
            });
        });

        if (additions.length === 0)
        {
            break;
        }

        const current = detections;

        detections = await timed('prepare', () => masking.prepare([...current, ...additions]));
    }

    return timed('render', () => masking.render(detections, [...failedDetectors]));
};
