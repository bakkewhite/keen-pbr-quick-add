# Contributing

Please discuss substantial changes in an issue first. Keep changes focused and
avoid runtime dependencies unless the problem cannot be solved safely without one.

## Build and verify

Use Node.js 22.13+ (22 LTS recommended) and npm:

```powershell
npm ci
npm run verify
npm run package
```

Load `dist/` as an unpacked extension during development. Packaging verifies the
source and creates `release/keen-pbr-quick-add-v<package-version>.zip` with license
notices but no source maps. CI runs the same package command on Windows.
`npm run mock-api` serves fictional router data at `127.0.0.1:12122`; do not point
automated tests at a production router.

## API compatibility and troubleshooting

- The extension uses the keen-pbr Web UI/API origin, not the main Keenetic admin
  page. If a KeenDNS or reverse proxy returns an external login page instead of
  JSON, direct API access must be configured; the extension does not reuse its cookies.
- Native authentication uses Basic with the fixed username `admin`.
  It does not replace the Web UI's separate Bearer session.
  HTTP 401 requires authentication; 403 can also indicate an origin/proxy restriction.
- Editable lists must contain inline domains, be nonempty, and participate in an
  enabled routing rule. URL/file sources and IP lists are not editable.
- URL/file membership diagnostics report only the first external match per rule.
  Their absence is not proof that a domain is absent from every subscription.
- Domain normalization respects private Public Suffix List boundaries.

See [Privacy](PRIVACY.md), [Security](SECURITY.md) and the
[keen-pbr REST API documentation](https://keen-pbr.fyi/docs/rest-api/) for more context.

## Change safety

Before a mutation, the extension rereads configuration, stages the full updated
copy, sends one save/apply POST, and verifies with reads. Never automatically
retry `POST /api/config/save` after an uncertain response.
Temporary list selection must not change the connection's saved default.

Test user-facing changes in real Chrome with representative keen-pbr behavior,
including uncertain save responses. Do not commit real router configs,
credentials, tokens, private hostnames, or generated `dist/` and `release/` artifacts.

AI-assisted contributions require understanding and reviewing the complete diff,
and personally running the relevant tests and Chrome checks.

## License and assets

Contributions are licensed under GPL-3.0. Dependencies retain their own licenses.
The keen-pbr logo has a separate [provenance notice](public/icons/keen-pbr-NOTICE.txt).
Its use does not imply endorsement.
