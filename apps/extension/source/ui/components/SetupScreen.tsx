import { CpuIcon, DownloadIcon, LockIcon } from '@primer/octicons-react';
import type { Setup } from '../state';
import { Button } from './Button';
import { Flash } from './Flash';
import { ScanProgress } from './ScanProgress';

type SetupScreenProps = {
    setup: Setup;
    onDownload: () => void;
    onCancel: () => void;
    onRulesOnly: () => void;
    onDone: () => void;
};

const FACTS = [
    { icon: LockIcon, text: 'Runs on this device. Your text is never uploaded.' },
    { icon: DownloadIcon, text: 'One download of about 330 MB from Hugging Face, pinned to a fixed version. Chrome asks you once to allow huggingface.co.' },
    { icon: CpuIcon, text: 'Runs on the CPU. A long prompt takes a few seconds.' },
];

// the first-run choice between the local model and rules only
export const SetupScreen = ({ setup, onDownload, onCancel, onRulesOnly, onDone }: SetupScreenProps) =>
{
    return (
        <>
            <main className="screen setup">
                <div>
                    <h1 className="setup-title">Set up name and address detection</h1>
                    <p className="muted no-margin">
                        Emails, phone numbers, IBANs and similar values are found by rules. Names, addresses and other context need a local AI model.
                    </p>
                </div>
                <ul className="facts">
                    {FACTS.map(({ icon: FactIcon, text }) => (
                        <li key={text}>
                            <FactIcon size={16} className="muted" />
                            <span>{text}</span>
                        </li>
                    ))}
                </ul>
                {setup.step === 'denied' ? <Flash tone="warning">Chrome didn't allow the download. Try again, or use rules only.</Flash> : null}
                {setup.step === 'failed' ? <Flash tone="danger">The model couldn't be downloaded or started. Try again, or use rules only.</Flash> : null}
                {setup.step === 'ready' ? <Flash tone="success">Model ready. Everything now runs offline.</Flash> : null}
            </main>
            <footer className="footer footer-stack">
                {setup.step === 'download' ? <ScanProgress scan={setup.scan} onCancel={onCancel} /> : null}
                {setup.step === 'ready' ? (
                    <Button variant="primary" onClick={onDone}>
                        Start writing
                    </Button>
                ) : null}
                {setup.step === 'offer' || setup.step === 'denied' || setup.step === 'failed' ? (
                    <>
                        <Button variant="primary" icon={DownloadIcon} onClick={onDownload}>
                            Download model
                        </Button>
                        <Button onClick={onRulesOnly}>Use rules only</Button>
                    </>
                ) : null}
            </footer>
        </>
    );
};
