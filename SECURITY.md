# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this plugin, please **do not** open a public issue.

Instead, please report it privately by:

1. Emailing the maintainer with details of the vulnerability
2. Including steps to reproduce, affected versions, and potential impact
3. Allowing reasonable time for a fix before public disclosure

## Security Considerations

Since this plugin handles API keys and personal note content, please be aware of the following:

### API Key Storage
- API keys are stored in Obsidian's plugin data (`data.json`), which resides in your vault's `.obsidian` directory
- Never share your `data.json` file or commit it to version control
- Consider using environment variables (`DEEPSEEK_API_KEY`) for additional security

### PII (Personally Identifiable Information)
- The built-in sanitizer can mask phone numbers, ID numbers, emails, and IP addresses before sending to external APIs
- Enable sanitization in plugin settings for sensitive notes
- Sanitization is regex-based and may not catch all PII — review sensitive content before sending

### Data Transmission
- All API calls use HTTPS
- API keys are sent via `Authorization: Bearer` headers
- No data is collected, stored, or transmitted by the plugin beyond what is explicitly sent to your configured AI providers

### Local-Only Mode
- For maximum privacy, use Ollama with a local model — no data leaves your machine
- Combine with TF-IDF search (local, no external dependencies) for a fully offline experience

## Dependencies

This plugin uses the following third-party libraries:
- `pdfjs-dist` — PDF rendering (loaded on demand)
- `mammoth` — Word document extraction (loaded on demand)
- `react` / `react-dom` — UI framework

Dependencies are loaded lazily where possible to minimize attack surface.
