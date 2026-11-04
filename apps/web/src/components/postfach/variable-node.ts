import { mergeAttributes, Node } from "@tiptap/react";

/**
 * Inline, non-editable variable chip `[Vorname]`. Stored as `<span data-variable="Vorname">[Vorname]</span>`;
 * `fillVariables` (packages/core/src/mail) replaces it when sending. Missing values are coloured by a
 * generated CSS rule in the composer (no node view needed).
 */
export const VariableNode = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-variable") ?? "",
        renderHTML: (attrs) => ({ "data-variable": attrs.key }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "mail-var" }), `[${node.attrs.key}]`];
  },
  renderText({ node }) {
    return `[${node.attrs.key}]`;
  },
});
