export type TextDocumentKind =
    | 'prompt'
    | 'file';

export type TextDocumentFormat =
    | 'txt'
    | 'md'
    | 'csv'
    | 'tsv'
    | 'json'
    | 'jsonl'
    | 'yaml'
    | 'xml'
    | 'html'
    | 'log'
    | 'env'
    | 'ini'
    | 'toml';

export type TextDocument = {
    id: string;
    kind: TextDocumentKind;
    name: string;
    text: string;
    size: number;
    mimeType: string;
    format: TextDocumentFormat;
    warnings: string[];
};

export type FileTextDocument = TextDocument & {
    kind: 'file';
    fileName: string;
    extension: string;
    lastModified: number;
};
