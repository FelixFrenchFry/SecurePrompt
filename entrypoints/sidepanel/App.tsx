import {
    type ChangeEvent as ReactChangeEvent,
    type CSSProperties,
    type FocusEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ArrowUpDown,
    Check,
    CircleMinus,
    CirclePlus,
    Copy,
    Cpu,
    Download,
    Eraser,
    Eye,
    FileQuestion,
    FileText,
    Maximize2,
    MoreHorizontal,
    Paperclip,
    RotateCcw,
    ScanSearch,
    Search,
    Send,
    Settings as SettingsIcon,
    ShieldCheck,
    StepForward,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import {
    extractTextFile,
    formatTextFileSize,
    MAX_TEXT_FILE_BYTES,
    SUPPORTED_TEXT_FILE_ACCEPT,
} from '../../source/documents/extract-text-file';
import type { FileTextDocument } from '../../source/documents/types';
import {
    GET_CHAT_TARGET_MESSAGE,
    INJECT_PROMPT_MESSAGE,
    type RuntimeResponse,
} from '../../source/messaging';
import {
    createPrivatizedPromptAsync,
    createPrivatizedPromptPreview,
    createPrivatizedPromptWithManualItem,
    type LocalModelProgress,
    type MaskingMapping,
    type PrivacyBenchmark,
    type PrivacyBenchmarkStageTiming,
    type PrivatizedPromptSegment,
    type PrivatizedPromptResult,
    type SensitiveItemCategory,
} from '../../source/privacy';
import {
    loadExtensionSettings,
    saveExtensionSettings,
} from '../../source/settings/storage';
import {
    DEFAULT_EXTENSION_SETTINGS,
    isSensitiveItemCategoryEnabled,
    prependPromptHeader,
    type ExtensionSettings,
} from '../../source/settings/types';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import {
    PRIVACY_SCAN_CATEGORIES,
    type PrivacyScanCategory,
} from './privacy-categories';
import { PrivacyFootnote } from './PrivacyFootnote';
import { SettingsPage } from './SettingsPage';
import {
    getCategoryColorStyle,
    type CategoryColorStyle,
} from './theme';

const EMPTY_PREVIEW_TEXT = 'No privatized prompt yet.';
const ACTION_FEEDBACK_MS = 1500;
const MAX_VISIBLE_COUNT = 99;
const MAX_TEXT_FILE_CATEGORY_SUMMARIES = 5;
const TEXT_FILE_HELP_ID = 'text-file-help-tooltip';
const SUPPORTED_TEXT_FILE_EXTENSION_LABEL = SUPPORTED_TEXT_FILE_ACCEPT.split(
    ',',
).join(', ');
const PREVIEW_TOOLTIP_MARGIN = 12;
const PREVIEW_TOOLTIP_MAX_WIDTH = 260;
const PREVIEW_TOOLTIP_GAP = 3;
const PREVIEW_TOOLTIP_MIN_ABOVE_SPACE = 80;
const PREVIEW_TOOLTIP_HIDE_DELAY_MS = 220;
const PREVIEW_TOOLTIP_BRIDGE_PADDING = 10;
const PREVIEW_TOOLTIP_BRIDGE_OVERLAP = 2;
const PREVIEW_SELECTION_POPOVER_MAX_WIDTH = 236;
const AI_CHAT_FALLBACK_LABEL = 'AI chat';
const LOCAL_MODEL_FALLBACK_PROGRESS_LABEL = 'Creating rules-only fallback...';
const MODEL_HOST_PERMISSIONS = [
    'https://huggingface.co/*',
    'https://*.huggingface.co/*',
    'https://*.hf.co/*',
    'https://*.xethub.hf.co/*',
];

const LOCAL_MODEL_PROGRESS_INDETERMINATE_PHASES = new Set([
    'permission',
    'runtime',
    'load',
    'postprocess',
]);

type PreviewTooltipRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

type PreviewTooltipBridge = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type PreviewTooltip = {
    target: PreviewTarget;
    text: string;
    mappingId: string;
    mask: string;
    left: number;
    top: number;
    anchorLeft: number;
    arrowLeft: number;
    placement: 'above' | 'below';
    anchorRect: PreviewTooltipRect;
    bridge: PreviewTooltipBridge | null;
};

type PreviewSelectionPopover = {
    target: PreviewTarget;
    text: string;
    start: number;
    end: number;
    left: number;
    top: number;
    anchorLeft: number;
    arrowLeft: number;
    placement: 'above' | 'below';
};

type UnsafeRulesOnlyFallbackOutcome =
    | 'applied'
    | 'disabled'
    | 'failed'
    | 'stale';

type PreviewTooltipEvent =
    | ReactPointerEvent<HTMLElement>
    | FocusEvent<HTMLElement>
    | ReactKeyboardEvent<HTMLElement>;

type ShowPreviewTooltip = (
    target: PreviewTarget,
    event: PreviewTooltipEvent,
    text: string,
    mappingId: string,
    mask: string,
) => void;

type ScanDetailSortDirection = 'neutral' | 'ascending' | 'descending';

type ScanCategoryStaleState = 'added' | 'removed';

type AppView = 'main' | 'promptReader' | 'reader' | 'fileReader' | 'settings';

type WorkspaceTab = 'prompt' | 'privatized';

type FileReaderTab = 'original' | 'privatized';

type PreviewTarget =
    | {
          kind: 'prompt';
      }
    | {
          kind: 'file';
          attachmentId: string;
      };

const PROMPT_PREVIEW_TARGET: PreviewTarget = { kind: 'prompt' };

type TextFileAttachment = {
    document: FileTextDocument;
    result: PrivatizedPromptResult | null;
    ignoredMappingIds: string[];
    error: string | null;
    included: boolean;
};

type TextFileCategorySummary = {
    category: SensitiveItemCategory;
    label: string;
    count: number;
};

type ScanDetailSearchTarget = {
    normalized: string;
    compact: string;
    digits: string;
    terms: string[];
    acronym: string;
};

const formatCount = (count: number) =>
{
    return count > MAX_VISIBLE_COUNT ? `${MAX_VISIBLE_COUNT}+` : String(count);
};

const formatOccurrenceCount = (count: number) =>
{
    return count > MAX_VISIBLE_COUNT ? `${MAX_VISIBLE_COUNT}+` : `${count}x`;
};

const getPrivacyScanCategoryColorStyle = (
    category: SensitiveItemCategory,
    count: number,
): CategoryColorStyle =>
{
    const colorCategory = count === 0 ? 'OTHER' : category;

    return getCategoryColorStyle(colorCategory);
};

const getPrivacyScanCategory = (category: SensitiveItemCategory) =>
{
    return PRIVACY_SCAN_CATEGORIES.find((scanCategory) =>
    {
        return scanCategory.category === category;
    });
};

const getActiveMaskingMappings = (
    maskingMappings: MaskingMapping[],
    ignoredMappingIds: string[],
) =>
{
    const ignoredMappingIdSet = new Set(ignoredMappingIds);

    return maskingMappings.filter((maskingMapping) =>
    {
        return !ignoredMappingIdSet.has(maskingMapping.id);
    });
};

const getMaskingMappingItemCount = (maskingMappings: MaskingMapping[]) =>
{
    return maskingMappings.reduce((count, maskingMapping) =>
    {
        return count + maskingMapping.itemIds.length;
    }, 0);
};

const getMaskingMappingsByCategory = (
    maskingMappings: MaskingMapping[],
    category: SensitiveItemCategory,
) =>
{
    return maskingMappings.filter((maskingMapping) =>
    {
        return maskingMapping.category === category;
    });
};

const compareMaskingMappingsByMask = (
    left: MaskingMapping,
    right: MaskingMapping,
) =>
{
    const numberDifference =
        getMaskNumber(left.mask) - getMaskNumber(right.mask);

    if (numberDifference !== 0)
    {
        return numberDifference;
    }

    return left.mask.localeCompare(right.mask);
};

const getSortedMaskingMappings = (
    maskingMappings: MaskingMapping[],
    sortDirection: ScanDetailSortDirection,
) =>
{
    if (sortDirection === 'neutral')
    {
        return [...maskingMappings].sort(compareMaskingMappingsByMask);
    }

    return [...maskingMappings].sort((left, right) =>
    {
        const countDifference =
            left.itemIds.length - right.itemIds.length;
        const sortedCountDifference =
            sortDirection === 'ascending' ? countDifference : -countDifference;

        return sortedCountDifference || compareMaskingMappingsByMask(left, right);
    });
};

const getSearchFilteredMaskingMappings = (
    maskingMappings: MaskingMapping[],
    searchText: string,
) =>
{
    const searchQuery = createScanDetailSearchTarget(searchText);

    if (searchQuery.normalized.length === 0)
    {
        return maskingMappings;
    }

    return maskingMappings
        .map((maskingMapping, index) =>
        {
            return {
                maskingMapping,
                index,
                rank: getScanDetailSearchRank(maskingMapping.original, searchQuery),
            };
        })
        .filter((searchResult): searchResult is {
            maskingMapping: MaskingMapping;
            index: number;
            rank: number;
        } =>
        {
            return searchResult.rank != null;
        })
        .sort((left, right) =>
        {
            return left.rank - right.rank || left.index - right.index;
        })
        .map((searchResult) =>
        {
            return searchResult.maskingMapping;
        });
};


const getMaskingMappingById = (
    maskingMappings: MaskingMapping[],
    mappingId: string,
) =>
{
    return maskingMappings.find((maskingMapping) =>
    {
        return maskingMapping.id === mappingId;
    });
};

const getScanDetailSearchRank = (
    original: string,
    searchQuery: ScanDetailSearchTarget,
) =>
{
    const originalSearchTarget = createScanDetailSearchTarget(original);

    if (originalSearchTarget.normalized.length === 0)
    {
        return null;
    }

    if (originalSearchTarget.normalized === searchQuery.normalized)
    {
        return 0;
    }

    if (originalSearchTarget.normalized.includes(searchQuery.normalized))
    {
        return 1;
    }

    if (
        searchQuery.compact.length >= 2 &&
        originalSearchTarget.compact.includes(searchQuery.compact)
    )
    {
        return 2;
    }

    if (
        searchQuery.digits.length >= 2 &&
        originalSearchTarget.digits.includes(searchQuery.digits)
    )
    {
        return 3;
    }

    if (
        searchQuery.terms.length > 0 &&
        searchQuery.terms.every((term) =>
        {
            return isScanDetailSearchTermMatch(term, originalSearchTarget);
        })
    )
    {
        return 4;
    }

    return null;
};

const createScanDetailSearchTarget = (text: string): ScanDetailSearchTarget =>
{
    const normalized = normalizeScanDetailSearchText(text);
    const terms = normalized.split(' ').filter((term) =>
    {
        return term.length > 0;
    });

    return {
        normalized,
        compact: normalized.replace(/\s/g, ''),
        digits: normalized.replace(/\D/g, ''),
        terms,
        acronym: terms.map((term) => term[0]).join(''),
    };
};

const normalizeScanDetailSearchText = (text: string) =>
{
    return text
        .normalize('NFKD')
        .toLowerCase()
        .replace(/\u00df/g, 'ss')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
};

const isScanDetailSearchTermMatch = (
    term: string,
    originalSearchTarget: ScanDetailSearchTarget,
) =>
{
    if (originalSearchTarget.terms.some((originalTerm) => originalTerm.includes(term)))
    {
        return true;
    }

    if (term.length >= 2 && originalSearchTarget.acronym.includes(term))
    {
        return true;
    }

    if (term.length < 4)
    {
        return false;
    }

    return originalSearchTarget.terms.some((originalTerm) =>
    {
        const allowedDistance = getAllowedScanDetailSearchDistance(term);

        return (
            Math.abs(originalTerm.length - term.length) <= allowedDistance &&
            getBoundedLevenshteinDistance(term, originalTerm, allowedDistance) <=
                allowedDistance
        );
    });
};

const getAllowedScanDetailSearchDistance = (term: string) =>
{
    if (term.length <= 5)
    {
        return 1;
    }

    if (term.length <= 10)
    {
        return 2;
    }

    return 3;
};

const getBoundedLevenshteinDistance = (
    left: string,
    right: string,
    maximumDistance: number,
) =>
{
    let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1)
    {
        const currentRow = [leftIndex];
        let rowMinimum = currentRow[0];

        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1)
        {
            const substitutionCost =
                left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
            const distance = Math.min(
                previousRow[rightIndex] + 1,
                currentRow[rightIndex - 1] + 1,
                previousRow[rightIndex - 1] + substitutionCost,
            );

            currentRow[rightIndex] = distance;
            rowMinimum = Math.min(rowMinimum, distance);
        }

        if (rowMinimum > maximumDistance)
        {
            return maximumDistance + 1;
        }

        previousRow = currentRow;
    }

    return previousRow[right.length];
};

const getMaskNumber = (mask: string) =>
{
    const match = /_(\d+)$/.exec(mask);

    if (match == null)
    {
        return Number.MAX_SAFE_INTEGER;
    }

    return Number(match[1]);
};

const getNextScanDetailSortDirection = (
    sortDirection: ScanDetailSortDirection,
): ScanDetailSortDirection =>
{
    if (sortDirection === 'neutral')
    {
        return 'ascending';
    }

    if (sortDirection === 'ascending')
    {
        return 'descending';
    }

    return 'neutral';
};

const getScanDetailSortLabel = (sortDirection: ScanDetailSortDirection) =>
{
    if (sortDirection === 'ascending')
    {
        return 'Sorted by occurrence count low to high';
    }

    if (sortDirection === 'descending')
    {
        return 'Sorted by occurrence count high to low';
    }

    return 'Sorted by mask number';
};

const getScanDetailSortButtonLabel = (sortDirection: ScanDetailSortDirection) =>
{
    if (sortDirection === 'ascending')
    {
        return 'Sort by occurrence count high to low';
    }

    if (sortDirection === 'descending')
    {
        return 'Sort by mask number';
    }

    return 'Sort by occurrence count low to high';
};

const getScanDetailSortTitle = (sortDirection: ScanDetailSortDirection) =>
{
    const buttonLabel = getScanDetailSortButtonLabel(sortDirection);

    if (sortDirection === 'neutral')
    {
        return buttonLabel;
    }

    return `${getScanDetailSortLabel(sortDirection)}. ${buttonLabel}.`;
};

const getScanDetailSortIcon = (sortDirection: ScanDetailSortDirection) =>
{
    if (sortDirection === 'ascending')
    {
        return ArrowUp;
    }

    if (sortDirection === 'descending')
    {
        return ArrowDown;
    }

    return ArrowUpDown;
};

const clamp = (value: number, minimum: number, maximum: number) =>
{
    return Math.min(maximum, Math.max(minimum, value));
};

const renderPreviewSegment = (
    target: PreviewTarget,
    segment: PrivatizedPromptSegment,
    index: number,
    activeScanCategory: SensitiveItemCategory | null,
    showPreviewTooltip: ShowPreviewTooltip,
    queueHidePreviewTooltip: () => void,
    hidePreviewTooltip: () => void,
) =>
{
    if (segment.type === 'text')
    {
        return (
            <span
                key={`preview-text-${index}`}
                className="preview-text"
                data-source-start={segment.sourceStart}
                data-source-end={segment.sourceEnd}
            >
                {segment.text}
            </span>
        );
    }

    return (
        <span
            key={`${segment.mappingId}-${index}`}
            className={`preview-mask${
                activeScanCategory != null && activeScanCategory !== segment.category
                    ? ' is-dimmed'
                    : ''
            }`}
            style={getCategoryColorStyle(segment.category)}
            tabIndex={0}
            aria-label={`${segment.text} masks ${segment.category.toLowerCase()}`}
            onPointerEnter={(event) =>
                showPreviewTooltip(
                    target,
                    event,
                    segment.original,
                    segment.mappingId,
                    segment.text,
                )
            }
            onPointerLeave={queueHidePreviewTooltip}
            onFocus={(event) =>
                showPreviewTooltip(
                    target,
                    event,
                    segment.original,
                    segment.mappingId,
                    segment.text,
                )
            }
            onBlur={queueHidePreviewTooltip}
            onKeyDown={(event) =>
            {
                if (event.key === 'Escape')
                {
                    event.preventDefault();
                    hidePreviewTooltip();
                    return;
                }

                if (event.key === 'Enter' || event.key === ' ')
                {
                    event.preventDefault();
                    showPreviewTooltip(
                        target,
                        event,
                        segment.original,
                        segment.mappingId,
                        segment.text,
                    );
                }
            }}
        >
            {segment.text}
        </span>
    );
};

const getPreviewContent = (
    target: PreviewTarget,
    privatizedPrompt: string,
    previewSegments: PrivatizedPromptSegment[],
    activeScanCategory: SensitiveItemCategory | null,
    showPreviewTooltip: ShowPreviewTooltip,
    queueHidePreviewTooltip: () => void,
    hidePreviewTooltip: () => void,
) =>
{
    if (!privatizedPrompt)
    {
        return EMPTY_PREVIEW_TEXT;
    }

    if (previewSegments.length === 0)
    {
        return privatizedPrompt;
    }

    return previewSegments.map((segment, index) =>
    {
        return renderPreviewSegment(
            target,
            segment,
            index,
            activeScanCategory,
            showPreviewTooltip,
            queueHidePreviewTooltip,
            hidePreviewTooltip,
        );
    });
};

