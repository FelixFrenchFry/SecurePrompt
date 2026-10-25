import { CheckIcon, CopyIcon, EyeClosedIcon, EyeIcon, ReplyIcon } from '@primer/octicons-react';
import type { AnswerPart } from '../../masking/restore';
import { categoryColor } from '../categories';
import type { AnswerEntry } from '../state';
import { Button, IconButton } from './Button';
import { CategoryIcon } from './CategoryIcon';
import { Flash } from './Flash';
import { useCopied } from './useCopied';

type AnswerCardProps = {
    entry: AnswerEntry;
    parts: AnswerPart[];
    onToggle: () => void;
    onCopy: () => Promise<boolean>;
};

// an AI answer in the timeline, with this session's placeholders turned back into the originals
export const AnswerCard = ({ entry, parts, onToggle, onCopy }: AnswerCardProps) =>
{
    const { copied, onCopy: copy } = useCopied(onCopy);
    const restored = parts.filter((part) => part.kind === 'restored').length;
    const unknown = [...new Set(parts.flatMap((part) => (part.kind === 'unknown' ? [part.placeholder] : [])))];

    return (
        <section className="card" aria-label="Answer card">
            <div className="card-head card-head-static">
                <ReplyIcon size={16} />
                <span className="grow">
                    Answer · {restored} {restored === 1 ? 'placeholder' : 'placeholders'} unmasked
                </span>
            </div>
            <div className="card-text" aria-label="Answer with originals">
                {entry.showMasked
                    ? entry.text
                    : parts.map((part, index) =>
                      {
                          if (part.kind === 'text')
                          {
                              return <span key={index}>{part.text}</span>;
                          }

                          if (part.kind === 'unknown')
                          {
                              return (
                                  <span key={index} className="unknown-placeholder" data-tooltip="Not from this browser session">
                                      {part.placeholder}
                                  </span>
                              );
                          }

                          return (
                              <mark key={index} className="restored" data-tooltip={part.placeholder}>
                                  <CategoryIcon category={part.category} />
                                  <span className="restored-text" style={{ textDecorationColor: categoryColor(part.category) }}>
                                      {part.text}
                                  </span>
                              </mark>
                          );
                      })}
            </div>
            {unknown.length === 0 ? null : (
                <div className="card-section">
                    <Flash tone="warning">
                        {unknown.join(', ')} {unknown.length === 1 ? 'isn\'t' : 'aren\'t'} from this browser session, so the AI may have made{' '}
                        {unknown.length === 1 ? 'it' : 'them'} up. {unknown.length === 1 ? 'It stays' : 'They stay'} as written.
                    </Flash>
                </div>
            )}
            <div className="card-foot">
                <IconButton
                    icon={entry.showMasked ? EyeIcon : EyeClosedIcon}
                    label={entry.showMasked ? 'Show originals' : 'Show masked'}
                    aria-pressed={entry.showMasked}
                    onClick={onToggle}
                />
                <span className="grow" />
                <Button small variant="brand" icon={copied ? CheckIcon : CopyIcon} onClick={copy}>
                    {copied ? 'Copied' : 'Copy with originals'}
                </Button>
            </div>
        </section>
    );
};
