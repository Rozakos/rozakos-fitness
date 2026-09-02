import { useWindowDimensions } from "react-native";

/**
 * Below this the phone is "compact" and control rows have to stack rather than
 * sit side by side. The number is set by the Galaxy Z Flip3 (360dp wide, the
 * narrowest device this app targets): a 4-across row of inputs leaves each box
 * ~68dp, which is not enough for "100.5" once the box's own padding is removed.
 * Anything at or above ~380dp (iPhone 12+, most modern Androids) has the room.
 */
export const COMPACT_WIDTH = 380;

/** Past this the OS font is large enough to overflow rows that fit at 1.0. */
export const LARGE_FONT_SCALE = 1.15;

export interface Layout {
  width: number;
  fontScale: number;
  /** Narrow screen — split multi-column control rows. */
  compact: boolean;
  /** Narrow screen *or* large system font — anything that squeezes a row. */
  tight: boolean;
}

export function useLayout(): Layout {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < COMPACT_WIDTH;
  return { width, fontScale, compact, tight: compact || fontScale > LARGE_FONT_SCALE };
}

/**
 * Usable width for a chart drawn inside a `Card` on a screen padded by
 * `spacing.md` — screen padding + card padding, both sides. Floored so a
 * chart never gets a negative or absurdly small canvas on a folded cover
 * display or a split-screen window.
 */
export function chartWidth(windowWidth: number, gutters = 64) {
  return Math.max(200, windowWidth - gutters);
}
