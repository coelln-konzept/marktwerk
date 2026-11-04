"use client";

import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Braces,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VARIABLE_GROUPS } from "./context";
import { sanitizeMailHtml } from "./sanitize";
import { VariableNode } from "./variable-node";

/**
 * Small rich-text editor for mails, templates and signatures (Tiptap). Only simple formatting: bold,
 * italic, underline, lists, links, variable chips. Pasted content is reduced to that.
 */
export function RichEditor({
  initialHtml,
  onChange,
  onReady,
  missing = [],
  label,
  extraTools,
  minHeight = "10rem",
  onModEnter,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  onReady?: (editor: Editor) => void;
  /** Variable keys without a value: shown red. */
  missing?: string[];
  label: string;
  extraTools?: React.ReactNode;
  minHeight?: string;
  onModEnter?: () => void;
}) {
  const t = useTranslations("postfach.editor");
  const scope = useId().replace(/:/g, "");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      VariableNode,
    ],
    content: initialHtml,
    editorProps: {
      attributes: { "aria-label": label, class: "mail-editor-content" },
      transformPastedHTML: sanitizeMailHtml,
      handleKeyDown: (_view, event) => {
        if (onModEnter && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          onModEnter();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  const tool = (
    labelKey: "bold" | "italic" | "underline" | "bullets" | "numbers" | "link" | "clear",
    Icon: typeof Bold,
    run: (e: Editor) => void,
    active?: (e: Editor) => boolean,
  ) => (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={t(labelKey)}
      title={t(labelKey)}
      aria-pressed={editor && active ? active(editor) : undefined}
      className={cn(editor && active?.(editor) && "bg-selected")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => editor && run(editor)}
    >
      <Icon />
    </Button>
  );

  return (
    <div className={cn("mail-editor rounded-lg border bg-card", `mail-editor-${scope}`)}>
      {missing.length > 0 && (
        <style>
          {missing
            .map(
              (k) =>
                `.mail-editor-${scope} [data-variable="${k.replace(/"/g, "")}"]{background:var(--status-critical-bg);color:var(--status-critical);border-color:var(--status-critical-dot)}`,
            )
            .join("")}
        </style>
      )}
      <div
        className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1"
        role="toolbar"
        aria-label={t("toolbar")}
      >
        {tool(
          "bold",
          Bold,
          (e) => e.chain().focus().toggleBold().run(),
          (e) => e.isActive("bold"),
        )}
        {tool(
          "italic",
          Italic,
          (e) => e.chain().focus().toggleItalic().run(),
          (e) => e.isActive("italic"),
        )}
        {tool(
          "underline",
          Underline,
          (e) => e.chain().focus().toggleUnderline().run(),
          (e) => e.isActive("underline"),
        )}
        {tool(
          "bullets",
          List,
          (e) => e.chain().focus().toggleBulletList().run(),
          (e) => e.isActive("bulletList"),
        )}
        {tool(
          "numbers",
          ListOrdered,
          (e) => e.chain().focus().toggleOrderedList().run(),
          (e) => e.isActive("orderedList"),
        )}
        {tool(
          "link",
          Link2,
          (e) => {
            const prev = e.getAttributes("link").href as string | undefined;
            const url = window.prompt(t("linkPrompt"), prev ?? "https://");
            if (url === null) return;
            if (url === "") e.chain().focus().unsetLink().run();
            else e.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          },
          (e) => e.isActive("link"),
        )}
        {tool("clear", RemoveFormatting, (e) =>
          e.chain().focus().unsetAllMarks().clearNodes().run(),
        )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <label className="flex items-center gap-1 text-small">
          <Braces className="size-4 text-muted-foreground" aria-hidden />
          <select
            aria-label={t("insertVariable")}
            value=""
            onChange={(ev) => {
              const key = ev.target.value;
              if (!key || !editor) return;
              editor
                .chain()
                .focus()
                .insertContent({ type: "variable", attrs: { key } })
                .insertContent(" ")
                .run();
            }}
            className="h-7 rounded-md bg-transparent px-1 text-small hover:bg-hover"
          >
            <option value="">{t("variable")}</option>
            {Object.entries(VARIABLE_GROUPS).map(([group, keys]) => (
              <optgroup key={group} label={t(`groups.${group as keyof typeof VARIABLE_GROUPS}`)}>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {extraTools}
      </div>
      <EditorContent editor={editor} className="px-3 py-2" style={{ minHeight }} />
    </div>
  );
}
