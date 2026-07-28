# Contributing to ADB Commander

Thanks for helping improve ADB Commander.

## Before opening an issue

- Search existing issues first.
- Confirm the problem still happens on the current `main` branch.
- Include the macOS version, Android version and `adb version`.
- Remove device serials, local paths and personal filenames from screenshots.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
```

Use `http://127.0.0.1:5173/?demo=1` for UI work that should not access a real
device or local files.

## Pull requests

- Keep changes focused and explain the user-facing outcome.
- Keep all user-facing interface copy in English and add every new string to
  `src/i18n.tsx`.
- Do not introduce shell interpolation for user-controlled paths.
- Preserve the non-destructive behavior of incremental updates.
- Run `npm run build` before submitting the pull request.
- Include demo-mode screenshots for visible interface changes.

## Commit messages

Use short, imperative English messages, for example:

```text
Add transfer cancellation
Fix quoting for remote paths
```
