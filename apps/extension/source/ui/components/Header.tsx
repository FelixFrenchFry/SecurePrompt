import { ArrowLeftIcon, GearIcon } from '@primer/octicons-react';
import type { ModelStatus } from '../state';
import { IconButton } from './Button';

const MODEL_STATUS: Record<ModelStatus, { text: string; tone: string; tooltip: string }> = {
    off: { text: 'Rules only', tone: 'neutral', tooltip: 'The local AI model is off. Turn it on in Settings to also find names and addresses.' },
    idle: { text: 'Loads on first use', tone: 'neutral', tooltip: 'The local AI model loads when you mask your first prompt.' },
    downloading: { text: 'Downloading model', tone: 'accent', tooltip: 'Downloading the local AI model once. Your text is never uploaded.' },
    loading: { text: 'Loading model', tone: 'accent', tooltip: 'Starting the local AI model on this device.' },
    ready: { text: 'Model ready', tone: 'success', tooltip: 'The local AI model runs on this device.' },
    failed: { text: 'Model failed', tone: 'danger', tooltip: 'The local AI model couldn\'t run, so only rules mask. Check your prompts carefully.' },
};

export const Header = ({ model, onOpenSettings }: { model: ModelStatus; onOpenSettings?: (() => void) | undefined }) =>
{
    const status = MODEL_STATUS[model];

    return (
        <header className="header">
            <img src="/icons/logo.svg" alt="" width={20} height={20} />
            <span className="header-title">SecurePrompt</span>
            <span className="model-status" data-tooltip={status.tooltip}>
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
