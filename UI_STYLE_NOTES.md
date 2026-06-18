# Trimax UI Style Notes

## Light-mode accent rule

Avoid pale sky, cyan, or blue text as a readable label color in light mode.

Dark mode can use luminous accents like `text-sky-200` or `text-cyan-200`.
Light mode should resolve small labels and section kickers to dark ink such as
`#0f172a`. Use stronger blue like `#075985`, `#0369a1`, or `#1d4ed8` only for
clear links, buttons, and action affordances.

The end of `src/app/globals.css` contains the global light-mode contrast
guardrail. Keep new feature styling compatible with that rule instead of
adding lighter overrides later in the stylesheet.
