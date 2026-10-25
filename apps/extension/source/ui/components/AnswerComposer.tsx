import { Button } from './Button';

type AnswerComposerProps = {
    text: string;
    // placeholders of this session in the pasted answer
    knownPlaceholders: number;
    onTextChange: (text: string) => void;
    onUnmask: () => void;
};

// the answer input: same shape as the prompt input, with Unmask in the logo's taupe for the way back
export const AnswerComposer = ({ text, knownPlaceholders, onTextChange, onUnmask }: AnswerComposerProps) =>
{
    const hasText = text.trim().length > 0;

    return (
        <div className="composer">
            <textarea
                className="composer-input"
                aria-label="AI answer"
                value={text}
                placeholder="Paste the AI's answer"
                onChange={(event) => onTextChange(event.target.value)}
                onKeyDown={(event) =>
                {
                    // Ctrl+Enter unmasks, like Mask on the prompt page
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && hasText)
                    {
                        event.preventDefault();
                        onUnmask();
                    }
                }}
            />
            <div className="composer-toolbar composer-toolbar-text">
                <span className="small muted grow">
                    {!hasText ? '' : knownPlaceholders === 0 ? 'No placeholders from this session' : `${knownPlaceholders} ${knownPlaceholders === 1 ? 'placeholder' : 'placeholders'} to unmask`}
                </span>
                <Button small variant="brand" disabled={!hasText} data-tooltip="Unmask (Ctrl+Enter)" onClick={onUnmask}>
                    Unmask
                </Button>
            </div>
        </div>
    );
};
