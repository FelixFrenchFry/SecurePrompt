import type { CSSProperties } from 'react';
import type {
    PrivacyBenchmarkStage,
    SensitiveItemCategory,
} from '../../source/privacy';

export type CategoryColors = {
    // text, icon, strong border, and active state color
    primary: string;
    // soft background tint behind category highlights
    secondary: string;
    // neutral border color for inactive category surfaces
    border: string;
};

export type CategoryColorStyle = CSSProperties & {
    '--category-primary': string;
    '--category-secondary': string;
    '--category-border': string;
};

export type BenchmarkStageColorStyle = CSSProperties & {
    '--benchmark-stage-color': string;
};

export const CATEGORY_COLORS: Record<SensitiveItemCategory, CategoryColors> = {
    EMAIL: {
        primary: '#243172',
        secondary: '#f1f3fb',
        border: '#c8cfe8',
    },
    PHONE: {
        primary: '#166534',
        secondary: '#ecfdf5',
        border: '#bbf7d0',
    },
    PERSON: {
        primary: '#2563eb',
        secondary: '#eff6ff',
        border: '#bfdbfe',
    },
    ADDRESS: {
        primary: '#7c2d12',
        secondary: '#fff7ed',
        border: '#fdba74',
    },
    ACCOUNT: {
        primary: '#6d28d9',
        secondary: '#f5f3ff',
        border: '#ddd6fe',
    },
    DATE: {
        primary: '#a16207',
        secondary: '#fefce8',
        border: '#fde047',
    },
    NETWORK: {
        primary: '#0f766e',
        secondary: '#f0fdfa',
        border: '#5eead4',
    },
    SECRET: {
        primary: '#be123c',
        secondary: '#fff1f2',
        border: '#fecdd3',
    },
    OTHER: {
        primary: '#334155',
        secondary: '#f8fafc',
        border: '#dbe4ec',
    },
};

export const BENCHMARK_STAGE_COLORS: Record<PrivacyBenchmarkStage, string> = {
    rulesDetection: '#0f766e',
    modelDetection: '#7c3aed',
    resultAssembly: '#d97706',
    rulesHardening: '#ea580c',
    modelHardening: '#db2777',
    finalization: '#475569',
};

export const getCategoryColorStyle = (
    category: SensitiveItemCategory,
): CategoryColorStyle =>
{
    const colors = CATEGORY_COLORS[category];

    return {
        '--category-primary': colors.primary,
        '--category-secondary': colors.secondary,
        '--category-border': colors.border,
    };
};

export const getBenchmarkStageColorStyle = (
    stage: PrivacyBenchmarkStage,
): BenchmarkStageColorStyle =>
{
    return {
        '--benchmark-stage-color': BENCHMARK_STAGE_COLORS[stage],
    };
};
