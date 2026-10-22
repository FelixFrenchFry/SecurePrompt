import type { Category } from '@secureprompt/core';

// bardsai/eu-pii-anonimization-multilang-v2 entity types → our categories
// null means never mask, for context that doesn't identify anyone
export const BARDSAI_TYPE_CATEGORIES: Record<string, Category | null> = {
    PERSON_NAME: 'PERSON',
    PERSON_ALIAS: 'PERSON',
    PERSON_IDENTIFIER: 'ACCOUNT',
    PERSON_ATTRIBUTE: 'OTHER', // age, gender and similar
    // "Herr", "Dr.", "Geschäftsführerin" stay readable: "Herr PERSON_001"
    PERSON_ROLE_OR_TITLE: null,
    DATE_OF_BIRTH: 'DATE',
    EMAIL_ADDRESS: 'EMAIL',
    PHONE_NUMBER: 'PHONE',
    CONTACT_HANDLE: 'ACCOUNT',
    POSTAL_ADDRESS: 'ADDRESS',
    // also general places ("Berlin ist die Hauptstadt"), the model can't tell them apart
    LOCATION: 'ADDRESS',
    GEO_LOCATION: 'ADDRESS',
    IP_ADDRESS: 'NETWORK',
    IDENTIFYING_LINK: 'NETWORK',
    DEVICE_IDENTIFIER: 'ACCOUNT',
    ACCOUNT_IDENTIFIER: 'ACCOUNT',
    BANK_ACCOUNT_IDENTIFIER: 'ACCOUNT',
    PAYMENT_CARD: 'ACCOUNT',
    PAYMENT_CARD_SECURITY: 'SECRET',
    AUTH_SECRET: 'SECRET',
    DOCUMENT_IDENTIFIER: 'ACCOUNT',
    DOCUMENT_REFERENCE: 'ACCOUNT',
    VEHICLE_IDENTIFIER: 'ACCOUNT',
    ORGANIZATION_IDENTIFIER: 'ACCOUNT',
    ORGANIZATION_NAME: 'OTHER',
    PROPER_NAME: 'OTHER',
    // amounts are context ("1.240,00 €"), not identifiers
    FINANCIAL_AMOUNT: null,
    // GDPR special categories are usually the subject of the question ("Nussallergie")
    HEALTH_DATA: 'OTHER',
    BIOMETRIC_DATA: 'OTHER',
    ETHNIC_ORIGIN: 'OTHER',
    POLITICAL_OPINION: 'OTHER',
    RELIGION_OR_BELIEF: 'OTHER',
    SEXUAL_ORIENTATION: 'OTHER',
    TRADE_UNION_MEMBERSHIP: 'OTHER',
    CRIMINAL_OFFENCE_DATA: 'OTHER',
};

// types describing the same kind of value, which the decoder pools against "O"
export const BARDSAI_TYPE_KINDS: Record<string, string> = {
    PERSON_NAME: 'name',
    PERSON_ALIAS: 'name',
    PROPER_NAME: 'name',
    POSTAL_ADDRESS: 'place',
    LOCATION: 'place',
    GEO_LOCATION: 'place',
    PERSON_IDENTIFIER: 'identifier',
    BANK_ACCOUNT_IDENTIFIER: 'identifier',
    PAYMENT_CARD: 'identifier',
    ACCOUNT_IDENTIFIER: 'identifier',
    DOCUMENT_IDENTIFIER: 'identifier',
    DOCUMENT_REFERENCE: 'identifier',
    VEHICLE_IDENTIFIER: 'identifier',
    DEVICE_IDENTIFIER: 'identifier',
    ORGANIZATION_IDENTIFIER: 'identifier',
    CONTACT_HANDLE: 'identifier',
};
