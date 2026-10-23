export const CATEGORIES = [
    'EMAIL',
    'PHONE',
    'PERSON',
    'ADDRESS',
    'ACCOUNT', // IBANs, cards, tax, ID and passport numbers, customer IDs
    'DATE',
    'NETWORK', // URLs, domains, IP/MAC addresses
    'SECRET', // passwords, API keys, tokens, private keys
    'OTHER',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const isCategory = (value: string): value is Category =>
{
    return (CATEGORIES as readonly string[]).includes(value);
};

// character range in UTF-16 code units (JS string indices), end exclusive
export type Span = {
    start: number;
    end: number;
};

export type DetectionSource =
    | 'rule'
    | 'model'
    | 'manual' // selected by the user
    | 'propagated'; // another mention of an already detected value

export type Detection = Span & {
    category: Category;
    source: DetectionSource;
    // id of the detector that produced it, such as 'rule:email' or 'model:bardsai-v2'
    detector: string;
    // model probability, or 1 for rules
    score: number;
    // true when a formal check passed (checksum, parser), not just a pattern match
    validated: boolean;
    // the value whose placeholder this mention reuses, such as 'Claudia Neumann' for 'Neumann'
    aliasOf?: string;
};

// the part of AbortSignal core needs, so it type-checks without DOM or Node types
export type CancelSignal = {
    readonly aborted: boolean;
    // lets work in another context, such as the model's page, stop right away
    addEventListener?: (type: 'abort', listener: () => void, options?: { once?: boolean }) => void;
};

export type DetectContext = {
    // stop early when aborted, the pipeline also checks it between stages
    signal?: CancelSignal;
    // share of the text processed so far, 0 to 1
    onProgress?: (fraction: number) => void;
};

export type Detector = {
    id: string;
    detect: (text: string, context?: DetectContext) => Promise<Detection[]>;
};

// thrown by the pipeline when its signal is aborted
export class PipelineCancelledError extends Error
{
    override name = 'PipelineCancelledError';

    constructor()
    {
        super('The pipeline run was cancelled');
    }
}

// a detection with the placeholder it was replaced by
export type MaskedSpan = Detection & {
    placeholder: string;
};

// kept text and placeholders with source and masked positions, never holding original values
export type Segment = {
    sourceStart: number;
    sourceEnd: number;
    maskedStart: number;
    maskedEnd: number;
} & ({ kind: 'text' } | { kind: 'mask'; placeholder: string; category: Category });

export type PipelineResult = {
    maskedText: string;
    spans: MaskedSpan[];
    segments: Segment[];
    // detectors that threw, the result is built from the others (rules only if the model failed)
    failedDetectors: string[];
};
