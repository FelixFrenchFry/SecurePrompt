import type { Span } from '@secureprompt/core';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OutputPart } from '../../masking/output';
import { categoryClass } from '../categories';
import type { Anchor } from './Popover';

type MaskedPreviewProps = {
    parts: OutputPart[];
    // the open placeholder and which of its mentions was clicked
    selected: string | undefined;
    selectedIndex: number | undefined;
    onSelectPlaceholder: (placeholder: string, index: number) => void;
    // the selected text's position in the masked input, or undefined when nothing is selected
    onSelectText: (selection: Span | undefined) => void;
    // the popovers to show at the open placeholder and at the selected text
    placeholderPopover?: ((anchor: Anchor) => ReactNode) | undefined;
    selectionPopover?: ((anchor: Anchor) => ReactNode) | undefined;
};

// a selection boundary as a position in the input, if it lies in kept text
const sourceOffset = (node: Node, offset: number): number | undefined =>
{
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    const start = element instanceof HTMLElement ? element.dataset.start : undefined;

    if (start == null)
    {
        return undefined;
    }

    // an element boundary counts child nodes: 0 is its start, anything else its end
    const within = node.nodeType === Node.TEXT_NODE || offset === 0 ? offset : (element?.textContent?.length ?? 0);

    return Number(start) + within;
};

// a rectangle relative to the container the popovers are placed in
const anchorOf = (rect: DOMRect, container: HTMLElement): Anchor =>
{
    const origin = container.getBoundingClientRect();

    return { top: rect.top - origin.top, bottom: rect.bottom - origin.top, left: rect.left - origin.left };
};

export const MaskedPreview = (props: MaskedPreviewProps) =>
{
    const { parts, selected, selectedIndex, onSelectPlaceholder, onSelectText, placeholderPopover, selectionPopover } = props;
    const container = useRef<HTMLDivElement>(null);
    const preview = useRef<HTMLDivElement>(null);
    const [placeholderAnchor, setPlaceholderAnchor] = useState<Anchor | undefined>(undefined);
    const [selectionAnchor, setSelectionAnchor] = useState<Anchor | undefined>(undefined);

    // measured after every change, as unmasking a value moves the text after it
    useLayoutEffect(() =>
    {
        const element = selectedIndex == null ? undefined : preview.current?.children[selectedIndex];

        setPlaceholderAnchor(element == null || container.current == null ? undefined : anchorOf(element.getBoundingClientRect(), container.current));
    }, [parts, selectedIndex]);

    const readSelection = () =>
    {
        const selection = window.getSelection();
        const range = selection == null || selection.isCollapsed || selection.rangeCount === 0 ? undefined : selection.getRangeAt(0);
        const start = range == null ? undefined : sourceOffset(range.startContainer, range.startOffset);
        const end = range == null ? undefined : sourceOffset(range.endContainer, range.endOffset);
        // the popover opens at the selection's last line
        const lines = range?.getClientRects();
        const last = lines?.[lines.length - 1];

        if (start == null || end == null || end <= start || last == null || container.current == null)
        {
            onSelectText(undefined);
            return;
        }

        setSelectionAnchor(anchorOf(last, container.current));
        onSelectText({ start, end });
    };

    return (
        <div ref={container} className="preview-container">
            <div ref={preview} className="preview" aria-label="Masked prompt" onMouseUp={readSelection} onKeyUp={readSelection}>
                {parts.map((part, index) =>
                {
                    if (part.kind === 'text')
                    {
                        return (
                            <span key={index} data-start={part.start}>
                                {part.text}
                            </span>
                        );
                    }

                    const isOpen = part.placeholder === selected && index === selectedIndex;

                    if (part.kind === 'revealed')
                    {
                        return (
                            <button
                                key={index}
                                type="button"
                                className="revealed"
                                title={`${part.placeholder}, sent as is`}
                                aria-expanded={isOpen}
                                onClick={() => onSelectPlaceholder(part.placeholder, index)}
                            >
                                {part.text}
                            </button>
                        );
                    }

                    return (
                        <button
                            key={index}
                            type="button"
                            className={`placeholder ${categoryClass(part.category)}${part.placeholder === selected ? ' is-selected' : ''}`}
                            aria-expanded={isOpen}
                            onClick={() => onSelectPlaceholder(part.placeholder, index)}
                        >
                            {part.placeholder}
                        </button>
                    );
                })}
            </div>
            {placeholderPopover == null || placeholderAnchor == null ? null : placeholderPopover(placeholderAnchor)}
            {selectionPopover == null || selectionAnchor == null ? null : selectionPopover(selectionAnchor)}
        </div>
    );
};
