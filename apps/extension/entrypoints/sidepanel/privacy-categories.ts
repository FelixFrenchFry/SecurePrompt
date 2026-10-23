import {
    Calendar,
    CircleHelp,
    Globe,
    Home,
    Landmark,
    Lock,
    Mail,
    Phone,
    UserRound,
} from 'lucide-react';
import type { SensitiveItemCategory } from '../../source/engine';

export type PrivacyScanCategory = {
    category: SensitiveItemCategory;
    label: string;
    description: string;
    Icon: typeof Mail;
};

export const PRIVACY_SCAN_CATEGORIES: PrivacyScanCategory[] = [
    {
        category: 'EMAIL',
        label: 'Email',
        description: 'Email addresses, aliases, mail links...',
        Icon: Mail,
    },
    {
        category: 'PHONE',
        label: 'Phone',
        description: 'Phone, mobile, and messaging numbers...',
        Icon: Phone,
    },
    {
        category: 'PERSON',
        label: 'Person',
        description: 'Private names, people, owners, contacts...',
        Icon: UserRound,
    },
    {
        category: 'ADDRESS',
        label: 'Address',
        description: 'Street and postal addresses, locations...',
        Icon: Home,
    },
    {
        category: 'ACCOUNT',
        label: 'Account',
        description: 'Customer, account, payment, bank, contract, invoice, tax, ticket, subscriptions...',
        Icon: Landmark,
    },
    {
        category: 'DATE',
        label: 'Date',
        description: 'Dates, timestamps, calendar references...',
        Icon: Calendar,
    },
    {
        category: 'NETWORK',
        label: 'Network',
        description: 'URLs, domains, hostnames, IPs, endpoints, private infrastructure...',
        Icon: Globe,
    },
    {
        category: 'SECRET',
        label: 'Secret',
        description: 'API keys, credentials, tokens, passwords, private keys, webhooks...',
        Icon: Lock,
    },
    {
        category: 'OTHER',
        label: 'Other',
        description: 'Outside of the known categories...',
        Icon: CircleHelp,
    },
];
