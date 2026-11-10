// Local extension: MkDocs Material (pymdownx) syntax support
//
// MPE has no markdown-it plugin entry point, only two string hooks around parsing, running in a QuickJS sandbox.
// Before parsing, ??? and === are rewritten into the built-in !!! container so its plugin parses the indented body.
// After parsing, those containers become collapsible blocks and tabs.
// The pre-parse rewrite must stay strictly line-for-line: scroll sync and checkbox write-back depend on line numbers.

const COLLAPSED = "\uE100";
const OPEN = "\uE101";
const TAB = "\uE102";
const TAB_SELECTED = "\uE103";
const NO_TITLE = "\uE104";

const data = require("./material-data.js");

const keyLabels = new Map(Object.entries(data.keys));
const keyAliases = new Map(Object.entries(data.aliases));
const icons = new Map(Object.entries(data.icons));

const fenceLine = /^\s*(`{3,}(?=[^`]*$)|~{3,})(.*)$/;
const headingLine = /^\s{0,3}#{1,6}\s/;
const admonitionLine = /^(\s*)!!!\s+([\w-]+)(?:\s+[\w-]+)*\s+"(.*)"\s*$/;
// pymdownx treats the "-" in ???- as a class, so the block ends up collapsed, on the site as well
const detailsLine =
  /^(\s*)\?\?\?([+-]?)\s*(?:([\w-]+)(?:\s+[\w-]+)*)?\s*(?:"(.*)")?\s*$/;
const tabLine = /^(\s*)===(\+?)\s+"(.*)"\s*$/;

function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}

function rewriteBlockLine(line) {
  let match = line.match(admonitionLine);
  if (match) {
    const [, indent, type, title] = match;
    return `${indent}!!! ${type} ${title || NO_TITLE}`;
  }

  match = line.match(detailsLine);
  if (match) {
    const [, indent, mark, type, title] = match;
    if (!type && title === undefined) {
      return line;
    }

    const kind = type || "note";
    const state = mark === "+" ? OPEN : COLLAPSED;
    return `${indent}!!! ${kind} ${state}${title || capitalize(kind)}`;
  }

  match = line.match(tabLine);
  if (match) {
    const [, indent, mark, title] = match;
    return `${indent}!!! note ${mark ? TAB_SELECTED : TAB}${title}`;
  }

  return line;
}

