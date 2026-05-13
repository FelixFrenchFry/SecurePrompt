# Privacy Requirements

These rules define the privacy boundary for SecurePrompt. They are intentionally strict and should change only after deliberate review.

## Core Rule

Raw prompt text, detected original values, and masking mappings must not leave the local extension privacy boundary.

Only the privatized prompt may be copied or inserted into supported AI chat pages. If the user restores an original value in the preview, that edited preview is treated as local-only and must not be injected into a remote chat page.

## Local Data

The extension may keep the following data locally:

- The raw prompt while the side panel is open.
- Detected sensitive items and masking mappings while the current preview exists.
- User settings, including dark mode, detection toggles, enabled categories, and prompt-header preferences.
- The last pipeline timing benchmark, as aggregate timing and count data only.

Raw prompts, original detected values, and masking mappings must not be written to extension storage, browser storage, logs, analytics, telemetry, or remote services.

## Detection Boundary

Detection and privatization happen locally in the extension.

Allowed local detection sources:

- Rules and heuristics.
- The local `openai/privacy-filter` model.
- Manual user selections in the privatized preview.

Disabled categories must be filtered before masking and before residual hardening contributes new masks.

The local model may download model assets from the configured model host after permission is granted. Those download requests must not contain raw prompt text, detected values, masking mappings, or user-entered prompt content.

## Prompt Injection

Supported AI chat pages may receive only text that the extension considers safe to inject.

Allowed remote insertion:

```text
Privatized prompt
  -> optional placeholder explanation header
  -> supported AI chat page
```

Disallowed remote insertion:

```text
Raw prompt, original sensitive value, masking mapping, or restored preview text
  -> third-party page, remote API, analytics, logs, extension storage, or browser storage
```

## Rules

- Detect and privatize before remote insertion.
- Keep original values and masking mappings in memory only.
- Do not persist raw prompts or masking mappings.
- Do not log raw prompts, detected original values, or masking mappings.
- Do not add analytics or telemetry.
- Do not send raw prompt text to model hosts, AI providers, or other remote APIs.
- Do not request broad host permissions such as `<all_urls>`.
- Keep host permissions limited to supported AI chat pages and explicitly required model-asset hosts.
- Do not inject anything if the extension cannot prove the text is privatized.
- Do not include original values in prompt headers, diagnostics, status messages, or errors.

## Review Question

Before adding a feature, dependency, permission, model, storage key, log, diagnostic view, or integration, answer:

```text
Can raw user text or an original sensitive value reach a remote system or persistent storage before local privatization?
```

If the answer is not clearly `No`, the change is not acceptable.
