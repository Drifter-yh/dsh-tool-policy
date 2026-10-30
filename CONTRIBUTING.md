# Contributing

Thanks for improving `dsh-tool-policy`. Keep changes small and focused on the public Harness extension points.

## Development

The locked validation baseline uses the published Harness `0.1.1-rc.2` packages and Cordis `4.0.1` (with Loader `1.0.2` and Include `1.0.6`). CI runs one locked dependency set, not a version matrix. The declared `@deepseek-ai/dsh-tools` peer range is `>=0.1.0-rc.5 <0.2.0 || 0.1.1-rc.2` and the Cordis range is `>=4.0.1 <5`; these intended bounds do not establish that every version in them has been tested. The explicit `0.1.1-rc.2` alternative is required by npm semver prerelease matching and does not include other `0.1.1` prereleases. All development dependencies are registry packages; the repository must not depend on a sibling Harness checkout, local tarball, or private workspace path. The integration test uses the installed Cordis Loader and Include packages directly.

For the locked baseline, use Node `22.19.0` and pnpm `11.24.0` as in CI, then run:

```sh
pnpm install --frozen-lockfile --ignore-scripts --config.minimumReleaseAge=0 --config.strictDepBuilds=false
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm integration
npm pack --dry-run
```

Changes to `src/index.ts` should stay limited to Cordis/Harness integration. Keep policy compilation and matching in `src/policy.ts` independent of Cordis so it can be tested and reused without a running agent.

## Contributions

### Bug reports

Include the Harness/Cordis package versions, a minimal policy, the observed decision, and whether the call used a direct tool or an MCP namespace. Do not include secrets or raw production tool arguments; redact them or provide a synthetic fixture.

### Feature proposals

Explain the deployment problem and why it belongs in this per-call routing layer instead of Harness sandboxing, approval, telemetry, or another existing plugin. Proposals should preserve explicit rule order and fail-closed behavior unless a change is intentionally scoped and documented.

### Policy examples

Real-world, sanitized policy use cases are especially useful. Please include the tool names, the intended `allow`/`ask`/`deny` behavior, the relevant sandbox assumption, and any equivalent-operation limitation that operators should understand.

### Pull requests

Keep pull requests focused. Add tests for allow, ask, deny, unmatched rules, malformed configuration, and compatibility-sensitive behavior when applicable. Update both README files and the changelog for user-visible configuration changes. Decision traces and reasons must not copy parsed tool arguments.
