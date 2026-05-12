import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const components = {
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a {...props} target="_blank" rel="noreferrer noopener" />
  ),
  code: (props: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => {
    const { inline, className, children, ...rest } = props;
    if (inline) {
      return (
        <code className={`md-inline-code ${className ?? ""}`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};
