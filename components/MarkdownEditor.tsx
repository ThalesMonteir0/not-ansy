"use client";

import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Recebe um arquivo de imagem colado/arrastado e devolve a URL pública. */
  onImage?: (file: File) => Promise<string | null>;
  dark?: boolean;
};

export default function MarkdownEditor({ value, onChange, onImage, dark }: Props) {
  const extensions = useMemo(() => {
    const exts = [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { fontSize: "16px", backgroundColor: "transparent" },
        ".cm-content": { fontFamily: "var(--font-sans)", padding: "12px 0", caretColor: "var(--accent)" },
        ".cm-gutters": { display: "none" },
        "&.cm-focused": { outline: "none" },
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-line": { lineHeight: "1.7" },
      }),
    ];
    if (onImage) {
      const insertImages = (view: EditorView, files: File[]) => {
        files.forEach(async (file) => {
          const placeholder = `![enviando ${file.name}…]()`;
          const pos = view.state.selection.main.head;
          view.dispatch({ changes: { from: pos, insert: placeholder } });
          const url = await onImage(file);
          const doc = view.state.doc.toString();
          const at = doc.indexOf(placeholder);
          if (at >= 0) {
            view.dispatch({
              changes: {
                from: at,
                to: at + placeholder.length,
                insert: url ? `![${file.name}](${url})` : "",
              },
            });
          }
        });
      };
      const imagesFrom = (list?: FileList | null) =>
        Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
      exts.push(
        EditorView.domEventHandlers({
          paste(event, view) {
            const files = imagesFrom(event.clipboardData?.files);
            if (!files.length) return false;
            event.preventDefault();
            insertImages(view, files);
            return true;
          },
          drop(event, view) {
            const files = imagesFrom(event.dataTransfer?.files);
            if (!files.length) return false;
            event.preventDefault();
            insertImages(view, files);
            return true;
          },
        }),
      );
    }
    return exts;
  }, [onImage]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? "dark" : "light"}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
      placeholder="Comece a escrever… (Markdown funciona: # título, **negrito**, - [ ] tarefa)"
      className="min-h-[60vh]"
    />
  );
}
