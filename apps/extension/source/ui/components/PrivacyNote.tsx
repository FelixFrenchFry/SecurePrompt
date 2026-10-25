import { LockIcon } from '@primer/octicons-react';

// the last line of the side panel, below all actions; a non-breaking hyphen keeps "on-device" together
export const PrivacyNote = () =>
{
    return (
        <p className="privacy-note">
            <LockIcon size={12} />
            <span className="privacy-note-text">All inputs processed on‑device. No cloud. No account.</span>
        </p>
    );
};
