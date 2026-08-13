# Contributing

Thanks for improving `dsh-tool-policy`. Keep changes small and focused on the public Harness extension points.

## Development

The current Harness `0.1.0-rc.5` packages are not yet available from the public npm registry. The checked-in development manifest therefore uses local tarballs generated from the sibling Harness checkout used by the integration test. Before working from a different directory, regenerate those tarballs from the matching Harness commit or replace the development references with the published package versions when they become available.

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
