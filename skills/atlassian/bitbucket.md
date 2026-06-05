# Bitbucket Commands

Requires `atlassian-cli bb`. Coordinates from `.atlassianrc` (see `atlassian.md`).

`--workspace` is optional when inside a repo with a recognised Bitbucket remote.

## PR Operations

```sh
# List open PRs
atlassian-cli bb pr list <repo>

# Read a PR
atlassian-cli bb pr get <repo> <PR_ID>

# Create a PR
atlassian-cli bb pr create <repo> \
  --title "<JIRA-KEY> <title>" \
  --source <branch> \
  --destination <base-branch>

# Diff
atlassian-cli bb pr diff <repo> <PR_ID>

# Approve
atlassian-cli bb pr approve <repo> <PR_ID>

# Comment
atlassian-cli bb pr comment <repo> <PR_ID> --body "<text>"

# Merge
atlassian-cli bb pr merge <repo> <PR_ID>

# Decline
atlassian-cli bb pr decline <repo> <PR_ID>
```

## PR Descriptions

Plain Markdown — no ADF conversion. (ADF is Jira-only.)

## Output Formats

Default: `table`. Add `-f json` for scripting or when parsing output.
