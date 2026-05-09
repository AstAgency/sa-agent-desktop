import type { CSSProperties } from "react";

type IconProps = {
  size?: number;
  stroke?: number;
  style?: CSSProperties;
};

export function IconHome(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M5 12.5 12 6l7 6.5M7.5 10.5V19h9v-8.5" />} />;
}

export function IconActivity(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M4 12h3l2.5-5 5 10 2.5-5H20" />} />;
}

export function IconMessage(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M6 18l-2 2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6z" />} />;
}

export function IconChecklist(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />} />;
}

export function IconUsers(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M15 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8 9v-1a4 4 0 0 0-3-3.87M14 3.13A4 4 0 0 1 14 10.87" />} />;
}

export function IconFolder(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />} />;
}

export function IconBolt(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />} />;
}

export function IconPlus(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M12 5v14M5 12h14" />} />;
}

export function IconCommand(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M8 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm14 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM8 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm14 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM8 8h8v8H8z" />} />;
}

export function IconSparkles(props: IconProps) {
  return <BaseIcon {...props} path={<path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3zm7 10 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM5 14l.8 1.7L7.5 16l-1.7.8L5 18.5l-.8-1.7L2.5 16l1.7-.8L5 14z" />} />;
}

export function IconLayoutSidebarLeftCollapse(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M4 5h16v14H4zM9 5v14M14 9l-3 3 3 3" />} />;
}

export function IconLayoutSidebarLeftExpand(props: IconProps) {
  return <BaseIcon {...props} path={<path d="M4 5h16v14H4zM9 5v14M11 9l3 3-3 3" />} />;
}

function BaseIcon({
  size = 16,
  stroke = 1.75,
  style,
  path,
}: IconProps & { path: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {path}
    </svg>
  );
}
