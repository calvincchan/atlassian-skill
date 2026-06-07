# Bitbucket Commands

Requires `atlassian-cli bitbucket`. Coordinates from `.atlassianrc` (see `SKILL.md`).

Official docs: https://atlassiancli.com/bitbucket/

`--workspace` is optional when inside a repo with a recognised Bitbucket remote.

## PR Operations

```sh
# List open PRs
atlassian-cli bitbucket --workspace <WORKSPACE> pr list <repo> [--state OPEN|MERGED|DECLINED]

# Read a PR
atlassian-cli bitbucket --workspace <WORKSPACE> pr get <repo> <PR_ID>

# Create a PR
atlassian-cli bitbucket --workspace <WORKSPACE> pr create <repo> \
  --title "<JIRA-KEY> <title>" \
  --source <branch> \
  --destination <base-branch>

# Diff
atlassian-cli bitbucket --workspace <WORKSPACE> pr diff <repo> <PR_ID>

# Approve
atlassian-cli bitbucket --workspace <WORKSPACE> pr approve <repo> <PR_ID>

# Comment
atlassian-cli bitbucket --workspace <WORKSPACE> pr comment <repo> <PR_ID> --body "<text>"

# Merge
atlassian-cli bitbucket --workspace <WORKSPACE> pr merge <repo> <PR_ID> [--strategy merge_commit|squash|fast_forward]

# Decline
atlassian-cli bitbucket --workspace <WORKSPACE> pr decline <repo> <PR_ID>
```

## PR Descriptions

Plain Markdown — no ADF conversion. (ADF is Jira-only.)

## Branch Operations

```sh
# List branches
atlassian-cli bitbucket --workspace <WORKSPACE> branch list <repo>

# Delete branch
atlassian-cli bitbucket --workspace <WORKSPACE> branch delete <repo> <branch> [--force]

# Protect branch (restrict merges, require approvals)
atlassian-cli bitbucket --workspace <WORKSPACE> branch protect <repo> \
  --pattern "main" --kind restrict_merges --approvals 2
```

## Repository Operations

```sh
# List repos in workspace
atlassian-cli bitbucket --workspace <WORKSPACE> repo list [--limit <N>]

# Get repo details
atlassian-cli bitbucket --workspace <WORKSPACE> repo get <repo>

# List repo permissions
atlassian-cli bitbucket --workspace <WORKSPACE> permission list <repo>
```

## Auth Check

```sh
atlassian-cli bitbucket whoami [--profile <profile>]
```

## Output Formats

Default: `table`. Add `--format json` for scripting or when parsing output.
