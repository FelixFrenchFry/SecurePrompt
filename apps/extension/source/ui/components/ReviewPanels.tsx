import { EyeClosedIcon, EyeIcon, XIcon } from '@primer/octicons-react';
import type { Category } from '@secureprompt/core';
import { useState } from 'react';
import type { PlaceholderDetails } from '../../masking/output';
import { CATEGORY_INFO, categoryClass } from '../categories';
import { Button, IconButton } from './Button';
import { Select } from './Select';

const SOURCES: Record<PlaceholderDetails['source'], string> = {
    model: 'found by the model',
    manual: 'selected by you',
    rule: 'found by a rule',
    propagated: 'repeats a found value',
};

// a rule's id like 'rule:email' as 'email rule'
const sourceText = (details: PlaceholderDetails) =>
{
    return details.source === 'rule' && details.detector.startsWith('rule:') ? `${details.detector.slice('rule:'.length)} rule` : SOURCES[details.source];
};

type PlaceholderPanelProps = {
    details: PlaceholderDetails;
    original: string;
    revealed: boolean;
    onToggle: () => void;
    onClose: () => void;
};

// what a selected placeholder stands for, and the choice to send its value as is
export const PlaceholderPanel = ({ details, original, revealed, onToggle, onClose }: PlaceholderPanelProps) =>
{
    return (
        <div className="stack">
            <div className="panel-head">
                <span className={`placeholder ${categoryClass(details.category)}`}>{details.placeholder}</span>
                <span className="small muted grow">
                    {CATEGORY_INFO[details.category].label} · {sourceText(details)}
                </span>
                <IconButton icon={XIcon} label="Close details" onClick={onClose} />
            </div>
            <div>
                <div className="small muted">Original, kept on this device</div>
                <div className="mono">{original}</div>
            </div>
            {details.mentions > 1 ? <div className="small muted">{details.mentions} mentions in this prompt</div> : null}
            <div className="row">
                {revealed ? (
                    <Button small icon={EyeClosedIcon} onClick={onToggle}>
                        Mask again
                    </Button>
                ) : (
                    <Button small icon={EyeIcon} onClick={onToggle}>
                        Send unmasked
                    </Button>
                )}
            </div>
        </div>
    );
};

type SelectionBarProps = {
    excerpt: string;
    categories: Category[];
    onMask: (category: Category) => void;
    onCancel: () => void;
};

// masks text the scan missed, after the user selected it in the preview
export const SelectionBar = ({ excerpt, categories, onMask, onCancel }: SelectionBarProps) =>
{
    const [category, setCategory] = useState<Category | undefined>(categories.includes('PERSON') ? 'PERSON' : categories[0]);

    if (category == null)
    {
        return null;
    }

    return (
        <div className="stack">
            <div className="panel-head">
                <span className="small grow">
                    Mask <q className="mono">{excerpt}</q> as
                </span>
                <IconButton icon={XIcon} label="Cancel" onClick={onCancel} />
            </div>
            <div className="row">
                <Select small aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
                    {categories.map((option) => (
                        <option key={option} value={option}>
                            {CATEGORY_INFO[option].label}
                        </option>
                    ))}
                </Select>
                <Button small variant="primary" onClick={() => onMask(category)}>
                    Mask
                </Button>
            </div>
        </div>
    );
};
