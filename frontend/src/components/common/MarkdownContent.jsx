import { Children, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function getText(node) {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string") return child;
    if (child && typeof child === "object" && "props" in child) {
      return getText(child.props.children);
    }
    return "";
  }).join("");
}

function CodeBlock({ children }) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const code = getText(children);
  const codeElement = Children.toArray(children).find((child) => child && typeof child === "object");
  const language = codeElement?.props?.className?.match(/language-([\w+#.-]+)/)?.[1];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span>{language || "Código"}</span>
        <button type="button" onClick={copyCode} aria-label="Copiar código">
          {copyStatus === "copied" ? <Check size={13} /> : <Copy size={13} />}
          {copyStatus === "copied" ? "Copiado" : copyStatus === "failed" ? "Error al copiar" : "Copiar"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export default function MarkdownContent({ content }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const external = /^https?:\/\//i.test(href || "");
            return (
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                {children}
              </a>
            );
          },
          input: ({ checked, type }) => type === "checkbox"
            ? <input type="checkbox" checked={Boolean(checked)} readOnly disabled />
            : null,
          pre: CodeBlock,
          table: ({ children }) => (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
