# Jira Commands

Requires `atlassian-cli`. Coordinates from `.atlassianrc` (see `SKILL.md`).

Official docs: https://atlassiancli.com/jira/

## Known gotcha: `issue update` always exits 1

Jira's PUT `/issue` returns **204 No Content**. `atlassian-cli` tries to decode the body as JSON and always fails:

```
ERROR Failed to parse JSON response: error decoding response body
Error: Failed to update issue LRIS-210: Invalid response format: error decoding response body
```

**The update succeeds.** Ignore the error. Always verify with a follow-up `issue get`:

```sh
atlassian-cli jira issue get <ISSUE-KEY>
```

## Issue Operations

```sh
# Create
atlassian-cli jira issue create \
  --project <PROJECT> \
  --issue-type <Story|Task|Bug|Sub-task> \
  --summary "<summary>" \
  [--field "description=$adf"]

# Read
atlassian-cli jira issue get <ISSUE-KEY>

# Search
atlassian-cli jira issue search --jql "<JQL>"
# Example: project = LRIS AND status = "To Do" AND labels = "ready-for-agent"

# Update summary
atlassian-cli jira issue update <ISSUE-KEY> --summary "<new summary>"

# Update description (ADF — see below)
# Both --description and --field "description=$adf" work identically.
# Both exit 1 due to the 204 gotcha above — update still applies.
atlassian-cli jira issue update <ISSUE-KEY> --description "$adf"

# Comment
atlassian-cli jira issue comments add <ISSUE-KEY> --body "<text>"

# Link issues
atlassian-cli jira issue links add <ISSUE-KEY> --link-type <type> --target <TARGET-KEY>

# Apply labels (include all existing labels to avoid overwrite)
atlassian-cli jira issue update <ISSUE-KEY> --field 'labels=["existing","new-label"]'
```

## Transitions

**Never hardcode a status name.** Boards vary.

```sh
# 1. List available transitions for this issue
atlassian-cli jira issue transitions <ISSUE-KEY>

# 2. Apply by exact name from the output above
atlassian-cli jira issue transition <ISSUE-KEY> --status "<exact-status-name>"
```

## Descriptions: Markdown → ADF

Jira accepts ADF JSON only for rich descriptions. Use the bundled converter:

```sh
# From a heredoc / string
# Path assumes default skill install: ~/.claude/skills/atlassian/ — adjust if installed elsewhere
adf=$(printf '## Summary\n\n- item 1\n- item 2' | bun ~/.claude/skills/atlassian/md-to-adf.ts)
atlassian-cli jira issue create --project LRIS --issue-type Story \
  --summary "My issue" --field "description=$adf"

# From a file
adf=$(bun ~/.claude/skills/atlassian/md-to-adf.ts description.md)
atlassian-cli jira issue update LRIS-123 --field "description=$adf"
```

Both `--description "$adf"` and `--field "description=$adf"` accept ADF JSON despite the help text saying `--description` is "plain text only". Either works.

## Output Formats

Default: `table`. Add `-f json` for scripting or when parsing output.
