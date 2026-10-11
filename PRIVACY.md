# Privacy

keen-pbr Quick Add does not collect or transmit telemetry, analytics, browsing
history, or personal data to the extension author. It contains no remote code.

The extension stores only:

- the selected and previously saved normalized keen-pbr API origins;
- a separate default domain-list name for each saved origin;
- the selected interface language.
- a Basic credential for each origin where the user explicitly signs in.
- the normalized address of an unfinished connection check, without credentials.
- an origin-only cleanup marker for the credential of a new, unfinished connection.

Only those origin-only checkpoints use the popup's synchronous localStorage.
They survive closing the popup during a permission prompt or before final Save,
and are removed on Save or Cancel; clearing browsing data may also remove them.
They never contain a password. Cancel of a new unfinished connection also removes
its staged credential; a saved connection's credential is not removed by Cancel.

The credential stays in Chrome extension session storage by default and is
cleared on browser restart. If the user selects **Remember on this computer**,
it stays in local extension storage without sync until **Forget password** or
extension data removal. This is not encrypted by the extension; software with
access to the Chrome profile may read it. The password is sent directly to the
selected keen-pbr origin as Basic authentication. HTTP does not encrypt it.

The active tab URL is read when opening the popup or choosing **From tab**.
You can also enter a domain or URL manually; it is normalized locally to a root
domain and is not saved as browsing history. Checking reads keen-pbr lists and
does not visit the entered site. When URL/file lists exist, opening the popup or
checking a domain also sends its normalized root to the configured router's
read-only routing diagnostic, which may perform DNS resolution. Subscriptions
are not fetched by the browser. Add/Remove changes the router configuration only
after an explicit button press. keen-pbr config
responses and domain arrays are held in memory for the current operation and
are not logged or persisted by the extension. Optional host permission is
requested only for the exact API origin that the user confirms.

Remove the extension or clear its site/extension data in Chrome to delete the
stored settings. Network requests go directly from the browser extension to the
user-configured keen-pbr endpoint; the project has no intermediary service.

Switching the active origin retains previously granted host permissions and saved
credentials so the user can return to that connection. Forget password removes
only the selected origin's credential. Confirmed Delete removes the selected
profile and its credential locally, without modifying the router or automatically
choosing a replacement. Chrome host permissions are retained and can be revoked
in Chrome's extension settings. Credentials are not shared across origins.

Last updated: 2026-10-10.
