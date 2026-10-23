import type { Category } from '@secureprompt/core';

// names and descriptions shown in the side panel, colors are the --sp-<category>-* tokens
export const CATEGORY_INFO: Record<Category, { label: string; description: string }> = {
    PERSON: { label: 'Person', description: 'Names, also surname-only mentions' },
    EMAIL: { label: 'Email', description: 'Email addresses, also "name [at] mail [dot] de"' },
    PHONE: { label: 'Phone', description: 'Phone and fax numbers' },
    ADDRESS: { label: 'Address', description: 'Street addresses and coordinates' },
    ACCOUNT: { label: 'Account', description: 'IBANs, cards, customer IDs, usernames' },
    DATE: { label: 'Date', description: 'Birth dates, appointments, timestamps' },
    NETWORK: { label: 'Network', description: 'URLs, IP and MAC addresses' },
    SECRET: { label: 'Secret', description: 'Passwords, API keys, tokens' },
    OTHER: { label: 'Other', description: 'Age, gender, companies, countries' },
};

// the CSS class that colors a placeholder or label by its category
export const categoryClass = (category: Category): string => `category-${category.toLowerCase()}`;
