type Tab = 'prompt' | 'answer';

const TABS: Array<{ tab: Tab; label: string }> = [
    { tab: 'prompt', label: 'Prompt' },
    { tab: 'answer', label: 'Answer' },
];

// Primer's underline navigation between masking a prompt and restoring the answer
export const Tabs = ({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) =>
{
    return (
        <nav className="tabs" aria-label="Side panel">
            {TABS.map(({ tab, label }) => (
                <button
                    key={tab}
                    type="button"
                    className={tab === active ? 'tab is-active' : 'tab'}
                    aria-current={tab === active ? 'page' : undefined}
                    onClick={() => onSelect(tab)}
                >
                    {label}
                </button>
            ))}
        </nav>
    );
};
