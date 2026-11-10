/**
 * Diegetic (in-world) typefaces for Cikajang, one family per era / material.
 * Loaded by `useDiegeticFonts()` in Cikajang.tsx behind a 1200 ms font guard;
 * every stack ends in a system fallback of the same character so an offline
 * render still looks era-appropriate.
 *
 * Use with canvas fonts as `${weight} ${size}px ${ERA_FONT.colonial}`.
 */
export const ERA_FONT = {
  /** 1930s Staatsspoorwegen enamel plates: TJIKADJANG, GAROET, DIENSTREGELING. */
  colonial: "'Cinzel', 'Trajan Pro', Georgia, 'Times New Roman', serif",
  /** Newspaper mastheads and chiselled stone (DE KOERIER, 1930 – 1982). */
  editorial: "'Playfair Display', 'Bodoni 72', Didot, Georgia, serif",
  /** Stencilled crates and sacks (BERAS). */
  stencil: "'IBM Plex Mono', 'Courier New', Courier, monospace",
  /** 1980s PJKA administration, DITUTUP stamp. */
  industrial: "'Oswald', 'Arial Narrow', 'Roboto Condensed', Impact, sans-serif",
  /** Present-day street mural (CIKAJANG). */
  mural: "'Permanent Marker', 'Marker Felt', 'Comic Sans MS', cursive",
  /** KAI 2022+ wayfinding (GARUT +717 M, PETA RUTE). */
  transit: "'Plus Jakarta Sans', 'Montserrat', 'Helvetica Neue', Arial, sans-serif",
} as const;

export type EraFont = keyof typeof ERA_FONT;

/** One Google Fonts stylesheet for every diegetic family above. */
export const DIEGETIC_FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800' +
  '&family=Playfair+Display:ital,wght@0,700;0,900;1,700' +
  '&family=IBM+Plex+Mono:wght@600;700' +
  '&family=Oswald:wght@500;700' +
  '&family=Permanent+Marker' +
  '&family=Plus+Jakarta+Sans:wght@600;800' +
  '&display=block';

/** Faces that must be resolved before world canvases are painted. */
export const DIEGETIC_FONT_FACES: readonly string[] = [
  "800 64px 'Cinzel'",
  "600 64px 'Cinzel'",
  "900 64px 'Playfair Display'",
  "700 64px 'Playfair Display'",
  "italic 700 64px 'Playfair Display'",
  "700 64px 'IBM Plex Mono'",
  "700 64px 'Oswald'",
  "500 64px 'Oswald'",
  "400 64px 'Permanent Marker'",
  "800 64px 'Plus Jakarta Sans'",
  "600 64px 'Plus Jakarta Sans'",
];

/** Guard budget: never let an offline font fetch stall a local render. */
export const FONT_GUARD_MS = 1200;
