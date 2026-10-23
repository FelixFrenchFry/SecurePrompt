import { LockIcon } from '@primer/octicons-react';

// the last line of the side panel, below all actions
export const PrivacyNote = () =>
{
    return (
        <p className="privacy-note">
            <LockIcon size={12} />
            Scanned on this device. Originals never leave it.
        </p>
    );
};
