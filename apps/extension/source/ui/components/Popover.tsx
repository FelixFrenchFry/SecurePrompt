import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// a position inside the popover's container, in pixels
export type Anchor = { top: number; bottom: number; left: number };

type PopoverProps = {
    anchor: Anchor;
    label: string;
    onClose: () => void;
    children: ReactNode;
};

const GAP = 4;

// clicks on placeholders move the popover instead of closing it
const OPENERS = '.placeholder, .revealed';

// floats below its anchor, or above it when there's more visible room there
export const Popover = ({ anchor, label, onClose, children }: PopoverProps) =>
{
    const ref = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    // the element focused before opening, where Escape returns the keyboard focus
    const opener = useRef<Element | null>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | undefined>(undefined);

    close.current = onClose;

    useLayoutEffect(() =>
    {
        const popover = ref.current;
        const container = popover?.offsetParent;
        const scroller = popover?.closest('.screen');

        if (popover == null || !(container instanceof HTMLElement) || scroller == null)
        {
            return;
        }

        if (!popover.contains(document.activeElement))
        {
            opener.current = document.activeElement;
        }

        const visible = scroller.getBoundingClientRect();
        const origin = container.getBoundingClientRect();
        const below = visible.bottom - (origin.top + anchor.bottom);
        const above = origin.top + anchor.top - visible.top;
        const height = popover.offsetHeight + GAP;

        setPosition({
            top: below >= height || below >= above ? anchor.bottom + GAP : anchor.top - height,
            left: Math.max(0, Math.min(anchor.left, container.clientWidth - popover.offsetWidth)),
        });
    }, [anchor]);

    useEffect(() =>
    {
        if (position != null)
        {
            ref.current?.scrollIntoView({ block: 'nearest' });
        }
    }, [position]);

    useEffect(() =>
    {
        const onKeyDown = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
            {
                close.current();

                if (opener.current instanceof HTMLElement)
                {
                    opener.current.focus();
                }
            }
        };
        const onMouseDown = (event: MouseEvent) =>
        {
            const target = event.target instanceof Element ? event.target : null;

            if (target != null && !ref.current?.contains(target) && target.closest(OPENERS) == null)
            {
                close.current();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onMouseDown);

        return () =>
        {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, []);

    return (
        <div ref={ref} className="popover" role="dialog" aria-label={label} style={position ?? { visibility: 'hidden' }}>
            {children}
        </div>
    );
};
