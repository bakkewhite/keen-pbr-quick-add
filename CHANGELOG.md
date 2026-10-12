# Changelog

## 0.4.9-beta.1

- Show a neutral loading state while domain checks run, with a compact result reveal and reduced-motion support.
- Keep the loading message and connection address at the same font size.
- Add English and Russian manifest metadata for localized Chrome Web Store listings.
- Update privacy documentation and prepare store listing assets and reviewer instructions.
- Restore the authentication-status endpoint in the optional local API fixture used for testing.
- Use portable ZIP paths for nested icon and locale files.

## 0.4.8-beta.1

- Preserve real subdomains in manual input and current-tab addresses.
- Strip the `www.` prefix and URL components without reducing other subdomains to the root domain.

## 0.4.7-beta.1

Initial public source snapshot.

- Add/remove registrable domains in the selected editable keen-pbr list.
- Manual domain/URL input, current-tab shortcut, membership status and other-list chips.
- Saved connection manager and Address → Access → List setup wizard.
- Optional per-origin Basic credentials, HTTP warning, session/local storage choices.
- EN/RU, system light/dark theme, 440px popup and open-source HeroUI components.
- Independent accessible step indicator; no paid UI dependency or build token.
- Verified Developer Mode ZIP packaging with version checks and license notices.
