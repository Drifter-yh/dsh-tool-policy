# Contributing

Thanks for improving `dsh-tool-policy`. Keep changes small and focused on the public Harness extension points.

## Development

The public Harness package line used for reproducible validation is `0.1.0-rc.6`; exact `0.1.0-rc.5` package versions are not currently available from the public registry, while the plugin compatibility range starts at `0.1.0-rc.5`. All development dependencies are registry packages; the repository must not depend on a sibling Harness checkout, local tarball, or private workspace path. The integration test uses the installed Cordis Loader and Include packages directly.

Run the full local checks:

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm integration
```

Changes to `src/index.ts` should stay limited to Cordis/Harness integration. Keep policy compilation and matching in `src/policy.ts` independent of Cordis so it can be tested and reused without a running agent.
