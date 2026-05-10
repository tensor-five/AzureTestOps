# Security Policy

## Supported Versions

This project is maintained as a small local open-source tool. Security fixes are generally applied to the default branch and included in the next public release or tag when releases are used.

## Reporting a Vulnerability

Please do not open a public issue for suspected security vulnerabilities.

If GitHub private vulnerability reporting is enabled for this repository, use that feature. Otherwise, contact the maintainers through a private channel listed in the repository. If no private channel is available, open a minimal public issue asking for a secure contact path, without including exploit details.

When reporting, include:

- A clear description of the issue.
- Steps to reproduce, if safe to share privately.
- The affected version, commit, or branch.
- Any known impact on local files, Azure DevOps data, credentials, or network requests.

## Handling Sensitive Data

This tool may interact with Azure DevOps APIs and local user preferences. Do not include personal access tokens, organization names, project names, test data, logs, screenshots, or configuration files in public reports unless you have reviewed and sanitized them.

## Scope

Security issues in this project may include unsafe handling of credentials, unintended persistence of sensitive data, unsafe file access, dependency vulnerabilities with practical impact, or behavior that could modify Azure DevOps resources unexpectedly.

Issues in Microsoft Azure, Azure DevOps, or related Microsoft services should be reported to Microsoft through their official security channels.
