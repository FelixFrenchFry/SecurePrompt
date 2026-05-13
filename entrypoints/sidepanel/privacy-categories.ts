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
import type { SensitiveItemCategory } from '../../source/privacy';

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
        description: 'Email addresses and email links.',
        Icon: Mail,
    },
    {
        category: 'PHONE',
        label: 'Phone',
        description: 'Phone, mobile, messaging, SMS, and tel values.',
        Icon: Phone,
    },
    {
        category: 'PERSON',
        label: 'Person',
        description: 'Private names, people, owners, reviewers, and contacts.',
        Icon: UserRound,
    },
    {
        category: 'ADDRESS',
        label: 'Address',
        description: 'Street addresses, postal addresses, and private locations.',
        Icon: Home,
    },
    {
        category: 'ACCOUNT',
        label: 'Account',
        description: 'Customer, account, payment, bank, tax, invoice, tenant, contract, ticket, and subscription IDs.',
        Icon: Landmark,
    },
    {
        category: 'DATE',
        label: 'Date',
        description: 'Dates, times, timestamps, and calendar references.',
        Icon: Calendar,
    },
    {
        category: 'NETWORK',
        label: 'Network',
        description: 'URLs, domains, hostnames, IPs, endpoints, email links, and private infrastructure references.',
        Icon: Globe,
    },
    {
        category: 'SECRET',
        label: 'Secret',
        description: 'Credentials, tokens, API keys, passwords, private keys, connection strings, and webhooks.',
        Icon: Lock,
    },
    {
        category: 'OTHER',
        label: 'Other',
        description: 'Sensitive values that do not fit one of the known categories.',
        Icon: CircleHelp,
    },
];
