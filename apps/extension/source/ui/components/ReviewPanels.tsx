import { ArrowLeftIcon, CheckIcon, CopyIcon, EyeClosedIcon, EyeIcon, TagIcon, XIcon } from '@primer/octicons-react';
import type { Category } from '@secureprompt/core';
import { useState } from 'react';
import type { PlaceholderDetails } from '../../masking/output';
import { CATEGORY_INFO, categoryClass } from '../categories';
import { Button, IconButton } from './Button';
import { Select } from './Select';
import { useCopied } from './useCopied';

// what a rule recognized, in plain words
const RECOGNIZED: Record<Category, string> = {
    EMAIL: 'an email address',
    PHONE: 'a phone number',
    PERSON: 'a username',
    ADDRESS: 'a location',
    ACCOUNT: 'an account number or ID',
    DATE: 'a date',
    NETWORK: 'a web or network address',
    SECRET: 'a password or key',
    OTHER: 'personal data',
};

// how a value was found, in plain words
const sourceText = (details: PlaceholderDetails) =>
{
    switch (details.source)
    {
        case 'model':
            return 'found by the privacy filter model';
        case 'manual':
            return 'selected by you';
        case 'propagated':
            return 'repeats a found value';
        case 'rule':
            return `recognized as ${RECOGNIZED[details.category]}`;
    }
};

type PlaceholderPanelProps = {
    details: PlaceholderDetails;
    original: string;
    revealed: boolean;
    // the categories a value can move to
    categories: Category[];
    onToggle: () => void;
    onCopy: () => Promise<boolean>;
    onChangeCategory: (category: Category) => void;
};

// what a placeholder stands for, as GitHub's action menu: the original on top, icon actions below
export const PlaceholderPanel = ({ details, original, revealed, categories, onToggle, onCopy, onChangeCategory }: PlaceholderPanelProps) =>
{
    const [picking, setPicking] = useState(false);
    const { copied, onCopy: copy } = useCopied(onCopy);
    const facts = [CATEGORY_INFO[details.category].label, sourceText(details), details.mentions > 1 ? `${details.mentions} mentions` : undefined].filter(Boolean);

    return (
        <div className="menu">
            <div className="menu-head">
                <div className="menu-title">{original}</div>
                <div className="small muted">{facts.join(' · ')}</div>
            </div>
            <div className="menu-divider" />
            {picking ? (
                <div className="menu-actions menu-categories">
                    <IconButton icon={ArrowLeftIcon} label="Back" onClick={() => setPicking(false)} />
                    {categories.map((category) => (
                        <button
                            key={category}
                            type="button"
                            className={`label category-button ${categoryClass(category)}${category === details.category ? ' is-current' : ''}`}
                            aria-pressed={category === details.category}
                            onClick={() => (category === details.category ? setPicking(false) : onChangeCategory(category))}
                        >
                            {CATEGORY_INFO[category].label}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="menu-actions">
                    <IconButton icon={revealed ? EyeClosedIcon : EyeIcon} label={revealed ? 'Mask again' : 'Send unmasked'} onClick={onToggle} />
                    <IconButton icon={TagIcon} label="Change category" onClick={() => setPicking(true)} />
                    <IconButton icon={copied ? CheckIcon : CopyIcon} label={copied ? 'Copied' : 'Copy original'} className={copied ? 'is-done' : ''} onClick={copy} />
                </div>
            )}
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
