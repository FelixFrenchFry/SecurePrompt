import type { Category } from '@secureprompt/core';
import { categoryColor } from '../categories';
import { CategoryIcon } from './CategoryIcon';

// example text: plain strings, and masked values shown as placeholder or original
type ExamplePart = string | { category: Category; placeholder: string; original: string };

// a before → after pair, showing what masking or unmasking does at a glance
const Example = ({ parts, rows }: { parts: ExamplePart[]; rows: Array<{ label: string; masked: boolean }> }) =>
{
    return (
        <div className="example" aria-label="Example">
            {rows.map(({ label, masked }) => (
                <div key={label} className="example-row">
                    <span className="example-label">{label}</span>
                    <span>
                        {parts.map((part, index) =>
                        {
                            if (typeof part === 'string')
                            {
                                return part;
                            }
                            return masked ? (
                                <span key={index} className="placeholder example-placeholder">
                                    <CategoryIcon category={part.category} />
                                    {part.placeholder}
                                </span>
                            ) : (
                                <mark key={index} className="restored">
                                    <CategoryIcon category={part.category} />
                                    <span className="restored-text" style={{ textDecorationColor: categoryColor(part.category) }}>
                                        {part.original}
                                    </span>
                                </mark>
                            );
                        })}
                    </span>
                </div>
            ))}
        </div>
    );
};

const ANSWER_EXAMPLE: ExamplePart[] = [
    'Hi ',
    { category: 'PERSON', placeholder: 'PERSON_001', original: 'John Smith' },
    ', please call ',
    { category: 'PHONE', placeholder: 'PHONE_001', original: '555-0134' },
    ' …',
];

const STEPS = [
    {
        title: 'Input your prompt or text file below.',
        text: 'A privacy filter masks the personal data using placeholders.',
    },
    { title: 'Review the result and send.', text: 'Click the placeholders to see what they hide, then copy or submit the prompt.' },
    { title: 'Unmask the answer.', text: 'Paste the AI\'s reply into the other tab, and placeholders turn back into your originals.' },
];

// what an empty Prompt page shows: what the side panel does, in three steps
export const EmptyPrompts = () =>
{
    return (
        <div className="empty-session">
            <h1 className="empty-title">Mask personal data before it reaches AI</h1>
            <ol className="steps">
                {STEPS.map((step) => (
                    <li key={step.title}>
                        <strong>{step.title}</strong> <span className="muted">{step.text}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
};

// what an empty Answer page shows: how unmasking works, with an example
export const EmptyAnswers = () =>
{
    return (
        <div className="empty-session">
            <div>
                <h1 className="empty-title">Unmask the answer you get from AI</h1>
                <p className="small muted no-margin">Paste the reply below. Placeholders turn back into what was hidden.</p>
            </div>
            <Example
                parts={ANSWER_EXAMPLE}
                rows={[
                    { label: 'The AI writes', masked: true },
                    { label: 'What you get', masked: false },
                ]}
            />
        </div>
    );
};
