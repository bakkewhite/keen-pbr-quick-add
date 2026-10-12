# Chrome Web Store draft fields

These are release-preparation notes, not a guarantee of policy approval.
The dashboard declarations must match the uploaded package and privacy policy.

## Single purpose

Manage domains and subdomains in the user's selected keen-pbr domain list directly
from Chrome: check membership and explicitly add or remove a domain through the
user-configured keen-pbr API.

## activeTab justification

Read the URL of the active tab when the user opens the extension or chooses
From tab, so the popup can check and manage that website's hostname. No history
permission, background browsing tracking or webpage content injection is used.

## storage justification

Keep user-selected API addresses, per-address default lists and the interface
language locally. Optional Basic credentials are held in Chrome session storage
by default, or local storage only when the user selects Remember on this computer.
No Chrome storage synchronization is used.

## Host permission justification

Users configure their own keen-pbr API servers, which may have arbitrary LAN
addresses, ports or HTTPS KeenDNS hostnames. Optional HTTP/HTTPS patterns are
therefore declared in the manifest, but the extension requests runtime access
only for the user-selected address. This access is used for JSON API health,
configuration and routing checks, and explicitly requested list changes. It is
not used to read arbitrary websites or subscription URLs.

## Remote code

No. All executable JavaScript, styles and dependencies are bundled in the ZIP.
Remote API responses are JSON data, not executable code.

## Data categories

- Authentication information: optional user-entered keen-pbr Basic credentials,
  local/session storage, transmitted only to the user-selected server.
- Web history / browsing activity: the active tab URL and derived hostname are
  processed for the visible domain-management feature. No visit history is saved.
  A hostname may be sent to the selected router's routing diagnostic.

Do not certify "no user data" merely because the author receives none: Google's
FAQ also covers processing on the user's device. There is no collection of
page content, cookies, form fields, personal communications, precise location,
health/payment data or background interaction analytics.

The extension does not sell or transfer data to unrelated third parties, use it
for unrelated purposes, or use it for creditworthiness/lending. Read the exact
dashboard certifications before checking them.

## Privacy policy URL

https://github.com/bakkewhite/keen-pbr-quick-add/blob/main/PRIVACY.md

This URL must display the updated 2026-10-12 policy before submission.
The policy links to a Russian translation.

## Reviewer note: HTTP and local credential storage

This extension is a client for user-specified keen-pbr servers. It has no
developer-specified server, relay, analytics endpoint or extension account.
HTTPS is supported and recommended. Local HTTP servers are also supported and
the UI warns before sending a password over HTTP. Optional persistent
credentials are not encrypted by the extension; the UI discloses the local
Chrome-profile storage limitation. They are never sent to the developer.

Please consider the user-specified-server client case in User Data FAQ section
15. This is not a request to waive any applicable policy. If Google requires a
different treatment, resolve it before resubmission; do not obscure the behavior.

## Public URLs

- Homepage: https://github.com/bakkewhite/keen-pbr-quick-add
- Support: https://github.com/bakkewhite/keen-pbr-quick-add/issues
- Price: free, no in-extension purchases.
- Category: choose the available developer/network-tools category in the live dashboard.

## Official references checked on 2026-10-12

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
