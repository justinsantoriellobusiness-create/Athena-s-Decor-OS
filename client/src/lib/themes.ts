/**
 * Dashboard color themes. These reskin the persistent app chrome (sidebar
 * logo, active nav item, user avatar) that wraps every page. Most individual
 * pages use fixed per-metric Tailwind colors by design (e.g. red for
 * expenses, green for revenue in Accounting) and intentionally don't shift
 * with the theme — only the shared navigation chrome does.
 */
export interface DashboardTheme {
  id: string;
  name: string;
  swatch: string;
  gradientFrom: string;
  gradientTo: string;
  activeBg: string;
  activeText: string;
}

export const DASHBOARD_THEMES: DashboardTheme[] = [
  { id: "violet", name: "Violet", swatch: "#8b5cf6", gradientFrom: "#8b5cf6", gradientTo: "#6d28d9", activeBg: "rgba(139,92,246,0.2)", activeText: "#c4b5fd" },
  { id: "ocean", name: "Ocean Blue", swatch: "#3b82f6", gradientFrom: "#3b82f6", gradientTo: "#1d4ed8", activeBg: "rgba(59,130,246,0.2)", activeText: "#93c5fd" },
  { id: "emerald", name: "Emerald Forest", swatch: "#10b981", gradientFrom: "#10b981", gradientTo: "#047857", activeBg: "rgba(16,185,129,0.2)", activeText: "#6ee7b7" },
  { id: "sunset", name: "Sunset Orange", swatch: "#f97316", gradientFrom: "#f97316", gradientTo: "#c2410c", activeBg: "rgba(249,115,22,0.2)", activeText: "#fdba74" },
  { id: "rose", name: "Rose Pink", swatch: "#f43f5e", gradientFrom: "#f43f5e", gradientTo: "#be123c", activeBg: "rgba(244,63,94,0.2)", activeText: "#fda4af" },
  { id: "slate", name: "Slate Gray", swatch: "#64748b", gradientFrom: "#64748b", gradientTo: "#334155", activeBg: "rgba(100,116,139,0.2)", activeText: "#cbd5e1" },
  { id: "amber", name: "Amber Gold", swatch: "#f59e0b", gradientFrom: "#f59e0b", gradientTo: "#b45309", activeBg: "rgba(245,158,11,0.2)", activeText: "#fcd34d" },
  { id: "crimson", name: "Crimson Red", swatch: "#ef4444", gradientFrom: "#ef4444", gradientTo: "#b91c1c", activeBg: "rgba(239,68,68,0.2)", activeText: "#fca5a5" },
  { id: "teal", name: "Teal Cyan", swatch: "#14b8a6", gradientFrom: "#14b8a6", gradientTo: "#0f766e", activeBg: "rgba(20,184,166,0.2)", activeText: "#5eead4" },
  { id: "indigo", name: "Indigo Night", swatch: "#6366f1", gradientFrom: "#6366f1", gradientTo: "#4338ca", activeBg: "rgba(99,102,241,0.2)", activeText: "#a5b4fc" },
];

export function getTheme(id: string | null | undefined): DashboardTheme {
  return DASHBOARD_THEMES.find((t) => t.id === id) ?? DASHBOARD_THEMES[0];
}
