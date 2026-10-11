# Security Policy

## Supported versions

The current public beta line `0.4.x` receives security fixes. Older development
snapshots are unsupported.

## Reporting a vulnerability

Use this repository's private GitHub Security Advisory reporting when enabled.
If private reporting is unavailable, open a minimal issue asking for a private
contact channel without including exploit details.

Never post router credentials, API tokens, cookies, SSH keys, full configs,
private hostnames, or unredacted logs in a public issue.

## Deployment guidance

Use the extension and keen-pbr API only on a trusted LAN, over a trusted VPN, or
through a correctly authenticated HTTPS endpoint. Do not expose the keen-pbr API
port directly to WAN or guest networks. Basic credentials are stored only in
Chrome extension session storage unless the user explicitly chooses local
profile storage. HTTP transmits the password without encryption. The extension
does not use the single-session Bearer login, so it does not log out the Web UI.
