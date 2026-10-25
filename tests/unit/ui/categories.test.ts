import { describe, expect, it } from 'vitest';
import { categoryClass, categoryColor, placeholderLabel } from '../../../apps/extension/source/ui/categories';

describe('placeholderLabel', () =>
{
    it.each([
        ['PERSON', 'PERSON_001', 'Person 1'],
        ['EMAIL', 'EMAIL_012', 'Email 12'],
        ['OTHER', 'OTHER_1000', 'Other 1000'],
        // the label follows the given category, which a relabeled placeholder's name already matches
        ['ACCOUNT', 'ACCOUNT_001', 'Account 1'],
    ] as const)('reads %s placeholder %s as "%s"', (category, placeholder, label) =>
    {
        expect(placeholderLabel(category, placeholder)).toBe(label);
    });

    it.each(['PERSON', 'PERSON_', 'PERSON_01x', 'PERSON_001_'])('keeps %s as is without a trailing number', (placeholder) =>
    {
        expect(placeholderLabel('PERSON', placeholder)).toBe(placeholder);
    });
});

describe('categoryClass', () =>
{
    it('names the CSS class of a category', () =>
    {
        expect(categoryClass('SECRET')).toBe('category-secret');
    });
});

describe('categoryColor', () =>
{
    it('names the color token of a category', () =>
    {
        expect(categoryColor('PHONE')).toBe('var(--sp-phone)');
    });
});
