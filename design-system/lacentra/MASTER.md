# Lacentra Design System — MASTER (Stage 78)

Source of truth for visual decisions. Page-specific exceptions go in `pages/<page>.md` and override this file.
Built from the ui-ux-pro-max rule set (priority order: accessibility, touch, performance, style, layout, type/color, motion, forms, navigation, charts) and layout patterns surveyed on 21st.dev (collapsible icon-rail sidebar with grouped sections, animated active item, user footer, status badges).

## Direction: "Calm clinical"
Users are credentialing staff and providers, many older, working long sessions. The UI should feel trustworthy and quiet: deep ink navigation, one teal accent, warm-neutral canvas, generous spacing, large readable type. Motion explains cause and effect and never decorates.

## Color tokens
| Token | Value | Use |
|---|---|---|
| `--pr` | `#0B6B7A` | Primary action, links, focus (6.2:1 on white) |
| `--pr-d` | `#085563` | Primary hover / pressed |
| `--ink` navigation | `#0F1C2E` | Sidebar surface |
| nav text / label | `#C3CEDC` / `#8FA0B5` | 10:1 and 6:1 on the sidebar surface |
| nav accent | `#5EC8D6` | Active indicator, logo mark |
| `--bg` | `#F2F5F7` | App canvas |
| `--card` | `#FFFFFF` | Surfaces |
| status | green `#047857`, amber `#B45309`, red `#C62222` | Always paired with text or an icon, never color alone |

## Type
Inter, 15px body, 14px dense table text minimum. Headings 700 with slightly tight tracking; page title 26px. Tabular numerals on counts, dates and money. Nothing below 12px except decorative marks.

## Spacing, shape, elevation
4/8 spacing scale. Radius 10 controls, 14 cards, 20 modals. Elevation has three levels only: card, raised (hover), overlay.

## Touch and focus
Controls are at least 40px tall (44px on phones). Visible 3px teal focus ring on every interactive element (`:focus-visible`). Never remove outlines.

## Motion tokens
`--ease-out: cubic-bezier(.22,1,.36,1)`; durations 120ms (feedback), 200ms (state change), 320ms (page and panel). Only transform and opacity animate. Page content enters with a short fade-rise; KPI tiles stagger by 40ms; press feedback scales to .98; panels slide from their edge; exits are shorter than enters. Everything is disabled under `prefers-reduced-motion`.

## Anti-patterns for this product
Emoji as icons, color-only status, hover-only controls, more than one primary button per view, animations on data tables, content that shifts as it loads.
