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
    ArrowUp,
    ArrowUpDown,
    Calendar,
    Check,
    CircleHelp,
    Copy,
    Cpu,
    Eraser,
    FileText,
    Globe,
    Home,
    Landmark,
    Lock,
    Mail,
    Phone,
    RotateCcw,
    ScanSearch,
    Search,
    Send,
    ShieldCheck,
    StepForward,
    UserRound,
    X,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { INJECT_PROMPT_MESSAGE, type RuntimeResponse } from '../../source/messaging';
import {
    createPrivatizedPrompt,
    createPrivatizedPromptAsync,
    createPrivatizedPromptPreview,
    createPrivatizedPromptWithManualItem,
    type MaskingMapping,
    type PrivatizedPromptSegment,
    type PrivatizedPromptResult,
    type SensitiveItem,
    type SensitiveItemCategory,
} from '../../source/privacy';

const EMPTY_PREVIEW_TEXT = 'No privatized prompt yet.';
const ACTION_FEEDBACK_MS = 1500;
const MAX_VISIBLE_COUNT = 99;
const SCAN_DETAIL_SCORE_MEDIUM_THRESHOLD = 0.6;
const SCAN_DETAIL_SCORE_HIGH_THRESHOLD = 0.85;
const PREVIEW_TOOLTIP_MARGIN = 12;
const PREVIEW_TOOLTIP_MAX_WIDTH = 260;
const PREVIEW_TOOLTIP_GAP = 3;
const PREVIEW_TOOLTIP_MIN_ABOVE_SPACE = 80;
const PREVIEW_TOOLTIP_HIDE_DELAY_MS = 220;
const PREVIEW_TOOLTIP_BRIDGE_PADDING = 10;
const PREVIEW_TOOLTIP_BRIDGE_OVERLAP = 2;
const PREVIEW_SELECTION_POPOVER_MAX_WIDTH = 236;
const MODEL_HOST_PERMISSIONS = [
    'https://huggingface.co/*',
    'https://*.huggingface.co/*',
    'https://*.hf.co/*',
    'https://*.xethub.hf.co/*',
];

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
    text: string;
    start: number;
    end: number;
    left: number;
    top: number;
    anchorLeft: number;
    arrowLeft: number;
    placement: 'above' | 'below';
};

type PreviewTooltipEvent =
    | ReactPointerEvent<HTMLElement>
    | FocusEvent<HTMLElement>
    | ReactKeyboardEvent<HTMLElement>;

type ShowPreviewTooltip = (
    event: PreviewTooltipEvent,
    text: string,
    mappingId: string,
    mask: string,
) => void;

type ScanDetailSortDirection = 'neutral' | 'ascending' | 'descending';

type ScanDetailScoreLevel = 1 | 2 | 3;

type ScanDetailSearchTarget = {
    normalized: string;
    compact: string;
    digits: string;
    terms: string[];
    acronym: string;
};

type CategoryColors = {
    primary: string;
    secondary: string;
    border: string;
};

type CategoryColorStyle = CSSProperties & {
    '--category-primary': string;
    '--category-secondary': string;
    '--category-border': string;
};

type PrivacyScanCategory = {
    category: SensitiveItemCategory;
    label: string;
    Icon: typeof Mail;
};

const CATEGORY_COLORS: Record<SensitiveItemCategory, CategoryColors> = {
    EMAIL: {
        primary: '#243172',
        secondary: '#f1f3fb',
        border: '#c8cfe8',
    },
    PHONE: {
        primary: '#166534',
        secondary: '#ecfdf5',
        border: '#bbf7d0',
    },
    PERSON: {
        primary: '#2563eb',
        secondary: '#eff6ff',
        border: '#bfdbfe',
    },
    ADDRESS: {
        primary: '#7c2d12',
        secondary: '#fff7ed',
        border: '#fdba74',
    },
    ACCOUNT: {
        primary: '#6d28d9',
        secondary: '#f5f3ff',
        border: '#ddd6fe',
    },
    DATE: {
        primary: '#a16207',
        secondary: '#fefce8',
        border: '#fde047',
    },
    NETWORK: {
        primary: '#0f766e',
        secondary: '#f0fdfa',
        border: '#5eead4',
    },
    SECRET: {
        primary: '#be123c',
        secondary: '#fff1f2',
        border: '#fecdd3',
    },
    OTHER: {
        primary: '#334155',
        secondary: '#f8fafc',
        border: '#dbe4ec',
    },
};

