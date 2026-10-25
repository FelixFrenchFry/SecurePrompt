import {
    CalendarIcon,
    CreditCardIcon,
    DeviceMobileIcon,
    GlobeIcon,
    type Icon,
    KeyIcon,
    LocationIcon,
    MailIcon,
    PersonIcon,
    QuestionIcon,
} from '@primer/octicons-react';
import type { Category } from '@secureprompt/core';

// names, descriptions and icons shown in the side panel; icon colors are the --sp-<category> tokens
export const CATEGORY_INFO: Record<Category, { label: string; description: string; icon: Icon }> = {
    PERSON: { label: 'Person', description: 'Names, also surname-only mentions', icon: PersonIcon },
    EMAIL: { label: 'Email', description: 'Email addresses, also written out ("at")', icon: MailIcon },
    PHONE: { label: 'Phone', description: 'Phone and fax numbers', icon: DeviceMobileIcon },
    ADDRESS: { label: 'Address', description: 'Street addresses and coordinates', icon: LocationIcon },
    ACCOUNT: { label: 'Account', description: 'IBANs, cards, customer IDs, usernames', icon: CreditCardIcon },
    DATE: { label: 'Date', description: 'Birth dates, appointments, timestamps', icon: CalendarIcon },
    NETWORK: { label: 'Network', description: 'URLs, IP and MAC addresses', icon: GlobeIcon },
    SECRET: { label: 'Secret', description: 'Passwords, API keys, tokens', icon: KeyIcon },
    OTHER: { label: 'Other', description: 'Age, gender, companies, countries', icon: QuestionIcon },
};

// the CSS class that sets a category's icon color
export const categoryClass = (category: Category): string => `category-${category.toLowerCase()}`;

// a category's color as a CSS value, for the underline under a visible original
export const categoryColor = (category: Category): string => `var(--sp-${category.toLowerCase()})`;

// how a placeholder reads in the side panel: PERSON_001 → "Person 1"; the chat page still gets PERSON_001
export const placeholderLabel = (category: Category, placeholder: string): string =>
{
    const number = /_(\d+)$/.exec(placeholder)?.[1];

    return number == null ? placeholder : `${CATEGORY_INFO[category].label} ${Number(number)}`;
};
