import { useState } from 'react';
import { getAiChatFaviconUrl } from '../../chat-targets';
import type { ChatTarget } from '../state';

// the chat site's favicon from Chrome's cache (a globe if it has none), or its first letter if the image fails to load
export const SiteIcon = ({ target }: { target: ChatTarget }) =>
{
    const src = getAiChatFaviconUrl(target.id, location.origin, target.pageUrl);
    const [failedSrc, setFailedSrc] = useState<string>();

    if (src == null || failedSrc === src)
    {
        return (
            <span className="site-badge" aria-hidden="true">
                {target.label.charAt(0)}
            </span>
        );
    }

    return <img className="site-icon" src={src} alt="" width={16} height={16} onError={() => setFailedSrc(src)} />;
};
