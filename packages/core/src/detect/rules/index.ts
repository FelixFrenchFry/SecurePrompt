import type { Detector } from '../../types';
import { accountRule } from './account';
import { dateRule } from './date';
import { emailRule } from './email';
import { locationRule } from './location';
import { networkRule } from './network';
import { phoneRule } from './phone';
import { secretRule } from './secret';
import { usernameRule } from './username';

// all rules by name, so each one can be switched off
export const RULES = {
    date: dateRule,
    network: networkRule,
    secret: secretRule,
    account: accountRule,
    phone: phoneRule,
    email: emailRule,
    location: locationRule,
    username: usernameRule,
} as const satisfies Record<string, Detector>;

export type RuleName = keyof typeof RULES;

export const RULE_NAMES = Object.keys(RULES) as RuleName[];
