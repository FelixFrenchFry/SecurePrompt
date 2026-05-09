# Project Plan

SecurePrompt is a local-first browser extension for using external AI chat tools without exposing raw personal or confidential information.

The user writes a prompt in the extension's trusted local UI. SecurePrompt detects sensitive information locally, replaces it with placeholders, and injects only the sanitized prompt into supported AI chat tools such as ChatGPT. The original values remain local so the extension can restore placeholders for the user later.

## Core Flow

```text
Local extension editor
  -> local PII detection
  -> local pseudonymization
  -> sanitized prompt injection
  -> local restoration for display or copy
```

## Initial Scope

The first working version should stay simple:

- Chrome Manifest V3 extension
- WXT, TypeScript, React, and plain CSS
- Side panel prompt editor
- Rules-based PII detection
- Local placeholder mapping
- Sanitized prompt preview
- ChatGPT injection of sanitized text only
- Unit tests for privacy logic

Initial detectors should focus on structured data that can be found reliably without machine learning:

- Email addresses
- Phone numbers
- URLs
- IBANs
- IPv4 and IPv6 addresses
- Credit-card-like numbers with Luhn validation
- German tax-ID-like numbers
- API-key-like secrets
- Dates

Person-name detection is intentionally not part of the initial rules-only scope because regex-only name detection is unreliable across German and English text.

## Technical Direction

The extension should keep privacy logic separate from browser integration code.

Expected areas:

- Side panel UI for trusted input, preview, detected sensitive items, and user actions
- Pure TypeScript privacy module for detection, overlap merging, pseudonymization, and restoration
- Site adapter for ChatGPT DOM insertion
- Background/service worker code only where coordination is needed
- Tests for detectors, validators, mapping, restoration, and raw-value leakage regressions

Start with narrow host permissions:

```json
{
    "host_permissions": ["https://chatgpt.com/*", "https://chat.openai.com/*"]
}
```

Do not use `<all_urls>` for the initial version.

## Future Direction

Later versions may add stronger local detection, including a browser-runnable privacy model, better German and EU-specific detectors, Claude and Gemini support, document handling, and an optional native helper for larger local models or stricter hardware control.

These ideas are tentative. The stable product constraint is that raw user text must not leave the local privacy boundary before pseudonymization.
