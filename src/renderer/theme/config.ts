import type { ThemeMode } from "../lib/types";

const themeFoundation = {
  fonts: {
    sans: '"Roboto Flex", "Roboto", "Segoe UI", sans-serif',
    mono: '"Roboto Mono", monospace',
  },
  fontSizes: {
    eyebrow: "12px",
    caption: "13px",
    body: "16px",
    bodyLarge: "20px",
    section: "24px",
    title: "26px",
    metric: "24px",
  },
  lineHeights: {
    tight: 1.05,
    compact: 1.2,
    body: 1.6,
  },
  radii: {
    medium: "8px",
    large: "12px",
    xlarge: "16px",
    pill: "999px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "18px",
    xl: "24px",
  },
  shadows: {
    panel: "none",
  },
  components: {
    panel: {
      padding: "16px",
      gap: "24px",
      borderWidth: "1px",
    },
    card: {
      padding: "16px",
      gap: "12px",
    },
    button: {
      height: "32px",
      paddingX: "16px",
    },
    input: {
      minHeight: "48px",
      paddingX: "14px",
      paddingY: "12px",
      textareaMinHeight: "88px",
    },
    listItem: {
      padding: "12px",
      gap: "8px",
    },
    chatBubble: {
      padding: "16px",
      gap: "8px",
    },
    composer: {
      padding: "16px",
      gap: "12px",
    },
  },
} as const;

const themePalettes = {
  dark: {
    appBackgroundTopGlow: "rgba(20, 184, 166, 0.16)",

    appBackgroundStart: "#030507",
    appBackgroundMiddle: "#070b10",
    appBackgroundEnd: "#020305",

    textPrimary: "#f3f6fb",
    textSecondary: "#b6c0cf",
    textMuted: "#7a8699",
    textInverse: "#020305",

    accentPrimary: "#14b8a6",        // teal
    accentPrimaryStrong: "#0f766e",  // deep teal
    accentPrimaryBright: "#22d3ee",  // cyan highlight

    borderPrimary: "rgba(255, 255, 255, 0.14)",
    borderSecondary: "rgba(255, 255, 255, 0.08)",

    panelSurfaceStart: "#0e1117",
    panelSurfaceEnd: "#090c12",
    panelSurfaceMuted: "#151922",

    railSurface: "#06090d",

    statusInfo: "rgba(34, 211, 238, 0.16)",
    statusDanger: "rgba(248, 113, 113, 0.18)",
    statusDangerText: "#fecaca",
  },

  light: {
    appBackgroundTopGlow: "rgba(20, 184, 166, 0.12)",

    appBackgroundStart: "#fafbfd",
    appBackgroundMiddle: "#f2f5f9",
    appBackgroundEnd: "#e7ecf3",

    textPrimary: "#0b1220",
    textSecondary: "#334155",
    textMuted: "#64748b",
    textInverse: "#ffffff",

    accentPrimary: "#0d9488",
    accentPrimaryStrong: "#0f766e",
    accentPrimaryBright: "#0891b2",

    borderPrimary: "rgba(15, 23, 42, 0.14)",
    borderSecondary: "rgba(15, 23, 42, 0.08)",

    panelSurfaceStart: "#ffffff",
    panelSurfaceEnd: "#f8fafc",
    panelSurfaceMuted: "#eef2f7",

    railSurface: "#e5eaf1",

    statusInfo: "rgba(6, 182, 212, 0.12)",
    statusDanger: "rgba(220, 38, 38, 0.10)",
    statusDangerText: "#991b1b",
  },
} as const;

export function getThemeConfig(mode: ThemeMode) {
  return {
    colors: themePalettes[mode],
    ...themeFoundation,
  } as const;
}

