import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { translate } from "../../lib/i18n";
import type { AgentCatalogItem } from "../../lib/types";
import { IconChevronDown, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconSparkles } from "../workspace/TablerIcons";

const HEADER_HEIGHT = 56;

export function SidebarHeader(props: {
  language: "ru" | "en";
  workspaceName: string;
  agents: AgentCatalogItem[];
  selectedAgentKey: string | null;
  collapsed: boolean;
  onSelectAgent: (agentKey: string | null) => void;
  onToggleCollapse: () => void;
}) {
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);

  const selectedAgent = props.agents.find((a) => a.agent_key === props.selectedAgentKey) ?? null;
  const agentLabel = selectedAgent?.display_name ?? selectedAgent?.agent_key ?? props.selectedAgentKey ?? "sa-agent";

  const calcDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, []);

  const toggleDropdown = useCallback(() => {
    setAgentDropdownOpen((prev) => {
      if (!prev) calcDropdownPosition();
      return !prev;
    });
  }, [calcDropdownPosition]);

  const closeDropdown = useCallback(() => setAgentDropdownOpen(false), []);

  // Close dropdown on Escape
  useEffect(() => {
    if (!agentDropdownOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeDropdown();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [agentDropdownOpen, closeDropdown]);

  // Close on outside click
  useEffect(() => {
    if (!agentDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    // Delay listener to avoid closing on the same click that opened it
    const id = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", handleClick);
    };
  }, [agentDropdownOpen, closeDropdown]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: props.collapsed ? "center" : "flex-start",
        gap: props.collapsed ? "0" : "8px",
        padding: props.collapsed ? "0" : "0 8px 0 12px",
        height: HEADER_HEIGHT,
        borderBottom: "1px solid var(--theme-color-border-secondary)",
        flexShrink: 0,
        overflow: "hidden",
      }}
      role="banner"
    >
      {!props.collapsed ? (
        <>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <span
              style={{
                fontSize: "var(--theme-font-size-caption)",
                fontWeight: 600,
                color: "var(--theme-color-text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "block",
              }}
            >
              {props.workspaceName}
            </span>
          </div>

          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              ref={buttonRef}
              type="button"
              className="sa-sidebar-btn"
              aria-label={translate(props.language, "sidebar.agent.select")}
              aria-expanded={agentDropdownOpen}
              aria-haspopup="listbox"
              onClick={toggleDropdown}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "30px",
                padding: "0 10px",
                border: "1px solid var(--theme-color-border-secondary)",
                borderRadius: "var(--theme-radius-medium)",
                background: "var(--theme-color-panel-muted)",
                color: "var(--theme-color-text-secondary)",
                fontSize: "var(--theme-font-size-caption)",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <IconSparkles size={14} style={{ flexShrink: 0, color: "var(--theme-color-accent-primary)" }} />
              <span style={{ maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {agentLabel}
              </span>
              <IconChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
            </button>
          </div>
        </>
      ) : null}

      <button
        type="button"
        className="sa-sidebar-btn"
        aria-label={
          props.collapsed
            ? translate(props.language, "sidebar.expand")
            : translate(props.language, "sidebar.collapse")
        }
        onClick={props.onToggleCollapse}
        title={
          props.collapsed
            ? translate(props.language, "sidebar.expand")
            : translate(props.language, "sidebar.collapse")
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "30px",
          height: "30px",
          padding: 0,
          border: "none",
          borderRadius: "var(--theme-radius-medium)",
          background: "transparent",
          color: "var(--theme-color-text-muted)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {props.collapsed ? (
          <IconLayoutSidebarLeftExpand size={18} />
        ) : (
          <IconLayoutSidebarLeftCollapse size={18} />
        )}
      </button>

      {/* Dropdown rendered via portal to avoid clipping */}
      {agentDropdownOpen &&
        dropdownPosition &&
        createPortal(
          <div
            role="listbox"
            aria-label={translate(props.language, "sidebar.agent.select")}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: dropdownPosition.top,
              right: dropdownPosition.right,
              minWidth: "180px",
              padding: "4px",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--theme-color-panel-start) 92%, rgba(8, 10, 20, 0.92)), color-mix(in srgb, var(--theme-color-panel-end) 94%, rgba(4, 6, 14, 0.94)))",
              border: "1px solid var(--theme-color-border-primary)",
              borderRadius: "var(--theme-radius-large)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              zIndex: 9999,
            }}
          >
            {props.agents.map((agent, i) => (
              <button
                key={agent.agent_key}
                type="button"
                role="option"
                aria-selected={agent.agent_key === props.selectedAgentKey}
                className="sa-dropdown-item"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onSelectAgent(agent.agent_key);
                    closeDropdown();
                    buttonRef.current?.focus();
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = (e.currentTarget.nextElementSibling ?? e.currentTarget.parentElement?.firstElementChild) as HTMLElement | undefined;
                    next?.focus();
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prev = (e.currentTarget.previousElementSibling ?? e.currentTarget.parentElement?.lastElementChild) as HTMLElement | undefined;
                    prev?.focus();
                  }
                  if (e.key === "Escape") {
                    closeDropdown();
                    buttonRef.current?.focus();
                  }
                }}
                onClick={() => {
                  props.onSelectAgent(agent.agent_key);
                  closeDropdown();
                  buttonRef.current?.focus();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "var(--theme-radius-medium)",
                  background: agent.agent_key === props.selectedAgentKey ? "var(--theme-color-status-info)" : "transparent",
                  color: agent.agent_key === props.selectedAgentKey ? "var(--theme-color-accent-primary-bright)" : "var(--theme-color-text-primary)",
                  fontSize: "var(--theme-font-size-caption)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                {agent.display_name ?? agent.agent_key}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