function preprocess(markdown) {
  let fence = null;

  return markdown
    .split("\n")
    .map((line) => {
      const match = line.match(fenceLine);

      if (fence) {
        const closes =
          match &&
          match[1][0] === fence[0] &&
          match[1].length >= fence.length &&
          !match[2].trim();
        if (closes) {
          fence = null;
        }
        return line;
      }

      if (match) {
        fence = match[1];
        return line;
      }

      // The sidebar TOC takes heading text directly and skips the post-parse hook, so strip the prefix here
      if (headingLine.test(line)) {
        return line.replace(/`#!\w+ /g, "`");
      }

      return rewriteBlockLine(line);
    })
    .join("\n");
}

function applyEdits(html, edits) {
  edits.sort((a, b) => a.start - b.start || a.end - b.end);

  const parts = [];
  let cursor = 0;
  for (const edit of edits) {
    parts.push(html.slice(cursor, edit.start), edit.text);
    cursor = edit.end;
  }

  parts.push(html.slice(cursor));
  return parts.join("");
}

function readContainer(html, tag, start) {
  const node = { start, openEnd: start + tag.length, tag, marker: null };
  if (!/\bclass="admonition\b/.test(tag)) {
    return node;
  }

  const title =
    /\s*<p class="admonition-title"([^>]*)>([\uE100-\uE104])([\s\S]*?)<\/p>/y;
  title.lastIndex = node.openEnd;

  const found = title.exec(html);
  if (found) {
    node.titleEnd = title.lastIndex;
    node.titleStart = node.titleEnd - found[0].length;
    node.titleAttributes = found[1];
    node.marker = found[2];
    node.titleHtml = found[3];
  }

  return node;
}

function renderTabs(sets, edits) {
  sets.forEach((set, setIndex) => {
    const name = `mpe-tabs-${setIndex + 1}`;
    const marked = set.tabs.findIndex(({ node }) => node.marker === TAB_SELECTED);
    const selected = Math.max(marked, 0);

    set.tabs.forEach(({ node }, index) => {
      const id = `${name}-${index + 1}`;
      const checked = index === selected ? " checked" : "";
      const line = (node.tag.match(/\sdata-source-line="\d+"/) || [""])[0];
      const wrapper = index === 0 ? '<div class="mpe-tabs">' : "";

      edits.push({
        start: node.start,
        end: node.openEnd,
        text:
          `${wrapper}<input type="radio" name="${name}" id="${id}"${checked}>` +
          `<label for="${id}">${node.titleHtml}</label>` +
          `<div class="mpe-tab-panel"${line}>`,
      });
      edits.push({ start: node.titleStart, end: node.titleEnd, text: "" });
    });

    const { closeEnd } = set.tabs[set.tabs.length - 1];
    edits.push({ start: closeEnd, end: closeEnd, text: "</div>" });
  });
}

function rewriteContainers(html) {
  const tags = /<(pre|script|style)\b[\s\S]*?<\/\1>|<div\b[^>]*>|<\/div>/gi;
  const stack = [];
  const edits = [];
  const sets = [];
  let lastTab = null;
  let match;

  while ((match = tags.exec(html))) {
    if (match[1]) {
      continue;
    }

    if (match[0][1] !== "/") {
      stack.push(readContainer(html, match[0], match.index));
      continue;
    }

    const node = stack.pop();
    if (!node || !node.marker) {
      continue;
    }

    const closeStart = match.index;
    const closeEnd = closeStart + match[0].length;

    if (node.marker === NO_TITLE) {
      edits.push({ start: node.titleStart, end: node.titleEnd, text: "" });
    } else if (node.marker === OPEN || node.marker === COLLAPSED) {
      const open = node.marker === OPEN ? " open>" : ">";
      edits.push({
        start: node.start,
        end: node.openEnd,
        text: node.tag.replace(/^<div/i, "<details").replace(/>$/, open),
      });
      edits.push({
        start: node.titleStart,
        end: node.titleEnd,
        text: `<summary class="admonition-title"${node.titleAttributes}>${node.titleHtml}</summary>`,
      });
      edits.push({ start: closeStart, end: closeEnd, text: "</details>" });
    } else {
      const adjacent =
        lastTab && !html.slice(lastTab.closeEnd, node.start).trim();
      const set = adjacent ? lastTab.set : { tabs: [] };
      if (!adjacent) {
        sets.push(set);
      }

      set.tabs.push({ node, closeEnd });
      lastTab = { closeEnd, set };
    }
  }

  renderTabs(sets, edits);
  return applyEdits(html, edits);
}

const pythonKeywords = new Set(
  (
    "and as assert async await break class continue def del elif else except " +
    "finally for from global if import in is lambda nonlocal not or pass " +
    "raise return try while with yield"
  ).split(" "),
);
const pythonConstants = new Set(["True", "False", "None"]);
const pythonToken =
  /&#?\w+;|[rbfu]{0,2}(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b\d[\d_]*(?:\.\d+)?\b|[A-Za-z_]\w*/gi;

function token(kind, text) {
  return `<span class="token ${kind}">${text}</span>`;
}

// Prism is not available in the sandbox; token class names match code blocks, so colors follow the Prism theme
function highlightPython(code) {
  return code.replace(pythonToken, (text, offset) => {
    if (text[0] === "&") {
      return text;
    }
    if (/["']$/.test(text)) {
      return token("string", text);
    }
    if (/^\d/.test(text)) {
      return token("number", text);
    }
    if (pythonConstants.has(text)) {
      return token("boolean", text);
    }
    if (pythonKeywords.has(text)) {
      return token("keyword", text);
    }
    if (/^\s*\(/.test(code.slice(offset + text.length))) {
      return token("function", text);
    }
    return text;
  });
}

// No language-* class: Prism themes would add a background and rounded corners, unlike other inline code
function rewriteInlineCode(html) {
  const pattern = /<pre\b[\s\S]*?<\/pre>|<code>#!([\w+#.-]+) ([\s\S]*?)<\/code>/gi;

  return html.replace(pattern, (whole, language, code) => {
    if (language === undefined) {
      return whole;
    }

    const python = /^(?:python3?|py)$/i.test(language);
    return `<code>${python ? highlightPython(code) : code}</code>`;
  });
}

function addCodeTitles(html) {
  const pattern =
    /<pre data-role="codeBlock" data-info="[^"]*?\btitle=(?:&quot;|&apos;|&#39;|')([^"]*?)(?:&quot;|&apos;|&#39;|')/g;

  return html.replace(
    pattern,
    (whole, title) => `<div class="mpe-code-title">${title}</div>${whole}`,
  );
}

function renderKeys(names) {
  const labels = names.split("+").map((name) => {
    return keyLabels.get(keyAliases.get(name) || name);
  });

  // Like pymdownx, keep the original text if any key name is unknown
  if (labels.includes(undefined)) {
    return null;
  }

  const keys = labels.map((label) => `<kbd>${label}</kbd>`).join("<span>+</span>");
  return `<span class="keys">${keys}</span>`;
}

// Text nodes only: skip tags, code, and the annotation element where KaTeX stores the formula source
function rewriteInlineText(html) {
  const pattern =
    /<(pre|code|script|style|annotation|svg)\b[\s\S]*?<\/\1>|<[^>]+>|\+\+([\w-]+(?:\+[\w-]+)*?)\+\+|:((?:material|fontawesome|octicons|simple)-[\w-]+):/gi;

  return html.replace(pattern, (whole, skipped, keys, icon) => {
    if (keys) {
      return renderKeys(keys) || whole;
    }

    if (icon && icons.has(icon)) {
      return `<span class="twemoji">${icons.get(icon)}</span>`;
    }

    return whole;
  });
}

// If a hook throws or times out, MPE silently falls back to the default hooks, losing heading numbers and table enhancements too
function guarded(step, input) {
  try {
    return step(input);
  } catch {
    return input;
  }
}

module.exports = {
  preprocess: (markdown) => guarded(preprocess, markdown),
  postprocess: (html) =>
    [rewriteContainers, rewriteInlineCode, rewriteInlineText, addCodeTitles].reduce(
      (output, step) => guarded(step, output),
      html,
    ),
};
