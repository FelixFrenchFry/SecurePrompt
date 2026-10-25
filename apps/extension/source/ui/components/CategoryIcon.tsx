import type { Category } from '@secureprompt/core';
import { CATEGORY_INFO, categoryClass } from '../categories';

// a category's Octicon in its color; the label next to it says the category, so the icon is decorative
export const CategoryIcon = ({ category, size = 14 }: { category: Category; size?: number }) =>
{
    const Icon = CATEGORY_INFO[category].icon;

    return <Icon size={size} className={`category-icon ${categoryClass(category)}`} aria-hidden="true" />;
};
