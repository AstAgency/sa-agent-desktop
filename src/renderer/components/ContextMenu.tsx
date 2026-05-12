import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContextMenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

export function ContextMenu(props: {
  anchorRef: React.RefObject<HTMLElement | null>;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = props.anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 4;
    const menuWidth = 180;
    const margin = 8;
    let left = rect.right - menuWidth;
    if (left < margin) left = margin;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    setPosition({ top, left });
  }, [props.anchorRef]);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const menu = menuRef.current;
      const anchor = props.anchorRef.current;
      const target = event.target as Node;
      if (menu?.contains(target)) return;
      if (anchor?.contains(target)) return;
      props.onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [props]);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ top: position.top, left: position.left }}
    >
      {props.items.map((item) => (
        <button
          key={item.key}
          role="menuitem"
          className={`context-menu-item${item.destructive ? " destructive" : ""}`}
          onClick={() => {
            item.onSelect();
            props.onClose();
          }}
        >
          {item.icon ? <span className="icon">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
