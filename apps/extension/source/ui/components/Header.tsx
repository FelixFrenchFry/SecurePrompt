import { ArrowLeftIcon, GearIcon } from '@primer/octicons-react';
import type { ModelStatus } from '../state';
import { IconButton } from './Button';

const MODEL_STATUS: Record<ModelStatus, { text: string; tone: string }> = {
    off: { text: 'Rules only', tone: 'neutral' },
    idle: { text: 'Model loads on first use', tone: 'neutral' },
    downloading: { text: 'Downloading model', tone: 'accent' },
    loading: { text: 'Loading model', tone: 'accent' },
    ready: { text: 'Model ready', tone: 'success' },
    failed: { text: 'Model failed', tone: 'danger' },
};

export const Header = ({ model, onOpenSettings }: { model: ModelStatus; onOpenSettings?: (() => void) | undefined }) =>
{
    const status = MODEL_STATUS[model];

    return (
        <header className="header">
            <img src="/icons/logo.svg" alt="" width={20} height={20} />
            <span className="header-title">SecurePrompt</span>
            <span className="model-status">
                <span className={`status-dot status-${status.tone}`} />
                {status.text}
            </span>
            {onOpenSettings == null ? null : <IconButton icon={GearIcon} label="Settings" onClick={onOpenSettings} />}
        </header>
    );
};

export const SettingsHeader = ({ onBack }: { onBack: () => void }) =>
{
    return (
        <header className="header header-back">
            <IconButton icon={ArrowLeftIcon} label="Back" onClick={onBack} />
            <span className="header-title">Settings</span>
        </header>
    );
};