const getPreviewTooltipPosition = (target: HTMLElement) =>
{
    const anchorRect = getPreviewTooltipRect(target.getBoundingClientRect());
    const maxWidth = Math.min(
        PREVIEW_TOOLTIP_MAX_WIDTH,
        window.innerWidth - PREVIEW_TOOLTIP_MARGIN * 2,
    );
    const anchorLeft = anchorRect.left + anchorRect.width / 2;
    const left = getClampedPreviewTooltipLeft(anchorLeft, maxWidth);
    const arrowLeft = getClampedPreviewTooltipArrowLeft(anchorLeft, left, maxWidth);

    if (anchorRect.top >= PREVIEW_TOOLTIP_MIN_ABOVE_SPACE)
    {
        return {
            left,
            top: anchorRect.top - PREVIEW_TOOLTIP_GAP,
            anchorLeft,
            arrowLeft,
            placement: 'above' as const,
            anchorRect,
            bridge: null,
        };
    }

    return {
        left,
        top: anchorRect.bottom + PREVIEW_TOOLTIP_GAP,
        anchorLeft,
        arrowLeft,
        placement: 'below' as const,
        anchorRect,
        bridge: null,
    };
};

const getPreviewTooltipRect = (rect: DOMRect): PreviewTooltipRect =>
{
    return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
};

const getPreviewTooltipBridge = (
    anchorRect: PreviewTooltipRect,
    tooltipRect: PreviewTooltipRect,
    placement: PreviewTooltip['placement'],
): PreviewTooltipBridge | null =>
{
    const top =
        placement === 'above'
            ? tooltipRect.bottom - PREVIEW_TOOLTIP_BRIDGE_OVERLAP
            : anchorRect.bottom - PREVIEW_TOOLTIP_BRIDGE_OVERLAP;
    const bottom =
        placement === 'above'
            ? anchorRect.top + PREVIEW_TOOLTIP_BRIDGE_OVERLAP
            : tooltipRect.top + PREVIEW_TOOLTIP_BRIDGE_OVERLAP;
    const height = bottom - top;

    if (height <= 0)
    {
        return null;
    }

    const left = Math.max(
        0,
        Math.min(anchorRect.left, tooltipRect.left) - PREVIEW_TOOLTIP_BRIDGE_PADDING,
    );
    const right = Math.min(
        window.innerWidth,
        Math.max(anchorRect.right, tooltipRect.right) + PREVIEW_TOOLTIP_BRIDGE_PADDING,
    );

    return {
        left,
        top,
        width: right - left,
        height,
    };
};

const isSamePreviewTooltipBridge = (
    left: PreviewTooltipBridge | null,
    right: PreviewTooltipBridge | null,
) =>
{
    if (left == null || right == null)
    {
        return left == null && right == null;
    }

    return (
        Math.abs(left.left - right.left) < 0.5 &&
        Math.abs(left.top - right.top) < 0.5 &&
        Math.abs(left.width - right.width) < 0.5 &&
        Math.abs(left.height - right.height) < 0.5
    );
};

const getPreviewSelectionPopoverPosition = (
    anchorRect: PreviewTooltipRect,
): Pick<
    PreviewSelectionPopover,
    'left' | 'top' | 'anchorLeft' | 'arrowLeft' | 'placement'
> =>
{
    const maxWidth = Math.min(
        PREVIEW_SELECTION_POPOVER_MAX_WIDTH,
        window.innerWidth - PREVIEW_TOOLTIP_MARGIN * 2,
    );
    const anchorLeft = anchorRect.left + anchorRect.width / 2;
    const left = getClampedPreviewTooltipLeft(anchorLeft, maxWidth);
    const arrowLeft = getClampedPreviewTooltipArrowLeft(anchorLeft, left, maxWidth);

    if (anchorRect.top >= PREVIEW_TOOLTIP_MIN_ABOVE_SPACE)
    {
        return {
            left,
            top: anchorRect.top - PREVIEW_TOOLTIP_GAP,
            anchorLeft,
            arrowLeft,
            placement: 'above',
        };
    }

    return {
        left,
        top: anchorRect.bottom + PREVIEW_TOOLTIP_GAP,
        anchorLeft,
        arrowLeft,
        placement: 'below',
    };
};

const getPreviewSelectionPopover = (
    selection: Selection | null,
    previewElement: HTMLElement | null,
    inputText: string,
    target: PreviewTarget,
): PreviewSelectionPopover | null =>
{
    if (
        selection == null ||
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        previewElement == null ||
        inputText.length === 0
    )
    {
        return null;
    }

    const range = selection.getRangeAt(0);

    if (!isSelectionInsidePreview(range, previewElement))
    {
        return null;
    }

    if (selectionOverlapsPreviewMask(range, previewElement))
    {
        return null;
    }

    const selectedRange = getSelectedSourceRange(range, inputText);

    if (selectedRange == null)
    {
        return null;
    }

    const anchorRect = getPreviewSelectionRect(range);

    if (anchorRect == null)
    {
        return null;
    }

    return {
        target,
        ...selectedRange,
        ...getPreviewSelectionPopoverPosition(anchorRect),
    };
};

const isSelectionInsidePreview = (range: Range, previewElement: HTMLElement) =>
{
    return (
        isNodeInsideElement(range.startContainer, previewElement) &&
        isNodeInsideElement(range.endContainer, previewElement)
    );
};

const isNodeInsideElement = (node: Node, element: HTMLElement) =>
{
    return node === element || element.contains(node);
};

const selectionOverlapsPreviewMask = (range: Range, previewElement: HTMLElement) =>
{
    return Array.from(previewElement.querySelectorAll('.preview-mask')).some((node) =>
    {
        return range.intersectsNode(node);
    });
};

const getSelectedSourceRange = (
    range: Range,
    inputText: string,
): Pick<PreviewSelectionPopover, 'text' | 'start' | 'end'> | null =>
{
    const startElement = getPreviewTextElement(range.startContainer);
    const endElement = getPreviewTextElement(range.endContainer);

    if (startElement == null || endElement == null || startElement !== endElement)
    {
        return null;
    }

    const sourceStart = getPreviewTextSourceOffset(
        startElement,
        range.startContainer,
        range.startOffset,
    );
    const sourceEnd = getPreviewTextSourceOffset(
        endElement,
        range.endContainer,
        range.endOffset,
    );

    if (sourceStart == null || sourceEnd == null || sourceEnd <= sourceStart)
    {
        return null;
    }

    const trimmedRange = trimPreviewSelectionSourceRange(
        inputText,
        sourceStart,
        sourceEnd,
    );
    const text = inputText.slice(trimmedRange.start, trimmedRange.end);

    if (text.length === 0)
    {
        return null;
    }

    return {
        text,
        start: trimmedRange.start,
        end: trimmedRange.end,
    };
};

const getPreviewTextElement = (node: Node): HTMLElement | null =>
{
    const element =
        node.nodeType === Node.ELEMENT_NODE
            ? (node as Element)
            : node.parentElement;
    const previewTextElement = element?.closest('.preview-text');

    if (previewTextElement instanceof HTMLElement)
    {
        return previewTextElement;
    }

    return null;
};

const getPreviewTextSourceOffset = (
    element: HTMLElement,
    container: Node,
    offset: number,
) =>
{
    const sourceStart = Number(element.dataset.sourceStart);

    if (!Number.isFinite(sourceStart))
    {
        return null;
    }

    const range = document.createRange();

    try
    {
        range.selectNodeContents(element);
        range.setEnd(container, offset);

        return sourceStart + range.toString().length;
    }
    catch
    {
        return null;
    }
    finally
    {
        range.detach();
    }
};

const trimPreviewSelectionSourceRange = (
    inputText: string,
    start: number,
    end: number,
) =>
{
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /\s/.test(inputText[trimmedStart]))
    {
        trimmedStart += 1;
    }

    while (trimmedEnd > trimmedStart && /\s/.test(inputText[trimmedEnd - 1]))
    {
        trimmedEnd -= 1;
    }

    return {
        start: trimmedStart,
        end: trimmedEnd,
    };
};

const getPreviewSelectionRect = (range: Range): PreviewTooltipRect | null =>
{
    const rects = Array.from(range.getClientRects()).filter((rect) =>
    {
        return rect.width > 0 || rect.height > 0;
    });

    if (rects.length === 0)
    {
        return null;
    }

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));

    return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
};

const getClampedPreviewTooltipLeft = (anchorLeft: number, width: number) =>
{
    const maxLeft = window.innerWidth - PREVIEW_TOOLTIP_MARGIN - width;

    if (maxLeft < PREVIEW_TOOLTIP_MARGIN)
    {
        return PREVIEW_TOOLTIP_MARGIN;
    }

    return clamp(anchorLeft - width / 2, PREVIEW_TOOLTIP_MARGIN, maxLeft);
};

const getClampedPreviewTooltipArrowLeft = (
    anchorLeft: number,
    tooltipLeft: number,
    tooltipWidth: number,
) =>
{
    return clamp(anchorLeft - tooltipLeft, 8, tooltipWidth - 8);
};

const requestCurrentChatTarget = async () =>
{
    return (await browser.runtime.sendMessage({
        type: GET_CHAT_TARGET_MESSAGE,
    })) as RuntimeResponse | undefined;
};

const getLocalModelProgressPercent = (progress: LocalModelProgress) =>
{
    if (typeof progress.progress !== 'number' || !Number.isFinite(progress.progress))
    {
        return null;
    }

    return clamp(progress.progress, 0, 100);
};

const getLocalModelProgressLabel = (progress: LocalModelProgress) =>
{
    if (progress.label === LOCAL_MODEL_FALLBACK_PROGRESS_LABEL)
    {
        return progress.label;
    }

    if (progress.phase === 'error')
    {
        return 'Local model failed.';
    }

    if (progress.phase === 'permission' || progress.phase === 'runtime')
    {
        return 'Preparing model...';
    }

    if (progress.phase === 'download' && progress.progress == null)
    {
        return 'Checking model files...';
    }

    if (progress.phase === 'download')
    {
        return 'Downloading model...';
    }

    if (progress.phase === 'load')
    {
        return 'Loading model...';
    }

    if (progress.phase === 'inference')
    {
        return 'Scanning input...';
    }

    if (progress.phase === 'postprocess')
    {
        return progress.label;
    }

    if (progress.phase === 'done')
    {
        return 'Finishing scan...';
    }

    return progress.label;
};

const getLocalModelProgressMeta = (progress: LocalModelProgress) =>
{
    if (
        progress.loadedBytes != null &&
        progress.totalBytes != null &&
        progress.totalBytes > 0
    )
    {
        return `${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`;
    }

    if (progress.currentChunk != null && progress.totalChunks != null)
    {
        return `${progress.currentChunk}/${progress.totalChunks} chunks`;
    }

    const percent = getLocalModelProgressPercent(progress);

    return percent == null ? '' : `${Math.round(percent)}%`;
};

const isLocalModelProgressIndeterminate = (progress: LocalModelProgress) =>
{
    return (
        getLocalModelProgressPercent(progress) == null ||
        LOCAL_MODEL_PROGRESS_INDETERMINATE_PHASES.has(progress.phase)
    );
};

const formatBytes = (bytes: number) =>
{
    if (!Number.isFinite(bytes) || bytes <= 0)
    {
        return '0 B';
    }

    const megabytes = bytes / 1024 / 1024;

    if (megabytes >= 1)
    {
        return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
    }

    const kilobytes = bytes / 1024;

    if (kilobytes >= 1)
    {
        return `${kilobytes.toFixed(0)} KB`;
    }

    return `${bytes.toFixed(0)} B`;
};

const hasScrollableOverflow = (element: HTMLElement | null) =>
{
    if (element == null)
    {
        return false;
    }

    return (
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1
    );
};

const getTextFileAttachmentLabel = (
    attachment: TextFileAttachment,
    index: number,
) =>
{
    return `File ${index + 1} (.${attachment.document.format})`;
};

const getTextFileAttachmentLineCount = (attachment: TextFileAttachment) =>
{
    if (attachment.document.text.length === 0)
    {
        return 0;
    }

    return attachment.document.text.split(/\r\n|\r|\n/).length;
};

const getTextFileAttachmentItemCount = (attachment: TextFileAttachment) =>
{
    return getMaskingMappingItemCount(
        getActiveTextFileAttachmentMappings(attachment),
    );
};

const getTextFileAttachmentCategorySummaries = (
    attachment: TextFileAttachment,
) =>
{
    const activeMappings = getActiveTextFileAttachmentMappings(attachment);

    return PRIVACY_SCAN_CATEGORIES.map(({ category, label }) =>
    {
        return {
            category,
            label,
            count: getMaskingMappingItemCount(
                getMaskingMappingsByCategory(activeMappings, category),
            ),
        };
    }).filter((summary) =>
    {
        return summary.count > 0;
    });
};

const getVisibleTextFileCategorySummaries = (
    summaries: readonly TextFileCategorySummary[],
) =>
{
    return summaries.slice(0, MAX_TEXT_FILE_CATEGORY_SUMMARIES);
};

const getActiveTextFileAttachmentMappings = (attachment: TextFileAttachment) =>
{
    if (attachment.result == null)
    {
        return [];
    }

    return getActiveMaskingMappings(
        attachment.result.maskingMappings,
        attachment.ignoredMappingIds,
    );
};

const getTextFileAttachmentPreview = (attachment: TextFileAttachment) =>
{
    if (attachment.result == null)
    {
        return null;
    }

    if (attachment.ignoredMappingIds.length === 0)
    {
        return {
            privatizedPrompt: attachment.result.privatizedPrompt,
            segments: attachment.result.segments,
        };
    }

    try
    {
        return createPrivatizedPromptPreview(
            attachment.document.text,
            attachment.result,
            {
                ignoredMappingIds: attachment.ignoredMappingIds,
            },
        );
    }
    catch
    {
        return {
            privatizedPrompt: attachment.result.privatizedPrompt,
            segments: attachment.result.segments,
        };
    }
};

const getTextFileAttachmentPreviewText = (attachment: TextFileAttachment) =>
{
    return getTextFileAttachmentPreview(attachment)?.privatizedPrompt ?? '';
};

const mergePreferredMaskingMappings = (
    currentMappings: readonly MaskingMapping[],
    nextMappings: readonly MaskingMapping[],
) =>
{
    const mappingKeys = new Set(
        currentMappings.map((maskingMapping) =>
        {
            return getMaskingMappingKey(maskingMapping);
        }),
    );
    const mergedMappings = [...currentMappings];

    for (const maskingMapping of nextMappings)
    {
        const mappingKey = getMaskingMappingKey(maskingMapping);

        if (mappingKeys.has(mappingKey))
        {
            continue;
        }

        mappingKeys.add(mappingKey);
        mergedMappings.push(maskingMapping);
    }

    return mergedMappings;
};

const getBundleActiveMaskingMappings = (
    promptResult: PrivatizedPromptResult | null,
    promptIgnoredMappingIds: readonly string[],
    attachments: readonly TextFileAttachment[],
) =>
{
    const mappingsByKey = new Map<string, MaskingMapping>();

    if (promptResult != null)
    {
        addBundleMaskingMappings(
            mappingsByKey,
            'prompt',
            getActiveMaskingMappings(promptResult.maskingMappings, [
                ...promptIgnoredMappingIds,
            ]),
        );
    }

    for (const attachment of attachments)
    {
        addBundleMaskingMappings(
            mappingsByKey,
            attachment.document.id,
            getActiveTextFileAttachmentMappings(attachment),
        );
    }

    return [...mappingsByKey.values()];
};

const addBundleMaskingMappings = (
    mappingsByKey: Map<string, MaskingMapping>,
    sourceId: string,
    mappings: readonly MaskingMapping[],
) =>
{
    for (const maskingMapping of mappings)
    {
        const mappingKey = getMaskingMappingKey(maskingMapping);
        const existingMapping = mappingsByKey.get(mappingKey);
        const itemIds = maskingMapping.itemIds.map((itemId) =>
        {
            return `${sourceId}:${itemId}`;
        });

        if (existingMapping != null)
        {
            existingMapping.itemIds.push(...itemIds);
            continue;
        }

        mappingsByKey.set(mappingKey, {
            ...maskingMapping,
            id: `bundle-mapping-${mappingsByKey.size + 1}`,
            itemIds,
        });
    }
};

const getMaskingMappingKey = (maskingMapping: MaskingMapping) =>
{
    return `${maskingMapping.category}\n${maskingMapping.original}`;
};

const isSameMaskingMapping = (
    left: MaskingMapping,
    right: MaskingMapping,
) =>
{
    return (
        left.category === right.category &&
        left.original === right.original &&
        left.mask === right.mask
    );
};

const composePrivatizedOutput = (
    privatizedPrompt: string,
    attachments: readonly TextFileAttachment[],
) =>
{
    const outputParts: string[] = [];
    const trimmedPrompt = privatizedPrompt.trim();
    const includedAttachments = attachments.filter((attachment) =>
    {
        return attachment.included && attachment.result != null;
    });

    if (trimmedPrompt.length > 0)
    {
        outputParts.push(privatizedPrompt);
    }

    includedAttachments.forEach((attachment) =>
    {
        const sanitizedText = getTextFileAttachmentPreviewText(attachment);
        const fence = getMarkdownFence(sanitizedText);

        outputParts.push(
            [
                `Sanitized file content from ${attachment.document.fileName}:`,
                '',
                `${fence}${getMarkdownFenceLanguage(attachment.document.format)}`,
                sanitizedText,
                fence,
            ].join('\n'),
        );
    });

    return outputParts.join('\n\n');
};

