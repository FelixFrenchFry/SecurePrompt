# Privacy Requirements

These rules define the privacy boundary for SecurePrompt. They are intentionally strict and should change only after deliberate review.

## Core Rule

Raw user text must never be inserted into ChatGPT, Claude, Gemini, OpenAI, or any other remote service before local pseudonymization.

## Rules

- Detect and pseudonymize locally.
- Insert only sanitized text into supported AI chat pages.
- Keep raw prompts in memory only.
- Keep pseudonym mappings in memory only.
- Do not persist raw prompts or mappings.
- Do not log raw prompts, detected values, or mappings.
- Do not add analytics, telemetry, or remote API calls.
- Do not request broad host permissions such as `<all_urls>`.
- Do not inject anything if the extension cannot prove the text is sanitized.

## Allowed Data Flow

```text
User types raw prompt in extension UI
  -> local detection
  -> local pseudonymization
  -> sanitized prompt only
  -> supported AI chat page
```

## Disallowed Data Flow

```text
Raw prompt
  -> third-party page, remote API, analytics, logs, extension storage, or browser storage
```

## Review Question

Before adding a feature, dependency, permission, or integration, answer:

```text
Can raw user text reach a remote system before local pseudonymization?
```

If the answer is not clearly `No`, the change is not acceptable.
