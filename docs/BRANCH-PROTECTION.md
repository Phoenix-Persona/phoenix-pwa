# Branch Protection

Require the GitHub Actions `CI / test` status check before merging into
`dev` or `main`.

## Required Checks

- `CI / test` must pass for pull requests into `dev`.
- `CI / test` must pass for pull requests into `main`.
- Direct pushes to `main` should stay restricted to maintainers.

## Security Check

The `Security / audit` workflow runs on pull requests and weekly on Mondays.
It fails only for high or critical advisories in production dependencies
(`npm audit --omit=dev --audit-level=high`).

## Notes

- Integration tests use loopback `127.0.0.1` only.
- CI must not receive PPQ, Breez, Blossom, Lightning, relay, or signer secrets.
- Branch protection is configured in GitHub repository settings, not in this repo.
