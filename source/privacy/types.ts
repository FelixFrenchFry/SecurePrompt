// supported categories of sensitive items that can be detected in prompt data
export type SensitiveItemCategory =
    | 'EMAIL' // email addresses
    | 'PHONE' // phone and mobile numbers
    | 'PERSON' // names of private persons
    | 'ADDRESS' // street addresses and postal addresses
    | 'ACCOUNT' // IBANs, credit cards, tax IDs, etc...
    | 'DATE' // calendar dates
    | 'NETWORK' // URLs, domains, hostnames, IP addresses, etc...
    | 'SECRET' // API keys, tokens, passwords, logins, etc...
    | 'OTHER'; // sensitive item that does not fit a known category

export type PrivatizationMethod =
    | 'removal' // items get removed
    | 'placeholder' // items get replaced with numbered category marker
    | 'pseudonymized'; // items get replaced with realistic pseudonyms

export type DetectionSource =
    | 'rules' // detected by predefined patterns or heuristics
    | 'model' // detected by an AI model trained to identify sensitive information
    | 'manual'; // identified manually by a user

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

// mapping from original sensitive items to masks used in output
export type MaskingMapping = {
    id: string;
    category: SensitiveItemCategory;
    original: string;
    mask: string;
    itemIds: string[];
};

// renderable part of the privatized prompt preview
export type PrivatizedPromptSegment =
    | {
          type: 'text';
          text: string;
      }
    | {
          type: 'mask';
          text: string;
          category: SensitiveItemCategory;
          original: string;
          mappingId: string;
      };

// complete result for one prompt
export type PrivatizedPromptResult = {
    privatizedPrompt: string;
    method: PrivatizationMethod;
    items: SensitiveItem[];
    maskingMappings: MaskingMapping[];
    segments: PrivatizedPromptSegment[];
    safeToInject: boolean;
};
