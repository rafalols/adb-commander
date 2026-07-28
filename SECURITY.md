# Security policy

## Supported versions

ADB Commander is currently an early preview. Security fixes are applied to the
latest version on the `main` branch.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities that could expose local files,
execute commands, bypass the Electron bridge, or modify an Android device
without confirmation.

Use GitHub's private vulnerability reporting feature on the repository. Include
reproduction steps, affected versions and the expected impact. Remove personal
paths, filenames, device serials and other sensitive information.

## Security model

- The renderer runs with Node integration disabled and context isolation enabled.
- Filesystem and ADB access are exposed through an explicit preload API.
- Child processes are spawned without a local shell.
- Arguments used by `adb shell` are POSIX-quoted.
- Incremental update analysis is read-only and incremental updates never delete
  files.
- Demo mode uses fictional in-memory data and cannot access ADB.
