import { useEffect, useState } from 'react';

const COPIED_FEEDBACK_MS = 1500;

// "Copied" feedback on a button, shown briefly after a successful copy
export const useCopied = (copy: () => Promise<boolean>) =>
{
    const [copied, setCopied] = useState(false);

    useEffect(() =>
    {
        if (!copied)
        {
            return undefined;
        }

        const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);

        return () => window.clearTimeout(timer);
    }, [copied]);

    return { copied, onCopy: () => void copy().then(setCopied) };
};
