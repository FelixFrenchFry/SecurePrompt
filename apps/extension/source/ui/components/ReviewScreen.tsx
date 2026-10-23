import { ArrowLeftIcon, CheckIcon, CopyIcon, PaperAirplaneIcon, ShieldCheckIcon } from '@primer/octicons-react';
import type { Category, Span } from '@secureprompt/core';
import { useEffect, useState } from 'react';
import { categoryCounts, placeholderDetails, type OutputPart } from '../../masking/output';
import { CATEGORY_INFO, categoryClass } from '../categories';
import type { ChatTarget, Review } from '../state';
import { Button } from './Button';
import { Flash } from './Flash';
import { MaskedPreview } from './MaskedPreview';
import { Popover } from './Popover';
import { PlaceholderPanel, SelectionBar } from './ReviewPanels';

const COPIED_FEEDBACK_MS = 1500;
const EXCERPT_LENGTH = 40;

const MODEL_NOTES = {
    permission: 'The model download wasn\'t allowed, so only rules masked this prompt.',
    failed: 'The model couldn\'t run, so only rules masked this prompt.',
};

type ReviewScreenProps = {
    review: Review;
    parts: OutputPart[];
    target: ChatTarget | undefined;
    categories: Category[];
    originalFor: (placeholder: string) => string | undefined;
    onEdit: () => void;
    onSelectPlaceholder: (placeholder?: string) => void;
    onTogglePlaceholder: (placeholder: string) => void;
    onSelectText: (selection: Span | undefined) => void;
    onMaskSelection: (category: Category) => void;
    onCopy: () => Promise<boolean>;
    onInsert: () => void;
};

const excerptOf = (text: string) => (text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text);

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} s`;

export const ReviewScreen = (props: ReviewScreenProps) =>
{
    const { review, parts, target } = props;
    const { run, selected, selection, revealed, insert, modelNote } = review;
    const counts = categoryCounts(run.result);
    const values = counts.reduce((sum, entry) => sum + entry.count, 0);
    const details = selected == null ? undefined : placeholderDetails(run.result, selected);
    const [copied, setCopied] = useState(false);
    // which mention of the open placeholder was clicked, where its popover opens
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);

    const selectPlaceholder = (placeholder: string, index: number) =>
    {
        const isOpen = placeholder === selected && index === selectedIndex;

        setSelectedIndex(isOpen ? undefined : index);
        props.onSelectPlaceholder(isOpen ? undefined : placeholder);
    };

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
                <div className="row">
                    <ShieldCheckIcon size={16} className="success" />
                    <span className="grow">
                        <strong>{values === 0 ? 'Nothing to mask found' : `${values} ${values === 1 ? 'value' : 'values'} masked`}</strong>{' '}
                        <span className="muted">in {seconds(run.milliseconds)}</span>
                    </span>
                    <Button small variant="invisible" icon={ArrowLeftIcon} onClick={props.onEdit}>
                        Edit prompt
                    </Button>
                </div>
                {counts.length === 0 ? null : (
                    <ul className="labels" aria-label="Masked values by category">
                        {counts.map(({ category, count }) => (
                            <li key={category} className={`label ${categoryClass(category)}`}>
                                {CATEGORY_INFO[category].label} {count}
                            </li>
                        ))}
                    </ul>
                )}
                {modelNote == null ? null : <Flash tone="warning">{MODEL_NOTES[modelNote]} Names and addresses may be missed, so check the preview.</Flash>}
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
                                          onToggle={() => props.onTogglePlaceholder(details.placeholder)}
                                          onClose={() => props.onSelectPlaceholder(undefined)}
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
                {revealed.length === 0 ? null : (
                    <Flash tone="warning">
                        {revealed.map((placeholder) => props.originalFor(placeholder)).join(', ')} {revealed.length === 1 ? 'will be sent as is.' : 'will be sent as they are.'}
                    </Flash>
                )}
                {insert == null ? null : <Flash tone={insert.ok ? 'success' : 'danger'}>{insert.message}</Flash>}
                {details == null && selection == null && insert == null ? (
                    <Flash tone="info">Click a placeholder to check its original. Select text in the preview to mask something the scan missed.</Flash>
                ) : null}
            </main>
            <footer className="footer">
                <Button icon={copied ? CheckIcon : CopyIcon} onClick={() => void props.onCopy().then(setCopied)}>
                    {copied ? 'Copied' : 'Copy masked'}
                </Button>
                <span className="grow" />
                <Button variant="primary" icon={PaperAirplaneIcon} disabled={target == null} onClick={props.onInsert}>
                    {target == null ? 'Insert into chat' : `Insert into ${target.label}`}
                </Button>
            </footer>
        </>
    );
};
