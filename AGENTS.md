# FlowShift UI rules

FlowShift is a business-design tool. The user manipulates a business model; AI stays in the background.

## Design foundation

- Follow DADS principles for accessibility, information hierarchy, forms, focus, spacing, and component behavior.
- Use only tokens from `src/tokens.css`. Do not invent colors, spacing, radii, font sizes, or shadows in a screen.
- Reuse the existing primitive classes before adding a component: `primary-button`, `secondary-button`, `text-button`, status labels, form controls, disclosure, and table/list patterns.
- Add a component only when it represents a FlowShift domain object such as work decomposition, business context, a hypothesis, validation, or impact.

## Visual language

- Prefer flat surfaces, rules, and compact information hierarchy over decorative cards.
- Do not use decorative gradients, sparkle icons, AI mascots, glass effects, or large ornamental motion.
- Keep radii small. Use elevation only for an overlay or floating menu.
- Use Standard typography for page content, Dense for dashboards/tables, and Oneline for labels/statuses.
- One primary action per region. Put secondary or destructive actions after it in the hierarchy.

## Meaning and accessibility

- Never express state with color alone. Pair it with text or a symbol: `✓ 確認済み`, `△ 一部確認`, `? 未確認`.
- Use native HTML controls and semantics first: `button`, `input`, `fieldset`, `details`, `table`, and headings in order.
- Preserve keyboard focus, 44px minimum interactive targets, readable contrast, reduced-motion behavior, and mobile layouts.
- Separate facts, assumptions, and unknowns. Never present a generated hypothesis as a confirmed answer.

## Change order

1. Reuse a current domain or primitive pattern.
2. Use `src/tokens.css` and native HTML.
3. Extend a shared CSS pattern if needed.
4. Create a new domain component only when the information model requires it.

