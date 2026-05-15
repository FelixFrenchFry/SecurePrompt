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
        primary: 'rgba(36, 49, 114, 1)',
        secondary: 'rgba(241, 243, 251, 1)',
        border: 'rgba(200, 207, 232, 1)',
    },
    PHONE: {
        primary: 'rgba(22, 101, 52, 1)',
        secondary: 'rgba(236, 253, 245, 1)',
        border: 'rgba(187, 247, 208, 1)',
    },
    PERSON: {
        primary: 'rgba(37, 99, 235, 1)',
        secondary: 'rgba(239, 246, 255, 1)',
        border: 'rgba(191, 219, 254, 1)',
    },
    ADDRESS: {
        primary: 'rgba(124, 45, 18, 1)',
        secondary: 'rgba(255, 247, 237, 1)',
        border: 'rgba(253, 186, 116, 1)',
    },
    ACCOUNT: {
        primary: 'rgba(109, 40, 217, 1)',
        secondary: 'rgba(245, 243, 255, 1)',
        border: 'rgba(221, 214, 254, 1)',
    },
    DATE: {
        primary: 'rgba(161, 98, 7, 1)',
        secondary: 'rgba(254, 252, 232, 1)',
        border: 'rgba(253, 224, 71, 1)',
    },
    NETWORK: {
        primary: 'rgba(15, 118, 110, 1)',
        secondary: 'rgba(240, 253, 250, 1)',
        border: 'rgba(94, 234, 212, 1)',
    },
    SECRET: {
        primary: 'rgba(190, 18, 60, 1)',
        secondary: 'rgba(255, 241, 242, 1)',
        border: 'rgba(254, 205, 211, 1)',
    },
    OTHER: {
        primary: 'rgba(51, 65, 85, 1)',
        secondary: 'rgba(248, 250, 252, 1)',
        border: 'rgba(219, 228, 236, 1)',
    },
};

export const BENCHMARK_STAGE_COLORS: Record<PrivacyBenchmarkStage, string> = {
    rulesDetection: 'rgba(15, 118, 110, 1)',
    modelDetection: 'rgba(124, 58, 237, 1)',
    resultAssembly: 'rgba(217, 119, 6, 1)',
    rulesHardening: 'rgba(234, 88, 12, 1)',
    modelHardening: 'rgba(219, 39, 119, 1)',
    finalization: 'rgba(71, 85, 105, 1)',
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
