import { AlertIcon, CheckIcon, InfoIcon, type Icon } from '@primer/octicons-react';
import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<Tone, Icon> = { info: InfoIcon, success: CheckIcon, warning: AlertIcon, danger: AlertIcon };

// a short message box in Primer's flash style
export const Flash = ({ tone, children, action }: { tone: Tone; children: ReactNode; action?: ReactNode }) =>
{
    const FlashIcon = ICONS[tone];

    return (
        <div className={`flash flash-${tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
            <FlashIcon size={16} className="flash-icon" />
            <span className="flash-text">{children}</span>
            {action}
        </div>
    );
};
