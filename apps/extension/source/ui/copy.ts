// copying anywhere in the side panel gives real placeholders: a mask label "Person 1" becomes PERSON_001, as the
// chat page gets it. Copies without mask labels keep the browser's own behavior

const LABEL = '[data-placeholder]';

let initialized = false;

// the copied text with every mask label replaced by its placeholder
const maskedTextOf = (fragment: DocumentFragment): string =>
{
    fragment.querySelectorAll<HTMLElement>(LABEL).forEach((element) => element.replaceWith(element.dataset.placeholder ?? ''));

    // innerText needs rendered elements: a hidden copy off screen keeps the line breaks the browser would copy
    const holder = document.createElement('div');

    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position: fixed; top: 0; left: -10000px; white-space: pre-wrap;';
    holder.append(fragment);
    document.body.append(holder);

    const text = holder.innerText;

    holder.remove();

    return text;
};

export const initializeCopy = () =>
{
    if (initialized)
    {
        return;
    }

    initialized = true;

    document.addEventListener('copy', (event) =>
    {
        const selection = document.getSelection();

        if (event.clipboardData == null || selection == null || selection.isCollapsed || selection.rangeCount === 0)
        {
            return;
        }

        const range = selection.getRangeAt(0);
        const ancestor = range.commonAncestorContainer;
        const label = (ancestor instanceof Element ? ancestor : ancestor.parentElement)?.closest<HTMLElement>(LABEL);
        let text: string;

        if (label != null)
        {
            // a selection within one label copies its whole placeholder
            text = label.dataset.placeholder ?? '';
        }
        else
        {
            const fragment = range.cloneContents();

            if (fragment.querySelector(LABEL) == null)
            {
                return;
            }

            text = maskedTextOf(fragment);
        }

        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
    });
};
