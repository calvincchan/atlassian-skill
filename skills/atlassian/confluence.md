# Confluence Commands

Requires `atlassian-cli confluence`. Coordinates from `.atlassianrc` (see `SKILL.md`).

Official docs: https://atlassiancli.com/confluence/

## Body Format

Confluence accepts **HTML storage format** — not Markdown, not ADF.
Pass `--body` as a **file path** containing HTML:

```sh
# Write HTML to a temp file, then reference it
body_file=$(mktemp /tmp/confluence-body.XXXXXX.html)
cat > "$body_file" <<'EOF'
<h2>Summary</h2>
<ul><li>Item 1</li><li>Item 2</li></ul>
EOF

atlassian-cli confluence page create \
  --space DEV --title "My Page" --body "$body_file"

rm "$body_file"
```

## Space Operations

```sh
# List
atlassian-cli confluence space list [--limit <N>]

# Get
atlassian-cli confluence space get <SPACE-KEY>

# Create
atlassian-cli confluence space create \
  --key DOCS --name "Documentation" --description "Team docs"

# Update
atlassian-cli confluence space update <SPACE-KEY> --name "New Name"

# Delete (irreversible — confirm with user first)
atlassian-cli confluence space delete <SPACE-KEY> [--force]

# Permissions
atlassian-cli confluence space permissions <SPACE-KEY>
atlassian-cli confluence space add-permission <SPACE-KEY> \
  --principal user@example.com --operation read
```

## Page Operations

```sh
# List
atlassian-cli confluence page list [--space <KEY>] [--limit <N>]

# Get
atlassian-cli confluence page get <PAGE-ID>

# Create
atlassian-cli confluence page create \
  --space <KEY> --title "<title>" --body <file.html> \
  [--parent <PARENT-PAGE-ID>]

# Update (--body is a file path)
atlassian-cli confluence page update <PAGE-ID> \
  [--title "<new title>"] [--body <file.html>] \
  [--status current|draft] [--message "<version note>"]

# Publish draft
atlassian-cli confluence page publish <PAGE-ID>

# Delete (irreversible — confirm with user first)
atlassian-cli confluence page delete <PAGE-ID>

# Version history
atlassian-cli confluence page versions <PAGE-ID>
```

### Labels

```sh
atlassian-cli confluence page add-label <PAGE-ID> <label> [<label2> ...]
atlassian-cli confluence page remove-label <PAGE-ID> <label>
```

### Comments

```sh
atlassian-cli confluence page comments <PAGE-ID>
atlassian-cli confluence page add-comment <PAGE-ID> --body "<text>"
```

### Restrictions

```sh
atlassian-cli confluence page get-restrictions <PAGE-ID>
atlassian-cli confluence page add-restriction <PAGE-ID> \
  --operation update --user user@example.com
atlassian-cli confluence page remove-restriction <PAGE-ID> \
  --operation update --user user@example.com
```

## Blog Post Operations

```sh
atlassian-cli confluence blog list [--space <KEY>] [--limit <N>]
atlassian-cli confluence blog get <BLOG-ID>
atlassian-cli confluence blog create \
  --space <KEY> --title "<title>" --body <file.html>
atlassian-cli confluence blog update <BLOG-ID> \
  [--title "<title>"] [--body <file.html>]
atlassian-cli confluence blog publish <BLOG-ID>
atlassian-cli confluence blog delete <BLOG-ID>
```

## Attachment Operations

```sh
atlassian-cli confluence attachment list <PAGE-ID>
atlassian-cli confluence attachment get <ATTACHMENT-ID>
atlassian-cli confluence attachment upload \
  --page-id <PAGE-ID> --file ./diagram.png
atlassian-cli confluence attachment download \
  <ATTACHMENT-ID> --output ./local-file.png
atlassian-cli confluence attachment delete <ATTACHMENT-ID>
```

## Search

```sh
# CQL (most powerful) — CQL query is a positional argument
atlassian-cli confluence search cql \
  "space = DEV AND type = page AND title ~ \"api\"" \
  [--limit <N>]

# Plain text
atlassian-cli confluence search text \
  --query "meeting notes" [--limit <N>]

# Scoped to one space
atlassian-cli confluence search in-space \
  --space DEV --query "api docs"

# Parameterised filters
atlassian-cli confluence search params [--space <KEY>] [--limit <N>]
```

## Bulk Operations

Always run with `--dry-run` first to verify scope.

```sh
# Bulk delete pages
atlassian-cli confluence bulk delete --space OLD [--dry-run]

# Bulk add labels
atlassian-cli confluence bulk add-labels \
  --cql "space = DEV" --labels docs,reviewed [--dry-run]

# Bulk export (backup)
atlassian-cli confluence bulk export \
  --space DEV --output backup.json --format json
```

## Analytics

```sh
atlassian-cli confluence analytics page-views <PAGE-ID> \
  [--from <YYYY-MM-DD>]

atlassian-cli confluence analytics space-stats <SPACE-KEY>
```

## Output Formats

Default: `table`. Add `-f json` for scripting.
All commands support: `table`, `json`, `yaml`, `csv`, `quiet`, `markdown`.
