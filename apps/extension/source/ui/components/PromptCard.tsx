import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, PaperAirplaneIcon, PencilIcon, ShieldCheckIcon } from '@primer/octicons-react';
import type { Category, Span } from '@secureprompt/core';
import { useState } from 'react';
import { categoryCounts, excerptOf, outputText, placeholderDetails, type OutputPart } from '../../masking/output';
import type { ChatTarget, PromptEntry } from '../state';
import { Button, IconButton } from './Button';
import { Flash } from './Flash';
import { MaskedPreview } from './MaskedPreview';
import { Popover } from './Popover';
import { PlaceholderPanel, SelectionBar } from './ReviewPanels';
import { useCopied } from './useCopied';

const MODEL_NOTES = {
    permission: 'The model download wasn\'t allowed, so only rules masked this prompt.',
    failed: 'The model couldn\'t run, so only rules masked this prompt.',
};

type PromptCardProps = {
    entry: PromptEntry;
    parts: OutputPart[];
    target: ChatTarget | undefined;
    categories: Category[];
    originalFor: (placeholder: string) => string | undefined;
    onEdit: () => void;
    // why Edit is off right now, shown as its tooltip
    editBlocked: string | undefined;
    onToggle: () => void;
    onSelectPlaceholder: (placeholder?: string) => void;
    onTogglePlaceholder: (placeholder: string) => void;
    onSelectText: (selection: Span | undefined) => void;
    onMaskSelection: (category: Category) => void;
    onChangeCategory: (placeholder: string, category: Category) => void;
    onCopyText: (text: string) => Promise<boolean>;
    onCopy: () => Promise<boolean>;
    onInsert: () => void;
};

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} s`;

// a masked prompt in the timeline: reviewed in full, folded to two lines once sent
export const PromptCard = (props: PromptCardProps) =>
{
    const { entry, parts, target } = props;
    const { run, selected, selection, revealed, insert, modelNote, sentTo, expanded } = entry;
    const values = categoryCounts(run.result).reduce((sum, count) => sum + count.count, 0);
    const details = selected == null ? undefined : placeholderDetails(run.result, selected);
    const { copied, onCopy } = useCopied(props.onCopy);
    // which mention of the open placeholder was clicked, where its popover opens
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
    const summary = values === 0 ? 'Nothing to mask found' : `${values} ${values === 1 ? 'value' : 'values'} masked`;

    const selectPlaceholder = (placeholder: string, index: number) =>
    {
        const isOpen = placeholder === selected && index === selectedIndex;

        setSelectedIndex(isOpen ? undefined : index);
        props.onSelectPlaceholder(isOpen ? undefined : placeholder);
    };

    const head = (
        <button type="button" className="card-head" aria-expanded={expanded} onClick={props.onToggle}>
            {sentTo == null ? <ShieldCheckIcon size={16} className="success" /> : <CheckIcon size={16} className="success" />}
            <span className="grow">{sentTo == null ? `${summary} · ${seconds(run.milliseconds)}` : `Sent to ${sentTo} · ${summary}`}</span>
            {expanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        </button>
    );

    if (!expanded)
    {
        return (
            <section className="card" aria-label="Prompt card">
                {head}
                <p className="card-excerpt">{outputText(parts)}</p>
            </section>
        );
    }

    return (
        <section className="card" aria-label="Prompt card">
            {head}
            {modelNote == null ? null : (
                <div className="card-section">
                    <Flash tone="warning">{MODEL_NOTES[modelNote]} Names and addresses may be missed, so check the preview.</Flash>
                </div>
            )}
            <MaskedPreview
                parts={parts}
                selected={selected}
                selectedIndex={details == null ? undefined : selectedIndex}
                onSelectPlaceholder={selectPlaceholder}
                onSelectText={props.onSelectText}
                placeholderPopover={
                    details == null
                        ? undefined
                        : (anchor) => (
                              <Popover anchor={anchor} label={`${details.placeholder} details`} onClose={() => props.onSelectPlaceholder(undefined)}>
                                  <PlaceholderPanel
                                      details={details}
                                      original={props.originalFor(details.placeholder) ?? ''}
                                      revealed={revealed.includes(details.placeholder)}
                                      categories={props.categories}
                                      onToggle={() => props.onTogglePlaceholder(details.placeholder)}
                                      onCopy={() => props.onCopyText(props.originalFor(details.placeholder) ?? '')}
                                      onChangeCategory={(category) => props.onChangeCategory(details.placeholder, category)}
                                  />
                              </Popover>
                          )
                }
                selectionPopover={
                    selection == null
                        ? undefined
                        : (anchor) => (
                              <Popover anchor={anchor} label="Mask selected text" onClose={() => props.onSelectText(undefined)}>
                                  <SelectionBar
                                      excerpt={excerptOf(run.input.slice(selection.start, selection.end))}
                                      categories={props.categories}
                                      onMask={props.onMaskSelection}
                                      onCancel={() => props.onSelectText(undefined)}
                                  />
                              </Popover>
                          )
                }
            />
            {revealed.length === 0 && insert == null ? null : (
                <div className="card-section">
                    {revealed.length === 0 ? null : (
                        <Flash tone="warning">
                            {revealed.map((placeholder) => props.originalFor(placeholder)).join(', ')} {revealed.length === 1 ? 'will be sent as is.' : 'will be sent as they are.'}
                        </Flash>
                    )}
                    {insert == null || insert.ok ? null : <Flash tone="danger">{insert.message}</Flash>}
                </div>
            )}
            <div className="card-foot">
                <IconButton icon={copied ? CheckIcon : CopyIcon} label={copied ? 'Copied' : 'Copy to clipboard'} className={copied ? 'is-done' : ''} onClick={onCopy} />
                {sentTo == null ? (
                    // aria-disabled instead of disabled, so the tooltip still explains why on hover and focus
                    <IconButton
                        icon={PencilIcon}
                        label="Edit prompt"
                        aria-disabled={props.editBlocked != null}
                        data-tooltip={props.editBlocked ?? 'Edit prompt'}
                        onClick={props.editBlocked == null ? props.onEdit : undefined}
                    />
                ) : null}
                <span className="grow" />
                <Button small variant={sentTo == null ? 'primary' : 'default'} icon={PaperAirplaneIcon} disabled={target == null} onClick={props.onInsert}>
                    {target == null ? 'Insert into chat' : `${sentTo == null ? 'Insert into' : 'Insert again into'} ${target.label}`}
                </Button>
            </div>
        </section>
    );
};
