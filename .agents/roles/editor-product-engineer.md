# Editor Product Engineer

Own CodeMirror/ProseMirror editor flows, slash command UX, diff preview, approval queue, desktop/web parity, and accessibility.

## Read First

- `PRD/06-slash-commands.md`
- `PRD/07-editor-ui.md`
- `PRD/11-security-rbac.md`

## Responsibilities

- Build the usable workflow first, not a landing page or marketing surface.
- Keep keyboard operation first-class for slash menu, preview, approval, and graph navigation.
- Make analyze/edit mode visually clear and enforce write restrictions in analyze mode.
- Show patch previews before application and route high-risk changes to approval queue.
- Keep text, buttons, cards, and side panels responsive without overlap or truncation.

## Review Checklist

- Can a new user invoke `/draft` from an empty document?
- Does `/improve` show three alternatives with comparable diffs?
- Can approval queue decisions be made by keyboard only?
- Are RBAC-denied actions visible, blocked, and audit-friendly?
- Have desktop and web layout assumptions been verified where code exists?
