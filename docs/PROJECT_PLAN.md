# Project Plan

SecurePrompt is a local-first browser extension for using external AI chat tools without exposing raw personal or confidential information.

The user writes a prompt in the extension's trusted local UI. SecurePrompt detects sensitive information locally, replaces it with placeholders, and injects only the privatized prompt into supported AI chat tools such as ChatGPT. The original values remain local so the extension can restore placeholders for the user later.

## Core Flow

```text
Local extension editor
  -> local PII detection
  -> local privatization
  -> privatized prompt injection
  -> local restoration for display or copy
```

## Terminology

User-facing copy, code identifiers, and technical documentation should use `privatize`, `privatized`, and `privatization` for processed prompts.

The current default privatization method is `placeholder`: sensitive values are replaced with placeholders such as `EMAIL_001` or `ACCOUNT_001`.

Future privatization methods may include `removal` and `pseudonymized` masking, but they are not part of the current implementation.

## Initial Scope

The first working version should stay simple:

- Chrome Manifest V3 extension
- WXT, TypeScript, React, and plain CSS
- Side panel prompt editor
- Rules-based PII detection
- Local masking mappings
- Privatized prompt view
- ChatGPT injection of privatized text only
- Unit tests for privacy logic

Initial detectors should focus on structured data that can be found reliably without machine learning:

- Email addresses
- Phone numbers
- URLs, domains, and IP addresses
- IBANs
- Credit-card-like numbers with Luhn validation
- German tax-ID-like numbers
- API-key-like secrets
- Dates

Person-name detection is intentionally not part of the initial rules-only scope because regex-only name detection is unreliable across German and English text.

## Technical Direction

The extension should keep privacy logic separate from browser integration code.

Expected areas:

- Side panel UI for trusted input, preview, detected sensitive items, and user actions
- Pure TypeScript privacy module for detection, overlap merging, privatization, and restoration
- Site adapter for ChatGPT DOM insertion
- Background/service worker code only where coordination is needed
- Tests for detectors, validators, masking mappings, restoration, and raw-value leakage regressions

Initial privatization pipeline:

```text
createPrivatizedPrompt(inputText)
  -> detectSensitiveItems(inputText)
       -> if enabled, detectSensitiveItemsWithRules(inputText)
       -> later, if enabled, detectSensitiveItemsWithLocalModel(inputText)
  -> resolveSensitiveItemOverlaps(detectedItems)
  -> createMaskingMappings(finalItems)
  -> applyMasksToItems(inputText, finalItems, maskingMappings, method)
  -> return PrivatizedPromptResult
```

The first implementation should define this orchestration shape before filling in real detection, overlap handling, and masking logic. Until those internals exist, the pipeline must fail closed and avoid injecting raw prompt text.

Start with narrow host permissions:

```json
{
    "host_permissions": ["https://chatgpt.com/*", "https://chat.openai.com/*"]
}
```

Do not use `<all_urls>` for the initial version.

## Future Direction

Later versions may add stronger local detection, including a browser-runnable privacy model, better German and EU-specific detectors, Claude and Gemini support, document handling, and an optional native helper for larger local models or stricter hardware control.

These ideas are tentative. The stable product constraint is that raw user text must not leave the local privacy boundary before privatization.
