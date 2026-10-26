// one tooltip for the whole side panel: any element with data-tooltip="…" gets it, shown at once on
// hover or keyboard focus, in the top layer so scroll areas can't clip it

const SELECTOR = '[data-tooltip]';
const TOOLTIP_ID = 'sp-tooltip';
const GAP = 6;
const MARGIN = 8;
// a short delay before closing, so moving within the element or quickly back onto it doesn't flicker
const LEAVE_MS = 120;

let initialized = false;

// wrapped text keeps the box at its maximum width, so narrow it to the longest line
const fitToText = (tooltip: HTMLElement) =>
{
    tooltip.style.width = '';

    const range = document.createRange();

    range.selectNodeContents(tooltip);

    const lines = [...range.getClientRects()];

    if (lines.length < 2)
    {
        return;
    }

    const style = getComputedStyle(tooltip);
    const frame =
        style.boxSizing === 'border-box'
            ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
            : 0;

    tooltip.style.width = `${Math.ceil(Math.max(...lines.map((line) => line.width)) + frame)}px`;
};

// below the element, or above it when there's no room, and always inside the window
const place = (tooltip: HTMLElement, anchor: HTMLElement) =>
{
    const target = anchor.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const below = target.bottom + GAP;
    const above = target.top - box.height - GAP;
    const left = target.left + target.width / 2 - box.width / 2;

    tooltip.style.left = `${Math.max(MARGIN, Math.min(left, width - box.width - MARGIN))}px`;
    tooltip.style.top = `${below + box.height + MARGIN <= height || above < MARGIN ? below : above}px`;
};

export const initializeTooltips = () =>
{
    if (initialized)
    {
        return;
    }

    initialized = true;

    const tooltip = document.createElement('div');
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'tooltip';
    tooltip.popover = 'manual';
    tooltip.setAttribute('role', 'tooltip');
    document.body.append(tooltip);

    const close = () =>
    {
        clearTimeout(timer);
        target?.removeAttribute('aria-describedby');
        target = null;

        if (tooltip.matches(':popover-open'))
        {
            tooltip.hidePopover();
        }
    };

    const show = (node: HTMLElement) =>
    {
        const text = node.dataset.tooltip ?? '';

        if (text.length === 0 || !node.isConnected || node.getClientRects().length === 0)
        {
            close();
            return;
        }

        clearTimeout(timer);

        if (target !== node)
        {
            target?.removeAttribute('aria-describedby');
        }

        target = node;
        node.setAttribute('aria-describedby', TOOLTIP_ID);
        tooltip.textContent = text;

        if (!tooltip.matches(':popover-open'))
        {
            tooltip.showPopover();
        }

        fitToText(tooltip);
        place(tooltip, node);
    };

    const leave = () =>
    {
        clearTimeout(timer);
        timer = setTimeout(() =>
        {
            if (!target?.matches(':hover, :focus-visible'))
            {
                close();
            }
        }, LEAVE_MS);
    };

    const find = (value: EventTarget | null) => (value instanceof Element ? value.closest<HTMLElement>(SELECTOR) : null);

    document.addEventListener('pointerover', (event) =>
    {
        const node = find(event.target);

        if (event.pointerType === 'mouse' && node != null)
        {
            show(node);
        }
    });
    document.addEventListener('pointerout', (event) =>
    {
        if (target != null && find(event.target) === target)
        {
            leave();
        }
    });
    // keyboard focus only, so focus returned after a mouse click stays quiet
    document.addEventListener('focusin', (event) =>
    {
        const node = find(event.target);

        if (node?.matches(':focus-visible') === true)
        {
            show(node);
        }
    });
    document.addEventListener('focusout', (event) =>
    {
        if (target != null && find(event.target) === target)
        {
            leave();
        }
    });
    // a click starts something else, like a copy or a page change; help buttons have no action, so theirs stays
    document.addEventListener('click', (event) =>
    {
        const node = find(event.target);

        if (node?.hasAttribute('data-tooltip-help') === true)
        {
            show(node);
            return;
        }

        if (target != null && node === target)
        {
            close();
        }
    });
    document.addEventListener('keydown', (event) =>
    {
        if (event.key === 'Escape')
        {
            close();
        }
    });
    document.addEventListener('visibilitychange', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, { capture: true });
};
