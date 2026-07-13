// Rozakos Industries brand palette (rozakos.com) — "Build your ideas"
export const colors = {
  // brand
  primaryDark: "#2c2c3e",
  accent: "#a5211f",
  accentBright: "#c94a3d", // readable variant of the crimson on dark surfaces
  success: "#2fb1a2",
  alert: "#dc5a5a",

  // dark theme surfaces derived from primaryDark
  bg: "#1f1f2d",
  surface: "#2c2c3e",
  surfaceRaised: "#3a3a4f",
  border: "#464660",

  // text
  text: "#f4f4f4",
  textMuted: "#a0a0b8",
  textFaint: "#6e6e88",

  // chart hues — validated ≥3:1 against surface #2c2c3e (dataviz six checks)
  chartTeal: "#2aa596",
  chartCrimson: "#d4584b",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
