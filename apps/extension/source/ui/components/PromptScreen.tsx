import { FileIcon, PaperclipIcon, XIcon } from '@primer/octicons-react';
import { useRef } from 'react';
import { formatTextFileSize, SUPPORTED_TEXT_FILE_ACCEPT } from '../../documents/extract-text-file';
import type { AttachedFile } from '../../masking/compose';
import type { ChatTarget, ScanStep } from '../state';
import { Button, IconButton } from './Button';
import { Flash } from './Flash';
import { ScanProgress } from './ScanProgress';

type PromptScreenProps = {
    prompt: string;
    files: AttachedFile[];
    fileError: string | undefined;
    scan: ScanStep | undefined;
    scanError: string | undefined;
    target: ChatTarget | undefined;
    onPromptChange: (prompt: string) => void;
    onAddFiles: (files: File[]) => void;
    onRemoveFile: (id: string) => void;
    onMask: () => void;
    onCancel: () => void;
};

export const TargetRow = ({ target }: { target: ChatTarget | undefined }) =>
{
    return (
        <div>
            <span className="field-label">Send to</span>
            {target == null ? (
                <p className="small muted no-margin">Open ChatGPT, Claude, Gemini or Perplexity to insert prompts there. Copying works anytime.</p>
            ) : (
                <div className="target">
                    <span className="site-badge" aria-hidden="true">
                        {target.label.charAt(0)}
                    </span>
                    <span>{target.label}</span>
                    <span className="muted">· open tab</span>
                </div>
            )}
        </div>
    );
};

const FileList = ({ files, disabled, onAdd, onRemove }: { files: AttachedFile[]; disabled: boolean; onAdd: (files: File[]) => void; onRemove: (id: string) => void }) =>
{
    const input = useRef<HTMLInputElement>(null);

    return (
        <div>
            <span className="field-label">Files</span>
            {files.length === 0 ? null : (
                <ul className="file-list">
                    {files.map((file) => (
                        <li key={file.id} className="file-row">
                            <FileIcon size={16} className="muted" />
                            <span className="file-name">{file.fileName}</span>
                            <span className="small muted">{formatTextFileSize(file.size)}</span>
                            <IconButton icon={XIcon} label={`Remove ${file.fileName}`} disabled={disabled} onClick={() => onRemove(file.id)} />
                        </li>
                    ))}
                </ul>
            )}
            <input
                ref={input}
                type="file"
                multiple
                hidden
                accept={SUPPORTED_TEXT_FILE_ACCEPT}
                onChange={(event) =>
                {
                    onAdd([...(event.target.files ?? [])]);
                    event.target.value = '';
                }}
            />
            <Button small icon={PaperclipIcon} disabled={disabled} onClick={() => input.current?.click()}>
                Add text file
            </Button>
        </div>
    );
};

export const PromptScreen = (props: PromptScreenProps) =>
{
    const { prompt, files, fileError, scan, scanError, target } = props;
    const scanning = scan != null;
    const hasInput = prompt.trim().length > 0 || files.some((file) => file.text.trim().length > 0);

    return (
        <>
            <main className="screen">
                <TargetRow target={target} />
                <div className="prompt-field">
                    <label className="field-label" htmlFor="prompt">
                        Prompt
                    </label>
                    <textarea
                        id="prompt"
                        className="input prompt-input"
                        value={prompt}
                        readOnly={scanning}
                        placeholder="Write or paste your prompt. Personal data is masked before it goes anywhere."
                        onChange={(event) => props.onPromptChange(event.target.value)}
                    />
                </div>
                <FileList files={files} disabled={scanning} onAdd={props.onAddFiles} onRemove={props.onRemoveFile} />
                {fileError == null ? null : <Flash tone="danger">{fileError}</Flash>}
                {scanError == null ? null : <Flash tone="danger">{scanError}</Flash>}
            </main>
            <footer className="footer">
                {scan == null ? (
                    <Button variant="primary" className="grow" disabled={!hasInput} onClick={props.onMask}>
                        Mask prompt
                    </Button>
                ) : (
                    <ScanProgress scan={scan} onCancel={props.onCancel} />
                )}
            </footer>
        </>
    );
};
