import { CATEGORIES, type Category } from '@secureprompt/core';

// the result shapes the side panel works with, filled by the new pipeline

export const SENSITIVE_ITEM_CATEGORIES = CATEGORIES;
export type SensitiveItemCategory = Category;

// only placeholders are produced, the other methods are kept for the side panel's types
export type PrivatizationMethod = 'removal' | 'placeholder' | 'pseudonymized';
export type DetectionSource = 'rules' | 'model' | 'manual';

export type LocalModelProgressPhase = 'permission' | 'runtime' | 'download' | 'load' | 'inference' | 'postprocess' | 'done' | 'error';

export type LocalModelProgress = {
    phase: LocalModelProgressPhase;
    label: string;
    // percent, 0 to 100
    progress?: number;
    loadedBytes?: number;
    totalBytes?: number;
    currentChunk?: number;
    totalChunks?: number;
    file?: string;
};

export type LocalModelProgressCallback = (progress: LocalModelProgress) => void;

export type PrivacyBenchmarkStage = 'rulesDetection' | 'modelDetection' | 'resultAssembly' | 'rulesHardening' | 'modelHardening' | 'finalization';

export type PrivacyBenchmarkStageTiming = {
    stage: PrivacyBenchmarkStage;
    label: string;
    durationMs: number;
    itemCount?: number;
};

// timings and counts of one run, never any text
export type PrivacyBenchmark = {
    startedAt: number;
    completedAt: number;
    totalDurationMs: number;
    inputCharacters: number;
    inputLines: number;
    rulesEnabled: boolean;
    localModelEnabled: boolean;
    safeToInject: boolean;
    itemCount: number;
    hardeningItemCount: number;
    stages: PrivacyBenchmarkStageTiming[];
};

export type PrivacyBenchmarkCallback = (benchmark: PrivacyBenchmark) => void;

export type SensitiveItem = {
    id: string;
    category: SensitiveItemCategory;
    start: number;
    end: number;
    value: string;
    confidence: number;
    source: DetectionSource;
};

// one original value and the placeholder that replaces it, with the items it covers
export type MaskingMapping = {
    id: string;
    category: SensitiveItemCategory;
    original: string;
    mask: string;
    itemIds: string[];
};

export type PrivatizedPromptSegment =
    | { type: 'text'; text: string; sourceStart: number; sourceEnd: number }
    | {
          type: 'mask';
          text: string;
          category: SensitiveItemCategory;
          original: string;
          mappingId: string;
          sourceStart: number;
          sourceEnd: number;
      };

export type PrivatizedPromptPreview = {
    privatizedPrompt: string;
    segments: PrivatizedPromptSegment[];
};

export type PrivatizedPromptResult = PrivatizedPromptPreview & {
    method: PrivatizationMethod;
    items: SensitiveItem[];
    maskingMappings: MaskingMapping[];
    safeToInject: boolean;
};

export type PrivatizationPipelineOptions = {
    useLocalModelDetection?: boolean;
    useRulesDetection?: boolean;
    enabledCategories?: Partial<Record<SensitiveItemCategory, boolean>>;
    // placeholders already given out in this bundle, so values keep them
    preferredMaskingMappings?: readonly MaskingMapping[];
    onLocalModelProgress?: LocalModelProgressCallback;
    onBenchmark?: PrivacyBenchmarkCallback;
};

export type PrivatizedPromptPreviewOptions = {
    // mappings the user chose to keep readable
    ignoredMappingIds?: readonly string[];
};

export type ManualSensitiveItemInput = {
    category: SensitiveItemCategory;
    start: number;
    end: number;
};

export type ManualSensitiveItemOptions = {
    enabledCategories?: Partial<Record<SensitiveItemCategory, boolean>>;
    preferredMaskingMappings?: readonly MaskingMapping[];
};
