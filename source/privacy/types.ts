// supported categories of sensitive items that can be detected in prompt data
export type SensitiveItemCategory =
    | 'EMAIL'
    | 'PHONE'
    | 'PERSON'
    | 'ADDRESS'
    | 'ACCOUNT'
    | 'DATE'
    | 'URL'
    | 'SECRET'
    | 'OTHER';

// rules -> detected by predefined patterns or heuristics
// model -> detected by an AI model trained to identify sensitive information
// manual -> identified manually by a user
export type DetectionSource = 'rules' | 'model' | 'manual';

// sensitive item found in the prompt data
export type SensitiveItem = {
    id: string;
    category: SensitiveItemCategory;
    start: number;
    end: number;
    value: string;
    confidence: number;
    source: DetectionSource;
};

// mapping from original sensitive items to placeholders used in output
export type PlaceholderMapping = {
    id: string;
    category: SensitiveItemCategory;
    original: string;
    placeholder: string;
    itemIds: string[];
};

// complete result for one prompt
export type PseudoPromptResult = {
    pseudoPrompt: string;
    items: SensitiveItem[];
    mappings: PlaceholderMapping[];
    safeToInject: boolean;
};
