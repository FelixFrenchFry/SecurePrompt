import { CheckIcon, CopyIcon } from '@primer/octicons-react';
import { useEffect, useState } from 'react';
import type { AnswerPart } from '../../masking/restore';
import { categoryClass } from '../categories';
import { Button } from './Button';
import { Flash } from './Flash';

const COPIED_FEEDBACK_MS = 1500;

type AnswerScreenProps = {
    answer: string;
    parts: AnswerPart[];
    sessionSize: number;
    onAnswerChange: (answer: string) => void;
    onCopy: () => Promise<boolean>;
};

// the AI's answer with this browser session's placeholders turned back into the originals
export const AnswerScreen = ({ answer, parts, sessionSize, onAnswerChange, onCopy }: AnswerScreenProps) =>
{
    const [copied, setCopied] = useState(false);
    const restored = parts.filter((part) => part.kind === 'restored').length;
    const unknown = [...new Set(parts.flatMap((part) => (part.kind === 'unknown' ? [part.placeholder] : [])))];

    useEffect(() =>
    {
        if (!copied)
        {
            return undefined;
        }

        const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);

        return () => window.clearTimeout(timer);
    }, [copied]);

    return (
        <>
            <main className="screen">
                <div className="answer-field">
                    <label className="field-label" htmlFor="answer">
                        AI answer
                    </label>
                    <textarea
                        id="answer"
                        className="input answer-input"
                        value={answer}
                        placeholder="Paste the AI's answer. Its placeholders turn back into your originals below."
                        onChange={(event) => onAnswerChange(event.target.value)}
                    />
                </div>
                {sessionSize === 0 ? (
                    <Flash tone="info">No masked values in this browser session yet. Mask a prompt first, then paste the answer here.</Flash>
                ) : null}
                {answer.trim().length === 0 ? null : (
                    <div>
                        <span className="field-label">With originals</span>
                        <div className="preview" aria-label="Answer with originals">
                            {parts.map((part, index) =>
                            {
                                if (part.kind === 'text')
                                {
                                    return <span key={index}>{part.text}</span>;
                                }

                                if (part.kind === 'unknown')
                                {
                                    return (
                                        <span key={index} className="unknown-placeholder" title="Not from this browser session">
                                            {part.placeholder}
                                        </span>
                                    );
                                }

                                return (
                                    <mark key={index} className={`restored ${categoryClass(part.category)}`} title={part.placeholder}>
                                        {part.text}
                                    </mark>
                                );
                            })}
                        </div>
                    </div>
                )}
                {unknown.length === 0 ? null : (
                    <Flash tone="warning">
                        {unknown.join(', ')} {unknown.length === 1 ? 'isn\'t' : 'aren\'t'} from your prompts in this browser session, so{' '}
                        {unknown.length === 1 ? 'it stays' : 'they stay'} as written. The AI may have made {unknown.length === 1 ? 'it' : 'them'} up.
                    </Flash>
                )}
            </main>
            <footer className="footer">
                <span className="small muted grow">{answer.trim().length === 0 ? '' : `${restored} ${restored === 1 ? 'placeholder' : 'placeholders'} restored`}</span>
                <Button
                    variant={copied ? 'default' : 'primary'}
                    icon={copied ? CheckIcon : CopyIcon}
                    disabled={answer.trim().length === 0}
                    onClick={() => void onCopy().then(setCopied)}
                >
                    {copied ? 'Copied' : 'Copy with originals'}
                </Button>
            </footer>
        </>
    );
};
