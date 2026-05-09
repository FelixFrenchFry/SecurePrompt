import { useEffect, useRef, useState } from 'react';
import {
    Check,
    Copy,
    Cpu,
    Eraser,
    FileText,
    Home,
    Landmark,
    Lock,
    Mail,
    Phone,
    ScanSearch,
    Send,
    ShieldCheck,
    StepForward,
    UserRound,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { INJECT_PROMPT_MESSAGE, type RuntimeResponse } from '../../source/messaging';
import {
    createPrivatizedPrompt,
    type SensitiveItem,
    type SensitiveItemCategory,
} from '../../source/privacy';

const EMPTY_PREVIEW_TEXT = 'No privatized prompt yet.';
const ACTION_FEEDBACK_MS = 1500;
const MAX_VISIBLE_COUNT = 99;

const formatCount = (count: number) => {
    return count > MAX_VISIBLE_COUNT ? `${MAX_VISIBLE_COUNT}+` : String(count);
};

export function App() {
    const [prompt, setPrompt] = useState('');
    const [privatizedPrompt, setPrivatizedPrompt] = useState('');
    const [detectedItems, setDetectedItems] = useState<SensitiveItem[]>([]);
    const [clipboardStatus, setClipboardStatus] = useState('');
    const [sendStatus, setSendStatus] = useState('');
    const [copied, setCopied] = useState(false);
    const [cleared, setCleared] = useState(false);
    const copyResetTimerRef = useRef<number | undefined>(undefined);
    const clearResetTimerRef = useRef<number | undefined>(undefined);

    const previewText = privatizedPrompt || EMPTY_PREVIEW_TEXT;
    const itemCountLabel = `${formatCount(detectedItems.length)} ${
        detectedItems.length === 1 ? 'item' : 'items'
    }`;
    const countItemsByCategory = (category: SensitiveItemCategory) => {
        return detectedItems.filter((item) => item.category === category).length;
    };

    useEffect(() => {
        return () => {
            if (copyResetTimerRef.current !== undefined) {
                window.clearTimeout(copyResetTimerRef.current);
            }

            if (clearResetTimerRef.current !== undefined) {
                window.clearTimeout(clearResetTimerRef.current);
            }
        };
    }, []);

    const privatizePrompt = () => {
        if (!prompt) {
            return;
        }

        const result = createPrivatizedPrompt(prompt);

        if (!result.safeToInject) {
            setPrivatizedPrompt('');
            setDetectedItems(result.items);
            setClipboardStatus('Could not safely privatize prompt.');
            setSendStatus('');
            return;
        }

        setPrivatizedPrompt(result.privatizedPrompt);
        setDetectedItems(result.items);
        setClipboardStatus('Privatized prompt updated.');
        setSendStatus('');
    };

    const clearPrompts = () => {
        setPrompt('');
        setPrivatizedPrompt('');
        setDetectedItems([]);
        setClipboardStatus('');
        setSendStatus('');
        setCopied(false);
        setCleared(true);

        if (copyResetTimerRef.current !== undefined) {
            window.clearTimeout(copyResetTimerRef.current);
            copyResetTimerRef.current = undefined;
        }

        if (clearResetTimerRef.current !== undefined) {
            window.clearTimeout(clearResetTimerRef.current);
        }

        clearResetTimerRef.current = window.setTimeout(() => {
            setCleared(false);
            clearResetTimerRef.current = undefined;
        }, ACTION_FEEDBACK_MS);
    };

    const copyPrivatizedPrompt = async () => {
        if (!privatizedPrompt) {
            return;
        }

        try {
            await navigator.clipboard.writeText(privatizedPrompt);
            setCopied(true);
            setClipboardStatus('');
            setSendStatus('');

            if (copyResetTimerRef.current !== undefined) {
                window.clearTimeout(copyResetTimerRef.current);
            }

            copyResetTimerRef.current = window.setTimeout(() => {
                setCopied(false);
                copyResetTimerRef.current = undefined;
            }, ACTION_FEEDBACK_MS);
        } catch {
            setClipboardStatus('Could not copy privatized prompt.');
        }
    };

    const sendToChatGpt = async () => {
        if (!privatizedPrompt) {
            return;
        }

        try {
            setClipboardStatus('');
            const response = (await browser.runtime.sendMessage({
                type: INJECT_PROMPT_MESSAGE,
                text: privatizedPrompt,
            })) as RuntimeResponse | undefined;

            if (response?.ok) {
                setSendStatus('Sent to ChatGPT.');
                return;
            }

            setSendStatus(response?.error ?? 'Could not send to ChatGPT.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not send to ChatGPT.';
            setSendStatus(message);
        }
    };

    return (
        <main className="app-shell">
            <header className="app-header">
                <div className="brand-lockup">
                    <h1>Privatize Your Prompts</h1>
                </div>
                <span className="status-pill">
                    <Cpu size={12} aria-hidden="true" />
                    Fully on-device
                </span>
            </header>

            <section className="panel">
                <div className="section-header">
                    <label className="label label-with-icon" htmlFor="original-prompt">
                        <FileText size={18} aria-hidden="true" />
                        <span>Original prompt</span>
                    </label>
                    <button
                        className={`ghost-button clear-button${cleared ? ' is-cleared' : ''}`}
                        type="button"
                        onClick={clearPrompts}
                        disabled={!prompt && !privatizedPrompt && !cleared}
                    >
                        {cleared ? (
                            <Check size={16} aria-hidden="true" />
                        ) : (
                            <Eraser size={16} aria-hidden="true" />
                        )}
                        Clear
                    </button>
                </div>
                <textarea
                    id="original-prompt"
                    className="prompt-input"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Type or paste your prompt here..."
                    spellCheck="true"
                />
                <button
                    className="secondary-button panel-action"
                    type="button"
                    onClick={privatizePrompt}
                    disabled={prompt.trim().length === 0}
                >
                    <StepForward size={19} aria-hidden="true" />
                    Privatize
                </button>
            </section>

            <section className="panel">
                <div className="section-header">
                    <h2 className="label-with-icon">
                        <ScanSearch size={18} aria-hidden="true" />
                        <span>Privacy scan</span>
                    </h2>
                    <span>{itemCountLabel}</span>
                </div>
                <div className="chip-row" aria-label="Detected item categories">
                    <span className="chip">
                        <Mail size={17} aria-hidden="true" />
                        Email {formatCount(countItemsByCategory('EMAIL'))}
                    </span>
                    <span className="chip">
                        <Phone size={17} aria-hidden="true" />
                        Phone {formatCount(countItemsByCategory('PHONE'))}
                    </span>
                    <span className="chip">
                        <UserRound size={17} aria-hidden="true" />
                        Person {formatCount(countItemsByCategory('PERSON'))}
                    </span>
                    <span className="chip">
                        <Home size={17} aria-hidden="true" />
                        Address {formatCount(countItemsByCategory('ADDRESS'))}
                    </span>
                    <span className="chip">
                        <Landmark size={17} aria-hidden="true" />
                        Account {formatCount(countItemsByCategory('ACCOUNT'))}
                    </span>
                    <span className="chip">
                        <Lock size={17} aria-hidden="true" />
                        Secrets {formatCount(countItemsByCategory('SECRET'))}
                    </span>
                </div>
            </section>

            <section className="panel">
                <div className="section-header">
                    <h2 className="label-with-icon">
                        <ShieldCheck size={18} aria-hidden="true" />
                        <span>Privatized prompt</span>
                    </h2>
                    <button
                        className={`ghost-button copy-button${copied ? ' is-copied' : ''}`}
                        type="button"
                        onClick={copyPrivatizedPrompt}
                        disabled={!privatizedPrompt}
                    >
                        {copied ? (
                            <Check size={16} aria-hidden="true" />
                        ) : (
                            <Copy size={16} aria-hidden="true" />
                        )}
                        Copy
                    </button>
                </div>
                <div className="preview" aria-live="polite">
                    {previewText}
                </div>
                <button
                    className="primary-button panel-action"
                    type="button"
                    onClick={sendToChatGpt}
                    disabled={!privatizedPrompt}
                >
                    <Send size={18} aria-hidden="true" />
                    Send to ChatGPT
                </button>
            </section>

            {clipboardStatus || sendStatus ? (
                <p className="status-message" role="status">
                    {sendStatus || clipboardStatus}
                </p>
            ) : null}

            <footer className="footer">Local memory only</footer>
        </main>
    );
}
