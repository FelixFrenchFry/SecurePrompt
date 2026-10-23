import type { ScanStep } from '../state';
import { Button } from './Button';

const megabytes = (bytes: number) => Math.round(bytes / 1024 / 1024);

const describe = (scan: ScanStep): { label: string; percent?: number } =>
{
    switch (scan.step)
    {
        case 'starting':
            return { label: 'Starting' };
        case 'downloading':
            return { label: `Downloading model · ${megabytes(scan.loaded)} of ${megabytes(scan.total)} MB`, percent: scan.percent };
        case 'loading':
            return { label: 'Loading model' };
        case 'scanning':
            return { label: `Scanning · ${scan.percent}%`, percent: scan.percent };
    }
};

// the footer while a prompt is masked: what happens, a bar when the share is known, and cancel
export const ScanProgress = ({ scan, onCancel }: { scan: ScanStep; onCancel: () => void }) =>
{
    const { label, percent } = describe(scan);

    return (
        <div className="scan-progress">
            <div className="scan-progress-text">
                <span className="small">{label}</span>
                <div
                    className={`progress${percent == null ? ' progress-busy' : ''}`}
                    role="progressbar"
                    aria-label={label}
                    {...(percent == null ? {} : { 'aria-valuenow': Math.round(percent), 'aria-valuemin': 0, 'aria-valuemax': 100 })}
                >
                    <div className="progress-bar" style={{ width: `${percent ?? 100}%` }} />
                </div>
            </div>
            <Button onClick={onCancel}>Cancel</Button>
        </div>
    );
};
