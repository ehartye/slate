# Updater signing setup

Run this yourself from the Slate checkout after `npm install` and `gh auth login`:

```sh
node scripts/setup-updater-signing.mjs
```

The script creates a new Slate-specific Tauri updater key and a random password.
It uploads them to `ehartye/slate` as the GitHub Actions secrets
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, using stdin
rather than command arguments. It captures signer output and does not print the
key or password. It does not publish a release or modify another application's keys.

The backup is in `~/.tauri/slate-updater/`, outside the checkout. On Windows the
directory grants access to your account with inherited permissions removed; on
macOS/Linux it uses mode 0700 and private files use mode 0600. It contains the
encrypted `slate.key`, its public key, and the **plaintext** generated password in
`password.txt`. Keep this directory private and copy the key and password into
your secure backup or password manager. Both are needed to restore signing.

Only the public key is copied into `src-tauri/updater-public-key.txt`. That file is
safe to commit and supplies the public key for the upcoming updater integration.
Never commit or paste the private backup into an assistant conversation.

Existing secrets and backups are not overwritten on a normal run. If an upload
fails, keep the backup and run:

```sh
node scripts/setup-updater-signing.mjs --resume
```

Resume uploads the **same saved pair**; it never generates a replacement. Use it
only to resume this setup, not after independently rotating either GitHub secret.
The two GitHub writes are not atomic; do not publish until setup reports success.
GitHub confirms the names exist but cannot return the values for comparison;
the release workflow must verify that signing matches the embedded public key.

Test the script without creating real keys or contacting GitHub:

```sh
node --test scripts/setup-updater-signing.test.mjs
```
# Preview release contract

Slate currently accepts only `vMAJOR.MINOR.PATCH-alpha.N` tags (positive N).
Prepare versions intentionally across the five manifest/lock files, then run:

```sh
node scripts/validate-release.mjs --tag v0.2.0-alpha.1
node scripts/prepare-release-config.mjs --output <new-temporary-json-path>
```

The second command requires the owner-provisioned public handoff described above.
It writes an exclusive, temporary Tauri configuration overlay containing the public
key, fixed Preview endpoint, updater artifact generation and macOS ad-hoc signing.
Pass that output to `tauri build --config <path>` for release packaging. It never
reads private key backups. Missing public trust blocks release preparation.
Ordinary local packaging keeps `createUpdaterArtifacts: false`, needs no signing
key, and preserves checked-in versions. It must never publish or advance the feed.

The shared `scripts/lib/release-contract.mjs` validates complete three-platform
feeds and compares alpha versions numerically. Windows payloads are NSIS `.exe`
assets; both Mac targets must share one `.app.tar.gz` and signature. Every URL is
an exact HTTPS asset path under the version's Slate GitHub release. Feed validation
checks signature presence; cryptographic verification belongs to Tauri and the
release signing canary. Equal/older versions cannot be offered as updates.

## Publishing a Preview

The tag workflow has two packaging jobs (Windows x64 and universal macOS), then
one serialized publication job. It does not run a broad PR or nightly test matrix.
It accepts only eligible alpha tags whose commits are on `origin/main`. Before
tagging, finish local tests and isolated native verification, merge the reviewed
change, and obtain the owner's release go-ahead. Protect release tags from
untrusted writers using the repository's normal access controls.

For the first release, the owner runs the signing setup above, commits its public
handoff, and prepares the approved `0.2.0-alpha.1` version across all five files.
Private keys stay out of Git. The workflow runs `check-updater-key.mjs`: Tauri signs
a temporary canary using secrets from the environment, and Node verifies the
payload and trusted-comment signatures against the public handoff. Signer output
is suppressed. A missing or mismatched key stops packaging. No release can be
prepared from the current checkout until the owner supplies that public handoff
and the two repository secrets.

After the owner authorizes publication, push the corresponding immutable version
tag. The workflow builds with locked Cargo/npm dependencies and checks that build
commands did not edit the version files. macOS uses ad-hoc signing (`-`) and checks
both `x86_64` and `arm64` slices; there is no Apple notarization or Windows publisher
certificate. OS trust warnings may therefore require the user's attention.

The publication helper requires exactly the Windows `.exe` and `.sig`, universal
Mac `.app.tar.gz` and `.sig`, and Mac `.dmg`. It verifies updater signatures locally,
uploads a complete draft, and reads back every asset before publishing a GitHub
prerelease. It then checks the public tag-specific URLs without credentials before
advancing `updates:preview.json`. This dedicated feed includes prereleases, unlike
GitHub's latest-release endpoint. Both Mac target entries use the same archive.

Published assets are never replaced. A retry can finish a draft only with identical
existing bytes; retry the failed publication job with the retained build artifacts.
Rebuilding can produce different bytes, so a conflicting retry fails instead of
overwriting anything. Fix a published release by issuing a newer version. An exact
published release/feed retry is a no-op. Upload, validation, or public-download
failure leaves the previous feed intact. Feed writes use a non-forced Git commit
and re-read version ordering after conflicts; older runs cannot regress it.

The first updater-enabled build requires manual installation. Close all older
Slate processes first, install the new Windows installer or Mac DMG, then use
About → Check for updates. Future checks, downloads and installation each require
an explicit action. Save changes in every window before installing.

Focused local pipeline checks (the key fixture creates disposable test keys only):

```sh
node --test scripts/release-pipeline.test.mjs scripts/github-release.test.mjs
node --test scripts/setup-updater-signing.test.mjs
```

Workflow configuration and these fixtures do not prove a public release happened
or that Windows/Mac runtime update acceptance passed; record those observations
separately. Production signing readiness and the first publication remain owner
delivery gates.

