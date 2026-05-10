import { useCallback, useMemo, useRef, useState } from "react";
import { translate } from "../../lib/i18n";
import { IconSearch } from "../workspace/TablerIcons";

export type SearchScope = {
  projectNames: string[];
  sessionTitles: string[];
  messageSnippets: string[];
};

export type SearchResult = {
  kind: "project" | "session" | "message";
  label: string;
  projectId?: string | null;
  sessionId?: string | null;
};

export function SearchInput(props: {
  language: "ru" | "en";
  collapsed: boolean;
  scope: SearchScope;
  onSelectResult: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const results: SearchResult[] = useMemo(() => computeResults(query, props.scope), [query, props.scope]);
  const showDropdown = focused && query.length > 0;

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setQuery("");
      setFocused(false);
      props.onSelectResult(result);
    },
    [props.onSelectResult],
  );

  if (props.collapsed) {
    return null;
  }

  return (
    <div
      style={{
        position: "relative",
        padding: "8px 12px",
        borderBottom: "1px solid var(--theme-color-border-secondary)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          height: "36px",
          borderRadius: "var(--theme-radius-medium)",
          background: "var(--theme-color-panel-muted)",
          border: "1px solid var(--theme-color-border-secondary)",
        }}
      >
        <IconSearch size={16} style={{ flexShrink: 0, color: "var(--theme-color-text-muted)" }} />
        <input
          ref={inputRef}
          type="text"
          className="sa-input"
          aria-label={translate(props.language, "sidebar.search.placeholder")}
          placeholder={translate(props.language, "sidebar.search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay to allow click on dropdown items
            setTimeout(() => setFocused(false), 150);
          }}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            color: "var(--theme-color-text-primary)",
            fontSize: "var(--theme-font-size-caption)",
            outline: "none",
            minWidth: 0,
            fontFamily: "inherit",
          }}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="sa-sidebar-btn"
            aria-label={translate(props.language, "sidebar.search.clear")}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "18px",
              height: "18px",
              padding: 0,
              border: "none",
              borderRadius: "50%",
              background: "var(--theme-color-border-secondary)",
              color: "var(--theme-color-text-muted)",
              fontSize: "11px",
              cursor: "pointer",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: "calc(100% - 4px)",
            maxHeight: "260px",
            overflowY: "auto",
            padding: "4px",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--theme-color-panel-start) 92%, rgba(8, 10, 20, 0.92)), color-mix(in srgb, var(--theme-color-panel-end) 94%, rgba(4, 6, 14, 0.94)))",
            border: "1px solid var(--theme-color-border-primary)",
            borderRadius: "var(--theme-radius-large)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            zIndex: 90,
          }}
        >
          {results.length === 0 ? (
            <div
              style={{
                padding: "12px",
                textAlign: "center",
                fontSize: "var(--theme-font-size-caption)",
                color: "var(--theme-color-text-muted)",
              }}
            >
              {translate(props.language, "sidebar.search.empty")}
            </div>
          ) : (
            results.slice(0, 8).map((result, index) => (
              <button
                key={`${result.kind}-${result.label}-${index}`}
                type="button"
                role="option"
                className="sa-sidebar-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(result);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  borderRadius: "var(--theme-radius-medium)",
                  background: "transparent",
                  color: "var(--theme-color-text-primary)",
                  fontSize: "var(--theme-font-size-caption)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <span style={badgeStyle(result.kind)}>
                  {result.kind === "project" ? "P" : result.kind === "session" ? "S" : "M"}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {truncate(result.label, 60)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function computeResults(query: string, scope: SearchScope): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (q.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const name of scope.projectNames) {
    if (name.toLowerCase().includes(q)) {
      results.push({ kind: "project", label: name });
    }
  }

  for (const title of scope.sessionTitles) {
    if (title.toLowerCase().includes(q)) {
      results.push({ kind: "session", label: title });
    }
  }

  for (const snippet of scope.messageSnippets) {
    if (snippet.toLowerCase().includes(q)) {
      results.push({ kind: "message", label: snippet });
    }
  }

  return results;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen - 3) + "...";
}

function badgeStyle(kind: "project" | "session" | "message"): React.CSSProperties {
  const colors: Record<string, string> = {
    project: "var(--theme-color-accent-primary)",
    session: "var(--theme-color-accent-primary-bright)",
    message: "var(--theme-color-text-muted)",
  };
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    borderRadius: "4px",
    fontSize: "10px",
    fontWeight: 700,
    flexShrink: 0,
    background: `${colors[kind]}22`,
    color: colors[kind],
  };
}
