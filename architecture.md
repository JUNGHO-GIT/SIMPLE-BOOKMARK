# SIMPLE-BOOKMARK Architecture

## Structure Map

```text
SIMPLE-BOOKMARK
|-- src/
|   |-- commands/    -> bookmark action entrypoints
|   |-- providers/   -> tree view adapters
|   |-- services/    -> bookmark storage and mutation logic
|   |-- models/      -> shared bookmark contracts
|   |-- assets/      -> helpers and shared utilities
|   `-- exports/     -> module barrels
|-- out/             -> compiled extension output
`-- package.json     -> extension metadata and scripts
```

## Flow Map

```text
VS Code command or tree event
  -> provider loads bookmark state
  -> tree view renders current nodes
  -> command delegates mutation to service
  -> provider refreshes the view
```

## Boundaries

- Commands own entrypoints and user actions.
- Services own bookmark persistence and mutations.
- `out/` is generated and not edited directly.