# any-skills

When installed as a dependency, this package creates a shared skills directory (default: `.skills`) so Claude, Codex, and similar tools can reuse the same skills.

- `.claude/skills`
- `.codex/skills`

## How it works

The `postinstall` script runs at install time. It uses the user's install working directory as the root (prefers `INIT_CWD`, then `npm_config_local_prefix`, and falls back to `process.cwd()`). If the shared skills directory does not exist, it is created, then the tool-specific symlinks are generated (unless overridden by configuration).

## Configuration

You can customize which links are created by adding `.skillsrc` (JSON) in your project root.

Supported fields:

- `target`: optional string. Overrides where skills are stored (default: `.skills`).
- `links`: array of link definitions. Strings map to `target` by default.

Example:

```json
{
  "target": ".skills",
  "links": [".codex/skills", ".claude/skills"]
}
```

## Cross-platform behavior

- macOS / Linux uses `dir` symlinks
- Windows uses `junction` for better compatibility

## Usage

```sh
npm install any-skills --save-dev
```
