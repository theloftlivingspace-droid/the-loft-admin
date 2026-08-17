/* =========================================================
   THE LOFT — shared "five-star" design tokens
   Single source of truth so every screen (Dashboard, Booking,
   Check-in/out, Stock, Users, Car, Pricing) uses the same
   navy / brass / bone identity as the header + bottom nav.
========================================================= */

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
} as const;

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
`;
