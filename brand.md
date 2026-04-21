# Foundation Design System

Institutional luxury aesthetic — navy & gold brand identity with modern glassmorphism and editorial typography. Shared across `foundation-app` (Next.js) and `landing-latest` (Vite + Vue).

## Color Palette

### Navy (primary)
- `#0c2340` — primary (backgrounds, headers, primary buttons)
- `#1d4e6e` — light
- `#040e1a` — dark

### Gold (accent)
- `#b8960c` — primary (accents, hover states, section labels, cursor)
- `#d4af37` — accent light
- `#97790a` — dark

### Neutrals
- `#f8fafc` — off-white background
- `#0f172a` — slate text
- `rgba(0,0,0,0.04)` — subtle borders

### Mode
- Light is default (`html.light`)
- Dark mode mirrors via `--color-dark-*` tokens
- Base background: `linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)`

## Typography

| Role | Font | Notes |
|------|------|-------|
| Headings | Cormorant Garamond | 300–600 weight, tight `-0.02em` tracking, light weight default |
| Body | Inter | via `next/font` |
| Mono | DM Mono / JetBrains Mono | stats, labels, numeric data |
| Labels | DM Mono | 10px, ALL CAPS, `0.25em` tracking |

Base size: 14px (app) / 18px (landing).

## Components

### Glass surfaces (core treatment)
- `.infra-card` — `rgba(255,255,255,0.45)` + `blur(20px) saturate(150%)` + inset white highlight
- `.glass-strong` — `rgba(255,255,255,0.55)` + `blur(24px) saturate(160%)` for elevated surfaces
- `.btn-glass` — lighter 12px blur variant for secondary actions

### Buttons
- `.btn-primary` — navy background, gold on hover, `translateY(-1px)` lift, inset white highlight for carved effect
- Transitions: `all 0.2s ease` with subtle shadow lift

### Radius & borders
- Default 8px (Tailwind `lg`), 4px for small elements
- 1px alpha borders with white/black overlays for depth

## Layout

- Tailwind 4 with custom theme extensions
- Container max-width ~`7xl` (56rem)
- Gap rhythm: 12px / 16px increments
- Fixed grain texture overlay via `/textures/noise.png`

## Motion

Pure CSS keyframes — **no Framer Motion or GSAP**.

| Name | Duration | Effect |
|------|----------|--------|
| `fade-up` | 0.6s | `translateY(24px)` → 0, used on hero |
| `fade-in` | 0.5s | opacity only |
| `ticker` | 30s | infinite horizontal scroll for stats bar |
| `glow` | 4s ease-in-out | opacity pulse 0.4 → 0.7 |

Stagger children at 0.08s per element.

## Iconography

**Lucide** exclusively — `lucide-react` (app) and `lucide-vue-next` (landing). Sizes 12–16px, inherit `currentColor`.

## Project Divergence

| | `foundation-app` | `landing-latest` |
|---|---|---|
| Stack | Next.js 16 | Vite + Vue 3 |
| Focus | Dashboard, wallet integration, dark toggle | Marketing, Spline 3D hero, gold cursor tracking |
| Shared | Design tokens · glass components · typography · motion | ← same |
