# atlassian-skill

A [Claude Code](https://claude.ai/code) skill for Jira, Bitbucket, and Confluence operations via [`atlassian-cli`](https://github.com/omar16100/atlassian-cli). Handles issue creation, transitions, PR management, Confluence page/space/blog authoring, and Markdown → ADF conversion — with zero external Node dependencies.

## What it does

| Capability | Details |
|---|---|
| Jira issues | Create, read, search, update, comment, link, label |
| Jira transitions | Fetch available transitions at runtime — never hardcodes status names |
| Bitbucket PRs | List, create, diff, approve, comment, merge, decline |
| Bitbucket branches | List, delete, protect |
| Bitbucket repos | List, get, permission management |
| Confluence pages | Create, read, update, publish, delete, version history, labels, comments, restrictions |
| Confluence spaces | List, create, update, delete, permissions |
| Confluence blog posts | List, create, update, publish, delete |
| Confluence attachments | List, upload, download, delete |
| Confluence search | CQL queries, plain text, space-scoped |
| Markdown → ADF | Bundled zero-dependency converter for Jira rich-text descriptions |
| Project auto-detection | Resolves workspace/repo/project key from git remote + branch names |

## Requirements

- [Bun](https://bun.sh) — runtime for `md-to-adf.ts`
- [`atlassian-cli`](https://github.com/omar16100/atlassian-cli) — authenticated and on `$PATH`
- Claude Code (CLI, desktop app, or IDE extension)

### Install `atlassian-cli`

```sh
# macOS
brew install omar16100/tap/atlassian-cli

# Or download a binary from the releases page:
# https://github.com/omar16100/atlassian-cli/releases
```

### Authenticate `atlassian-cli`

```sh
atlassian-cli config set --base-url https://<your-domain>.atlassian.net \
                         --email <you@example.com> \
                         --token <api-token>
```

Generate an API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

## Installation

### Option A — clone into your Claude skills directory

```sh
git clone https://github.com/calvinmclean/atlassian-skill ~/.claude/skills/atlassian-skill
```

Then add to your `~/.claude/CLAUDE.md`:

```markdown
## Atlassian (Jira + Bitbucket + Confluence)

For all Jira, Bitbucket, and Confluence operations, read `~/.claude/skills/atlassian-skill/skills/atlassian/SKILL.md` first.
```

### Option B — copy files only

```sh
mkdir -p ~/.claude/skills/atlassian
cp skills/atlassian/* ~/.claude/skills/atlassian/
```

Add to `~/.claude/CLAUDE.md`:

```markdown
## Atlassian (Jira + Bitbucket + Confluence)

For all Jira, Bitbucket, and Confluence operations, read `~/.claude/skills/atlassian/SKILL.md` first.
```

## Usage

Once installed, Claude Code picks up the skill automatically. Trigger phrases:

- "create a Jira issue for…"
- "transition PROJ-123 to In Progress"
- "create a PR from feature-branch to main"
- "update the description of PROJ-456"
- "create a Confluence page in the DEV space"
- "search Confluence for meeting notes"
- "list branches in my Bitbucket repo"

On first use in a repo, the skill auto-detects your Bitbucket workspace and Jira project key from the git remote and branch names, confirms with you, then writes an `.atlassianrc` cache file to the repo root.

### Markdown → ADF converter

The bundled `md-to-adf.ts` converts Markdown to Atlassian Document Format JSON — required for Jira rich-text fields. It has no external dependencies and runs with Bun.

```sh
# From stdin
printf '## Summary\n\n- item 1\n- item 2' | bun skills/atlassian/md-to-adf.ts

# From a file
bun skills/atlassian/md-to-adf.ts description.md
```

Supported Markdown elements: headings, paragraphs, bold, italic, strikethrough, inline code, code blocks, ordered/unordered/task lists, blockquotes, links, images, horizontal rules, and raw `<adf>…</adf>` passthrough blocks.

## Skill structure

```
skills/atlassian/
├── SKILL.md        # Main skill — bootstrap, guardrails, coordinate resolution
├── jira.md         # Jira command reference
├── bitbucket.md    # Bitbucket command reference
├── confluence.md   # Confluence command reference
└── md-to-adf.ts    # Markdown → ADF converter (Bun, no deps)
```

## Guardrails

The skill enforces three rules on every operation:

1. **`atlassian-cli` only** — never `gh`, `glab`, or Atlassian MCP tools
2. **Format split** — Jira descriptions use ADF JSON; Bitbucket PR descriptions use plain Markdown; Confluence bodies use HTML storage format passed as a file path
3. **Dynamic transitions** — always fetches available transitions before applying one; never hardcodes a status name

## Contributing

PRs welcome. Keep `md-to-adf.ts` dependency-free (Bun built-ins only).

## Licence

MIT
