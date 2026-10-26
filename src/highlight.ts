import hljs from "highlight.js/lib/core";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Segment, splitHighlighted } from "./diffModel";

// Only the team's languages are bundled, to keep the app small.
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

/** Larger files are shown as plain text: highlighting them would stall the UI. */
const MAX_HIGHLIGHT_CHARS = 400_000;

/** Lines of `content` without line endings. */
export function toLines(content: string): string[] {
  const lines = content.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  // A trailing newline does not start another line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Highlighted segments per line, or plain segments when the language is unknown. */
export function highlightLines(content: string, language: string | null): Segment[][] {
  const lines = toLines(content);
  if (!language || content.length > MAX_HIGHLIGHT_CHARS) return lines.map((text) => (text ? [{ text, cls: "" }] : []));
  try {
    const html = hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value;
    return splitHighlighted(html);
  } catch {
    return lines.map((text) => (text ? [{ text, cls: "" }] : []));
  }
}