const PRIVACY_SCAN_CATEGORIES: PrivacyScanCategory[] = [
    {
        category: 'EMAIL',
        label: 'Email',
        Icon: Mail,
    },
    {
        category: 'PHONE',
        label: 'Phone',
        Icon: Phone,
    },
    {
        category: 'PERSON',
        label: 'Person',
        Icon: UserRound,
    },
    {
        category: 'ADDRESS',
        label: 'Address',
        Icon: Home,
    },
    {
        category: 'ACCOUNT',
        label: 'Account',
        Icon: Landmark,
    },
    {
        category: 'DATE',
        label: 'Date',
        Icon: Calendar,
    },
    {
        category: 'NETWORK',
        label: 'Network',
        Icon: Globe,
    },
    {
        category: 'SECRET',
        label: 'Secret',
        Icon: Lock,
    },
    {
        category: 'OTHER',
        label: 'Other',
        Icon: CircleHelp,
    },
];

const formatCount = (count: number) =>
{
    return count > MAX_VISIBLE_COUNT ? `${MAX_VISIBLE_COUNT}+` : String(count);
};

const getCategoryColorStyle = (category: SensitiveItemCategory): CategoryColorStyle =>
{
    const colors = CATEGORY_COLORS[category];

    return {
        '--category-primary': colors.primary,
        '--category-secondary': colors.secondary,
        '--category-border': colors.border,
    };
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

const getMaskingMappingScoreLevel = (
    maskingMapping: MaskingMapping,
    items: SensitiveItem[],
): ScanDetailScoreLevel =>
{
    const itemIds = new Set(maskingMapping.itemIds);
    const confidences = items
        .filter((item) =>
        {
            return itemIds.has(item.id);
        })
        .map((item) =>
        {
            return clamp(item.confidence, 0, 1);
        });

    if (confidences.length === 0)
    {
        return 1;
    }

    const confidence = Math.min(...confidences);

    if (confidence >= SCAN_DETAIL_SCORE_HIGH_THRESHOLD)
    {
        return 3;
    }

    if (confidence >= SCAN_DETAIL_SCORE_MEDIUM_THRESHOLD)
    {
        return 2;
    }

    return 1;
};

const getScanDetailScoreLabel = (scoreLevel: ScanDetailScoreLevel) =>
{
    if (scoreLevel === 3)
    {
        return 'Confidence score: high';
    }

    if (scoreLevel === 2)
    {
        return 'Confidence score: medium';
    }

    return 'Confidence score: low';
};

const renderScanDetailScore = (scoreLevel: ScanDetailScoreLevel) =>
{
    const scoreLabel = getScanDetailScoreLabel(scoreLevel);

    return (
        <span
            className="scan-detail-score"
            title={scoreLabel}
            aria-label={scoreLabel}
            role="img"
        >
            {[0, 1, 2].map((index) => (
                <span
                    key={index}
                    className={`scan-detail-score-bar${
                        index < scoreLevel ? ' is-filled' : ''
                    }`}
                    aria-hidden="true"
                />
            ))}
        </span>
    );
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
    segment: PrivatizedPromptSegment,
    index: number,
    activeScanCategory: SensitiveItemCategory | null,
    showPreviewTooltip: ShowPreviewTooltip,
    queueHidePreviewTooltip: () => void,
    hidePreviewTooltip: () => void,
) =>
{
    if (segment.type === 'text') {
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
                showPreviewTooltip(event, segment.original, segment.mappingId, segment.text)
            }
            onPointerLeave={queueHidePreviewTooltip}
            onFocus={(event) =>
                showPreviewTooltip(event, segment.original, segment.mappingId, segment.text)
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
    privatizedPrompt: string,
    previewSegments: PrivatizedPromptSegment[],
    activeScanCategory: SensitiveItemCategory | null,
    showPreviewTooltip: ShowPreviewTooltip,
    queueHidePreviewTooltip: () => void,
    hidePreviewTooltip: () => void,
) =>
{
    if (!privatizedPrompt) {
        return EMPTY_PREVIEW_TEXT;
    }

    if (previewSegments.length === 0) {
        return privatizedPrompt;
    }

    return previewSegments.map((segment, index) =>
    {
        return renderPreviewSegment(
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

export function App()
{
    const [prompt, setPrompt] = useState('');
    const [privatizedPrompt, setPrivatizedPrompt] = useState('');
    const [privatizedInputText, setPrivatizedInputText] = useState('');
    const [privatizedResult, setPrivatizedResult] =
        useState<PrivatizedPromptResult | null>(null);
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
    const [isTestingLocalModel, setIsTestingLocalModel] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cleared, setCleared] = useState(false);
    const [previewTooltip, setPreviewTooltip] = useState<PreviewTooltip | null>(null);
    const [previewSelectionPopover, setPreviewSelectionPopover] =
        useState<PreviewSelectionPopover | null>(null);
    const copyResetTimerRef = useRef<number | undefined>(undefined);
    const clearResetTimerRef = useRef<number | undefined>(undefined);
    const previewTooltipHideTimerRef = useRef<number | undefined>(undefined);
    const previewSelectionFrameRef = useRef<number | undefined>(undefined);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const previewTooltipRef = useRef<HTMLDivElement | null>(null);
    const previewSelectionPopoverRef = useRef<HTMLDivElement | null>(null);

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
        event: PreviewTooltipEvent,
        text: string,
        mappingId: string,
        mask: string,
    ) =>
    {
        clearPreviewTooltipHideTimer();
        hidePreviewSelectionPopover();
        setPreviewTooltip({
            text,
            mappingId,
            mask,
            ...getPreviewTooltipPosition(event.currentTarget),
        });
    };
    const updatePreviewSelectionPopover = () =>
    {
        const selectionPopover = getPreviewSelectionPopover(
            window.getSelection(),
            previewRef.current,
            privatizedInputText,
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
    const previewContent = getPreviewContent(
        privatizedPrompt,
        previewSegments,
        activeScanCategory,
        showPreviewTooltip,
        queueHidePreviewTooltip,
        hidePreviewTooltip,
    );
    const previewTooltipMapping =
        previewTooltip == null || privatizedResult == null
            ? null
            : getMaskingMappingById(
                  privatizedResult.maskingMappings,
                  previewTooltip.mappingId,
              );
    const previewTooltipScoreLevel =
        previewTooltipMapping == null
            ? null
            : getMaskingMappingScoreLevel(previewTooltipMapping, privatizedResult?.items ?? []);
    const activeMaskingMappings = getActiveMaskingMappings(
        privatizedResult?.maskingMappings ?? [],
        ignoredMappingIds,
    );
    const activeItemCount = getMaskingMappingItemCount(activeMaskingMappings);
    const itemCountLabel = `${formatCount(activeItemCount)} ${
        activeItemCount === 1 ? 'item' : 'items'
    } detected`;
    const countItemsByCategory = (category: SensitiveItemCategory) =>
    {
        return getMaskingMappingItemCount(
            getMaskingMappingsByCategory(activeMaskingMappings, category),
        );
    };
    const toggleScanCategory = (category: SensitiveItemCategory) =>
    {
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

        return (
            <button
                key={category}
                className={`chip${isActive ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                style={getPrivacyScanCategoryColorStyle(category, count)}
                type="button"
                aria-pressed={isActive}
                onClick={() => toggleScanCategory(category)}
            >
                <Icon size={17} aria-hidden="true" />
                {label} {formatCount(count)}
            </button>
        );
    };
    const activeScanCategoryConfig =
        activeScanCategory == null ? null : getPrivacyScanCategory(activeScanCategory);
    const activeScanMappings =
        activeScanCategory == null
            ? []
            : getSortedMaskingMappings(
                  getMaskingMappingsByCategory(activeMaskingMappings, activeScanCategory),
                  scanDetailSortDirection,
              );
    const filteredActiveScanMappings = getSearchFilteredMaskingMappings(
        activeScanMappings,
        scanDetailSearchText,
    );
    const activeScanCount = getMaskingMappingItemCount(activeScanMappings);
    const hasScanDetailSearch = scanDetailSearchText.trim().length > 0;
    const ScanDetailSortIcon = getScanDetailSortIcon(scanDetailSortDirection);
    const scanDetailSortLabel = getScanDetailSortLabel(scanDetailSortDirection);
    const scanDetailSortButtonLabel =
        getScanDetailSortButtonLabel(scanDetailSortDirection);
    const scanDetailSortTitle =
        `${scanDetailSortLabel}. ${scanDetailSortButtonLabel}.`;
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
        setPrivatizedPrompt(result.privatizedPrompt);
        setPreviewSegments(result.segments);
        setCanUsePrivatizedPrompt(result.safeToInject);
    };
    const restoreMaskingMapping = (maskingMapping: MaskingMapping) =>
    {
        if (privatizedResult == null || ignoredMappingIds.includes(maskingMapping.id))
        {
            return;
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
            return;
        }

        hidePreviewTooltip();
        hidePreviewSelectionPopover();
        setIgnoredMappingIds(nextIgnoredMappingIds);
        setPrivatizedPrompt(preview.privatizedPrompt);
        setPreviewSegments(preview.segments);
        setCanUsePrivatizedPrompt(false);
        setSendStatus('');
        setClipboardStatus(`${maskingMapping.mask} restored in preview.`);
    };
    const restoreMaskingMappingById = (mappingId: string) =>
    {
        const maskingMapping = privatizedResult?.maskingMappings.find((mapping) =>
        {
            return mapping.id === mappingId;
        });

        if (maskingMapping == null)
        {
            setClipboardStatus('Could not restore masked item.');
            return;
        }

        restoreMaskingMapping(maskingMapping);
    };
    const preserveIgnoredMappingIds = (
        currentResult: PrivatizedPromptResult,
        nextResult: PrivatizedPromptResult,
        manualCategory: SensitiveItemCategory,
        manualOriginals: readonly string[],
    ) =>
    {
        const ignoredMappings = currentResult.maskingMappings.filter((maskingMapping) =>
        {
            return ignoredMappingIds.includes(maskingMapping.id);
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
    const manuallyPrivatizeSelection = (category: SensitiveItemCategory) =>
    {
        if (privatizedResult == null || previewSelectionPopover == null)
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
        const scoreLevel = getMaskingMappingScoreLevel(
            maskingMapping,
            privatizedResult?.items ?? [],
        );

        return (
            <li key={maskingMapping.id} className="scan-detail-row">
                <span className="scan-detail-mask">
                    {maskingMapping.mask}
                </span>
                <span className="scan-detail-original" title={maskingMapping.original}>
                    {maskingMapping.original}
                </span>
                {renderScanDetailScore(scoreLevel)}
                <span className="scan-detail-count">
                    {formatCount(maskingMapping.itemIds.length)}x
                </span>
                <button
                    className="scan-detail-restore-button"
                    type="button"
                    title="Restore original text"
                    aria-label={`Restore ${maskingMapping.mask} original text`}
                    onClick={() => restoreMaskingMapping(maskingMapping)}
                >
                    <RotateCcw size={15} aria-hidden="true" />
                </button>
            </li>
        );
    };

    useEffect(() =>
    {
        return () =>
        {
            if (copyResetTimerRef.current !== undefined) {
                window.clearTimeout(copyResetTimerRef.current);
            }

            if (clearResetTimerRef.current !== undefined) {
                window.clearTimeout(clearResetTimerRef.current);
            }

            if (previewTooltipHideTimerRef.current !== undefined) {
                window.clearTimeout(previewTooltipHideTimerRef.current);
            }

            if (previewSelectionFrameRef.current !== undefined) {
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

                if (
                    getPreviewSelectionPopover(
                        window.getSelection(),
                        previewRef.current,
                        privatizedInputText,
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
    }, [previewSelectionPopover, privatizedInputText]);

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

    const privatizePrompt = () =>
    {
        if (!prompt) {
            return;
        }

        const result = createPrivatizedPrompt(prompt);

        applyPrivatizedResult(prompt, result);
        setSendStatus('');

        if (!result.safeToInject) {
            setClipboardStatus('Preview only. Sending is disabled.');
            return;
        }

        setClipboardStatus('Privatized prompt updated.');
    };

    const testLocalModelPrivatization = async () =>
    {
        if (!prompt || isTestingLocalModel) {
            return;
        }

        setIsTestingLocalModel(true);
        setClipboardStatus('Loading local model. First run may download about 900 MB.');
        setSendStatus('');

        try {
            const hasPermission = await requestModelDownloadPermission();

            if (!hasPermission) {
                setClipboardStatus('Model download permission was not granted.');
                return;
            }

            const result = await createPrivatizedPromptAsync(prompt, {
                useLocalModelDetection: true,
            });

            applyPrivatizedResult(prompt, result);

            if (!result.safeToInject) {
                setClipboardStatus('Local model preview only. Sending is disabled.');
                return;
            }

            setClipboardStatus('Local model result updated.');
        } catch (error) {
            const fallbackResult = createPrivatizedPrompt(prompt);

            applyPrivatizedResult(prompt, fallbackResult);
            setClipboardStatus(getLocalModelFailureStatus(error));
        } finally {
            setIsTestingLocalModel(false);
        }
    };

    const clearPrompts = () =>
    {
        setPrompt('');
        setPrivatizedPrompt('');
        setPrivatizedInputText('');
        setPrivatizedResult(null);
        setPreviewSegments([]);
        setPreviewTooltip(null);
        setPreviewSelectionPopover(null);
        setIgnoredMappingIds([]);
        setActiveScanCategory(null);
        setScanDetailSortDirection('neutral');
        setScanDetailSearchText('');
        setCanUsePrivatizedPrompt(false);
        setClipboardStatus('');
        setSendStatus('');
        setCopied(false);
        setCleared(true);

        if (copyResetTimerRef.current !== undefined) {
            window.clearTimeout(copyResetTimerRef.current);
            copyResetTimerRef.current = undefined;
        }

        if (clearResetTimerRef.current !== undefined) {
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
        if (!privatizedPrompt) {
            return;
        }

        try {
            await navigator.clipboard.writeText(privatizedPrompt);
            setCopied(true);
            setClipboardStatus('');
            setSendStatus('');

            if (copyResetTimerRef.current !== undefined) {
                window.clearTimeout(copyResetTimerRef.current);
            }

            copyResetTimerRef.current = window.setTimeout(() =>
            {
                setCopied(false);
                copyResetTimerRef.current = undefined;
            }, ACTION_FEEDBACK_MS);
        } catch {
            setClipboardStatus('Could not copy privatized prompt.');
        }
    };

    const sendToChatGpt = async () =>
    {
        if (!privatizedPrompt || !canUsePrivatizedPrompt) {
            return;
        }

        try {
            setClipboardStatus('');
            const response = (await browser.runtime.sendMessage({
                type: INJECT_PROMPT_MESSAGE,
                text: privatizedPrompt,
            })) as RuntimeResponse | undefined;

            if (response?.ok) {
                setSendStatus('Sent to ChatGPT.');
                return;
            }

            setSendStatus(response?.error ?? 'Could not send to ChatGPT.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not send to ChatGPT.';
            setSendStatus(message);
        }
    };

    return (
        <main className="app-shell">
            <header className="app-header">
                <div className="brand-lockup">
                    <h1>Privatize Your Prompts</h1>
                </div>
                <span className="status-pill">
                    <Cpu size={12} aria-hidden="true" />
                    Fully on-device
                </span>
            </header>

            <section className="panel">
                <div className="section-header">
                    <label className="label label-with-icon" htmlFor="original-prompt">
                        <FileText size={18} aria-hidden="true" />
                        <span>Original prompt</span>
                    </label>
                    <button
                        className={`ghost-button clear-button${cleared ? ' is-cleared' : ''}`}
                        type="button"
                        onClick={clearPrompts}
                        disabled={!prompt && !privatizedPrompt && !cleared}
                    >
                        {cleared ? (
                            <Check size={16} aria-hidden="true" />
                        ) : (
                            <Eraser size={16} aria-hidden="true" />
                        )}
                        Clear
                    </button>
                </div>
                <textarea
                    id="original-prompt"
                    className="prompt-input"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Type or paste your prompt here..."
                    spellCheck="true"
                />
                <div className="action-grid">
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={privatizePrompt}
                        disabled={prompt.trim().length === 0 || isTestingLocalModel}
                    >
                        <StepForward size={19} aria-hidden="true" />
                        Privatize
                    </button>
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={testLocalModelPrivatization}
                        disabled={prompt.trim().length === 0 || isTestingLocalModel}
                    >
                        <Cpu size={17} aria-hidden="true" />
                        {isTestingLocalModel ? 'Testing...' : 'Test model'}
                    </button>
                </div>
            </section>

            <section className="panel">
                <div className="section-header">
                    <h2 className="label-with-icon">
                        <ScanSearch size={18} aria-hidden="true" />
                        <span>Privacy scan</span>
                    </h2>
                    <span>{itemCountLabel}</span>
                </div>
                <div className="chip-row" aria-label="Detected item categories">
                    {PRIVACY_SCAN_CATEGORIES.map(renderPrivacyScanCategory)}
                </div>
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
                                    <span>Score</span>
                                    <button
                                        className="scan-detail-sort-button"
                                        type="button"
                                        title={scanDetailSortTitle}
                                        aria-label={scanDetailSortButtonLabel}
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
                                            : `No ${activeScanCategoryConfig.label.toLowerCase()} items masked.`}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="scan-detail-empty">
                                No {activeScanCategoryConfig.label.toLowerCase()} items masked.
                            </p>
                        )}
                    </div>
                ) : null}
            </section>

            <section className="panel">
                <div className="section-header">
                    <h2 className="label-with-icon">
                        <ShieldCheck size={18} aria-hidden="true" />
                        <span>Privatized prompt</span>
                    </h2>
                    <button
                        className={`ghost-button copy-button${copied ? ' is-copied' : ''}`}
                        type="button"
                        onClick={copyPrivatizedPrompt}
                        disabled={!privatizedPrompt}
                    >
                        {copied ? (
                            <Check size={16} aria-hidden="true" />
                        ) : (
                            <Copy size={16} aria-hidden="true" />
                        )}
                        Copy
                    </button>
                </div>
                <div
                    ref={previewRef}
                    className="preview"
                    aria-live="polite"
                    onPointerUp={schedulePreviewSelectionPopover}
                    onKeyUp={schedulePreviewSelectionPopover}
                >
                    {previewContent}
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
                                    {previewTooltipMapping != null &&
                                    previewTooltipScoreLevel != null ? (
                                        <div className="preview-tooltip-meta">
                                            {renderScanDetailScore(previewTooltipScoreLevel)}
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
                                            restoreMaskingMappingById(previewTooltip.mappingId)
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
                                {PRIVACY_SCAN_CATEGORIES.map(({ category, label, Icon }) => (
                                    <button
                                        key={category}
                                        className="preview-selection-category-button"
                                        style={getCategoryColorStyle(category)}
                                        type="button"
                                        title={`Privatize as ${label.toLowerCase()}`}
                                        aria-label={`Privatize selected text as ${label.toLowerCase()}`}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => manuallyPrivatizeSelection(category)}
                                    >
                                        <Icon size={15} aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
                <button
                    className="primary-button panel-action"
                    type="button"
                    onClick={sendToChatGpt}
                    disabled={!privatizedPrompt || !canUsePrivatizedPrompt}
                >
                    <Send size={18} aria-hidden="true" />
                    Send to ChatGPT
                </button>
            </section>

            {clipboardStatus || sendStatus ? (
                <p className="status-message" role="status">
                    {sendStatus || clipboardStatus}
                </p>
            ) : null}

            <footer className="footer">Local memory only</footer>
        </main>
    );
}

const requestModelDownloadPermission = async () =>
{
    if (browser.permissions?.request == null) {
        return true;
    }

    return browser.permissions.request({
        origins: MODEL_HOST_PERMISSIONS,
    });
};

const getLocalModelFailureStatus = (error: unknown) =>
{
    const message = getLocalModelFailureMessage(error);

    if (isLocalModelRuntimeError(message)) {
        return 'Local model runtime failed. Showing rules-only preview.';
    }

    if (/QuotaExceeded|quota|storage/i.test(message)) {
        return 'Local model storage failed. Showing rules-only preview.';
    }

    if (/Failed to fetch|NetworkError|Load failed|ERR_|401|403|404/i.test(message)) {
        return 'Local model download failed. Showing rules-only preview.';
    }

    if (/Unsupported device|backend|execution provider/i.test(message)) {
        return 'Local model backend is unsupported. Showing rules-only preview.';
    }

    if (/memory|allocation|Array buffer/i.test(message)) {
        return 'Local model ran out of browser memory. Showing rules-only preview.';
    }

    return 'Could not run local model. Showing rules-only preview.';
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
