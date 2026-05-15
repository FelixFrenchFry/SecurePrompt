import type { CSSProperties } from 'react';
import type {
    PrivacyBenchmarkStage,
    SensitiveItemCategory,
} from '../../source/privacy';

export type CategoryColors = {
    // icon, strong border, and active state color
    primary: string;
    // readable text color on category-tinted surfaces
    text: string;
    // soft background tint behind category highlights
    secondary: string;
    // neutral border color for inactive category surfaces
    border: string;
};

export type CategoryColorStyle = CSSProperties & {
    '--category-primary': string;
    '--category-text': string;
    '--category-secondary': string;
    '--category-border': string;
};

export type BenchmarkStageColorStyle = CSSProperties & {
    '--benchmark-stage-color': string;
};

export const CATEGORY_COLORS: Record<SensitiveItemCategory, CategoryColors> = {
    EMAIL: {
        primary: 'rgba(220, 30, 40, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(255, 246, 247, 1)',
        border: 'rgba(220, 30, 40, 0.5)',
    },
    PHONE: {
        primary: 'rgba(40, 160, 70, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(247, 252, 248, 1)',
        border: 'rgba(40, 160, 70, 0.5)',
    },
    PERSON: {
        primary: 'rgba(30, 110, 250, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(246, 249, 255, 1)',
        border: 'rgba(30, 110, 250, 0.5)',
    },
    ADDRESS: {
        primary: 'rgba(160, 80, 50, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(251, 248, 247, 1)',
        border: 'rgba(160, 80, 50, 0.5)',
    },
    ACCOUNT: {
        primary: 'rgba(250, 160, 0, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(255, 251, 245, 1)',
        border: 'rgba(250, 160, 0, 0.5)',
    },
    DATE: {
        primary: 'rgba(240, 40, 100, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(254, 246, 249, 1)',
        border: 'rgba(240, 40, 100, 0.5)',
    },
    NETWORK: {
        primary: 'rgba(0, 190, 170, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(245, 252, 252, 1)',
        border: 'rgba(0, 190, 170, 0.5)',
    },
    SECRET: {
        primary: 'rgba(250, 90, 0, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(255, 248, 245, 1)',
        border: 'rgba(250, 90, 0, 0.5)',
    },
    OTHER: {
        primary: 'rgba(50, 60, 70, 1)',
        text: 'rgba(15, 23, 42, 1)',
        secondary: 'rgba(247, 247, 248, 1)',
        border: 'rgba(50, 60, 70, 0.5)',
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
        '--category-text': colors.text,
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
