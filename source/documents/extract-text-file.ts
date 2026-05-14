import type {
    FileTextDocument,
    TextDocumentFormat,
} from './types';

export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_TEXT_FILE_FORMATS: readonly TextDocumentFormat[] = [
    'txt',
    'md',
    'csv',
    'tsv',
    'json',
    'jsonl',
    'yaml',
    'xml',
    'html',
    'log',
    'env',
    'ini',
    'toml',
];

const TEXT_FILE_FORMAT_BY_EXTENSION: Record<string, TextDocumentFormat> = {
    conf: 'txt',
    csv: 'csv',
    env: 'env',
    htm: 'html',
    html: 'html',
    ini: 'ini',
    json: 'json',
    jsonl: 'jsonl',
    log: 'log',
    md: 'md',
    markdown: 'md',
    text: 'txt',
    toml: 'toml',
    tsv: 'tsv',
    txt: 'txt',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
};

export const SUPPORTED_TEXT_FILE_ACCEPT = Object.keys(TEXT_FILE_FORMAT_BY_EXTENSION)
    .map((extension) => `.${extension}`)
    .join(',');

let nextTextDocumentId = 1;

export const extractTextFile = async (file: File): Promise<FileTextDocument> =>
{
    const extension = getFileExtension(file.name);
    const format = TEXT_FILE_FORMAT_BY_EXTENSION[extension];

    if (format == null)
    {
        throw new Error('Unsupported file type.');
    }

    if (file.size > MAX_TEXT_FILE_BYTES)
    {
        throw new Error(
            `File is larger than ${formatTextFileSize(MAX_TEXT_FILE_BYTES)}.`,
        );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decodedText = decodeTextFile(bytes);

    return {
        id: createTextDocumentId(),
        kind: 'file',
        name: file.name,
        fileName: file.name,
        extension,
        format,
        mimeType: file.type,
        size: file.size,
        lastModified: file.lastModified,
        text: decodedText.text,
        warnings: decodedText.warnings,
    };
};

export const formatTextFileSize = (bytes: number) =>
{
    const megabytes = bytes / 1024 / 1024;

    if (megabytes >= 1)
    {
        return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
    }

    const kilobytes = bytes / 1024;

    if (kilobytes >= 1)
    {
        return `${kilobytes.toFixed(0)} KB`;
    }

    return `${bytes.toFixed(0)} B`;
};

const createTextDocumentId = () =>
{
    const id = `text-document-${String(nextTextDocumentId).padStart(3, '0')}`;
    nextTextDocumentId += 1;
    return id;
};

const getFileExtension = (fileName: string) =>
{
    const normalizedName = fileName.trim().toLowerCase();
    const extensionStart = normalizedName.lastIndexOf('.');

    if (extensionStart < 0 || extensionStart === normalizedName.length - 1)
    {
        return '';
    }

    return normalizedName.slice(extensionStart + 1);
};

const decodeTextFile = (bytes: Uint8Array) =>
{
    if (hasByteOrderMark(bytes, [0xef, 0xbb, 0xbf]))
    {
        return {
            text: decodeWithEncoding(bytes.slice(3), 'utf-8'),
            warnings: [],
        };
    }

    if (hasByteOrderMark(bytes, [0xff, 0xfe]))
    {
        return {
            text: decodeWithEncoding(bytes.slice(2), 'utf-16le'),
            warnings: ['Decoded as UTF-16 little-endian.'],
        };
    }

    if (hasByteOrderMark(bytes, [0xfe, 0xff]))
    {
        return {
            text: decodeWithEncoding(bytes.slice(2), 'utf-16be'),
            warnings: ['Decoded as UTF-16 big-endian.'],
        };
    }

    try
    {
        return {
            text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            warnings: [],
        };
    }
    catch
    {
        return {
            text: decodeWithEncoding(bytes, 'windows-1252'),
            warnings: ['Decoded as Windows-1252 because UTF-8 decoding failed.'],
        };
    }
};

const decodeWithEncoding = (bytes: Uint8Array, encoding: string) =>
{
    return new TextDecoder(encoding).decode(bytes);
};

const hasByteOrderMark = (bytes: Uint8Array, byteOrderMark: number[]) =>
{
    if (bytes.length < byteOrderMark.length)
    {
        return false;
    }

    return byteOrderMark.every((byte, index) =>
    {
        return bytes[index] === byte;
    });
};
