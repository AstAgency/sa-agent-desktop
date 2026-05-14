/**
 * Inline SVG icons matching the @tabler/icons visual style
 * (24x24 viewBox, 2px stroke, round joins, no fill).
 */

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconDotsVertical() {
  return (
    <svg {...baseProps}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

export function IconPencil() {
  return (
    <svg {...baseProps}>
      <path d="M4 20h4l10.5 -10.5a2.121 2.121 0 0 0 -3 -3l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg {...baseProps}>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

export function IconChevronLeft() {
  return (
    <svg {...baseProps}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg {...baseProps}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconFolder() {
  return (
    <svg {...baseProps}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconGlobe() {
  return (
    <svg {...baseProps}>
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </svg>
  );
}

export function IconChat() {
  return (
    <svg {...baseProps}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function IconArrowDown() {
  return (
    <svg {...baseProps}>
      <path d="M12 5v14" />
      <path d="M18 13l-6 6l-6 -6" />
    </svg>
  );
}

export function IconPaperclip() {
  return (
    <svg {...baseProps}>
      <path d="M15 7l-6.5 6.5a3 3 0 1 0 4.2 4.2l7.1 -7.1a5 5 0 0 0 -7.1 -7.1l-7.8 7.8a7 7 0 1 0 9.9 9.9l6.4 -6.4" />
    </svg>
  );
}
