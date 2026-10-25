import { ChatLockedIcon, UnlockIcon, type Icon } from '@primer/octicons-react';
import type { Page } from '../state';

const PAGES: Array<{ page: Page; label: string; icon: Icon; counted: [string, string] }> = [
    { page: 'prompt', label: 'Prompt', icon: ChatLockedIcon, counted: ['masked prompt', 'masked prompts'] },
    { page: 'answer', label: 'Answer', icon: UnlockIcon, counted: ['unmasked answer', 'unmasked answers'] },
];

// Primer's segmented control between masking prompts and unmasking answers; the selected half
// takes the logo's taupe, like the main buttons
export const Tabs = ({ active, counts, onSelect }: { active: Page; counts: Record<Page, number>; onSelect: (page: Page) => void }) =>
{
    return (
        <nav className="tabs" aria-label="Side panel">
            <div className="segmented">
                {PAGES.map(({ page, label, icon: TabIcon, counted }) => (
                    <button
                        key={page}
                        type="button"
                        className={`segment${page === active ? ' is-active' : ''}`}
                        aria-current={page === active ? 'page' : undefined}
                        data-tooltip={`${counts[page]} ${counts[page] === 1 ? counted[0] : counted[1]} in this session`}
                        onClick={() => onSelect(page)}
                    >
                        <TabIcon size={16} />
                        {label}
                        <span className="segment-count" aria-hidden="true">
                            {counts[page]}
                        </span>
                    </button>
                ))}
            </div>
        </nav>
    );
};
