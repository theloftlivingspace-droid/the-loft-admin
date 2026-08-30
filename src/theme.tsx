/* =========================================================
   THE LOFT — shared "five-star" design tokens
   Single source of truth so every screen (Dashboard, Booking,
   Check-in/out, Stock, Users, Car, Pricing) uses the same
   navy / brass / bone identity as the header + bottom nav.
========================================================= */
import type { CSSProperties } from 'react';

export const T = {
  ink: "#0B1E42",
  inkSoft: "#33405E",
  bone: "#EDF1F6",
  paper: "#F7F9FB",
  card: "#FFFFFF",
  navy: "#142E67",
  navyDeep: "#142E67",
  navyTint: "#E4E9F2",
  brass: "#D9B25C",
  brassDeep: "#A9791A",
  brassPale: "#F3E7C7",
  wine: "#9C2C3D",
  wineTint: "#F6E1E4",
  sage: "#3F8256",
  sageTint: "#E3F0E7",
  plum: "#6B4C93",
  plumTint: "#EAE2F2",
  hair: "rgba(11,27,61,0.12)",
  hairGold: "rgba(217,178,92,0.4)",
  // Liquid-glass surface tints — pair with backdropFilter: 'blur(..) saturate(180%)'
  glassNavy: "rgba(20,46,103,0.55)",
  glassNavyStrong: "rgba(20,46,103,0.72)",
  glassCard: "rgba(255,255,255,0.55)",
  glassCardStrong: "rgba(255,255,255,0.68)",
} as const;

/** Inline style helpers for the "liquid glass" surface treatment used across
 *  headers, nav pills, cards, and modals. Spread into a style={{}} object;
 *  any later key (e.g. a conditional background) will still override. */
export const glass = {
  navy: { background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.1) 100%), rgba(20,46,103,0.42)", backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)' },
  navyStrong: { background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.1) 100%), rgba(20,46,103,0.58)", backdropFilter: 'blur(18px) saturate(180%)', WebkitBackdropFilter: 'blur(18px) saturate(180%)' },
  card: { background: "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.25) 100%), rgba(255,255,255,0.38)", backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' },
  modal: { background: "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.25) 100%), rgba(255,255,255,0.5)", backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.6)' },
} as const;

/** Converts a '#rrggbb'/'#rgb' hex color or an 'rgb(...)' string to
 *  'rgba(r, g, b, alpha)'. Falls back to returning the input unchanged
 *  for anything else (e.g. already-rgba strings, named colors). */
export function toRgba(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map(s => s.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return c;
}

/** Builds a "liquid glass" style object over ANY base color (hex or
 *  rgb()/rgba()) — a translucent, blurred tint with a diagonal specular
 *  sheen and a bright top-edge highlight. Status/brand colors stay
 *  recognizable (same hue) while reading as glass rather than a flat
 *  fill. Spread into style={{ ...glassTint(cfg.bg), ... }}; later keys
 *  (color, border, etc.) still apply normally. */
export function glassTint(color: string, alpha = 0.5, blurPx = 16): CSSProperties {
  const tint = toRgba(color, alpha);
  return {
    background: `linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.16) 100%), ${tint}`,
    backdropFilter: `blur(${blurPx}px) saturate(180%)`,
    WebkitBackdropFilter: `blur(${blurPx}px) saturate(180%)`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(11,30,66,0.06)',
  };
}

/* Thin brass foil rule — used as a signature accent at the top of cards */
export function FoilRule() {
  return (
    <div
      style={{
        height: 2,
        background: `linear-gradient(90deg, transparent, ${T.brass} 18%, ${T.brass} 82%, transparent)`,
        opacity: 0.85,
      }}
    />
  );
}

export const fontImports = `
  .f-display { font-family: 'Plus Jakarta Sans', 'IBM Plex Sans Thai', sans-serif; letter-spacing: -0.01em; }
  .f-thai { font-family: 'IBM Plex Sans Thai', sans-serif; }
  .f-num { font-family: 'Work Sans', sans-serif; font-variant-numeric: tabular-nums; }
  .tabular { font-variant-numeric: tabular-nums; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.06em; }
  .loft-scroll::-webkit-scrollbar { display: none; }
  .loft-scroll { -ms-overflow-style: none; scrollbar-width: none; }
  .press:active { transform: scale(0.97); }
  .press { transition: transform 120ms ease, background-color 150ms ease, border-color 150ms ease; }
  @media (prefers-reduced-motion: reduce) { .press { transition: none; } }
  .focus-ring:focus-visible { outline: 2px solid ${T.brass}; outline-offset: 2px; }
  /* Visible, thin horizontal scrollbar — used where a hidden scrollbar would
     leave mouse-only users with no way to discover/grab it (e.g. the booking
     calendar's day grid). */
  .cal-hscroll { scrollbar-width: thin; scrollbar-color: ${T.brass} transparent; }
  .cal-hscroll::-webkit-scrollbar { height: 10px; }
  .cal-hscroll::-webkit-scrollbar-track { background: transparent; }
  .cal-hscroll::-webkit-scrollbar-thumb { background: ${T.brass}; border-radius: 6px; }
  .cal-hscroll::-webkit-scrollbar-thumb:hover { background: ${T.brassDeep}; }
`;
