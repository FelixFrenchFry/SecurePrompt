# Architecture and Roadmap

SecurePrompt is a local-first browser extension for preparing prompts before they are sent to external AI chat tools. The extension detects sensitive information locally, replaces it with stable typed placeholders, and inserts only the privatized prompt into supported chat pages.

The stable product constraint is simple: raw prompt text and original sensitive values must remain inside the local extension privacy boundary.

## Current Scope

- Chrome Manifest V3 extension built with WXT, TypeScript, React, and plain CSS.
- Side panel prompt editor with privatized preview.
- Rules-based detection for structured and semi-structured sensitive values.
- Optional local model detection with `openai/privacy-filter`.
- Manual masking from selected preview text.
- Stable placeholder mappings such as `EMAIL_001`, `PERSON_001`, and `SECRET_001`.
- Highlighted masked spans with local hover restore.
- Detected-item drawer with category filtering, search, occurrence sorting, and restore controls.
- Prompt header setting with `none`, `basic`, `detailed`, and `custom` modes.
- Dark mode and local settings persistence.
- Pipeline progress and last-run diagnostics.
- Prompt insertion into ChatGPT, Claude, Gemini, and Perplexity.

## Core Flow

```text
User writes raw prompt in the side panel
  -> local rules scan
  -> optional local model scan
  -> overlap resolution and placeholder mapping
  -> residual hardening pass
  -> privatized preview
  -> optional prompt header
  -> supported AI chat page
```

Manual masking follows the same result model:

```text
User selects preview text
  -> choose category
  -> create manual sensitive item
  -> recompute mappings and preview
  -> update counts, highlights, and drawer rows
```

## Privacy Categories

The current category set is:

- `EMAIL`: email addresses.
- `PHONE`: phone and mobile numbers.
- `PERSON`: private names or people.
- `ADDRESS`: street addresses, postal addresses, or private locations.
- `ACCOUNT`: account, payment, invoice, bank, tax, subscription, tenant, contract, ticket, or similar identifiers.
- `DATE`: date and time values.
- `NETWORK`: URLs, domains, hostnames, IP addresses, endpoints, email links, or private infrastructure references.
- `SECRET`: credentials, tokens, API keys, passwords, private keys, connection strings, webhooks, or similar secrets.
- `OTHER`: sensitive items that do not fit a known category.

## Detection Pipeline

The pipeline intentionally combines deterministic rules with optional model detection.

Rules handle high-confidence structured patterns such as emails, phones, dates, network indicators, account-like values, and secret-like assignments. The local model supports less structured entities such as person names, addresses, and ambiguous sensitive text.

When the local model is enabled, both detection sources are used. Results are merged, protected placeholders are filtered, overlaps are resolved, and the preview is assembled from the final item set. A residual hardening pass then scans the privatized output again and masks anything sensitive that survived the first pass.

If the local model fails, the extension falls back to a rules-only preview instead of sending raw text.

## Local Model Runtime

The local model configuration currently uses:

- Model: `openai/privacy-filter`.
- Task: token classification.
- Device: WebGPU.
- Quantization: `q4`.
- Chunked input processing for large prompts.
- Targeted WebGPU hardening for known failing ONNX nodes.

Model files may be downloaded from the configured model host after permission is granted. The prompt itself is not sent to the model host.

## Browser Integration

Supported AI chat targets are defined in `source/chat-targets.ts`.

Current targets:

- ChatGPT.
- Claude.
- Gemini.
- Perplexity.

Content scripts find the active supported chat input and insert the privatized prompt text. The side panel disables sending when the current preview is not safe to inject.

## Settings

Settings are persisted locally in extension storage. They are limited to non-sensitive preferences:

- Dark mode.
- Rules detection enabled.
- Local model test enabled.
- Prompt header mode.
- Custom prompt header text.

Raw prompts, original sensitive values, and masking mappings are not settings and must not be persisted.

## Diagnostics

Diagnostics report the most recent pipeline run only. They should remain aggregate and non-sensitive:

- Total runtime.
- Stage runtimes.
- Stage shares.
- Input size counts.
- Detected item counts.
- Hardening counts.

Diagnostics must not include raw prompt text, original sensitive values, or masking mappings.

## Roadmap

Near-term improvements:

- Add more automated coverage for manual masking, restore behavior, and residual hardening.
- Improve person, address, and date detection with stronger local NER support if the runtime cost is acceptable.
- Add import flows for text-based file formats without weakening the privacy boundary.
- Improve provider adapters as supported AI chat UIs change.
- Make diagnostics more useful without exposing sensitive values.

Possible later work:

- More local model choices.
- Optional pseudonymized replacement mode.
- Stronger multilingual detection.
- Better handling for very large documents.
- Optional export of sanitized reports, never raw mappings.

Out of scope unless the privacy model is deliberately redesigned:

- Remote detection APIs.
- Analytics or telemetry.
- Persisting raw prompts or original-value mappings.
- Broad host permissions such as `<all_urls>`.
