import { CpuIcon, DownloadIcon } from '@primer/octicons-react';
import type { Setup } from '../state';
import { Button } from './Button';
import { Flash } from './Flash';
import { ScanProgress } from './ScanProgress';

type SetupScreenProps = {
    setup: Setup;
    onDownload: () => void;
    onCancel: () => void;
    // closes the side panel, which shows the setup again when opened next
    onNotNow: () => void;
    onDone: () => void;
};

// the model's page on Hugging Face, with its files and license
const MODEL_NAME = 'bardsai/eu-pii-anonimization-multilang-v2';
const MODEL_URL = `https://huggingface.co/${MODEL_NAME}`;

// the model download, needed before the first prompt can be masked
export const SetupScreen = ({ setup, onDownload, onCancel, onNotNow, onDone }: SetupScreenProps) =>
{
    const offered = setup.step === 'offer' || setup.step === 'denied' || setup.step === 'failed';

    return (
        <>
            <main className="screen setup">
                <div>
                    <h1 className="setup-title">Detection model setup</h1>
                    <p className="muted no-margin">
                        SecurePrompt finds personal data (PII) like names, emails, addresses, IBANs and more with an AI model that runs on your device. It needs
                        a one-time download, then works offline.
                    </p>
                </div>
                <ul className="facts">
                    <li>
                        <DownloadIcon size={16} className="muted" />
                        <span>
                            About 343 MB from Hugging Face (
                            <a href={MODEL_URL} target="_blank" rel="noreferrer">
                                {MODEL_NAME}
                            </a>
                            ). Chrome asks you once to allow huggingface.co.
                        </span>
                    </li>
                    <li>
                        <CpuIcon size={16} className="muted" />
                        <span>Runs on your CPU. Typical prompts take a few seconds, large files can take minutes.</span>
                    </li>
                </ul>
                {setup.step === 'denied' ? (
                    <Flash tone="warning">Chrome didn't allow the download. Prompts can only be masked with the model, so allow huggingface.co to continue.</Flash>
                ) : null}
                {setup.step === 'failed' ? <Flash tone="danger">The model couldn't be downloaded or started. Check your connection and try again.</Flash> : null}
                {setup.step === 'ready' ? <Flash tone="success">Model ready. Everything now runs offline.</Flash> : null}
                {/* right below the text, so they move with it */}
                <div className="setup-actions">
                    {setup.step === 'download' ? <ScanProgress scan={setup.scan} onCancel={onCancel} /> : null}
                    {setup.step === 'ready' ? (
                        <Button variant="primary" onClick={onDone}>
                            Start writing
                        </Button>
                    ) : null}
                    {offered ? (
                        <>
                            <Button variant="primary" icon={DownloadIcon} onClick={onDownload}>
                                Download model (343 MB)
                            </Button>
                            <Button onClick={onNotNow}>Not now</Button>
                        </>
                    ) : null}
                </div>
            </main>
        </>
    );
};
