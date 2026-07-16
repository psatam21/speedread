# Design System — SpeedRead

## Identity
- Tool name: SpeedRead
- Primary action: Fast-track your reading by visual parsing (RSVP, Bionic, TTS)
- Tone: Premium, fast, distraction-free, clinical, and high-performance

## Color Tokens

We define a 4-theme palette (stored in `[data-theme]` attributes on `<html>` or `<body>` elements):

### 1. Light Mode (`data-theme="light"`)
- `--color-bg`: #ffffff
- `--color-bg-subtle`: #f8f9fa
- `--color-bg-card`: #ffffff
- `--color-text`: #111827
- `--color-text-muted`: #6b7280
- `--color-primary`: #2563eb (Vibrant Blue)
- `--color-primary-hover`: #1d4ed8
- `--color-border`: #e5e7eb
- `--color-accent`: #ef4444 (ORP Red highlight)

### 2. Sepia Mode (`data-theme="sepia"`)
- `--color-bg`: #f4ecd8
- `--color-bg-subtle`: #ebdcb9
- `--color-bg-card`: #fdf6e3
- `--color-text`: #5c4326
- `--color-text-muted`: #8f6f4c
- `--color-primary`: #8b5a2b
- `--color-primary-hover`: #6f421b
- `--color-border`: #d9cbb0
- `--color-accent`: #c2410c

### 3. Dark Mode (`data-theme="dark"`)
- `--color-bg`: #0f172a (Slate Dark)
- `--color-bg-subtle`: #1e293b
- `--color-bg-card`: #1e293b
- `--color-text`: #f8fafc
- `--color-text-muted`: #94a3b8
- `--color-primary`: #3b82f6
- `--color-primary-hover`: #60a5fa
- `--color-border`: #334155
- `--color-accent`: #f87171

### 4. AMOLED Black Mode (`data-theme="amoled"`)
- `--color-bg`: #000000 (Pure Black)
- `--color-bg-subtle`: #0a0a0a
- `--color-bg-card`: #121212
- `--color-text`: #ffffff
- `--color-text-muted`: #a3a3a3
- `--color-primary`: #3b82f6
- `--color-primary-hover`: #60a5fa
- `--color-border`: #262626
- `--color-accent`: #f87171

---

## Typography
- **Fonts:**
  - Sans-Serif: Inter (self-hosted)
  - Serif: Merriweather or Georgia (system fallback)
  - Dyslexic-Friendly: OpenDyslexic (self-hosted via a standard web-safe font or @fontsource if available, or load SVG/woff fallback)
- **Scale:**
  - H1: 2.5rem, font-weight 800, tracking-tight, line-height 1.2
  - H2: 1.75rem, font-weight 700
  - Body: 1rem, line-height 1.7
  - RSVP Display: 3.5rem, font-weight 700, font-family monospace/sans-serif

---

## Layout
- Max Content Width: 1200px (standard grid), centered.
- Distraction-Free View: The reading interface must support an expandable fullscreen mode that hides all ads and navigation elements.

---

## Component Rules
- **Interactive Buttons:** Glassmorphic buttons with subtle scale on hover and tap, border thickness of 1px.
- **Transits:** Maximum transition duration of 150ms to maintain speed-reading responsiveness.
- **Keyboard Shortcuts:**
  - `Space` - Play/Pause reading
  - `Escape` - Exit reading / Fullscreen
  - `ArrowUp` / `ArrowDown` - Adjust reading speed (WPM)
  - `ArrowLeft` / `ArrowRight` - Go back / forward in RSVP index
  - `D` - Cycle through theme modes
