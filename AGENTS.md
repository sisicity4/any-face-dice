# Agent Instructions

## Always Read This First

When working on this site, read this file before changing code, design, routes, deployment settings, or documentation.

## Repository Name vs Published Address

Do not change the distinction between the GitHub repository name and the published site address.

- GitHub repository name: `any-face-dice`
- Published GitHub Pages address/base path: `/😃🎲/`

This difference is intentional.

The repository should stay easy to manage from GitHub, npm, Vite, shell commands, and deployment tooling. The public site address should keep the emoji identity.

## Vite Base Rule

Keep the default Vite base as:

```ts
base: process.env.VITE_BASE_PATH ?? "/😃🎲/",
```

Do not replace the default base with `/any-face-dice/` unless the user explicitly asks to change the published address.

## Documentation Rule

If deployment instructions mention the repository name, also mention that the public base path intentionally remains `/😃🎲/`.
