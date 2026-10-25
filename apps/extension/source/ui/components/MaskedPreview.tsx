import type { Span } from '@secureprompt/core';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { excerptOf, type OutputPart } from '../../masking/output';
import { categoryColor, placeholderLabel } from '../categories';
import { CategoryIcon } from './CategoryIcon';
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

// the text line a rectangle sits on, so a chip and its revealed text (different heights) anchor the popover at the same place
const lineOf = (rect: DOMRect, preview: HTMLElement): { top: number; bottom: number } =>
{
    const style = getComputedStyle(preview);
    const lineHeight = parseFloat(style.lineHeight);

    if (!Number.isFinite(lineHeight) || lineHeight <= 0)
    {
        return rect;
    }

    const contentTop = preview.getBoundingClientRect().top + preview.clientTop + parseFloat(style.paddingTop);
    const line = Math.floor((rect.top + rect.height / 2 - contentTop) / lineHeight);

    return { top: contentTop + line * lineHeight, bottom: contentTop + (line + 1) * lineHeight };
};

// a rectangle's line, relative to the container the popovers are placed in
const anchorOf = (rect: DOMRect, preview: HTMLElement, container: HTMLElement): Anchor =>
{
    const origin = container.getBoundingClientRect();
    const line = lineOf(rect, preview);

    return { top: line.top - origin.top, bottom: line.bottom - origin.top, left: rect.left - origin.left };
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

        setPlaceholderAnchor(
            element == null || preview.current == null || container.current == null ? undefined : anchorOf(element.getBoundingClientRect(), preview.current, container.current),
        );
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

        if (start == null || end == null || end <= start || last == null || preview.current == null || container.current == null)
        {
            onSelectText(undefined);
            return;
        }

        setSelectionAnchor(anchorOf(last, preview.current, container.current));
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
                        // an inline span, not a <button>: a button is a box taller than the text and pushes the lines apart
                        return (
                            <span
                                key={index}
                                role="button"
                                tabIndex={0}
                                className="revealed"
                                data-tooltip={`${placeholderLabel(part.category, part.placeholder)}, sent as is`}
                                aria-expanded={isOpen}
                                onClick={() => onSelectPlaceholder(part.placeholder, index)}
                                onKeyDown={(event) =>
                                {
                                    if (event.key === 'Enter' || event.key === ' ')
                                    {
                                        event.preventDefault();
                                        onSelectPlaceholder(part.placeholder, index);
                                    }
                                }}
                            >
                                <CategoryIcon category={part.category} />
                                <span className="revealed-text" style={{ textDecorationColor: categoryColor(part.category) }}>
                                    {part.text}
                                </span>
                            </span>
                        );
                    }

                    return (
                        <button
                            key={index}
                            type="button"
                            className={`placeholder${part.placeholder === selected ? ' is-selected' : ''}`}
                            // copying the preview copies the placeholder itself, see copy.ts
                            data-placeholder={part.placeholder}
                            // the hidden value at a glance, on one line; it stays in the side panel like the input
                            data-tooltip={excerptOf(part.text.replace(/\s+/g, ' ').trim())}
                            aria-expanded={isOpen}
                            onClick={() => onSelectPlaceholder(part.placeholder, index)}
                        >
                            <CategoryIcon category={part.category} />
                            {placeholderLabel(part.category, part.placeholder)}
                        </button>
                    );
                })}
            </div>
            {placeholderPopover == null || placeholderAnchor == null ? null : placeholderPopover(placeholderAnchor)}
            {selectionPopover == null || selectionAnchor == null ? null : selectionPopover(selectionAnchor)}
        </div>
    );
};
