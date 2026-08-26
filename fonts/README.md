# VCR OSD Mono

The widget's OSD uses `VCR OSD Mono` (the required authentic VHS-broker look).
Embedded here as a self-hosted webfont so the widget stays fully offline-capable
(no Google Fonts / CDN dependency at runtime).

- **File:** `VCR_OSD_MONO_1.001.ttf`
- **Source:** public GitHub mirror `denilsonsacida/VCR-OSD-Mono` (raw `main` branch).
- **Author:** VCR_OSD_MONO was originally designed by Daniel Zadorozny; it is a
  free-for-personal-use font. **Verify the license** if this widget is used
  commercially before redistributing the file.

Usage: loaded via `@font-face` in `crt-tv.html` and referenced first in every
`--vcr-font` / `font` declaration across the widget. `VT323` remains the web
fallback.
