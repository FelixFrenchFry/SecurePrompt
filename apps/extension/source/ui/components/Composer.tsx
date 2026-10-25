import { FileIcon, PaperclipIcon, XIcon } from '@primer/octicons-react';
import { useRef } from 'react';
import { formatTextFileSize, SUPPORTED_TEXT_FILE_ACCEPT } from '../../documents/extract-text-file';
import type { AttachedFile } from '../../masking/compose';
import type { ScanStep } from '../state';
import { Button, IconButton } from './Button';
import { ScanProgress } from './ScanProgress';

type ComposerProps = {
    prompt: string;
    files: AttachedFile[];
    scan: ScanStep | undefined;
    // placeholders of this session in the text, a sign the user pasted an AI answer here
    knownPlaceholders: number;
    onPromptChange: (prompt: string) => void;
    onAddFiles: (files: File[]) => void;
    onRemoveFile: (id: string) => void;
    onMask: () => void;
    // moves a pasted answer to the Answer page
    onMoveToAnswer: () => void;
    onCancel: () => void;
};

// the prompt input: text, files and Mask
export const Composer = (props: ComposerProps) =>
{
    const { prompt, files, scan, knownPlaceholders } = props;
    const fileInput = useRef<HTMLInputElement>(null);
    const scanning = scan != null;
    const hasInput = prompt.trim().length > 0 || files.some((file) => file.text.trim().length > 0);
    const looksLikeAnswer = knownPlaceholders > 0 && files.length === 0;

    return (
        <div className="composer">
            <textarea
                className="composer-input"
                aria-label="Prompt"
                value={prompt}
                readOnly={scanning}
                placeholder="Write or paste your prompt"
                onChange={(event) => props.onPromptChange(event.target.value)}
                onKeyDown={(event) =>
                {
                    // Ctrl+Enter masks, as in many chat inputs
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && hasInput && !scanning)
                    {
                        event.preventDefault();
                        props.onMask();
                    }
                }}
            />
            {files.length === 0 ? null : (
                <ul className="composer-files" aria-label="Files">
                    {files.map((file) => (
                        <li key={file.id} className="file-chip">
                            <FileIcon size={12} className="muted" />
                            <span className="file-name">{file.fileName}</span>
                            <span className="muted">{formatTextFileSize(file.size)}</span>
                            <button type="button" className="file-chip-remove" aria-label={`Remove ${file.fileName}`} disabled={scanning} onClick={() => props.onRemoveFile(file.id)}>
                                <XIcon size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="composer-toolbar">
                {scan != null ? (
                    <ScanProgress scan={scan} onCancel={props.onCancel} />
                ) : (
                    <>
                        <IconButton icon={PaperclipIcon} label="Add text file" onClick={() => fileInput.current?.click()} />
                        {looksLikeAnswer ? (
                            <Button small variant="invisible" data-tooltip={`${knownPlaceholders} ${knownPlaceholders === 1 ? 'placeholder' : 'placeholders'} from this session`} onClick={props.onMoveToAnswer}>
                                Looks like an answer, unmask it
                            </Button>
                        ) : null}
                        <span className="grow" />
                        <Button small variant="primary" disabled={!hasInput} data-tooltip="Mask (Ctrl+Enter)" onClick={props.onMask}>
                            Mask
                        </Button>
                    </>
                )}
            </div>
            <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={SUPPORTED_TEXT_FILE_ACCEPT}
                onChange={(event) =>
                {
                    props.onAddFiles([...(event.target.files ?? [])]);
                    event.target.value = '';
                }}
            />
        </div>
    );
};
