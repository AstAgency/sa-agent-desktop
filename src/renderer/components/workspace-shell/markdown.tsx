import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageBody(props: { role: string; content: string }) {
  if (props.role !== "assistant") {
    return <div style={plainMessageTextStyle}>{props.content}</div>;
  }

  return (
    <div style={markdownBodyStyle}>
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {props.content}
      </ReactMarkdown>
    </div>
  );
}

const baseTextStyle = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.55,
  color: "var(--theme-color-text-primary)",
};

const plainMessageTextStyle = {
  ...baseTextStyle,
  whiteSpace: "pre-wrap" as const,
};

const markdownBodyStyle = {
  ...baseTextStyle,
  whiteSpace: "normal" as const,
  display: "grid",
  gap: "var(--theme-spacing-sm)",
};

const markdownComponents = {
  p: (props: ComponentPropsWithoutRef<"p">) => <p {...props} style={{ margin: 0 }} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => <ul {...props} style={markdownListStyle} />,
  ol: (props: ComponentPropsWithoutRef<"ol">) => <ol {...props} style={markdownListStyle} />,
  li: (props: ComponentPropsWithoutRef<"li">) => <li {...props} style={{ margin: 0 }} />,
  h1: (props: ComponentPropsWithoutRef<"h1">) => <h1 {...props} style={markdownHeadingOneStyle} />,
  h2: (props: ComponentPropsWithoutRef<"h2">) => <h2 {...props} style={markdownHeadingTwoStyle} />,
  h3: (props: ComponentPropsWithoutRef<"h3">) => <h3 {...props} style={markdownHeadingThreeStyle} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong {...props} style={{ fontWeight: 700 }} />,
  a: (props: ComponentPropsWithoutRef<"a">) => <a {...props} style={markdownLinkStyle} />,
  code: (props: ComponentPropsWithoutRef<"code">) => <code {...props} style={markdownCodeStyle} />,
  pre: (props: ComponentPropsWithoutRef<"pre">) => <pre {...props} style={markdownPreStyle} />,
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => <blockquote {...props} style={markdownQuoteStyle} />,
};

const markdownListStyle = {
  margin: 0,
  paddingLeft: "20px",
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const markdownHeadingOneStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-section)",
  lineHeight: 1.2,
};

const markdownHeadingTwoStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body-large)",
  lineHeight: 1.25,
};

const markdownHeadingThreeStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.3,
  fontWeight: 700,
};

const markdownLinkStyle = {
  color: "var(--theme-color-accent-primary)",
  textDecoration: "underline",
};

const markdownCodeStyle = {
  fontFamily: "var(--theme-font-mono)",
  fontSize: "0.92em",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "2px 6px",
};

const markdownPreStyle = {
  margin: 0,
  overflowX: "auto" as const,
  padding: "var(--theme-spacing-md)",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  fontFamily: "var(--theme-font-mono)",
  fontSize: "0.92em",
  lineHeight: 1.5,
};

const markdownQuoteStyle = {
  margin: 0,
  paddingLeft: "var(--theme-spacing-md)",
  borderLeft: "2px solid var(--theme-color-border-secondary)",
  color: "var(--theme-color-text-secondary)",
};
