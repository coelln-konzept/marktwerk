/**
 * Whitelist sanitizer for mail HTML (incoming mail, pasted content, templates). Regex-based so it runs the
 * same on the server and in the browser (no hydration differences). Keeps only simple formatting, links
 * (http, https, mailto) and variable chips; drops every other tag and attribute, scripts and styles.
 */
const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "span",
]);

export function sanitizeMailHtml(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title|xml|o:p)[\s\S]*?<\/\1>/gi, "");
  return cleaned.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g,
    (tag, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED.has(name)) return "";
      if (tag.startsWith("</")) return `</${name}>`;
      if (name === "a") {
        const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrs);
        const url = (href?.[1] ?? href?.[2] ?? "").trim();
        return /^(https?:|mailto:)/i.test(url)
          ? `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">`
          : "<a>";
      }
      if (name === "span") {
        const key = /data-variable\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
        return key
          ? `<span data-variable="${key.replace(/[^\wäöüÄÖÜß-]/g, "")}" class="mail-var">`
          : "<span>";
      }
      return `<${name}>`;
    },
  );
}
