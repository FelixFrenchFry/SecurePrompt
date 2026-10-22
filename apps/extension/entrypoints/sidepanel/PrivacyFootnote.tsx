import { Lock } from 'lucide-react';

export const PrivacyFootnote = () => (
    <footer className="footer">
        <span className="footer-line">
            <Lock size={13} aria-hidden="true" />
            <span>Your input files and prompts are processed locally.</span>
        </span>
        <span className="footer-line">All data stays on your device.</span>
    </footer>
);
