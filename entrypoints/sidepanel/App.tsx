import {
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
    Send,
    ShieldCheck,
    StepForward,
    UserRound,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { INJECT_PROMPT_MESSAGE, type RuntimeResponse } from '../../source/messaging';
import {
    createPrivatizedPrompt,
    createPrivatizedPromptAsync,
    createPrivatizedPromptPreview,
    type MaskingMapping,
    type PrivatizedPromptSegment,
    type PrivatizedPromptResult,
    type SensitiveItemCategory,
} from '../../source/privacy';

const EMPTY_PREVIEW_TEXT = 'No privatized prompt yet.';
const ACTION_FEEDBACK_MS = 1500;
const MAX_VISIBLE_COUNT = 99;
const PREVIEW_TOOLTIP_MARGIN = 12;
const PREVIEW_TOOLTIP_MAX_WIDTH = 260;
const PREVIEW_TOOLTIP_GAP = 3;
const PREVIEW_TOOLTIP_MIN_ABOVE_SPACE = 80;
const PREVIEW_TOOLTIP_HIDE_DELAY_MS = 220;
const PREVIEW_TOOLTIP_BRIDGE_PADDING = 10;
const PREVIEW_TOOLTIP_BRIDGE_OVERLAP = 2;
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
            <span key={`preview-text-${index}`}>
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
    const [clipboardStatus, setClipboardStatus] = useState('');
    const [sendStatus, setSendStatus] = useState('');
    const [isTestingLocalModel, setIsTestingLocalModel] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cleared, setCleared] = useState(false);
    const [previewTooltip, setPreviewTooltip] = useState<PreviewTooltip | null>(null);
    const copyResetTimerRef = useRef<number | undefined>(undefined);
    const clearResetTimerRef = useRef<number | undefined>(undefined);
    const previewTooltipHideTimerRef = useRef<number | undefined>(undefined);
    const previewTooltipRef = useRef<HTMLDivElement | null>(null);

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
        setPreviewTooltip({
            text,
            mappingId,
            mask,
            ...getPreviewTooltipPosition(event.currentTarget),
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
    const activeScanCount = getMaskingMappingItemCount(activeScanMappings);
    const ScanDetailSortIcon = getScanDetailSortIcon(scanDetailSortDirection);
    const scanDetailSortLabel = getScanDetailSortLabel(scanDetailSortDirection);
    const scanDetailSortButtonLabel =
        getScanDetailSortButtonLabel(scanDetailSortDirection);
    const scanDetailSortTitle =
        `${scanDetailSortLabel}. ${scanDetailSortButtonLabel}.`;
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
        setIgnoredMappingIds([]);
        setScanDetailSortDirection('neutral');
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
        };
    }, []);

    useEffect(() =>
    {
        if (previewTooltip == null)
        {
            return;
        }

        const hideTooltip = () =>
        {
            setPreviewTooltip(null);
        };

        window.addEventListener('resize', hideTooltip);
        window.addEventListener('scroll', hideTooltip, true);

        return () =>
        {
            window.removeEventListener('resize', hideTooltip);
            window.removeEventListener('scroll', hideTooltip, true);
        };
    }, [previewTooltip]);

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
        setIgnoredMappingIds([]);
        setActiveScanCategory(null);
        setScanDetailSortDirection('neutral');
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
                            <span>
                                {activeScanCategoryConfig.label} -{' '}
                                {formatCount(activeScanCount)} masked
                            </span>
                        </div>
                        {activeScanMappings.length > 0 ? (
                            <>
                                <div className="scan-detail-columns">
                                    <span>Mask</span>
                                    <span>Original</span>
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
                                <ul className="scan-detail-list">
                                    {activeScanMappings.map(renderScanDetailRow)}
                                </ul>
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
                <div className="preview" aria-live="polite">
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
