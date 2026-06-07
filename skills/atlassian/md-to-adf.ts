#!/usr/bin/env bun
/**
 * md-to-adf.ts — convert Markdown to Atlassian Document Format (ADF) JSON.
 * No external dependencies. Run with Bun:
 *   bun ~/.claude/skills/atlassian/md-to-adf.ts < input.md
 *   bun ~/.claude/skills/atlassian/md-to-adf.ts input.md
 */

// ---------------------------------------------------------------------------
// Ambient types (Bun runtime — not in project tsconfig)
// ---------------------------------------------------------------------------

declare const Bun: {
  argv: string[];
  file: (path: string) => { text: () => Promise<string> };
  stdin: { stream: () => AsyncIterable<Uint8Array> };
  stdout: { write: (data: string) => Promise<void> };
  exit: (code: number) => never;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BlockToken =
  | { type: "heading"; depth: number; text: string; tokens: InlineToken[] }
  | { type: "code"; lang: string; text: string }
  | { type: "blockquote"; tokens: BlockToken[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "hr" }
  | { type: "paragraph"; tokens: InlineToken[] }
  | { type: "html"; raw: string };

type InlineToken =
  | { type: "text"; text: string; tokens?: InlineToken[] }
  | { type: "strong"; tokens: InlineToken[] }
  | { type: "em"; tokens: InlineToken[] }
  | { type: "del"; tokens: InlineToken[] }
  | { type: "codespan"; text: string; tokens?: never }
  | { type: "link"; href: string; text: string; tokens: InlineToken[] }
  | { type: "image"; href: string; text: string }
  | { type: "br" }
  | { type: "escape"; text: string };

interface ListItem {
  task: boolean;
  checked: boolean;
  tokens: (InlineToken | BlockToken)[];
}

// ADF node shapes (minimal — just enough for the emitter)
interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: AdfMark[];
}

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Inline tokenizer
// ---------------------------------------------------------------------------

function tokenizeInline(src: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = src;

  while (remaining.length > 0) {
    let matched = false;

    // Hard break: two or more spaces followed by \n
    let m = remaining.match(/^( {2,})\n/);
    if (m) {
      tokens.push({ type: "br" });
      remaining = remaining.slice(m[0].length);
      matched = true;
    }

    // Escape: \X
    if (!matched) {
      m = remaining.match(/^\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/);
      if (m) {
        tokens.push({ type: "escape", text: m[1] });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Inline code: `span`
    if (!matched) {
      m = remaining.match(/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/);
      if (m) {
        tokens.push({ type: "codespan", text: m[2].trim() });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Image: ![alt](href)
    if (!matched) {
      m = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (m) {
        tokens.push({ type: "image", href: m[2].trim(), text: m[1] });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Link: [label](href)
    if (!matched) {
      m = remaining.match(/^\[([^\]]*)\]\(([^)]+)\)/);
      if (m) {
        const label = m[1];
        const href = m[2].trim();
        tokens.push({
          type: "link",
          href,
          text: label,
          tokens: tokenizeInline(label),
        });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Strong: **text** or __text__
    if (!matched) {
      m = remaining.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/);
      if (m) {
        tokens.push({ type: "strong", tokens: tokenizeInline(m[2]) });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Em: *text* or _text_ (not preceded by word char to avoid mid-word _)
    if (!matched) {
      m = remaining.match(/^(\*|_)(?=\S)([\s\S]*?\S)\1/);
      if (m) {
        tokens.push({ type: "em", tokens: tokenizeInline(m[2]) });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Strikethrough: ~~text~~
    if (!matched) {
      m = remaining.match(/^~~(?=\S)([\s\S]*?\S)~~/);
      if (m) {
        tokens.push({ type: "del", tokens: tokenizeInline(m[1]) });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Plain text — consume up to the next special char
    if (!matched) {
      m = remaining.match(/^[\s\S]+?(?=[`*_~[!\\]| {2,}\n|$)/);
      if (m && m[0].length > 0) {
        tokens.push({ type: "text", text: m[0] });
        remaining = remaining.slice(m[0].length);
        matched = true;
      }
    }

    // Safety: consume one character to avoid infinite loop
    if (!matched) {
      tokens.push({ type: "text", text: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return mergeAdjacentText(tokens);
}

function mergeAdjacentText(tokens: InlineToken[]): InlineToken[] {
  const out: InlineToken[] = [];
  for (const tok of tokens) {
    const last = out[out.length - 1];
    if (tok.type === "text" && last?.type === "text" && !last.tokens) {
      last.text += tok.text;
    } else {
      out.push(tok);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block tokenizer
// ---------------------------------------------------------------------------

function tokenizeBlock(src: string): BlockToken[] {
  // Normalize line endings, ensure trailing newline
  const lines = (src.replace(/\r\n/g, "\n").replace(/\r/g, "\n") + "\n").split(
    "\n"
  );
  const tokens: BlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // HTML passthrough: <adf>...</adf>
    if (/^<adf>/i.test(line.trim())) {
      let raw = "";
      while (i < lines.length) {
        raw += lines[i] + "\n";
        if (/<\/adf>/i.test(lines[i])) {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ type: "html", raw: raw.trim() });
      continue;
    }

    // Fenced code block
    const fenceMatch = line.match(/^(`{3,}|~{3,})\s*(\S*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] || "text";
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing fence
      tokens.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    // ATX heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+\s*)?$/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const text = headingMatch[2].trim();
      tokens.push({
        type: "heading",
        depth,
        text,
        tokens: tokenizeInline(text),
      });
      i++;
      continue;
    }

    // Setext heading (underline style)
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (/^=+\s*$/.test(nextLine) && line.trim()) {
        tokens.push({
          type: "heading",
          depth: 1,
          text: line.trim(),
          tokens: tokenizeInline(line.trim()),
        });
        i += 2;
        continue;
      }
      if (/^-+\s*$/.test(nextLine) && line.trim() && nextLine.length >= 2) {
        tokens.push({
          type: "heading",
          depth: 2,
          text: line.trim(),
          tokens: tokenizeInline(line.trim()),
        });
        i += 2;
        continue;
      }
    }

    // Horizontal rule
    if (/^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      tokens.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      tokens.push({
        type: "blockquote",
        tokens: tokenizeBlock(bqLines.join("\n")),
      });
      continue;
    }

    // List
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)]) /);
    if (listMatch) {
      const ordered = /^\d+[.)]/.test(listMatch[2]);
      const startNum = ordered ? parseInt(listMatch[2], 10) : 1;
      const baseIndent = listMatch[1].length;
      const items = parseListItems(lines, i, baseIndent, ordered);
      i = items.nextIndex;
      tokens.push({
        type: "list",
        ordered,
        start: startNum,
        items: items.items,
      });
      continue;
    }

    // Paragraph — collect until blank line or block-level element
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (/^(#{1,6})\s/.test(l)) break;
      if (/^(`{3,}|~{3,})/.test(l)) break;
      if (/^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(l.trim())) break;
      if (/^>\s?/.test(l)) break;
      if (/^(\s*)([-*+]|\d+[.)]) /.test(l)) break;
      if (/^<adf>/i.test(l.trim())) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      const text = paraLines.join("\n");
      tokens.push({ type: "paragraph", tokens: tokenizeInline(text) });
    }
  }

  return tokens;
}

interface ParsedList {
  items: ListItem[];
  nextIndex: number;
}

function parseListItems(
  lines: string[],
  startIndex: number,
  baseIndent: number,
  ordered: boolean
): ParsedList {
  const items: ListItem[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const itemMatch = line.match(/^(\s*)([-*+]|\d+[.)]) ((\[[ xX]\]) )?(.*)$/);
    if (!itemMatch) break;

    const indent = itemMatch[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) break; // handled as nested

    // Stop if marker type changes (e.g. unordered list followed by ordered)
    const itemIsOrdered = /^\d+[.)]/.test(itemMatch[2]);
    if (itemIsOrdered !== ordered) break;

    const taskMark = itemMatch[4]?.trim();
    const task = taskMark !== undefined;
    const checked = taskMark === "[x]" || taskMark === "[X]";
    const text = itemMatch[5];

    i++;

    // Collect continuation lines and nested content
    const itemLines: string[] = [text];
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine.trim() === "") {
        i++;
        continue;
      }
      const nextIndent = nextLine.match(/^(\s*)/)?.[1].length ?? 0;
      if (nextIndent <= baseIndent && /^(\s*)([-*+]|\d+[.)]) /.test(nextLine))
        break;
      if (nextIndent <= baseIndent) break;
      itemLines.push(
        nextLine.replace(new RegExp(`^\\s{${baseIndent + 2}}`), "")
      );
      i++;
    }

    // Parse item content — may contain nested lists
    const itemTokens = parseItemContent(itemLines, ordered);
    items.push({ task, checked, tokens: itemTokens });
  }

  return { items, nextIndex: i };
}

function parseItemContent(
  lines: string[],
  _ordered: boolean
): (InlineToken | BlockToken)[] {
  const result: (InlineToken | BlockToken)[] = [];
  let textLines: string[] = [];
  let j = 0;

  const flushText = () => {
    if (textLines.length > 0) {
      const inlines = tokenizeInline(textLines.join(" "));
      for (const t of inlines) result.push(t);
      textLines = [];
    }
  };

  while (j < lines.length) {
    const line = lines[j];
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)]) /);
    if (listMatch) {
      flushText();
      const nestedOrdered = /^\d+[.)]/.test(listMatch[2]);
      const nestedStart = nestedOrdered ? parseInt(listMatch[2], 10) : 1;
      const nestedIndent = listMatch[1].length;
      const parsed = parseListItems(lines, j, nestedIndent, nestedOrdered);
      j = parsed.nextIndex;
      result.push({
        type: "list",
        ordered: nestedOrdered,
        start: nestedStart,
        items: parsed.items,
      });
      continue;
    }
    textLines.push(line);
    j++;
  }

  flushText();
  return result;
}

// ---------------------------------------------------------------------------
// ADF emitter (adapted from marklassian lib/index.ts, minus marked imports)
// ---------------------------------------------------------------------------

const generateLocalId = () => globalThis.crypto.randomUUID();

function parseAdfTag(raw: string): AdfNode | AdfNode[] | null {
  const match = raw.trim().match(/^<adf>([\s\S]*?)<\/adf>$/i);
  if (!match) return null;
  const json = match[1].trim();
  if (json.length === 0) throw new Error("<adf> tag content is empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in <adf> tag: ${json}`);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item, idx) => {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        throw new Error(`ADF node must be an object (item ${idx} is not)`);
      const node = item as AdfNode;
      if (typeof node.type !== "string" || !node.type)
        throw new Error(`ADF node must have a "type" string property`);
      return node;
    });
  }
  if (typeof parsed !== "object" || parsed === null)
    throw new Error(`ADF node must be a JSON object or array`);
  const node = parsed as AdfNode;
  if (typeof node.type !== "string" || !node.type)
    throw new Error(`ADF node must have a "type" string property`);
  return node;
}

function markdownToAdf(markdown: string): AdfNode {
  const tokens = tokenizeBlock(markdown);
  return { version: 1, type: "doc", content: tokensToAdf(tokens) } as AdfNode;
}

function tokensToAdf(tokens: BlockToken[]): AdfNode[] {
  if (!tokens) return [];
  return tokens
    .map((token): AdfNode | AdfNode[] | null => {
      switch (token.type) {
        case "paragraph":
          return processParagraph(token.tokens as InlineToken[]);
        case "heading":
          return {
            type: "heading",
            attrs: { level: token.depth },
            content: inlineToAdf(token.tokens),
          };
        case "list": {
          const allTasks = token.items.every((item) => item.task);
          if (allTasks && token.items.some((item) => item.task)) {
            return {
              type: "taskList",
              attrs: { localId: generateLocalId() },
              content: token.items.map(processTaskItem),
            };
          }
          return {
            type: token.ordered ? "orderedList" : "bulletList",
            ...(token.ordered ? { attrs: { order: token.start || 1 } } : {}),
            content: token.items.map(processListItem),
          };
        }
        case "code":
          return {
            type: "codeBlock",
            attrs: { language: token.lang || "text" },
            content: [{ type: "text", text: token.text }],
          };
        case "blockquote":
          return { type: "blockquote", content: tokensToAdf(token.tokens) };
        case "hr":
          return { type: "rule" };
        case "html": {
          const adfNode = parseAdfTag(token.raw);
          if (adfNode) return adfNode;
          return null;
        }
        default:
          return null;
      }
    })
    .filter(Boolean)
    .flat() as AdfNode[];
}

function createMediaNode(token: { href: string; text: string }): AdfNode {
  return {
    type: "mediaSingle",
    attrs: { layout: "center" },
    content: [
      {
        type: "media",
        attrs: { type: "external", url: token.href, alt: token.text || "" },
      },
    ],
  };
}

function processParagraph(tokens: InlineToken[]): AdfNode[] {
  if (!tokens) return [];
  if (tokens.length === 1 && tokens[0]?.type === "image") {
    return [createMediaNode(tokens[0] as { href: string; text: string })];
  }
  const output: AdfNode[] = [];
  let cur: InlineToken[] = [];
  for (const token of tokens) {
    if (token.type === "image") {
      if (cur.length) {
        output.push({ type: "paragraph", content: inlineToAdf(cur) });
        cur = [];
      }
      output.push(createMediaNode(token as { href: string; text: string }));
    } else {
      cur.push(token);
    }
  }
  if (cur.length) output.push({ type: "paragraph", content: inlineToAdf(cur) });
  return output;
}

function processListItem(item: ListItem): AdfNode {
  const content: AdfNode[] = [];
  let cur: InlineToken[] = [];

  const flushCur = () => {
    if (cur.length) {
      content.push({ type: "paragraph", content: inlineToAdf(cur) });
      cur = [];
    }
  };

  for (const token of item.tokens || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = token as any;
    if (
      t.type === "text" ||
      t.type === "em" ||
      t.type === "strong" ||
      t.type === "del" ||
      t.type === "link" ||
      t.type === "codespan"
    ) {
      cur.push(t as InlineToken);
    } else {
      flushCur();
      if (t.type === "list") {
        const allTasks = (t.items as ListItem[]).every((item_) => item_.task);
        if (allTasks && (t.items as ListItem[]).some((item_) => item_.task)) {
          content.push({
            type: "taskList",
            attrs: { localId: generateLocalId() },
            content: (t.items as ListItem[]).map(processTaskItem),
          });
        } else {
          content.push({
            type: t.ordered ? "orderedList" : "bulletList",
            ...(t.ordered ? { attrs: { order: t.start || 1 } } : {}),
            content: (t.items as ListItem[]).map(processListItem),
          });
        }
      } else {
        const processed = tokensToAdf([t as BlockToken]);
        if (processed.length) content.push(...processed);
      }
    }
  }
  flushCur();
  return { type: "listItem", content };
}

function processTaskItem(item: ListItem): AdfNode {
  const content: AdfNode[] = [];
  let cur: InlineToken[] = [];

  const flushCur = () => {
    if (cur.length) {
      content.push(...inlineToAdf(cur));
      cur = [];
    }
  };

  for (const token of item.tokens || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = token as any;
    if (
      t.type === "text" ||
      t.type === "em" ||
      t.type === "strong" ||
      t.type === "del" ||
      t.type === "link" ||
      t.type === "codespan"
    ) {
      cur.push(t as InlineToken);
    } else {
      flushCur();
      if (t.type === "list") {
        const allTasks = (t.items as ListItem[]).every((item_) => item_.task);
        if (allTasks && (t.items as ListItem[]).some((item_) => item_.task)) {
          content.push({
            type: "taskList",
            attrs: { localId: generateLocalId() },
            content: (t.items as ListItem[]).map(processTaskItem),
          });
        } else {
          content.push({
            type: t.ordered ? "orderedList" : "bulletList",
            ...(t.ordered ? { attrs: { order: t.start || 1 } } : {}),
            content: (t.items as ListItem[]).map(processListItem),
          });
        }
      } else {
        const processed = tokensToAdf([t as BlockToken]);
        if (processed.length) content.push(...processed);
      }
    }
  }
  flushCur();
  return {
    type: "taskItem",
    attrs: {
      localId: generateLocalId(),
      state: item.checked ? "DONE" : "TODO",
    },
    content,
  };
}

function getSafeText(token: InlineToken): string {
  if ("tokens" in token && token.tokens?.length === 1 && token.tokens[0]) {
    return getSafeText(token.tokens[0]);
  }
  if ("text" in token && typeof token.text === "string") {
    return token.text
      .replace(/\n$/, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ");
  }
  return "";
}

function getMarks(
  token: InlineToken,
  marks: Record<string, AdfMark> = {}
): AdfMark[] {
  if (token.type === "em" && !marks.em) marks.em = { type: "em" };
  if (token.type === "strong" && !marks.strong)
    marks.strong = { type: "strong" };
  if (token.type === "del" && !marks.strike) marks.strike = { type: "strike" };
  if (token.type === "link")
    marks.link = {
      type: "link",
      attrs: { href: (token as { href: string }).href },
    };
  if (token.type === "codespan" && !marks.code) marks.code = { type: "code" };
  const nested = "tokens" in token ? token.tokens : undefined;
  if (nested && nested.length === 1 && nested[0]) {
    return getMarks(nested[0], marks);
  }
  const resolved = Object.values(marks);
  if (marks.code)
    return resolved.filter((m) => m.type === "link" || m.type === "code");
  return resolved;
}

function inlineToAdf(tokens: InlineToken[]): AdfNode[] {
  if (!tokens) return [];
  return tokens
    .flatMap((token): AdfNode[] => {
      switch (token.type) {
        case "text":
          if (token.tokens) return inlineToAdf(token.tokens);
          return [{ type: "text", text: getSafeText(token) }];
        case "em":
          return (token.tokens ?? []).map((t) => ({
            type: "text",
            text: getSafeText(t),
            marks: getMarks(t, { em: { type: "em" } }),
          }));
        case "strong":
          return (token.tokens ?? []).map((t) => ({
            type: "text",
            text: getSafeText(t),
            marks: getMarks(t, { strong: { type: "strong" } }),
          }));
        case "del":
          return (token.tokens ?? []).map((t) => ({
            type: "text",
            text: getSafeText(t),
            marks: getMarks(t, { strike: { type: "strike" } }),
          }));
        case "link":
          return [
            { type: "text", text: getSafeText(token), marks: getMarks(token) },
          ];
        case "codespan":
          return [
            { type: "text", text: getSafeText(token), marks: getMarks(token) },
          ];
        case "escape":
          return [{ type: "text", text: token.text }];
        case "br":
          return [{ type: "hardBreak" }];
        default:
          return [];
      }
    })
    .filter((node) => !(node.type === "text" && !node.text));
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  let markdown: string;
  const arg = Bun.argv[2];

  if (arg) {
    const file = Bun.file(arg);
    markdown = await file.text();
  } else {
    const chunks: Uint8Array[] = [];
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(chunk as Uint8Array);
    }
    const total = chunks.reduce((a, b) => a + b.length, 0);
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.length;
    }
    markdown = new TextDecoder().decode(buf);
  }

  const adf = markdownToAdf(markdown);
  Bun.stdout.write(JSON.stringify(adf));
}

main().catch((err) => {
  console.error(err);
  Bun.exit(1);
});
