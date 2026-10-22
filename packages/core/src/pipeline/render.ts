import type { MaskSession } from '../session';
import { compareSpans } from '../spans';
import type { Detection, MaskedSpan, Segment } from '../types';

// gives each detection its placeholder (detections must not overlap)
export const assignPlaceholders = (
    text: string,
    detections: readonly Detection[],
    session: MaskSession,
    reserved: ReadonlySet<string>,
): MaskedSpan[] =>
{
    return [...detections].sort(compareSpans).map((detection) =>
    {
        const value = detection.aliasOf ?? text.slice(detection.start, detection.end);

        return { ...detection, placeholder: session.placeholderFor(detection.category, value, reserved) };
    });
};

// replaces each span with its placeholder (spans must be sorted and not overlap)
export const renderMaskedText = (
    text: string,
    spans: readonly MaskedSpan[],
): { maskedText: string; segments: Segment[] } =>
{
    const segments: Segment[] = [];
    let maskedText = '';
    let cursor = 0;

    const pushText = (end: number) =>
    {
        if (end <= cursor)
        {
            return;
        }

        segments.push({
            kind: 'text',
            sourceStart: cursor,
            sourceEnd: end,
            maskedStart: maskedText.length,
            maskedEnd: maskedText.length + end - cursor,
        });
        maskedText += text.slice(cursor, end);
        cursor = end;
    };

    for (const span of spans)
    {
        if (span.start < cursor)
        {
            throw new RangeError('Masked spans must be sorted and must not overlap');
        }

        pushText(span.start);
        segments.push({
            kind: 'mask',
            placeholder: span.placeholder,
            category: span.category,
            sourceStart: span.start,
            sourceEnd: span.end,
            maskedStart: maskedText.length,
            maskedEnd: maskedText.length + span.placeholder.length,
        });
        maskedText += span.placeholder;
        cursor = span.end;
    }

    pushText(text.length);

    return { maskedText, segments };
};

// maps a masked-text range back to source ranges, dropping the parts over placeholders
export const maskedToSource = <T extends Detection>(detection: T, segments: readonly Segment[]): T[] =>
{
    const parts: T[] = [];

    for (const segment of segments)
    {
        if (segment.kind !== 'text' || segment.maskedEnd <= detection.start || segment.maskedStart >= detection.end)
        {
            continue;
        }

        const offset = segment.sourceStart - segment.maskedStart;

        parts.push({
            ...detection,
            start: Math.max(detection.start, segment.maskedStart) + offset,
            end: Math.min(detection.end, segment.maskedEnd) + offset,
        });
    }

    return parts;
};
