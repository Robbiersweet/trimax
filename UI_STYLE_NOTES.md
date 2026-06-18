# Trimax UI Style Notes

## Light-mode accent rule

Avoid pale sky, cyan, or blue text as a readable label color in light mode.

Dark mode can use luminous accents like `text-sky-200` or `text-cyan-200`.
Light mode should resolve those accents to stronger ink such as `#075985`,
`#0369a1`, or `#1d4ed8`.

The end of `src/app/globals.css` contains the global light-mode contrast
guardrail. Keep new feature styling compatible with that rule instead of
adding lighter overrides later in the stylesheet.