export function buildThemeCssVariables(mode: ThemeMode) {
  const themeConfig = getThemeConfig(mode);

  return {
    "--theme-color-app-bg-glow": themeConfig.colors.appBackgroundTopGlow,
    "--theme-color-app-bg-start": themeConfig.colors.appBackgroundStart,
    "--theme-color-app-bg-middle": themeConfig.colors.appBackgroundMiddle,
    "--theme-color-app-bg-end": themeConfig.colors.appBackgroundEnd,
    "--theme-color-text-primary": themeConfig.colors.textPrimary,
    "--theme-color-text-secondary": themeConfig.colors.textSecondary,
    "--theme-color-text-muted": themeConfig.colors.textMuted,
    "--theme-color-text-inverse": themeConfig.colors.textInverse,
    "--theme-color-accent-primary": themeConfig.colors.accentPrimary,
    "--theme-color-accent-primary-strong": themeConfig.colors.accentPrimaryStrong,
    "--theme-color-accent-primary-bright": themeConfig.colors.accentPrimaryBright,
    "--theme-color-border-primary": themeConfig.colors.borderPrimary,
    "--theme-color-border-secondary": themeConfig.colors.borderSecondary,
    "--theme-color-panel-start": themeConfig.colors.panelSurfaceStart,
    "--theme-color-panel-end": themeConfig.colors.panelSurfaceEnd,
    "--theme-color-panel-muted": themeConfig.colors.panelSurfaceMuted,
    "--theme-color-rail": themeConfig.colors.railSurface,
    "--theme-color-status-info": themeConfig.colors.statusInfo,
    "--theme-color-status-danger": themeConfig.colors.statusDanger,
    "--theme-color-status-danger-text": themeConfig.colors.statusDangerText,
    "--theme-font-sans": themeConfig.fonts.sans,
    "--theme-font-mono": themeConfig.fonts.mono,
    "--theme-font-size-eyebrow": themeConfig.fontSizes.eyebrow,
    "--theme-font-size-caption": themeConfig.fontSizes.caption,
    "--theme-font-size-body": themeConfig.fontSizes.body,
    "--theme-font-size-body-large": themeConfig.fontSizes.bodyLarge,
    "--theme-font-size-section": themeConfig.fontSizes.section,
    "--theme-font-size-title": themeConfig.fontSizes.title,
    "--theme-font-size-metric": themeConfig.fontSizes.metric,
    "--theme-radius-medium": themeConfig.radii.medium,
    "--theme-radius-large": themeConfig.radii.large,
    "--theme-radius-xlarge": themeConfig.radii.xlarge,
    "--theme-radius-pill": themeConfig.radii.pill,
    "--theme-spacing-xs": themeConfig.spacing.xs,
    "--theme-spacing-sm": themeConfig.spacing.sm,
    "--theme-spacing-md": themeConfig.spacing.md,
    "--theme-spacing-lg": themeConfig.spacing.lg,
    "--theme-spacing-xl": themeConfig.spacing.xl,
    "--theme-shadow-panel": themeConfig.shadows.panel,
    "--theme-panel-padding": themeConfig.components.panel.padding,
    "--theme-panel-gap": themeConfig.components.panel.gap,
    "--theme-panel-border-width": themeConfig.components.panel.borderWidth,
    "--theme-card-padding": themeConfig.components.card.padding,
    "--theme-card-gap": themeConfig.components.card.gap,
    "--theme-button-height": themeConfig.components.button.height,
    "--theme-button-padding-x": themeConfig.components.button.paddingX,
    "--theme-input-min-height": themeConfig.components.input.minHeight,
    "--theme-input-padding-x": themeConfig.components.input.paddingX,
    "--theme-input-padding-y": themeConfig.components.input.paddingY,
    "--theme-input-textarea-min-height": themeConfig.components.input.textareaMinHeight,
    "--theme-list-item-padding": themeConfig.components.listItem.padding,
    "--theme-list-item-gap": themeConfig.components.listItem.gap,
    "--theme-chat-bubble-padding": themeConfig.components.chatBubble.padding,
    "--theme-chat-bubble-gap": themeConfig.components.chatBubble.gap,
    "--theme-composer-padding": themeConfig.components.composer.padding,
    "--theme-composer-gap": themeConfig.components.composer.gap,
  } as const;
}
