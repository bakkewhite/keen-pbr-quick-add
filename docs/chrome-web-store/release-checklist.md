# Chrome Web Store preparation — 0.4.9

Prepared on 2026-10-12. Package version: `0.4.9-beta.1`; Chrome version: `0.4.9`.
This checklist distinguishes local verification from the live dashboard.

## Prepared and verified

- ZIP: `release/keen-pbr-quick-add-v0.4.9-beta.1.zip`, 351,360 bytes.
- SHA-256: `b8995bd8fd28ac8bee49b318b97e4f8641b1cfc989e794bc41c4a55bd35e3ce9`.
- ZIP contains 30 entries, both manifest locales, icons and license notices;
  no source maps, tests, development dependencies or API fixture. Nested paths
  use portable forward slashes.
- HTTP and HTTPS support are unchanged. No new runtime permissions.
- `npm run verify`: TypeScript, 318 tests in 25 files, production build passed.
- Real-client standalone-fixture check and Add/Remove round trip passed.
- Built popup checked at its actual 440px width: Russian/light,
  English/dark/reduced-motion, fast/slow responses, failed request/retry and
  cross-list membership. No unexpected console errors or horizontal overflow.
  No stale Add/Remove action during checks. Address and loading text use 13px.
- Four current-UI screenshots per locale, 1280 × 800 JPEG, RGB/no alpha.
  Demo-only addresses and data; no private router configuration or passwords.
- Shared small promotional tile: 440 × 280 JPEG. Package icon: 128 × 128 PNG.
- Descriptions: `listing.en.txt`, `listing.ru.txt`.
- Declarations: `privacy-fields.md`; reviewer workflow: `reviewer-instructions.txt`.
- Privacy policies: `PRIVACY.md` and `PRIVACY.ru.md` at repository root.

Rendered checks used an isolated Playwright browser because the Browser plugin
was not available. The fixtures served the compiled popup and background worker;
they did not connect to real routers. This is not a substitute for the live
Chrome Web Store package validator or real-router acceptance testing.

## Assets to upload

For English, upload `assets/en-1-main.jpg` through `assets/en-4-setup.jpg` in order.
For Russian, upload `assets/ru-1-main.jpg` through `assets/ru-4-setup.jpg` in order.
Upload `assets/small-promo-440x280.jpg` as the shared small promotional tile.
Use `public/icons/keen-pbr-128.png` if the dashboard asks for an icon separately.

## Still requires live verification

- Updated policy and reviewer fixture visible at the public repository URLs.
- Developer registration, verified contact information and account eligibility.
  Payments, agreements and trader/legal-status declarations require the owner.
- ZIP accepted by the Chrome Web Store validator.
- English/Russian listing text and images saved in the correct locales.
- Permission justifications, data declarations, policy URL and reviewer notes saved.
- Visibility/distribution settings selected by the owner where required.
- Draft has no unresolved required-field warnings.

Stop before **Submit for review**. No moderation submission is authorized by this
preparation step. Supporting user-specified HTTP servers is disclosed; approval
by Google is not guaranteed.
