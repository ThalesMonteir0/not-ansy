import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral max-w-none prose-img:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "*Nada escrito ainda.*"}</ReactMarkdown>
    </div>
  );
}