const getMarkdownFence = (text: string) =>
{
    const longestFence = Math.max(
        2,
        ...Array.from(text.matchAll(/`+/g), (match) => match[0].length),
    );

    return '`'.repeat(longestFence + 1);
};

const getMarkdownFenceLanguage = (format: FileTextDocument['format']) =>
{
    if (format === 'md')
    {
        return 'markdown';
    }

    if (format === 'yaml')
    {
        return 'yaml';
    }

    return format;
};

const createPrivatizedFileName = (fileName: string) =>
{
    const extensionStart = fileName.lastIndexOf('.');

    if (extensionStart <= 0)
    {
        return `${fileName}.privatized.txt`;
    }

    return `${fileName.slice(0, extensionStart)}.privatized${fileName.slice(extensionStart)}`;
};

const combinePrivacyBenchmarks = (
    benchmarks: readonly PrivacyBenchmark[],
): PrivacyBenchmark | null =>
{
    if (benchmarks.length === 0)
    {
        return null;
    }

    const stagesByName = new Map<string, PrivacyBenchmarkStageTiming>();

    for (const benchmark of benchmarks)
    {
        for (const stage of benchmark.stages)
        {
            const currentStage = stagesByName.get(stage.stage);

            if (currentStage == null)
            {
                stagesByName.set(stage.stage, { ...stage });
                continue;
            }

            currentStage.durationMs += stage.durationMs;

            if (stage.itemCount != null)
            {
                currentStage.itemCount = (currentStage.itemCount ?? 0) + stage.itemCount;
            }
        }
    }

    return {
        startedAt: Math.min(...benchmarks.map((benchmark) => benchmark.startedAt)),
        completedAt: Math.max(...benchmarks.map((benchmark) => benchmark.completedAt)),
        totalDurationMs: benchmarks.reduce((durationMs, benchmark) =>
        {
            return durationMs + benchmark.totalDurationMs;
        }, 0),
        inputCharacters: benchmarks.reduce((characters, benchmark) =>
        {
            return characters + benchmark.inputCharacters;
        }, 0),
        inputLines: benchmarks.reduce((lines, benchmark) =>
        {
            return lines + benchmark.inputLines;
        }, 0),
        rulesEnabled: benchmarks.some((benchmark) => benchmark.rulesEnabled),
        localModelEnabled: benchmarks.some((benchmark) => benchmark.localModelEnabled),
        safeToInject: benchmarks.every((benchmark) => benchmark.safeToInject),
        itemCount: benchmarks.reduce((count, benchmark) =>
        {
            return count + benchmark.itemCount;
        }, 0),
        hardeningItemCount: benchmarks.reduce((count, benchmark) =>
        {
            return count + benchmark.hardeningItemCount;
        }, 0),
        stages: [...stagesByName.values()],
    };
};

export function App()
{
    const [appView, setAppView] = useState<AppView>('main');
    const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('prompt');
    const [fileReaderTab, setFileReaderTab] =
        useState<FileReaderTab>('privatized');
    const [selectedFileAttachmentId, setSelectedFileAttachmentId] =
        useState<string | null>(null);
    const [settings, setSettings] = useState<ExtensionSettings>(
        DEFAULT_EXTENSION_SETTINGS,
    );
    const [settingsStatus, setSettingsStatus] = useState('');
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [privatizedPrompt, setPrivatizedPrompt] = useState('');
    const [privatizedInputText, setPrivatizedInputText] = useState('');
    const [privatizedResult, setPrivatizedResult] =
        useState<PrivatizedPromptResult | null>(null);
    const [textFileAttachments, setTextFileAttachments] = useState<
        TextFileAttachment[]
    >([]);
    const [openTextFileActionMenuId, setOpenTextFileActionMenuId] = useState<
        string | null
    >(null);
    const [bundleMaskingMappings, setBundleMaskingMappings] = useState<
        MaskingMapping[]
    >([]);
    const [previewSegments, setPreviewSegments] = useState<PrivatizedPromptSegment[]>([]);
    const [canUsePrivatizedPrompt, setCanUsePrivatizedPrompt] = useState(false);
    const [ignoredMappingIds, setIgnoredMappingIds] = useState<string[]>([]);
    const [activeScanCategory, setActiveScanCategory] =
        useState<SensitiveItemCategory | null>(null);
    const [scanDetailSortDirection, setScanDetailSortDirection] =
        useState<ScanDetailSortDirection>('neutral');
    const [scanDetailSearchText, setScanDetailSearchText] = useState('');
    const [clipboardStatus, setClipboardStatus] = useState('');
    const [sendStatus, setSendStatus] = useState('');
    const [chatTargetLabel, setChatTargetLabel] = useState(AI_CHAT_FALLBACK_LABEL);
    const [hasChatTarget, setHasChatTarget] = useState(false);
    const [localModelProgress, setLocalModelProgress] =
        useState<LocalModelProgress | null>(null);
    const [latestBenchmark, setLatestBenchmark] = useState<PrivacyBenchmark | null>(
        null,
    );
    const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
    const [isPreviewStale, setIsPreviewStale] = useState(false);
    const [resultEnabledCategories, setResultEnabledCategories] = useState<
        ExtensionSettings['enabledCategories'] | null
    >(null);
    const [isPrivatizing, setIsPrivatizing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cleared, setCleared] = useState(false);
    const [promptSurfaceHasOverflow, setPromptSurfaceHasOverflow] =
        useState(false);
    const [previewSurfaceHasOverflow, setPreviewSurfaceHasOverflow] =
        useState(false);
    const [previewTooltip, setPreviewTooltip] = useState<PreviewTooltip | null>(null);
    const [previewSelectionPopover, setPreviewSelectionPopover] =
        useState<PreviewSelectionPopover | null>(null);
    const copyResetTimerRef = useRef<number | undefined>(undefined);
    const clearResetTimerRef = useRef<number | undefined>(undefined);
    const previewTooltipHideTimerRef = useRef<number | undefined>(undefined);
    const previewSelectionFrameRef = useRef<number | undefined>(undefined);
    const promptSurfaceRef = useRef<HTMLTextAreaElement | null>(null);
    const previewSurfaceRef = useRef<HTMLDivElement | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const previewTooltipRef = useRef<HTMLDivElement | null>(null);
    const previewSelectionPopoverRef = useRef<HTMLDivElement | null>(null);
    const textFileInputRef = useRef<HTMLInputElement | null>(null);
    const textFileActionMenuRef = useRef<HTMLDivElement | null>(null);
    const privatizationRunIdRef = useRef(0);
    const settingsRef = useRef(settings);
    const settingsSavePromiseRef = useRef<Promise<void>>(Promise.resolve());

    const clearPreviewTooltipHideTimer = () =>
    {
        if (previewTooltipHideTimerRef.current !== undefined)
        {
            window.clearTimeout(previewTooltipHideTimerRef.current);
            previewTooltipHideTimerRef.current = undefined;
        }
    };
    const hidePreviewTooltip = () =>
    {
        clearPreviewTooltipHideTimer();
        setPreviewTooltip(null);
    };
    const hidePreviewSelectionPopover = () =>
    {
        setPreviewSelectionPopover(null);
    };
    const syncSurfaceOverflowState = () =>
    {
        const nextPromptSurfaceHasOverflow = hasScrollableOverflow(
            promptSurfaceRef.current,
        );
        const nextPreviewSurfaceHasOverflow = hasScrollableOverflow(
            previewSurfaceRef.current,
        );

        setPromptSurfaceHasOverflow((currentValue) =>
        {
            return currentValue === nextPromptSurfaceHasOverflow
                ? currentValue
                : nextPromptSurfaceHasOverflow;
        });
        setPreviewSurfaceHasOverflow((currentValue) =>
        {
            return currentValue === nextPreviewSurfaceHasOverflow
                ? currentValue
                : nextPreviewSurfaceHasOverflow;
        });
    };
    const updateChatTargetState = (response: RuntimeResponse | undefined) =>
    {
        if (response?.providerLabel != null)
        {
            setChatTargetLabel(response.providerLabel);
            setHasChatTarget(true);
            return;
        }

        if (response?.ok === false)
        {
            setChatTargetLabel(AI_CHAT_FALLBACK_LABEL);
            setHasChatTarget(false);
        }
    };
    const queueHidePreviewTooltip = () =>
    {
        clearPreviewTooltipHideTimer();

        previewTooltipHideTimerRef.current = window.setTimeout(() =>
        {
            setPreviewTooltip(null);
            previewTooltipHideTimerRef.current = undefined;
        }, PREVIEW_TOOLTIP_HIDE_DELAY_MS);
    };
    const showPreviewTooltip = (
        target: PreviewTarget,
        event: PreviewTooltipEvent,
        text: string,
        mappingId: string,
        mask: string,
    ) =>
    {
        clearPreviewTooltipHideTimer();
        hidePreviewSelectionPopover();
        setPreviewTooltip({
            target,
            text,
            mappingId,
            mask,
            ...getPreviewTooltipPosition(event.currentTarget),
        });
    };
    const getActivePreviewContext = () =>
    {
        if (
            appView === 'fileReader' &&
            selectedTextFileAttachment != null &&
            selectedFilePreviewTarget != null
        )
        {
            return {
                target: selectedFilePreviewTarget,
                inputText: selectedTextFileAttachment.document.text,
                result: selectedTextFileAttachment.result,
                ignoredMappingIds: selectedTextFileAttachment.ignoredMappingIds,
            };
        }

        return {
            target: PROMPT_PREVIEW_TARGET,
            inputText: privatizedInputText,
            result: privatizedResult,
            ignoredMappingIds,
        };
    };
    const updatePreviewSelectionPopover = () =>
    {
        if (!hasEnabledDetectionCategories || isPreviewStale)
        {
            hidePreviewSelectionPopover();
            return;
        }

        const previewContext = getActivePreviewContext();

        if (previewContext.result == null)
        {
            hidePreviewSelectionPopover();
            return;
        }

        const selectionPopover = getPreviewSelectionPopover(
            window.getSelection(),
            previewRef.current,
            previewContext.inputText,
            previewContext.target,
        );

        if (selectionPopover == null)
        {
            hidePreviewSelectionPopover();
            return;
        }

        hidePreviewTooltip();
        setPreviewSelectionPopover(selectionPopover);
    };
    const schedulePreviewSelectionPopover = () =>
    {
        if (previewSelectionFrameRef.current !== undefined)
        {
            window.cancelAnimationFrame(previewSelectionFrameRef.current);
        }

        previewSelectionFrameRef.current = window.requestAnimationFrame(() =>
        {
            previewSelectionFrameRef.current = undefined;
            updatePreviewSelectionPopover();
        });
    };
    const enabledPrivacyScanCategories = PRIVACY_SCAN_CATEGORIES.filter(
        ({ category }) =>
        {
            return isSensitiveItemCategoryEnabled(
                settings.enabledCategories,
                category,
            );
        },
    );
    const getScanCategoryStaleState = (
        category: SensitiveItemCategory,
    ): ScanCategoryStaleState | null =>
    {
        if (!isPreviewStale || resultEnabledCategories == null)
        {
            return null;
        }

        const isEnabled = isSensitiveItemCategoryEnabled(
            settings.enabledCategories,
            category,
        );
        const wasEnabled = isSensitiveItemCategoryEnabled(
            resultEnabledCategories,
            category,
        );

        if (isEnabled && !wasEnabled)
        {
            return 'added';
        }

        if (!isEnabled && wasEnabled)
        {
            return 'removed';
        }

        return null;
    };
    const privacyScanDisplayCategories = PRIVACY_SCAN_CATEGORIES.filter(
        ({ category }) =>
        {
            return (
                isSensitiveItemCategoryEnabled(
                    settings.enabledCategories,
                    category,
                ) ||
                (isPreviewStale &&
                    resultEnabledCategories != null &&
                    isSensitiveItemCategoryEnabled(
                        resultEnabledCategories,
                        category,
                    ))
            );
        },
    );
    const privacyScanDisplayCategorySet = new Set(
        privacyScanDisplayCategories.map(({ category }) => category),
    );
    const hasEnabledDetectionCategories = enabledPrivacyScanCategories.length > 0;
    const hasPrivacyScanDisplayCategories =
        privacyScanDisplayCategories.length > 0;
    const hasEnabledDetectionSources =
        settings.rulesDetectionEnabled || settings.localModelDetectionEnabled;
    const hasPreview = privatizedPrompt.length > 0;
    const readyTextFileAttachments = textFileAttachments.filter((attachment) =>
    {
        return attachment.error == null;
    });
    const includedTextFileAttachments = readyTextFileAttachments.filter(
        (attachment) =>
        {
            return attachment.included;
        },
    );
    const privatizableTextFileAttachments = readyTextFileAttachments.filter(
        (attachment) =>
        {
            return attachment.document.text.trim().length > 0;
        },
    );
    const includedPrivatizableTextFileAttachments =
        privatizableTextFileAttachments.filter((attachment) =>
        {
            return attachment.included;
        });
    const privatizedTextFileAttachments = readyTextFileAttachments.filter(
        (attachment) =>
        {
            return attachment.included && attachment.result != null;
        },
    );
    const selectedTextFileAttachment =
        selectedFileAttachmentId == null
            ? null
            : textFileAttachments.find((attachment) =>
              {
                  return attachment.document.id === selectedFileAttachmentId;
              }) ?? null;
    const selectedTextFilePreview =
        selectedTextFileAttachment == null
            ? null
            : getTextFileAttachmentPreview(selectedTextFileAttachment);
    const selectedFilePreviewTarget =
        selectedTextFileAttachment == null
            ? null
            : {
                  kind: 'file',
                  attachmentId: selectedTextFileAttachment.document.id,
              } satisfies PreviewTarget;
    const hasPrivatizedTextFileAttachments =
        privatizedTextFileAttachments.length > 0;
    const hasPrivatizedOutput = hasPreview || hasPrivatizedTextFileAttachments;
    const hasClearableInput =
        prompt.length > 0 ||
        privatizedPrompt.length > 0 ||
        textFileAttachments.length > 0;
    const hasPrivatizableInput =
        prompt.trim().length > 0 ||
        includedPrivatizableTextFileAttachments.length > 0;
    const textFileAttachmentsReadyToSend =
        includedPrivatizableTextFileAttachments.every((attachment) =>
        {
            return attachment.result != null;
        }) &&
        includedPrivatizableTextFileAttachments.every((attachment) =>
        {
            return (
                (attachment.result?.safeToInject ?? false) &&
                attachment.ignoredMappingIds.length === 0
            );
        });
    const canUsePrivatizedOutput =
        (hasPreview ? canUsePrivatizedPrompt : true) &&
        textFileAttachmentsReadyToSend;
    const composedPrivatizedOutput = composePrivatizedOutput(
        privatizedPrompt,
        textFileAttachments,
    );
    const hasOutgoingContentSummary =
        hasPrivatizedOutput || textFileAttachments.length > 0;
    const hasCategorySettingChanges =
        isPreviewStale &&
        resultEnabledCategories != null &&
        PRIVACY_SCAN_CATEGORIES.some(({ category }) =>
        {
            return getScanCategoryStaleState(category) != null;
        });
    const staleScanNotice = hasCategorySettingChanges
        ? {
              before: 'Detection category settings changed. Run ',
              after: ' again to apply the updated conditions to your input.',
          }
        : {
              before: 'Input or detection settings changed. Run ',
              after: ' again before copying or sending the output.',
          };
    const previewContent = getPreviewContent(
        PROMPT_PREVIEW_TARGET,
        privatizedPrompt,
        previewSegments,
        activeScanCategory,
        showPreviewTooltip,
        queueHidePreviewTooltip,
        hidePreviewTooltip,
    );
    const selectedTextFilePreviewContent =
        selectedTextFileAttachment == null ||
        selectedFilePreviewTarget == null ||
        selectedTextFilePreview == null
            ? EMPTY_PREVIEW_TEXT
            : getPreviewContent(
                  selectedFilePreviewTarget,
                  selectedTextFilePreview.privatizedPrompt,
                  selectedTextFilePreview.segments,
                  activeScanCategory,
                  showPreviewTooltip,
                  queueHidePreviewTooltip,
                  hidePreviewTooltip,
              );
    const previewTooltipTarget = previewTooltip?.target;
    const previewTooltipAttachment =
        previewTooltipTarget?.kind === 'file'
            ? textFileAttachments.find((attachment) =>
              {
                  return attachment.document.id === previewTooltipTarget.attachmentId;
              }) ?? null
            : null;
    const previewTooltipResult =
        previewTooltipTarget?.kind === 'file'
            ? previewTooltipAttachment?.result ?? null
            : privatizedResult;
    const previewTooltipMapping =
        previewTooltip == null || previewTooltipResult == null
            ? null
            : getMaskingMappingById(
                  previewTooltipResult.maskingMappings,
                  previewTooltip.mappingId,
              );
    const activeMaskingMappings = getBundleActiveMaskingMappings(
        privatizedResult,
        ignoredMappingIds,
        includedTextFileAttachments,
    );
    const visibleMaskingMappings = activeMaskingMappings.filter((maskingMapping) =>
    {
        return privacyScanDisplayCategorySet.has(maskingMapping.category);
    });
    const activeItemCount = getMaskingMappingItemCount(visibleMaskingMappings);
    const itemCountLabel = `${formatCount(activeItemCount)} ${
        activeItemCount === 1 ? 'item' : 'items'
    } detected`;
    const countItemsByCategory = (category: SensitiveItemCategory) =>
    {
        return getMaskingMappingItemCount(
            getMaskingMappingsByCategory(visibleMaskingMappings, category),
        );
    };
    const toggleScanCategory = (category: SensitiveItemCategory) =>
    {
        if (!privacyScanDisplayCategorySet.has(category))
        {
            return;
        }

        setScanDetailSearchText('');
        setActiveScanCategory((currentCategory) =>
        {
            return currentCategory === category ? null : category;
        });
    };
    const renderPrivacyScanCategory = (
        scanCategory: PrivacyScanCategory,
    ) =>
    {
        const { category, label, Icon } = scanCategory;
        const count = countItemsByCategory(category);
        const isActive = activeScanCategory === category;
        const isDimmed = activeScanCategory != null && !isActive;
        const staleState = getScanCategoryStaleState(category);
        const StaleIcon = staleState === 'added' ? CirclePlus : CircleMinus;
        const staleStateTitle =
            staleState === 'added'
                ? `${label} is enabled now and will be scanned after you run Privatize again.`
                : `${label} is disabled now and will be removed after you run Privatize again.`;
        const staleStateLabel =
            staleState === 'added'
                ? 'will be added on the next scan'
                : 'will be removed on the next scan';
        const staleClassName =
            staleState == null ? '' : ` is-setting-${staleState}`;

        return (
            <div key={category} className="chip-shell">
                <button
                    className={`chip${isActive ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}${staleClassName}`}
                    style={getPrivacyScanCategoryColorStyle(category, count)}
                    type="button"
                    aria-pressed={isActive}
                    title={staleState == null ? undefined : staleStateTitle}
                    aria-label={
                        staleState == null
                            ? `${label} ${formatCount(count)}`
                            : `${label} ${formatCount(count)}, ${staleStateLabel}`
                    }
                    onClick={() => toggleScanCategory(category)}
                >
                    <Icon size={17} aria-hidden="true" />
                    <span className="chip-label">{label}</span>
                    <span className="chip-count">{formatCount(count)}</span>
                </button>
                {staleState != null ? (
                    <StaleIcon
                        className={`chip-stale-marker is-${staleState}`}
                        size={17}
                        aria-hidden="true"
                    />
                ) : null}
            </div>
        );
    };
    const activeScanCategoryConfig =
        activeScanCategory == null ||
        !privacyScanDisplayCategorySet.has(activeScanCategory)
            ? null
            : getPrivacyScanCategory(activeScanCategory);
    const activeScanMappings =
        activeScanCategory == null
            ? []
            : getSortedMaskingMappings(
                  getMaskingMappingsByCategory(visibleMaskingMappings, activeScanCategory),
                  scanDetailSortDirection,
              );
    const filteredActiveScanMappings = getSearchFilteredMaskingMappings(
        activeScanMappings,
        scanDetailSearchText,
    );
    const activeScanCategoryStaleState =
        activeScanCategory == null
            ? null
            : getScanCategoryStaleState(activeScanCategory);
    const activeScanCategoryIsDisplayed =
        activeScanCategory == null ||
        privacyScanDisplayCategorySet.has(activeScanCategory);
    const activeScanCount = getMaskingMappingItemCount(activeScanMappings);
    const hasScanDetailSearch = scanDetailSearchText.trim().length > 0;
    const ScanDetailSortIcon = getScanDetailSortIcon(scanDetailSortDirection);
    const scanDetailSortButtonLabel =
        getScanDetailSortButtonLabel(scanDetailSortDirection);
    const scanDetailSortTitle = getScanDetailSortTitle(scanDetailSortDirection);
    const sendButtonLabel = hasChatTarget
        ? `Send to ${chatTargetLabel}`
        : 'Open supported AI chat';
    const privatizeButtonLabel = isPrivatizing ? 'Privatizing...' : 'Privatize';
    const sendButtonTitle = isPreviewStale
        ? 'Run Privatize again before sending.'
        : hasChatTarget
          ? undefined
          : 'Open ChatGPT, Claude, Gemini, or Perplexity before sending.';
    const privatizePromptDisabled =
        !hasPrivatizableInput ||
        isPrivatizing ||
        !hasEnabledDetectionSources ||
        !hasEnabledDetectionCategories;
    const privatizeButtonTitle = !hasEnabledDetectionCategories
        ? 'Enable at least one detection category in settings.'
        : hasEnabledDetectionSources
          ? undefined
          : 'Enable rules or local model detection in settings.';
    const copyPrivatizedPromptDisabled = !hasPrivatizedOutput || isPreviewStale;
    const copyButtonTitle = isPreviewStale
        ? 'Run Privatize again before copying.'
        : 'Copy privatized output';
    const visibleLocalModelProgress = isPrivatizing ? localModelProgress : null;
    const localModelProgressLabel =
        visibleLocalModelProgress == null
            ? ''
            : getLocalModelProgressLabel(visibleLocalModelProgress);
    const localModelProgressPercent =
        visibleLocalModelProgress == null
            ? null
            : getLocalModelProgressPercent(visibleLocalModelProgress);
    const localModelProgressMeta =
        visibleLocalModelProgress == null
            ? ''
            : getLocalModelProgressMeta(visibleLocalModelProgress);
    const localModelProgressIsIndeterminate =
        visibleLocalModelProgress != null &&
        isLocalModelProgressIndeterminate(visibleLocalModelProgress);
    const selectWorkspaceTab = (tab: WorkspaceTab) =>
    {
        if (tab === workspaceTab)
        {
            return;
        }

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setWorkspaceTab(tab);
    };
    const showPromptWorkspace = () =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setWorkspaceTab('prompt');
        setAppView('main');
        window.requestAnimationFrame(() =>
        {
            document.getElementById('original-prompt')?.focus({ preventScroll: true });
        });
    };
    const updatePrompt = (event: ReactChangeEvent<HTMLTextAreaElement>) =>
    {
        privatizationRunIdRef.current += 1;
        setPrompt(event.target.value);
        setIsPrivatizing(false);
        setLocalModelProgress(null);
        setCanUsePrivatizedPrompt(false);
        setSendStatus('');
        setIsPreviewStale(hasPreview || hasPrivatizedTextFileAttachments);
        hidePreviewSelectionPopover();
    };
    const openTextFileInput = () =>
    {
        textFileInputRef.current?.click();
    };
    const handleTextFileInputChange = async (
        event: ReactChangeEvent<HTMLInputElement>,
    ) =>
    {
        const files = Array.from(event.target.files ?? []);

        event.target.value = '';

        if (files.length === 0)
        {
            return;
        }

        const nextAttachments: TextFileAttachment[] = [];

        for (const file of files)
        {
            try
            {
                nextAttachments.push({
                    document: await extractTextFile(file),
                    result: null,
                    ignoredMappingIds: [],
                    error: null,
                    included: true,
                });
            }
            catch (error)
            {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Could not read file as text.';

                nextAttachments.push({
                    document: {
                        id: `text-document-error-${Date.now()}-${nextAttachments.length}`,
                        kind: 'file',
                        name: file.name,
                        fileName: file.name,
                        extension: '',
                        format: 'txt',
                        mimeType: file.type,
                        size: file.size,
                        lastModified: file.lastModified,
                        text: '',
                        warnings: [],
                    },
                    result: null,
                    ignoredMappingIds: [],
                    error: message,
                    included: false,
                });
            }
        }

        privatizationRunIdRef.current += 1;
        setTextFileAttachments((currentAttachments) => [
            ...currentAttachments,
            ...nextAttachments,
        ]);
        setIsPrivatizing(false);
        setLocalModelProgress(null);
        setCanUsePrivatizedPrompt(false);
        setSendStatus('');
        setIsPreviewStale(hasPreview || hasPrivatizedTextFileAttachments);
        setClipboardStatus(
            `${nextAttachments.length} ${nextAttachments.length === 1 ? 'file' : 'files'} attached.`,
        );
        hidePreviewSelectionPopover();
    };
    const removeTextFileAttachment = (attachmentId: string) =>
    {
        privatizationRunIdRef.current += 1;
        setOpenTextFileActionMenuId(null);
        setTextFileAttachments((currentAttachments) =>
        {
            return currentAttachments.filter((attachment) =>
            {
                return attachment.document.id !== attachmentId;
            });
        });
        setIsPrivatizing(false);
        setLocalModelProgress(null);
        setCanUsePrivatizedPrompt(false);
        setSendStatus('');
        setIsPreviewStale(hasPreview || hasPrivatizedTextFileAttachments);
        if (selectedFileAttachmentId === attachmentId)
        {
            setSelectedFileAttachmentId(null);
            setAppView('main');
        }
        hidePreviewSelectionPopover();
    };
    const toggleTextFileAttachmentIncluded = (attachmentId: string) =>
    {
        const attachment = textFileAttachments.find((currentAttachment) =>
        {
            return currentAttachment.document.id === attachmentId;
        });
        const isReinsertingProcessedContent =
            attachment != null &&
            attachment.error == null &&
            !attachment.included &&
            (hasPreview || hasPrivatizedTextFileAttachments);

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setTextFileAttachments((currentAttachments) =>
        {
            return currentAttachments.map((attachment) =>
            {
                if (attachment.document.id !== attachmentId || attachment.error != null)
                {
                    return attachment;
                }

                return {
                    ...attachment,
                    included: !attachment.included,
                };
            });
        });
        setClipboardStatus('');
        setSendStatus('');

        if (isReinsertingProcessedContent)
        {
            setCanUsePrivatizedPrompt(false);
            setIsPreviewStale(true);
        }
    };
    const copyTextFileAttachment = async (attachment: TextFileAttachment) =>
    {
        if (attachment.result == null)
        {
            return;
        }

        try
        {
            await navigator.clipboard.writeText(
                getTextFileAttachmentPreviewText(attachment),
            );
            setClipboardStatus(`Copied sanitized ${attachment.document.fileName}.`);
            setSendStatus('');
        }
        catch
        {
            setClipboardStatus('Could not copy sanitized file text.');
        }
    };
    const downloadTextFileAttachment = (attachment: TextFileAttachment) =>
    {
        if (attachment.result == null)
        {
            return;
        }

        const blob = new Blob([getTextFileAttachmentPreviewText(attachment)], {
            type: attachment.document.mimeType || 'text/plain',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = createPrivatizedFileName(attachment.document.fileName);
        link.click();
        URL.revokeObjectURL(url);
        setClipboardStatus(`Downloaded sanitized ${attachment.document.fileName}.`);
        setSendStatus('');
    };
    const copyTextFileAttachmentFromMenu = async (
        attachment: TextFileAttachment,
    ) =>
    {
        setOpenTextFileActionMenuId(null);
        await copyTextFileAttachment(attachment);
    };
    const downloadTextFileAttachmentFromMenu = (
        attachment: TextFileAttachment,
    ) =>
    {
        setOpenTextFileActionMenuId(null);
        downloadTextFileAttachment(attachment);
    };
    const removeTextFileAttachmentFromMenu = (attachmentId: string) =>
    {
        setOpenTextFileActionMenuId(null);
        removeTextFileAttachment(attachmentId);
    };
    const clearScanDetailSearch = () =>
    {
        setScanDetailSearchText('');
    };
    const updateScanDetailSearchText = (
        event: ReactChangeEvent<HTMLInputElement>,
    ) =>
    {
        setScanDetailSearchText(event.target.value);
    };
    const handleScanDetailSearchKeyDown = (
        event: ReactKeyboardEvent<HTMLInputElement>,
    ) =>
    {
        if (event.key !== 'Escape' || scanDetailSearchText.length === 0)
        {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        clearScanDetailSearch();
    };
    const cycleScanDetailSortDirection = () =>
    {
        setScanDetailSortDirection((currentSortDirection) =>
        {
            return getNextScanDetailSortDirection(currentSortDirection);
        });
    };
    const applyPrivatizedResult = (
        inputText: string,
        result: PrivatizedPromptResult,
    ) =>
    {
        setPreviewTooltip(null);
        hidePreviewSelectionPopover();
        setIgnoredMappingIds([]);
        setScanDetailSortDirection('neutral');
        setScanDetailSearchText('');
        setPrivatizedInputText(inputText);
        setPrivatizedResult(result);
        setResultEnabledCategories({ ...settingsRef.current.enabledCategories });
        setPrivatizedPrompt(result.privatizedPrompt);
        setPreviewSegments(result.segments);
        setCanUsePrivatizedPrompt(result.safeToInject);
        setIsPreviewStale(false);
        setWorkspaceTab('privatized');

        if (appView === 'promptReader')
        {
            setAppView('main');
        }
    };
    const restorePromptMaskingMapping = (maskingMapping: MaskingMapping) =>
    {
        if (privatizedResult == null || ignoredMappingIds.includes(maskingMapping.id))
        {
            return false;
        }

        const nextIgnoredMappingIds = [...ignoredMappingIds, maskingMapping.id];
        let preview: ReturnType<typeof createPrivatizedPromptPreview>;

        try
        {
            preview = createPrivatizedPromptPreview(
                privatizedInputText,
                privatizedResult,
                {
                    ignoredMappingIds: nextIgnoredMappingIds,
                },
            );
        }
        catch
        {
            setClipboardStatus(`Could not restore ${maskingMapping.mask}.`);
            return false;
        }

        setIgnoredMappingIds(nextIgnoredMappingIds);
        setPrivatizedPrompt(preview.privatizedPrompt);
        setPreviewSegments(preview.segments);
        setCanUsePrivatizedPrompt(false);
        return true;
    };
    const restoreTextFileMaskingMapping = (
        attachmentId: string,
        maskingMapping: MaskingMapping,
    ) =>
    {
        const attachment = textFileAttachments.find((currentAttachment) =>
        {
            return currentAttachment.document.id === attachmentId;
        });
        const attachmentMapping = attachment?.result?.maskingMappings.find((mapping) =>
        {
            return mapping.id === maskingMapping.id;
        });

        if (
            attachment == null ||
            attachmentMapping == null ||
            attachment.ignoredMappingIds.includes(attachmentMapping.id)
        )
        {
            return false;
        }

        setTextFileAttachments((currentAttachments) =>
        {
            return currentAttachments.map((currentAttachment) =>
            {
                if (currentAttachment.document.id !== attachmentId)
                {
                    return currentAttachment;
                }

                return {
                    ...currentAttachment,
                    ignoredMappingIds: [
                        ...currentAttachment.ignoredMappingIds,
                        attachmentMapping.id,
                    ],
                };
            });
        });

        return true;
    };
    const restoreBundleMaskingMapping = (maskingMapping: MaskingMapping) =>
    {
        let promptRestored = false;

        if (privatizedResult != null)
        {
            const promptMapping = privatizedResult.maskingMappings.find((mapping) =>
            {
                return isSameMaskingMapping(mapping, maskingMapping);
            });

            if (promptMapping != null)
            {
                promptRestored = restorePromptMaskingMapping(promptMapping);
            }
        }

        const fileRestores = textFileAttachments.flatMap((attachment) =>
        {
            const attachmentMapping = attachment.result?.maskingMappings.find((mapping) =>
            {
                return isSameMaskingMapping(mapping, maskingMapping);
            });

            if (
                attachmentMapping == null ||
                attachment.ignoredMappingIds.includes(attachmentMapping.id)
            )
            {
                return [];
            }

            return [
                {
                    attachmentId: attachment.document.id,
                    mappingId: attachmentMapping.id,
                },
            ];
        });

        if (fileRestores.length > 0)
        {
            setTextFileAttachments((currentAttachments) =>
            {
                return currentAttachments.map((attachment) =>
                {
                    const restoreIds = fileRestores
                        .filter((fileRestore) =>
                        {
                            return fileRestore.attachmentId === attachment.document.id;
                        })
                        .map((fileRestore) =>
                        {
                            return fileRestore.mappingId;
                        });

                    if (restoreIds.length === 0)
                    {
                        return attachment;
                    }

                    return {
                        ...attachment,
                        ignoredMappingIds: [
                            ...attachment.ignoredMappingIds,
                            ...restoreIds,
                        ],
                    };
                });
            });
        }

        if (!promptRestored && fileRestores.length === 0)
        {
            setClipboardStatus(`Could not restore ${maskingMapping.mask}.`);
            return;
        }

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setSendStatus('');
        setClipboardStatus(`${maskingMapping.mask} restored in preview.`);
    };
    const restoreMaskingMappingById = (mappingId: string) =>
    {
        const target = previewTooltip?.target ?? PROMPT_PREVIEW_TARGET;
        const targetAttachment =
            target.kind === 'file'
                ? textFileAttachments.find((attachment) =>
                  {
                      return attachment.document.id === target.attachmentId;
                  }) ?? null
                : null;
        const maskingMapping =
            target.kind === 'file'
                ? targetAttachment?.result?.maskingMappings.find((mapping) =>
                  {
                      return mapping.id === mappingId;
                  }) ?? null
                : privatizedResult?.maskingMappings.find((mapping) =>
                  {
                      return mapping.id === mappingId;
                  }) ?? null;

        if (maskingMapping == null)
        {
            setClipboardStatus('Could not restore masked item.');
            return;
        }

        const restored =
            target.kind === 'file'
                ? restoreTextFileMaskingMapping(target.attachmentId, maskingMapping)
                : restorePromptMaskingMapping(maskingMapping);

        if (!restored)
        {
            setClipboardStatus(`Could not restore ${maskingMapping.mask}.`);
            return;
        }

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setSendStatus('');
        setClipboardStatus(`${maskingMapping.mask} restored in preview.`);
    };
    const preserveIgnoredMappingIds = (
        currentResult: PrivatizedPromptResult,
        nextResult: PrivatizedPromptResult,
        manualCategory: SensitiveItemCategory,
        manualOriginals: readonly string[],
        currentIgnoredMappingIds: readonly string[] = ignoredMappingIds,
    ) =>
    {
        const ignoredMappings = currentResult.maskingMappings.filter((maskingMapping) =>
        {
            return currentIgnoredMappingIds.includes(maskingMapping.id);
        });
        const ignoredItemIds = new Set(
            ignoredMappings.flatMap((maskingMapping) => maskingMapping.itemIds),
        );
        const isIgnoredItemFragment = (itemId: string) =>
        {
            for (const ignoredItemId of ignoredItemIds)
            {
                if (itemId.startsWith(`${ignoredItemId}-fragment-`))
                {
                    return true;
                }
            }

            return false;
        };

        return nextResult.maskingMappings
            .filter((nextMapping) =>
            {
                const isManualOriginal =
                    nextMapping.category === manualCategory &&
                    manualOriginals.includes(nextMapping.original);

                if (isManualOriginal)
                {
                    return false;
                }

                if (nextMapping.itemIds.some(isIgnoredItemFragment))
                {
                    return true;
                }

                return ignoredMappings.some((ignoredMapping) =>
                {
                    return (
                        ignoredMapping.category === nextMapping.category &&
                        ignoredMapping.original === nextMapping.original
                    );
                });
            })
            .map((maskingMapping) =>
            {
                return maskingMapping.id;
            });
    };
    const getManualSelectionOriginals = (
        result: PrivatizedPromptResult,
        category: SensitiveItemCategory,
        selection: PreviewSelectionPopover,
    ) =>
    {
        return result.items
            .filter((item) =>
            {
                return (
                    item.source === 'manual' &&
                    item.category === category &&
                    item.start >= selection.start &&
                    item.end <= selection.end
                );
            })
            .map((item) =>
            {
                return item.value;
            });
    };
    const manuallyPrivatizeFileSelection = (
        category: SensitiveItemCategory,
        selection: PreviewSelectionPopover,
    ) =>
    {
        if (selection.target.kind !== 'file')
        {
            return;
        }

        const attachmentId = selection.target.attachmentId;
        const attachment = textFileAttachments.find((currentAttachment) =>
        {
            return currentAttachment.document.id === attachmentId;
        });

        if (attachment?.result == null)
        {
            return;
        }

        try
        {
            const nextResult = createPrivatizedPromptWithManualItem(
                attachment.document.text,
                attachment.result,
                {
                    category,
                    start: selection.start,
                    end: selection.end,
                },
                {
                    enabledCategories: settings.enabledCategories,
                    preferredMaskingMappings:
                        bundleMaskingMappings.length > 0
                            ? bundleMaskingMappings
                            : attachment.result.maskingMappings,
                },
            );
            const manualOriginals = getManualSelectionOriginals(
                nextResult,
                category,
                selection,
            );
            const nextIgnoredMappingIds = preserveIgnoredMappingIds(
                attachment.result,
                nextResult,
                category,
                manualOriginals,
                attachment.ignoredMappingIds,
            );
            const scanCategory = getPrivacyScanCategory(category);

            createPrivatizedPromptPreview(attachment.document.text, nextResult, {
                ignoredMappingIds: nextIgnoredMappingIds,
            });
            window.getSelection()?.removeAllRanges();
            hidePreviewTooltip();
            hidePreviewSelectionPopover();
            setTextFileAttachments((currentAttachments) =>
            {
                return currentAttachments.map((currentAttachment) =>
                {
                    if (currentAttachment.document.id !== attachment.document.id)
                    {
                        return currentAttachment;
                    }

                    return {
                        ...currentAttachment,
                        result: nextResult,
                        ignoredMappingIds: nextIgnoredMappingIds,
                    };
                });
            });
            setBundleMaskingMappings(
                mergePreferredMaskingMappings(
                    bundleMaskingMappings,
                    nextResult.maskingMappings,
                ),
            );
            setSendStatus('');
            setClipboardStatus(
                `Selected text privatized as ${scanCategory?.label ?? category}.`,
            );
        }
        catch
        {
            setClipboardStatus('Could not privatize selected text.');
        }
    };
    const manuallyPrivatizeSelection = (category: SensitiveItemCategory) =>
    {
        if (
            previewSelectionPopover == null ||
            !isSensitiveItemCategoryEnabled(settings.enabledCategories, category)
        )
        {
            return;
        }

        if (previewSelectionPopover.target.kind === 'file')
        {
            manuallyPrivatizeFileSelection(category, previewSelectionPopover);
            return;
        }

        if (privatizedResult == null)
        {
            return;
        }

        try
        {
            const nextResult = createPrivatizedPromptWithManualItem(
                privatizedInputText,
                privatizedResult,
                {
                    category,
                    start: previewSelectionPopover.start,
                    end: previewSelectionPopover.end,
                },
                {
                    enabledCategories: settings.enabledCategories,
                    preferredMaskingMappings:
                        bundleMaskingMappings.length > 0
                            ? bundleMaskingMappings
                            : privatizedResult.maskingMappings,
                },
            );
            const manualOriginals = getManualSelectionOriginals(
                nextResult,
                category,
                previewSelectionPopover,
            );
            const nextIgnoredMappingIds = preserveIgnoredMappingIds(
                privatizedResult,
                nextResult,
                category,
                manualOriginals,
            );
            const preview = createPrivatizedPromptPreview(
                privatizedInputText,
                nextResult,
                {
                    ignoredMappingIds: nextIgnoredMappingIds,
                },
            );
            const scanCategory = getPrivacyScanCategory(category);

            window.getSelection()?.removeAllRanges();
            hidePreviewTooltip();
            hidePreviewSelectionPopover();
            setPrivatizedResult(nextResult);
            setIgnoredMappingIds(nextIgnoredMappingIds);
            setPrivatizedPrompt(preview.privatizedPrompt);
            setPreviewSegments(preview.segments);
            setBundleMaskingMappings(
                mergePreferredMaskingMappings(
                    bundleMaskingMappings,
                    nextResult.maskingMappings,
                ),
            );
            setCanUsePrivatizedPrompt(
                nextResult.safeToInject && nextIgnoredMappingIds.length === 0,
            );
            setSendStatus('');
            setClipboardStatus(
                `Selected text privatized as ${scanCategory?.label ?? category}.`,
            );
        }
        catch
        {
            setClipboardStatus('Could not privatize selected text.');
        }
    };
    const renderScanDetailRow = (maskingMapping: MaskingMapping) =>
    {
        return (
            <li key={maskingMapping.id} className="scan-detail-row">
                <span className="scan-detail-mask">
                    {maskingMapping.mask}
                </span>
                <span className="scan-detail-original" title={maskingMapping.original}>
                    {maskingMapping.original}
                </span>
                <span className="scan-detail-count">
                    {formatOccurrenceCount(maskingMapping.itemIds.length)}
                </span>
                <button
                    className="scan-detail-restore-button"
                    type="button"
                    title="Restore original text"
                    aria-label={`Restore ${maskingMapping.mask} original text`}
                    onClick={() => restoreBundleMaskingMapping(maskingMapping)}
                >
                    <RotateCcw size={15} aria-hidden="true" />
                </button>
            </li>
        );
    };
    const updateSetting = async <K extends keyof ExtensionSettings>(
        key: K,
        value: ExtensionSettings[K],
    ) =>
    {
        const nextSettings = {
            ...settingsRef.current,
            [key]: value,
        };

        settingsRef.current = nextSettings;
        setSettings(nextSettings);
        setIsSavingSettings(true);
        setSettingsStatus('');

        const savePromise = settingsSavePromiseRef.current
            .catch(() =>
            {
                return undefined;
            })
            .then(() =>
            {
                return saveExtensionSettings(nextSettings);
            });
        settingsSavePromiseRef.current = savePromise;

        try
        {
            await savePromise;

            if (settingsSavePromiseRef.current === savePromise)
            {
                setSettingsStatus('Settings updated.');
            }
        }
        catch
        {
            if (settingsSavePromiseRef.current === savePromise)
            {
                setSettingsStatus('Could not save settings.');
            }
        }
        finally
        {
            if (settingsSavePromiseRef.current === savePromise)
            {
                setIsSavingSettings(false);
            }
        }
    };

    useLayoutEffect(() =>
    {
        syncSurfaceOverflowState();
    });

    useEffect(() =>
    {
        const promptSurface = promptSurfaceRef.current;
        const previewSurface = previewSurfaceRef.current;
        let resizeObserver: ResizeObserver | null = null;

        if (typeof ResizeObserver !== 'undefined')
        {
            resizeObserver = new ResizeObserver(syncSurfaceOverflowState);

            if (promptSurface != null)
            {
                resizeObserver.observe(promptSurface);
            }

            if (previewSurface != null)
            {
                resizeObserver.observe(previewSurface);
            }
        }

        window.addEventListener('resize', syncSurfaceOverflowState);
        syncSurfaceOverflowState();

        return () =>
        {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', syncSurfaceOverflowState);
        };
    }, [appView, workspaceTab]);

    useEffect(() =>
    {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() =>
    {
        if (hasEnabledDetectionCategories)
        {
            return;
        }

        hidePreviewSelectionPopover();
    }, [hasEnabledDetectionCategories]);

    useEffect(() =>
    {
        privatizationRunIdRef.current += 1;
        setIsPrivatizing(false);
        setLocalModelProgress(null);
        setCanUsePrivatizedPrompt(false);
        setSendStatus('');

        if (hasPreview || hasPrivatizedTextFileAttachments)
        {
            setIsPreviewStale(true);
            hidePreviewSelectionPopover();
        }
    }, [
        settings.enabledCategories,
        settings.localModelDetectionEnabled,
        settings.rulesDetectionEnabled,
    ]);

    useEffect(() =>
    {
        if (activeScanCategoryIsDisplayed)
        {
            return;
        }

        setActiveScanCategory(null);
        setScanDetailSearchText('');
    }, [activeScanCategoryIsDisplayed]);

    useEffect(() =>
    {
        if (
            appView !== 'fileReader' ||
            selectedFileAttachmentId == null ||
            selectedTextFileAttachment != null
        )
        {
            return;
        }

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setSelectedFileAttachmentId(null);
        setAppView('main');
    }, [appView, selectedFileAttachmentId, selectedTextFileAttachment]);

    useEffect(() =>
    {
        if (openTextFileActionMenuId == null)
        {
            return;
        }

        const menuAttachmentExists = textFileAttachments.some((attachment) =>
        {
            return attachment.document.id === openTextFileActionMenuId;
        });

        if (!menuAttachmentExists)
        {
            setOpenTextFileActionMenuId(null);
        }
    }, [openTextFileActionMenuId, textFileAttachments]);

    useEffect(() =>
    {
        let isMounted = true;

        const refreshChatTarget = async () =>
        {
            try
            {
                const response = await requestCurrentChatTarget();

                if (isMounted)
                {
                    updateChatTargetState(response);
                }
            }
            catch
            {
                if (isMounted)
                {
                    setChatTargetLabel(AI_CHAT_FALLBACK_LABEL);
                    setHasChatTarget(false);
                }
            }
        };
        const refreshVisibleChatTarget = () =>
        {
            if (document.visibilityState === 'visible')
            {
                void refreshChatTarget();
            }
        };

        void refreshChatTarget();
        const refreshChatTargetInterval = window.setInterval(() =>
        {
            void refreshChatTarget();
        }, 3000);
        window.addEventListener('focus', refreshChatTarget);
        document.addEventListener('visibilitychange', refreshVisibleChatTarget);

        return () =>
        {
            isMounted = false;
            window.clearInterval(refreshChatTargetInterval);
            window.removeEventListener('focus', refreshChatTarget);
            document.removeEventListener('visibilitychange', refreshVisibleChatTarget);
        };
    }, []);

    useEffect(() =>
    {
        let isMounted = true;

        loadExtensionSettings()
            .then((loadedSettings) =>
            {
                if (!isMounted)
                {
                    return;
                }

                settingsRef.current = loadedSettings;
                setSettings(loadedSettings);
            })
            .catch(() =>
            {
                if (!isMounted)
                {
                    return;
                }

                setSettingsStatus('Could not load settings.');
            });

        return () =>
        {
            isMounted = false;
        };
    }, []);

    useEffect(() =>
    {
        return () =>
        {
            if (copyResetTimerRef.current !== undefined)
            {
                window.clearTimeout(copyResetTimerRef.current);
            }

            if (clearResetTimerRef.current !== undefined)
            {
                window.clearTimeout(clearResetTimerRef.current);
            }

            if (previewTooltipHideTimerRef.current !== undefined)
            {
                window.clearTimeout(previewTooltipHideTimerRef.current);
            }

            if (previewSelectionFrameRef.current !== undefined)
            {
                window.cancelAnimationFrame(previewSelectionFrameRef.current);
            }
        };
    }, []);

    useEffect(() =>
    {
        if (previewTooltip == null && previewSelectionPopover == null)
        {
            return;
        }

        const hidePreviewPopovers = () =>
        {
            setPreviewTooltip(null);
            setPreviewSelectionPopover(null);
        };

        window.addEventListener('resize', hidePreviewPopovers);
        window.addEventListener('scroll', hidePreviewPopovers, true);

        return () =>
        {
            window.removeEventListener('resize', hidePreviewPopovers);
            window.removeEventListener('scroll', hidePreviewPopovers, true);
        };
    }, [previewTooltip, previewSelectionPopover]);

    useEffect(() =>
    {
        if (activeScanCategory == null)
        {
            return;
        }

        const closeScanDetailOnEscape = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
            {
                setActiveScanCategory(null);
            }
        };

        window.addEventListener('keydown', closeScanDetailOnEscape);

        return () =>
        {
            window.removeEventListener('keydown', closeScanDetailOnEscape);
        };
    }, [activeScanCategory]);

    useEffect(() =>
    {
        if (openTextFileActionMenuId == null)
        {
            return;
        }

        const closeFileActionMenuOnEscape = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
            {
                setOpenTextFileActionMenuId(null);
            }
        };
        const closeFileActionMenuOnOutsidePointerDown = (event: PointerEvent) =>
        {
            if (!(event.target instanceof Node))
            {
                return;
            }

            if (textFileActionMenuRef.current?.contains(event.target))
            {
                return;
            }

            setOpenTextFileActionMenuId(null);
        };

        window.addEventListener('keydown', closeFileActionMenuOnEscape);
        document.addEventListener(
            'pointerdown',
            closeFileActionMenuOnOutsidePointerDown,
        );

        return () =>
        {
            window.removeEventListener('keydown', closeFileActionMenuOnEscape);
            document.removeEventListener(
                'pointerdown',
                closeFileActionMenuOnOutsidePointerDown,
            );
        };
    }, [openTextFileActionMenuId]);

    useEffect(() =>
    {
        if (previewSelectionPopover == null)
        {
            return;
        }

        const closePreviewSelectionPopoverOnEscape = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
            {
                hidePreviewSelectionPopover();
            }
        };

        window.addEventListener('keydown', closePreviewSelectionPopoverOnEscape);

        return () =>
        {
            window.removeEventListener('keydown', closePreviewSelectionPopoverOnEscape);
        };
    }, [previewSelectionPopover]);

    useEffect(() =>
    {
        if (previewSelectionPopover == null)
        {
            return;
        }

        let selectionFrame: number | undefined;
        const closePreviewSelectionPopoverOnInvalidSelection = () =>
        {
            if (selectionFrame !== undefined)
            {
                window.cancelAnimationFrame(selectionFrame);
            }

            selectionFrame = window.requestAnimationFrame(() =>
            {
                selectionFrame = undefined;
                const previewContext = getActivePreviewContext();

                if (
                    getPreviewSelectionPopover(
                        window.getSelection(),
                        previewRef.current,
                        previewContext.inputText,
                        previewContext.target,
                    ) == null
                )
                {
                    hidePreviewSelectionPopover();
                }
            });
        };
        const closePreviewSelectionPopoverOnOutsidePointerDown = (event: PointerEvent) =>
        {
            if (!(event.target instanceof Node))
            {
                return;
            }

            if (
                previewSelectionPopoverRef.current?.contains(event.target) ||
                previewRef.current?.contains(event.target)
            )
            {
                return;
            }

            hidePreviewSelectionPopover();
        };

        document.addEventListener(
            'selectionchange',
            closePreviewSelectionPopoverOnInvalidSelection,
        );
        document.addEventListener(
            'pointerdown',
            closePreviewSelectionPopoverOnOutsidePointerDown,
        );

        return () =>
        {
            document.removeEventListener(
                'selectionchange',
                closePreviewSelectionPopoverOnInvalidSelection,
            );
            document.removeEventListener(
                'pointerdown',
                closePreviewSelectionPopoverOnOutsidePointerDown,
            );

            if (selectionFrame !== undefined)
            {
                window.cancelAnimationFrame(selectionFrame);
            }
        };
    }, [previewSelectionPopover, privatizedInputText, selectedTextFileAttachment]);

    useLayoutEffect(() =>
    {
        if (previewTooltip == null || previewTooltipRef.current == null)
        {
            return;
        }

        const tooltipRect = getPreviewTooltipRect(
            previewTooltipRef.current.getBoundingClientRect(),
        );
        const left = getClampedPreviewTooltipLeft(
            previewTooltip.anchorLeft,
            tooltipRect.width,
        );
        const arrowLeft = getClampedPreviewTooltipArrowLeft(
            previewTooltip.anchorLeft,
            left,
            tooltipRect.width,
        );
        const bridge = getPreviewTooltipBridge(
            previewTooltip.anchorRect,
            tooltipRect,
            previewTooltip.placement,
        );

        if (
            Math.abs(left - previewTooltip.left) < 0.5 &&
            Math.abs(arrowLeft - previewTooltip.arrowLeft) < 0.5 &&
            isSamePreviewTooltipBridge(bridge, previewTooltip.bridge)
        )
        {
            return;
        }

        setPreviewTooltip({
            ...previewTooltip,
            left,
            arrowLeft,
            bridge,
        });
    }, [previewTooltip]);

    useLayoutEffect(() =>
    {
        if (
            previewSelectionPopover == null ||
            previewSelectionPopoverRef.current == null
        )
        {
            return;
        }

        const popoverRect = getPreviewTooltipRect(
            previewSelectionPopoverRef.current.getBoundingClientRect(),
        );
        const left = getClampedPreviewTooltipLeft(
            previewSelectionPopover.anchorLeft,
            popoverRect.width,
        );
        const arrowLeft = getClampedPreviewTooltipArrowLeft(
            previewSelectionPopover.anchorLeft,
            left,
            popoverRect.width,
        );

        if (
            Math.abs(left - previewSelectionPopover.left) < 0.5 &&
            Math.abs(arrowLeft - previewSelectionPopover.arrowLeft) < 0.5
        )
        {
            return;
        }

        setPreviewSelectionPopover({
            ...previewSelectionPopover,
            left,
            arrowLeft,
        });
    }, [previewSelectionPopover]);

    const createPrivatizedBundle = async (
        inputText: string,
        attachments: readonly TextFileAttachment[],
        useLocalModelDetection: boolean,
        onLocalModelProgress?: (progress: LocalModelProgress) => void,
    ) =>
    {
        let preferredMaskingMappings: MaskingMapping[] = [];
        const benchmarks: PrivacyBenchmark[] = [];
        const collectBenchmark = (benchmark: PrivacyBenchmark) =>
        {
            benchmarks.push(benchmark);
        };
        let promptResult: PrivatizedPromptResult | null = null;

        if (inputText.trim().length > 0)
        {
            promptResult = await createPrivatizedPromptAsync(inputText, {
                useLocalModelDetection,
                useRulesDetection: settings.rulesDetectionEnabled,
                enabledCategories: settings.enabledCategories,
                preferredMaskingMappings,
                onLocalModelProgress,
                onBenchmark: collectBenchmark,
            });
            preferredMaskingMappings = mergePreferredMaskingMappings(
                preferredMaskingMappings,
                promptResult.maskingMappings,
            );
        }

        const nextAttachments: TextFileAttachment[] = [];

        for (const attachment of attachments)
        {
            if (!attachment.included)
            {
                nextAttachments.push(attachment);
                continue;
            }

            if (attachment.error != null || attachment.document.text.trim().length === 0)
            {
                nextAttachments.push({
                    ...attachment,
                    result: null,
                    ignoredMappingIds: [],
                });
                continue;
            }

            const attachmentResult = await createPrivatizedPromptAsync(
                attachment.document.text,
                {
                    useLocalModelDetection,
                    useRulesDetection: settings.rulesDetectionEnabled,
                    enabledCategories: settings.enabledCategories,
                    preferredMaskingMappings,
                    onLocalModelProgress,
                    onBenchmark: collectBenchmark,
                },
            );

            preferredMaskingMappings = mergePreferredMaskingMappings(
                preferredMaskingMappings,
                attachmentResult.maskingMappings,
            );
            nextAttachments.push({
                ...attachment,
                result: attachmentResult,
                ignoredMappingIds: [],
            });
        }

        return {
            promptResult,
            attachments: nextAttachments,
            maskingMappings: preferredMaskingMappings,
            benchmark: combinePrivacyBenchmarks(benchmarks),
        };
    };

    const makeBundleUnsafe = (
        promptResult: PrivatizedPromptResult | null,
        attachments: readonly TextFileAttachment[],
    ) =>
    {
        return {
            promptResult:
                promptResult == null
                    ? null
                    : {
                          ...promptResult,
                          safeToInject: false,
                      },
            attachments: attachments.map((attachment) =>
            {
                if (!attachment.included)
                {
                    return attachment;
                }

                return {
                    ...attachment,
                    result:
                        attachment.result == null
                            ? null
                            : {
                                  ...attachment.result,
                                  safeToInject: false,
                              },
                };
            }),
        };
    };

    const applyPrivatizedBundle = (
        inputText: string,
        promptResult: PrivatizedPromptResult | null,
        attachments: readonly TextFileAttachment[],
    ) =>
    {
        setTextFileAttachments([...attachments]);

        if (promptResult == null)
        {
            setPreviewTooltip(null);
            hidePreviewSelectionPopover();
            setIgnoredMappingIds([]);
            setScanDetailSortDirection('neutral');
            setScanDetailSearchText('');
            setPrivatizedInputText(inputText);
            setPrivatizedResult(null);
            setResultEnabledCategories({ ...settingsRef.current.enabledCategories });
            setPrivatizedPrompt('');
            setPreviewSegments([]);
            setCanUsePrivatizedPrompt(true);
            setIsPreviewStale(false);
            setWorkspaceTab('privatized');

            if (appView === 'promptReader')
            {
                setAppView('main');
            }

            return;
        }

        applyPrivatizedResult(inputText, promptResult);
    };

    const applyUnsafeRulesOnlyFallback = async (
        inputText: string,
        attachments: readonly TextFileAttachment[],
        runId: number,
        error: unknown,
    ): Promise<UnsafeRulesOnlyFallbackOutcome> =>
    {
        const failureSummary = getLocalModelFailureSummary(error);
        const failureStatus = getLocalModelFailureStatus(error);

        if (privatizationRunIdRef.current !== runId)
        {
            return 'stale';
        }

        if (!settings.rulesDetectionEnabled)
        {
            setLocalModelProgress(null);
            setClipboardStatus(`${failureSummary} Rules fallback is disabled.`);
            setCanUsePrivatizedPrompt(false);
            return 'disabled';
        }

        setLocalModelProgress({
            phase: 'postprocess',
            label: LOCAL_MODEL_FALLBACK_PROGRESS_LABEL,
        });

        try
        {
            const fallbackBundle = await createPrivatizedBundle(
                inputText,
                attachments,
                false,
            );

            if (privatizationRunIdRef.current !== runId)
            {
                return 'stale';
            }

            const unsafeBundle = makeBundleUnsafe(
                fallbackBundle.promptResult,
                fallbackBundle.attachments,
            );

            applyPrivatizedBundle(
                inputText,
                unsafeBundle.promptResult,
                unsafeBundle.attachments,
            );
            setBundleMaskingMappings(fallbackBundle.maskingMappings);
            setLatestBenchmark(fallbackBundle.benchmark);
            setLocalModelProgress(null);
            setClipboardStatus(failureStatus);
            return 'applied';
        }
        catch
        {
            if (privatizationRunIdRef.current !== runId)
            {
                return 'stale';
            }

            setLocalModelProgress(null);
            setClipboardStatus(
                `${failureSummary} Could not create rules-only fallback.`,
            );
            setCanUsePrivatizedPrompt(false);
            return 'failed';
        }
    };

    const privatizePrompt = async () =>
    {
        if (
            !hasPrivatizableInput ||
            isPrivatizing ||
            !hasEnabledDetectionSources ||
            !hasEnabledDetectionCategories
        )
        {
            return;
        }

        const inputText = prompt;
        const inputAttachments = textFileAttachments;
        const runId = privatizationRunIdRef.current + 1;
        const updateRunLocalModelProgress = (progress: LocalModelProgress) =>
        {
            if (privatizationRunIdRef.current === runId)
            {
                setLocalModelProgress(progress);
            }
        };

        privatizationRunIdRef.current = runId;
        setIsPrivatizing(true);
        setCanUsePrivatizedPrompt(false);
        setClipboardStatus('');
        setSendStatus('');

        if (settings.localModelDetectionEnabled)
        {
            setLocalModelProgress({
                phase: 'permission',
                label: 'Requesting model download permission.',
            });
        }
        else
        {
            setLocalModelProgress(null);
        }

        try
        {
            if (settings.localModelDetectionEnabled)
            {
                const hasPermission = await requestModelDownloadPermission();

                if (!hasPermission)
                {
                    throw new Error('Model download permission was not granted.');
                }
            }

            const bundle = await createPrivatizedBundle(
                inputText,
                inputAttachments,
                settings.localModelDetectionEnabled,
                settings.localModelDetectionEnabled
                    ? updateRunLocalModelProgress
                    : undefined,
            );

            if (privatizationRunIdRef.current !== runId)
            {
                return;
            }

            applyPrivatizedBundle(
                inputText,
                bundle.promptResult,
                bundle.attachments,
            );
            setBundleMaskingMappings(bundle.maskingMappings);
            setLatestBenchmark(bundle.benchmark);

            if (settings.localModelDetectionEnabled)
            {
                setLocalModelProgress({
                    phase: 'done',
                    label: 'Privatized output ready.',
                    progress: 100,
                });
            }

            const safeToInject =
                (bundle.promptResult?.safeToInject ?? true) &&
                bundle.attachments.every((attachment) =>
                {
                    return (
                        !attachment.included ||
                        (attachment.result?.safeToInject ?? true)
                    );
                });

            if (!safeToInject)
            {
                setClipboardStatus('Preview only. Sending is disabled.');
                return;
            }

            setClipboardStatus('');
        }
        catch (error)
        {
            if (privatizationRunIdRef.current !== runId)
            {
                return;
            }

            if (settings.localModelDetectionEnabled)
            {
                const fallbackOutcome = await applyUnsafeRulesOnlyFallback(
                    inputText,
                    inputAttachments,
                    runId,
                    error,
                );

                if (fallbackOutcome === 'stale')
                {
                    return;
                }

                return;
            }

            setClipboardStatus('Could not privatize prompt.');
        }
        finally
        {
            if (privatizationRunIdRef.current === runId)
            {
                setIsPrivatizing(false);
            }
        }
    };

    const clearPrompts = () =>
    {
        privatizationRunIdRef.current += 1;
        setPrompt('');
        setPrivatizedPrompt('');
        setPrivatizedInputText('');
        setPrivatizedResult(null);
        setResultEnabledCategories(null);
        setTextFileAttachments([]);
        setBundleMaskingMappings([]);
        setPreviewSegments([]);
        setPreviewTooltip(null);
        setPreviewSelectionPopover(null);
        setIgnoredMappingIds([]);
        setActiveScanCategory(null);
        setScanDetailSortDirection('neutral');
        setScanDetailSearchText('');
        setCanUsePrivatizedPrompt(false);
        setIsPreviewStale(false);
        setIsPrivatizing(false);
        setLocalModelProgress(null);
        setLatestBenchmark(null);
        setDiagnosticsExpanded(false);
        setClipboardStatus('');
        setSendStatus('');
        setCopied(false);
        setCleared(true);
        setWorkspaceTab('prompt');

        if (copyResetTimerRef.current !== undefined)
        {
            window.clearTimeout(copyResetTimerRef.current);
            copyResetTimerRef.current = undefined;
        }

        if (clearResetTimerRef.current !== undefined)
        {
            window.clearTimeout(clearResetTimerRef.current);
        }

        clearResetTimerRef.current = window.setTimeout(() =>
        {
            setCleared(false);
            clearResetTimerRef.current = undefined;
        }, ACTION_FEEDBACK_MS);
    };

    const copyPrivatizedPrompt = async () =>
    {
        if (copyPrivatizedPromptDisabled)
        {
            return;
        }

        try
        {
            await navigator.clipboard.writeText(composedPrivatizedOutput);
            setCopied(true);
            setClipboardStatus('');
            setSendStatus('');

            if (copyResetTimerRef.current !== undefined)
            {
                window.clearTimeout(copyResetTimerRef.current);
            }

            copyResetTimerRef.current = window.setTimeout(() =>
            {
                setCopied(false);
                copyResetTimerRef.current = undefined;
            }, ACTION_FEEDBACK_MS);
        }
        catch
        {
            setClipboardStatus('Could not copy privatized prompt.');
        }
    };

    const sendToAiChat = async () =>
    {
        if (
            !hasPrivatizedOutput ||
            !canUsePrivatizedOutput ||
            isPreviewStale ||
            !hasChatTarget
        )
        {
            return;
        }

        try
        {
            setClipboardStatus('');
            const promptText = prependPromptHeader(
                composedPrivatizedOutput,
                settingsRef.current,
            );
            const response = (await browser.runtime.sendMessage({
                type: INJECT_PROMPT_MESSAGE,
                text: promptText,
            })) as RuntimeResponse | undefined;
            updateChatTargetState(response);

            if (response?.ok)
            {
                setSendStatus(`Sent to ${response.providerLabel ?? chatTargetLabel}.`);
                return;
            }

            setSendStatus(response?.error ?? 'Could not send to the AI chat page.');
        }
        catch (error)
        {
            const message =
                error instanceof Error ? error.message : 'Could not send to the AI chat page.';
            setSendStatus(message);
        }
    };

    const openPromptReaderView = () =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setAppView('promptReader');
    };

    const closePromptReaderView = () =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setWorkspaceTab('prompt');
        setAppView('main');
    };

    const openReaderView = () =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setAppView('reader');
    };

    const closeReaderView = () =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setAppView('main');
    };
    const openFileReaderView = (attachment: TextFileAttachment) =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setOpenTextFileActionMenuId(null);
        setSelectedFileAttachmentId(attachment.document.id);
        setFileReaderTab(attachment.result == null ? 'original' : 'privatized');
        setAppView('fileReader');
    };
    const closeFileReaderView = () =>
    {
        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setSelectedFileAttachmentId(null);
        setAppView('main');
    };
    const selectFileReaderTab = (tab: FileReaderTab) =>
    {
        if (tab === fileReaderTab)
        {
            return;
        }

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setFileReaderTab(tab);
    };
    const getTextFileAttachmentStatusText = (attachment: TextFileAttachment) =>
    {
        if (attachment.error != null)
        {
            return attachment.error;
        }

        if (!attachment.included)
        {
            return 'Excluded';
        }

        if (attachment.result == null)
        {
            return 'Ready for Privatize';
        }

        if (isPreviewStale)
        {
            return 'Needs refresh';
        }

        const itemCount = getTextFileAttachmentItemCount(attachment);
        const itemLabel = itemCount === 1 ? 'item' : 'items';
        const previewOnlyLabel =
            attachment.result.safeToInject && attachment.ignoredMappingIds.length === 0
                ? ''
                : ' / preview only';

        return `${formatCount(itemCount)} ${itemLabel} masked${previewOnlyLabel}`;
    };
    const renderTextFileCategorySummaries = (
        attachment: TextFileAttachment,
        className: string,
    ) =>
    {
        const summaries = getTextFileAttachmentCategorySummaries(attachment);
        const visibleSummaries = getVisibleTextFileCategorySummaries(summaries);
        const remainingCount = summaries.length - visibleSummaries.length;

        if (visibleSummaries.length === 0)
        {
            return null;
        }

        return (
            <div className={className} aria-label="Masked file item summary">
                {visibleSummaries.map((summary) =>
                {
                    const categoryInfo = PRIVACY_SCAN_CATEGORIES.find(
                        ({ category }) =>
                        {
                            return category === summary.category;
                        },
                    );
                    const Icon = categoryInfo?.Icon;

                    return (
                        <span
                            key={summary.category}
                            className="text-file-category-chip"
                            style={getCategoryColorStyle(summary.category)}
                            title={`${summary.label}: ${formatCount(summary.count)}`}
                            aria-label={`${summary.label}: ${formatCount(summary.count)}`}
                        >
                            {Icon != null ? (
                                <Icon size={12} aria-hidden="true" />
                            ) : null}
                            <span>{formatCount(summary.count)}</span>
                        </span>
                    );
                })}
                {remainingCount > 0 ? (
                    <span
                        className="text-file-category-chip is-muted"
                        title={`${formatCount(remainingCount)} more categories`}
                        aria-label={`${formatCount(remainingCount)} more categories`}
                    >
                        +{remainingCount}
                    </span>
                ) : null}
            </div>
        );
    };
    const renderTextFileAttachment = (
        attachment: TextFileAttachment,
        index: number,
    ) =>
    {
        const lineCount = getTextFileAttachmentLineCount(attachment);
        const statusText = getTextFileAttachmentStatusText(attachment);
        const actionMenuId =
            `text-file-action-menu-${attachment.document.id}`;
        const isActionMenuOpen =
            openTextFileActionMenuId === attachment.document.id;
        const resultActionDisabled = attachment.result == null || isPreviewStale;

        return (
            <li
                key={attachment.document.id}
                className={`text-file-card${attachment.error != null ? ' is-error' : ''}${attachment.result != null ? ' is-processed' : ''}${!attachment.included ? ' is-excluded' : ''}`}
            >
                <div className="text-file-card-main">
                    {attachment.error == null ? (
                        <button
                            className="text-file-toggle-button"
                            type="button"
                            role="switch"
                            aria-checked={attachment.included}
                            title={
                                attachment.included
                                    ? 'Included in copied and sent output'
                                    : 'Excluded from copied and sent output'
                            }
                            aria-label={`Include ${attachment.document.fileName} in copied and sent output`}
                            onClick={() =>
                                toggleTextFileAttachmentIncluded(
                                    attachment.document.id,
                                )
                            }
                        >
                            <FileText size={16} aria-hidden="true" />
                            <span className="text-file-toggle-badge">
                                {attachment.included ? (
                                    <Check size={10} aria-hidden="true" />
                                ) : (
                                    <X size={10} aria-hidden="true" />
                                )}
                            </span>
                        </button>
                    ) : (
                        <span className="text-file-static-icon">
                            <FileText size={16} aria-hidden="true" />
                        </span>
                    )}
                    <div className="text-file-card-copy">
                        <span
                            className="text-file-card-name"
                            title={attachment.document.fileName}
                        >
                            {attachment.document.fileName}
                        </span>
                        <span className="text-file-card-meta">
                            {getTextFileAttachmentLabel(attachment, index)} /{' '}
                            {formatTextFileSize(attachment.document.size)} /{' '}
                            {formatCount(lineCount)}{' '}
                            {lineCount === 1 ? 'line' : 'lines'}
                        </span>
                    </div>
                    <div className="text-file-card-result-actions">
                        <div
                            className="text-file-action-menu"
                            ref={
                                isActionMenuOpen
                                    ? textFileActionMenuRef
                                    : undefined
                            }
                        >
                            <button
                                className={`subtle-icon-button text-file-more-button${isActionMenuOpen ? ' is-active' : ''}`}
                                type="button"
                                title="More file actions"
                                aria-label={`More actions for ${attachment.document.fileName}`}
                                aria-haspopup="menu"
                                aria-expanded={isActionMenuOpen}
                                aria-controls={
                                    isActionMenuOpen ? actionMenuId : undefined
                                }
                                onClick={() =>
                                    setOpenTextFileActionMenuId(
                                        isActionMenuOpen
                                            ? null
                                            : attachment.document.id,
                                    )
                                }
                            >
                                <MoreHorizontal size={15} aria-hidden="true" />
                            </button>
                            {isActionMenuOpen ? (
                                <div
                                    id={actionMenuId}
                                    className="text-file-action-menu-popover"
                                    role="menu"
                                >
                                    <button
                                        className="text-file-action-menu-item"
                                        type="button"
                                        role="menuitem"
                                        title={
                                            attachment.error == null
                                                ? 'Review file'
                                                : 'File could not be reviewed'
                                        }
                                        disabled={attachment.error != null}
                                        onClick={() => openFileReaderView(attachment)}
                                    >
                                        <Eye size={15} aria-hidden="true" />
                                        <span>Review</span>
                                    </button>
                                    <button
                                        className="text-file-action-menu-item"
                                        type="button"
                                        role="menuitem"
                                        title={
                                            resultActionDisabled
                                                ? 'Run Privatize before copying this file'
                                                : 'Copy sanitized file text'
                                        }
                                        disabled={resultActionDisabled}
                                        onClick={() =>
                                        {
                                            void copyTextFileAttachmentFromMenu(
                                                attachment,
                                            );
                                        }}
                                    >
                                        <Copy size={15} aria-hidden="true" />
                                        <span>Copy</span>
                                    </button>
                                    <button
                                        className="text-file-action-menu-item"
                                        type="button"
                                        role="menuitem"
                                        title={
                                            resultActionDisabled
                                                ? 'Run Privatize before downloading this file'
                                                : 'Download sanitized file'
                                        }
                                        disabled={resultActionDisabled}
                                        onClick={() =>
                                            downloadTextFileAttachmentFromMenu(
                                                attachment,
                                            )
                                        }
                                    >
                                        <Download size={15} aria-hidden="true" />
                                        <span>Download</span>
                                    </button>
                                    <span
                                        className="text-file-action-menu-divider"
                                        aria-hidden="true"
                                    />
                                    <button
                                        className="text-file-action-menu-item is-danger"
                                        type="button"
                                        role="menuitem"
                                        title={
                                            isPrivatizing
                                                ? 'Wait until Privatize finishes'
                                                : 'Remove file'
                                        }
                                        disabled={isPrivatizing}
                                        onClick={() =>
                                            removeTextFileAttachmentFromMenu(
                                                attachment.document.id,
                                            )
                                        }
                                    >
                                        <Trash2 size={15} aria-hidden="true" />
                                        <span>Remove</span>
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className="text-file-card-actions">
                    <span className="text-file-card-status">{statusText}</span>
                </div>
                {renderTextFileCategorySummaries(
                    attachment,
                    'text-file-card-summary',
                )}
                {attachment.document.warnings.length > 0 ? (
                    <ul className="text-file-card-warnings">
                        {attachment.document.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                ) : null}
            </li>
        );
    };
    const renderTextFileAttachments = (showAttachButton: boolean) =>
    {
        if (!showAttachButton && textFileAttachments.length === 0)
        {
            return null;
        }

        return (
            <div className="text-file-attachments">
                <div className="text-file-attachments-header">
                    <span className="label-with-icon text-file-attachments-title">
                        <Paperclip size={15} aria-hidden="true" />
                        <span>Attached files</span>
                        {showAttachButton ? (
                            <span className="text-file-help">
                                <button
                                    className="text-file-help-button"
                                    type="button"
                                    aria-label="Show supported file types"
                                    aria-describedby={TEXT_FILE_HELP_ID}
                                >
                                    <FileQuestion size={14} aria-hidden="true" />
                                </button>
                                <span
                                    id={TEXT_FILE_HELP_ID}
                                    className="text-file-help-tooltip"
                                    role="tooltip"
                                >
                                    <span className="text-file-help-title">
                                        Supported files
                                    </span>
                                    <span className="text-file-help-row">
                                        <span>Extensions</span>
                                        <span>
                                            {SUPPORTED_TEXT_FILE_EXTENSION_LABEL}
                                        </span>
                                    </span>
                                    <span className="text-file-help-row">
                                        <span>Max size</span>
                                        <span>
                                            {formatTextFileSize(MAX_TEXT_FILE_BYTES)}
                                        </span>
                                    </span>
                                </span>
                            </span>
                        ) : null}
                    </span>
                    {showAttachButton ? (
                        <>
                            <input
                                ref={textFileInputRef}
                                type="file"
                                multiple
                                hidden
                                accept={SUPPORTED_TEXT_FILE_ACCEPT}
                                onChange={handleTextFileInputChange}
                            />
                            <button
                                className="ghost-button text-file-attach-button"
                                type="button"
                                onClick={openTextFileInput}
                                disabled={isPrivatizing}
                            >
                                <Upload size={15} aria-hidden="true" />
                                Add file
                            </button>
                        </>
                    ) : null}
                </div>
                {textFileAttachments.length > 0 ? (
                    <ul className="text-file-list">
                        {textFileAttachments.map(renderTextFileAttachment)}
                    </ul>
                ) : (
                    <p className="text-file-empty">
                        Text files are processed separately and share the same aliases.
                    </p>
                )}
            </div>
        );
    };
    const getOutgoingFileStatus = (attachment: TextFileAttachment) =>
    {
        if (attachment.error != null)
        {
            return {
                label: 'Unsupported',
                className: 'is-error',
            };
        }

        if (!attachment.included)
        {
            return {
                label: 'Excluded',
                className: 'is-excluded',
            };
        }

        if (attachment.result == null)
        {
            return {
                label: 'Needs Privatize',
                className: 'is-warning',
            };
        }

        if (isPreviewStale)
        {
            return {
                label: 'Needs refresh',
                className: 'is-warning',
            };
        }

        if (!attachment.result.safeToInject || attachment.ignoredMappingIds.length > 0)
        {
            return {
                label: 'Preview only',
                className: 'is-warning',
            };
        }

        return {
            label: 'Included',
            className: 'is-included',
        };
    };
    const renderOutgoingContentSummary = () =>
    {
        if (!hasOutgoingContentSummary)
        {
            return null;
        }

        const includedPartCount =
            (privatizedPrompt.trim().length > 0 ? 1 : 0) +
            textFileAttachments.filter((attachment) =>
            {
                return attachment.included && attachment.result != null;
            }).length;

        return (
            <div className="outgoing-summary" aria-label="Outgoing content summary">
                <div className="outgoing-summary-header">
                    <span className="label-with-icon">
                        <Send size={15} aria-hidden="true" />
                        <span>Outgoing content</span>
                    </span>
                    <span>
                        {formatCount(includedPartCount)}{' '}
                        {includedPartCount === 1 ? 'part' : 'parts'}
                    </span>
                </div>
                <ul className="outgoing-summary-list">
                    {prompt.trim().length > 0 || privatizedPrompt.trim().length > 0 ? (
                        <li className="outgoing-summary-row">
                            <span className="outgoing-summary-name">Prompt</span>
                            <span
                                className={`outgoing-summary-status${
                                    privatizedPrompt.trim().length > 0 &&
                                    !isPreviewStale &&
                                    canUsePrivatizedPrompt
                                        ? ' is-included'
                                        : ' is-warning'
                                }`}
                            >
                                {privatizedPrompt.trim().length > 0 &&
                                !isPreviewStale &&
                                canUsePrivatizedPrompt
                                    ? 'Included'
                                    : privatizedPrompt.trim().length > 0 &&
                                        !isPreviewStale
                                      ? 'Preview only'
                                      : 'Needs Privatize'}
                            </span>
                        </li>
                    ) : null}
                    {textFileAttachments.map((attachment) =>
                    {
                        const status = getOutgoingFileStatus(attachment);

                        return (
                            <li
                                key={attachment.document.id}
                                className="outgoing-summary-row"
                            >
                                <span
                                    className="outgoing-summary-name"
                                    title={attachment.document.fileName}
                                >
                                    {attachment.document.fileName}
                                </span>
                                <span
                                    className={`outgoing-summary-status ${status.className}`}
                                >
                                    {status.label}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    const renderPromptSurface = (variant: 'compact' | 'reader') =>
    {
        const hasExpandableOverflow =
            variant === 'compact' && promptSurfaceHasOverflow;

        return (
            <div
                className={`prompt-input-shell${
                    hasExpandableOverflow ? ' has-expand-button' : ''
                }`}
            >
                <textarea
                    id={variant === 'compact' ? 'original-prompt' : 'original-prompt-reader'}
                    ref={variant === 'compact' ? promptSurfaceRef : undefined}
                    className={`prompt-input${
                        variant === 'reader' ? ' prompt-input-reader' : ''
                    }`}
                    value={prompt}
                    onChange={updatePrompt}
                    placeholder="Type or paste your prompt here..."
                    spellCheck="true"
                />
                {hasExpandableOverflow ? (
                    <button
                        className="preview-expand-button"
                        type="button"
                        title="Open expanded prompt"
                        aria-label="Open expanded prompt"
                        onClick={openPromptReaderView}
                    >
                        <Maximize2 size={15} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
        );
    };

    const renderPreviewSurface = (
        variant: 'compact' | 'reader',
        content = previewContent,
        hasSurfaceContent = privatizedPrompt.length > 0,
        isSurfaceStale = isPreviewStale,
        onExpand: (() => void) | null = openReaderView,
    ) =>
    {
        const hasExpandableOverflow =
            variant === 'compact' &&
            hasSurfaceContent &&
            onExpand != null &&
            previewSurfaceHasOverflow;

        return (
            <>
                <div
                    className={`preview-shell${
                        hasExpandableOverflow ? ' has-expand-button' : ''
                    }`}
                >
                    <div
                        ref={(element) =>
                        {
                            previewRef.current = element;

                            if (variant === 'compact')
                            {
                                previewSurfaceRef.current = element;
                            }
                        }}
                        className={`preview${
                            variant === 'reader' ? ' preview-reader' : ''
                        }${isSurfaceStale ? ' is-stale' : ''}`}
                        aria-live="polite"
                        onPointerUp={schedulePreviewSelectionPopover}
                        onKeyUp={schedulePreviewSelectionPopover}
                    >
                        {content}
                    </div>
                    {hasExpandableOverflow ? (
                        <button
                            className="preview-expand-button"
                            type="button"
                            title="Open expanded preview"
                            aria-label="Open expanded preview"
                            onClick={onExpand}
                        >
                            <Maximize2 size={15} aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
                {previewTooltip != null ? (
                    <>
                        {previewTooltip.bridge != null ? (
                            <div
                                className="preview-tooltip-bridge"
                                style={{
                                    left: previewTooltip.bridge.left,
                                    top: previewTooltip.bridge.top,
                                    width: previewTooltip.bridge.width,
                                    height: previewTooltip.bridge.height,
                                }}
                                aria-hidden="true"
                                onPointerEnter={clearPreviewTooltipHideTimer}
                                onPointerLeave={queueHidePreviewTooltip}
                            />
                        ) : null}
                        <div
                            ref={previewTooltipRef}
                            className={`preview-tooltip preview-tooltip-${previewTooltip.placement}`}
                            style={{
                                left: previewTooltip.left,
                                top: previewTooltip.top,
                                '--preview-tooltip-arrow-left': `${previewTooltip.arrowLeft}px`,
                            } as CSSProperties}
                            role="dialog"
                            aria-label={`${previewTooltip.mask} original text`}
                            onPointerEnter={clearPreviewTooltipHideTimer}
                            onPointerLeave={queueHidePreviewTooltip}
                            onFocus={clearPreviewTooltipHideTimer}
                            onBlur={queueHidePreviewTooltip}
                            onKeyDown={(event) =>
                            {
                                if (event.key === 'Escape')
                                {
                                    event.preventDefault();
                                    hidePreviewTooltip();
                                }
                            }}
                        >
                            <div className="preview-tooltip-content">
                                <div className="preview-tooltip-row">
                                    <div className="preview-tooltip-text">
                                        {previewTooltip.text}
                                    </div>
                                    {previewTooltipMapping != null ? (
                                        <div className="preview-tooltip-meta">
                                            <span className="preview-tooltip-count">
                                                {formatCount(
                                                    previewTooltipMapping.itemIds.length,
                                                )}
                                                x
                                            </span>
                                        </div>
                                    ) : null}
                                    <button
                                        className="preview-tooltip-restore-button"
                                        type="button"
                                        title="Restore original text"
                                        aria-label={`Restore ${previewTooltip.mask} original text`}
                                        onClick={() =>
                                            restoreMaskingMappingById(
                                                previewTooltip.mappingId,
                                            )
                                        }
                                    >
                                        <RotateCcw size={15} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
                {previewSelectionPopover != null ? (
                    <div
                        ref={previewSelectionPopoverRef}
                        className={`preview-tooltip preview-selection-popover preview-tooltip-${previewSelectionPopover.placement}`}
                        style={{
                            left: previewSelectionPopover.left,
                            top: previewSelectionPopover.top,
                            '--preview-tooltip-arrow-left': `${previewSelectionPopover.arrowLeft}px`,
                        } as CSSProperties}
                        role="dialog"
                        aria-label="Privatize selected text"
                    >
                        <div className="preview-tooltip-content preview-selection-content">
                            <div className="preview-selection-title">
                                Privatize as...
                            </div>
                            <div className="preview-selection-grid">
                                {enabledPrivacyScanCategories.map(
                                    ({ category, label, Icon }) => (
                                        <button
                                            key={category}
                                            className="preview-selection-category-button"
                                            style={getCategoryColorStyle(category)}
                                            type="button"
                                            title={`Privatize as ${label.toLowerCase()}`}
                                            aria-label={`Privatize selected text as ${label.toLowerCase()}`}
                                            onMouseDown={(event) =>
                                                event.preventDefault()
                                            }
                                            onClick={() =>
                                                manuallyPrivatizeSelection(category)
                                            }
                                        >
                                            <Icon size={15} aria-hidden="true" />
                                        </button>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </>
        );
    };

    if (appView === 'promptReader')
    {
        return (
            <main
                className={`app-shell reader-shell${
                    settings.darkModeEnabled ? ' is-dark' : ''
                }`}
            >
                <header className="app-header reader-header">
                    <button
                        className="icon-button"
                        type="button"
                        title="Back"
                        aria-label="Back"
                        onClick={closePromptReaderView}
                    >
                        <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <div className="brand-lockup">
                        <h1>Prompt</h1>
                    </div>
                </header>

                <section className="panel reader-panel">
                    <div className="section-header">
                        <label
                            className="label label-with-icon"
                            htmlFor="original-prompt-reader"
                        >
                            <FileText size={18} aria-hidden="true" />
                            <span>Original prompt</span>
                        </label>
                        <button
                            className={`ghost-button clear-button${cleared ? ' is-cleared' : ''}`}
                            type="button"
                            onClick={clearPrompts}
                            disabled={!hasClearableInput && !cleared}
                        >
                            {cleared ? (
                                <Check size={16} aria-hidden="true" />
                            ) : (
                                <Eraser size={16} aria-hidden="true" />
                            )}
                            Clear
                        </button>
                    </div>
                    {renderPromptSurface('reader')}
                    <button
                        className="primary-button panel-action"
                        type="button"
                        onClick={privatizePrompt}
                        disabled={privatizePromptDisabled}
                        title={privatizeButtonTitle}
                    >
                        <StepForward size={19} aria-hidden="true" />
                        {privatizeButtonLabel}
                    </button>
                    {visibleLocalModelProgress != null ? (
                        <div
                            className="local-model-progress"
                            role="status"
                            aria-live="polite"
                        >
                            <div className="local-model-progress-header">
                                <span>{localModelProgressLabel}</span>
                                {localModelProgressMeta.length > 0 ? (
                                    <span className="local-model-progress-meta">
                                        {localModelProgressMeta}
                                    </span>
                                ) : null}
                            </div>
                            <div
                                className={`local-model-progress-track${
                                    localModelProgressIsIndeterminate
                                        ? ' is-indeterminate'
                                        : ''
                                }`}
                                aria-hidden="true"
                            >
                                <div
                                    className="local-model-progress-fill"
                                    style={{
                                        width:
                                            localModelProgressPercent == null
                                                ? undefined
                                                : `${localModelProgressPercent}%`,
                                    }}
                                />
                            </div>
                        </div>
                    ) : null}
                </section>

                {clipboardStatus || sendStatus ? (
                    <p className="status-message" role="status">
                        {sendStatus || clipboardStatus}
                    </p>
                ) : null}
            </main>
        );
    }

    if (appView === 'reader')
    {
        return (
            <main
                className={`app-shell reader-shell${
                    settings.darkModeEnabled ? ' is-dark' : ''
                }`}
            >
                <header className="app-header reader-header">
                    <button
                        className="icon-button"
                        type="button"
                        title="Back"
                        aria-label="Back"
                        onClick={closeReaderView}
                    >
                        <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <div className="brand-lockup">
                        <h1>Preview</h1>
                    </div>
                </header>

                <section className="panel reader-panel">
                    <div className="section-header">
                        <h2 className="label-with-icon">
                            <ShieldCheck size={18} aria-hidden="true" />
                            <span>Privatized prompt</span>
                        </h2>
                        <button
                            className={`ghost-button copy-button${
                                copied ? ' is-copied' : ''
                            }`}
                            type="button"
                            title={copyButtonTitle}
                            onClick={copyPrivatizedPrompt}
                            disabled={copyPrivatizedPromptDisabled}
                        >
                            {copied ? (
                                <Check size={16} aria-hidden="true" />
                            ) : (
                                <Copy size={16} aria-hidden="true" />
                            )}
                            Copy
                        </button>
                    </div>
                    {isPreviewStale ? (
                        <p className="stale-preview-notice">
                            Does not match the updated settings. Run{' '}
                            <button
                                className="stale-preview-action"
                                type="button"
                                onClick={showPromptWorkspace}
                            >
                                Privatize
                            </button>{' '}
                            again before copying or sending the output.
                        </p>
                    ) : null}
                    {renderPreviewSurface('reader')}
                    {renderOutgoingContentSummary()}
                    <button
                        className="primary-button panel-action"
                        type="button"
                        onClick={sendToAiChat}
                        disabled={
                            !hasPrivatizedOutput ||
                            !canUsePrivatizedOutput ||
                            isPreviewStale ||
                            !hasChatTarget
                        }
                        title={sendButtonTitle}
                    >
                        <Send size={18} aria-hidden="true" />
                        {sendButtonLabel}
                    </button>
                </section>

                {clipboardStatus || sendStatus ? (
                    <p className="status-message" role="status">
                        {sendStatus || clipboardStatus}
                    </p>
                ) : null}
            </main>
        );
    }

    if (appView === 'fileReader' && selectedTextFileAttachment != null)
    {
        const selectedFileHasResult = selectedTextFileAttachment.result != null;
        const selectedFileHasPreview =
            (selectedTextFilePreview?.privatizedPrompt.length ?? 0) > 0;

        return (
            <main
                className={`app-shell reader-shell${
                    settings.darkModeEnabled ? ' is-dark' : ''
                }`}
            >
                <header className="app-header reader-header">
                    <button
                        className="icon-button"
                        type="button"
                        title="Back"
                        aria-label="Back"
                        onClick={closeFileReaderView}
                    >
                        <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <div className="brand-lockup">
                        <h1>File preview</h1>
                    </div>
                </header>

                <section className="panel reader-panel file-reader-panel">
                    <div className="section-header">
                        <h2 className="label-with-icon file-reader-title">
                            <FileText size={18} aria-hidden="true" />
                            <span>{selectedTextFileAttachment.document.fileName}</span>
                        </h2>
                    </div>
                    <div className="file-reader-meta-row">
                        <p className="file-reader-meta">
                            {selectedTextFileAttachment.document.format.toUpperCase()} /{' '}
                            {formatTextFileSize(
                                selectedTextFileAttachment.document.size,
                            )}{' '}
                            /{' '}
                            {formatCount(
                                getTextFileAttachmentLineCount(
                                    selectedTextFileAttachment,
                                ),
                            )}{' '}
                            {getTextFileAttachmentLineCount(
                                selectedTextFileAttachment,
                            ) === 1
                                ? 'line'
                                : 'lines'}
                        </p>
                        {selectedFileHasResult ? (
                            <div className="file-reader-actions">
                                <button
                                    className="ghost-button copy-button"
                                    type="button"
                                    title="Copy sanitized file text"
                                    onClick={() =>
                                        copyTextFileAttachment(selectedTextFileAttachment)
                                    }
                                    disabled={isPreviewStale}
                                >
                                    <Copy size={16} aria-hidden="true" />
                                    Copy
                                </button>
                                <button
                                    className="ghost-button"
                                    type="button"
                                    title="Download sanitized file"
                                    onClick={() =>
                                        downloadTextFileAttachment(
                                            selectedTextFileAttachment,
                                        )
                                    }
                                    disabled={isPreviewStale}
                                >
                                    <Download size={16} aria-hidden="true" />
                                    Download
                                </button>
                            </div>
                        ) : null}
                    </div>
                    {renderTextFileCategorySummaries(
                        selectedTextFileAttachment,
                        'file-reader-summary',
                    )}
                    <div
                        className="workspace-tabs file-reader-tabs"
                        role="tablist"
                        aria-label="File preview"
                    >
                        <button
                            id="file-reader-tab-original"
                            className={`workspace-tab${
                                fileReaderTab === 'original' ? ' is-active' : ''
                            }`}
                            type="button"
                            role="tab"
                            aria-selected={fileReaderTab === 'original'}
                            aria-controls="file-reader-panel-original"
                            onClick={() => selectFileReaderTab('original')}
                        >
                            <FileText size={16} aria-hidden="true" />
                            Original
                        </button>
                        <button
                            id="file-reader-tab-privatized"
                            className={`workspace-tab${
                                fileReaderTab === 'privatized' ? ' is-active' : ''
                            }${isPreviewStale ? ' is-stale' : ''}`}
                            type="button"
                            role="tab"
                            aria-selected={fileReaderTab === 'privatized'}
                            aria-controls="file-reader-panel-privatized"
                            onClick={() => selectFileReaderTab('privatized')}
                            disabled={!selectedFileHasResult}
                        >
                            <ShieldCheck size={16} aria-hidden="true" />
                            Privatized
                        </button>
                    </div>
                    {fileReaderTab === 'original' ? (
                        <div
                            id="file-reader-panel-original"
                            className="workspace-tab-panel file-reader-tab-panel"
                            role="tabpanel"
                            aria-labelledby="file-reader-tab-original"
                        >
                            <pre className="preview preview-reader file-original-preview">{selectedTextFileAttachment.document.text || 'No text extracted.'}</pre>
                        </div>
                    ) : (
                        <div
                            id="file-reader-panel-privatized"
                            className="workspace-tab-panel file-reader-tab-panel"
                            role="tabpanel"
                            aria-labelledby="file-reader-tab-privatized"
                        >
                            {isPreviewStale ? (
                                <p className="stale-preview-notice">
                                    Does not match the updated settings. Run{' '}
                                    <button
                                        className="stale-preview-action"
                                        type="button"
                                        onClick={showPromptWorkspace}
                                    >
                                        Privatize
                                    </button>{' '}
                                    again before copying or sending the output.
                                </p>
                            ) : null}
                            {selectedFileHasResult ? (
                                renderPreviewSurface(
                                    'reader',
                                    selectedTextFilePreviewContent,
                                    selectedFileHasPreview,
                                    isPreviewStale,
                                    null,
                                )
                            ) : (
                                <p className="scan-detail-empty">
                                    Run Privatize to create a sanitized file preview.
                                </p>
                            )}
                        </div>
                    )}
                </section>

                {clipboardStatus || sendStatus ? (
                    <p className="status-message" role="status">
                        {sendStatus || clipboardStatus}
                    </p>
                ) : null}
            </main>
        );
    }

    if (appView === 'settings')
    {
        return (
            <SettingsPage
                settings={settings}
                isSaving={isSavingSettings}
                status={settingsStatus}
                onBack={() => setAppView('main')}
                onChange={updateSetting}
            />
        );
    }

    return (
        <main className={`app-shell${settings.darkModeEnabled ? ' is-dark' : ''}`}>
            <header className="app-header">
                <button
                    className="icon-button"
                    type="button"
                    title="Settings"
                    aria-label="Settings"
                    onClick={() => setAppView('settings')}
                >
                    <SettingsIcon size={17} aria-hidden="true" />
                </button>
                <div className="brand-lockup main-brand-lockup">
                    <h1>Privatize Your Prompts</h1>
                    <span className="status-pill">
                        <Cpu size={12} aria-hidden="true" />
                        Fully on-device
                    </span>
                </div>
            </header>

            <section className="panel workspace-panel">
                <div className="section-header">
                    {workspaceTab === 'prompt' ? (
                        <label
                            className="label label-with-icon"
                            htmlFor="original-prompt"
                        >
                            <FileText size={18} aria-hidden="true" />
                            <span>Original prompt</span>
                        </label>
                    ) : (
                        <h2 className="label-with-icon">
                            <ShieldCheck size={18} aria-hidden="true" />
                            <span>Privatized prompt</span>
                        </h2>
                    )}
                    {workspaceTab === 'prompt' ? (
                        <button
                            className={`ghost-button clear-button${cleared ? ' is-cleared' : ''}`}
                            type="button"
                            onClick={clearPrompts}
                            disabled={!hasClearableInput && !cleared}
                        >
                            {cleared ? (
                                <Check size={16} aria-hidden="true" />
                            ) : (
                                <Eraser size={16} aria-hidden="true" />
                            )}
                            Clear
                        </button>
                    ) : (
                        <button
                            className={`ghost-button copy-button${copied ? ' is-copied' : ''}`}
                            type="button"
                            title={copyButtonTitle}
                            onClick={copyPrivatizedPrompt}
                            disabled={copyPrivatizedPromptDisabled}
                        >
                            {copied ? (
                                <Check size={16} aria-hidden="true" />
                            ) : (
                                <Copy size={16} aria-hidden="true" />
                            )}
                            Copy
                        </button>
                    )}
                </div>
                <div className="workspace-tabs" role="tablist" aria-label="Prompt workspace">
                    <button
                        id="workspace-tab-prompt"
                        className={`workspace-tab${workspaceTab === 'prompt' ? ' is-active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={workspaceTab === 'prompt'}
                        aria-controls="workspace-panel-prompt"
                        onClick={() => selectWorkspaceTab('prompt')}
                    >
                        <FileText size={16} aria-hidden="true" />
                        Prompt
                    </button>
                    <button
                        id="workspace-tab-privatized"
                        className={`workspace-tab${
                            workspaceTab === 'privatized' ? ' is-active' : ''
                        }${isPreviewStale ? ' is-stale' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={workspaceTab === 'privatized'}
                        aria-controls="workspace-panel-privatized"
                        onClick={() => selectWorkspaceTab('privatized')}
                    >
                        <ShieldCheck size={16} aria-hidden="true" />
                        Privatized
                        {isPreviewStale ? (
                            <span className="workspace-tab-status">Stale</span>
                        ) : null}
                    </button>
                </div>
                {workspaceTab === 'prompt' ? (
                    <div
                        id="workspace-panel-prompt"
                        className="workspace-tab-panel"
                        role="tabpanel"
                        aria-labelledby="workspace-tab-prompt"
                    >
                        {renderPromptSurface('compact')}
                        {renderTextFileAttachments(true)}
                        <div className="action-grid">
                            <button
                                className="primary-button"
                                type="button"
                                onClick={privatizePrompt}
                                disabled={privatizePromptDisabled}
                                title={privatizeButtonTitle}
                            >
                                <StepForward size={19} aria-hidden="true" />
                                {privatizeButtonLabel}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        id="workspace-panel-privatized"
                        className="workspace-tab-panel"
                        role="tabpanel"
                        aria-labelledby="workspace-tab-privatized"
                    >
                        {isPreviewStale ? (
                            <p className="stale-preview-notice">
                                Does not match the updated settings. Run{' '}
                                <button
                                    className="stale-preview-action"
                                    type="button"
                                    onClick={showPromptWorkspace}
                                >
                                    Privatize
                                </button>{' '}
                                again before copying or sending the output.
                            </p>
                        ) : null}
                        {renderPreviewSurface('compact')}
                        {renderTextFileAttachments(false)}
                        {renderOutgoingContentSummary()}
                        <button
                            className="primary-button panel-action"
                            type="button"
                            onClick={sendToAiChat}
                            disabled={
                                !hasPrivatizedOutput ||
                                !canUsePrivatizedOutput ||
                                isPreviewStale ||
                                !hasChatTarget
                            }
                            title={sendButtonTitle}
                        >
                            <Send size={18} aria-hidden="true" />
                            {sendButtonLabel}
                        </button>
                    </div>
                )}
                {visibleLocalModelProgress != null ? (
                    <div
                        className="local-model-progress"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="local-model-progress-header">
                            <span>{localModelProgressLabel}</span>
                            {localModelProgressMeta.length > 0 ? (
                                <span className="local-model-progress-meta">
                                    {localModelProgressMeta}
                                </span>
                            ) : null}
                        </div>
                        <div
                            className={`local-model-progress-track${
                                localModelProgressIsIndeterminate
                                    ? ' is-indeterminate'
                                    : ''
                            }`}
                            aria-hidden="true"
                        >
                            <div
                                className="local-model-progress-fill"
                                style={{
                                    width:
                                        localModelProgressPercent == null
                                            ? undefined
                                            : `${localModelProgressPercent}%`,
                                }}
                            />
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="panel">
                <div className="section-header">
                    <h2 className="label-with-icon">
                        <ScanSearch size={18} aria-hidden="true" />
                        <span>Privacy scan</span>
                    </h2>
                    <span>{itemCountLabel}</span>
                </div>
                {hasPrivacyScanDisplayCategories ? (
                    <div className="chip-row" aria-label="Detected item categories">
                        {privacyScanDisplayCategories.map(renderPrivacyScanCategory)}
                    </div>
                ) : (
                    <p className="scan-detail-empty">
                        No detection categories enabled.
                    </p>
                )}
                {isPreviewStale ? (
                    <p className="stale-preview-notice" role="status">
                        {staleScanNotice.before}
                        <button
                            className="stale-preview-action"
                            type="button"
                            onClick={showPromptWorkspace}
                        >
                            Privatize
                        </button>
                        {staleScanNotice.after}
                    </p>
                ) : null}
                {activeScanCategoryConfig != null ? (
                    <div
                        className="scan-detail"
                        style={getCategoryColorStyle(activeScanCategoryConfig.category)}
                    >
                        <div className="scan-detail-header">
                            <span className="scan-detail-title">
                                {activeScanCategoryConfig.label} -{' '}
                                {formatCount(activeScanCount)} masked
                            </span>
                            <label className="scan-detail-search">
                                <Search size={14} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={scanDetailSearchText}
                                    placeholder="Search originals"
                                    aria-label={`Search ${activeScanCategoryConfig.label.toLowerCase()} originals`}
                                    onChange={updateScanDetailSearchText}
                                    onKeyDown={handleScanDetailSearchKeyDown}
                                />
                                {scanDetailSearchText.length > 0 ? (
                                    <button
                                        className="scan-detail-search-clear-button"
                                        type="button"
                                        title="Clear search"
                                        aria-label="Clear search"
                                        onClick={clearScanDetailSearch}
                                    >
                                        <X size={13} aria-hidden="true" />
                                    </button>
                                ) : null}
                            </label>
                        </div>
                        {activeScanMappings.length > 0 ? (
                            <>
                                <div className="scan-detail-columns">
                                    <span>Mask</span>
                                    <span>Original</span>
                                    <button
                                        className={`scan-detail-sort-button${
                                            scanDetailSortDirection !== 'neutral'
                                                ? ' is-active'
                                                : ''
                                        }`}
                                        type="button"
                                        title={scanDetailSortTitle}
                                        aria-label={scanDetailSortButtonLabel}
                                        aria-pressed={scanDetailSortDirection !== 'neutral'}
                                        onClick={cycleScanDetailSortDirection}
                                    >
                                        <ScanDetailSortIcon size={14} aria-hidden="true" />
                                    </button>
                                    <span aria-hidden="true" />
                                </div>
                                {filteredActiveScanMappings.length > 0 ? (
                                    <ul className="scan-detail-list">
                                        {filteredActiveScanMappings.map(renderScanDetailRow)}
                                    </ul>
                                ) : (
                                    <p className="scan-detail-empty">
                                        {hasScanDetailSearch
                                            ? 'No matching originals.'
                                            : activeScanCategoryStaleState === 'added'
                                              ? 'Will be scanned after you run Privatize again.'
                                              : activeScanCategoryStaleState === 'removed'
                                                ? 'Will be removed after you run Privatize again.'
                                            : `No ${activeScanCategoryConfig.label.toLowerCase()} items masked.`}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="scan-detail-empty">
                                {activeScanCategoryStaleState === 'added'
                                    ? 'Will be scanned after you run Privatize again.'
                                    : activeScanCategoryStaleState === 'removed'
                                      ? 'Will be removed after you run Privatize again.'
                                    : `No ${activeScanCategoryConfig.label.toLowerCase()} items masked.`}
                            </p>
                        )}
                    </div>
                ) : null}
                <DiagnosticsPanel
                    benchmark={latestBenchmark}
                    isExpanded={diagnosticsExpanded}
                    onToggle={() =>
                        setDiagnosticsExpanded((isExpanded) => !isExpanded)
                    }
                />
            </section>

            {clipboardStatus || sendStatus ? (
                <p className="status-message" role="status">
                    {sendStatus || clipboardStatus}
                </p>
            ) : null}

            <PrivacyFootnote />
        </main>
    );
}

const requestModelDownloadPermission = async () =>
{
    if (browser.permissions?.request == null)
    {
        return true;
    }

    return browser.permissions.request({
        origins: MODEL_HOST_PERMISSIONS,
    });
};

const getLocalModelFailureStatus = (error: unknown) =>
{
    return `${getLocalModelFailureSummary(error)} Showing rules-only preview.`;
};

const getLocalModelFailureSummary = (error: unknown) =>
{
    const message = getLocalModelFailureMessage(error);

    if (isLocalModelRuntimeError(message))
    {
        return 'Local model runtime failed.';
    }

    if (/permission|not granted/i.test(message))
    {
        return 'Model download permission was not granted.';
    }

    if (/QuotaExceeded|quota|storage/i.test(message))
    {
        return 'Local model storage failed.';
    }

    if (/Failed to fetch|NetworkError|Load failed|ERR_|401|403|404/i.test(message))
    {
        return 'Local model download failed.';
    }

    if (/Unsupported device|backend|execution provider/i.test(message))
    {
        return 'Local model backend is unsupported.';
    }

    if (/memory|allocation|Array buffer/i.test(message))
    {
        return 'Local model ran out of browser memory.';
    }

    return 'Could not run local model.';
};

const getLocalModelFailureMessage = (error: unknown) =>
{
    return error instanceof Error ? error.message : String(error);
};

const isLocalModelRuntimeError = (message: string) =>
{
    return /OrtRun|onnxruntime|Non-zero status code|Failed to wait for the operation|ExecuteKernel/i.test(
        message,
    );
};
