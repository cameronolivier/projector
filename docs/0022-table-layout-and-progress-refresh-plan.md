status: not started

# 0022 Table Layout and Progress Refresh — Plan

## Overview
Reorder the primary table columns to surface the most relevant information first, replace the existing Git column with a progress summary, and ensure long values (project name and location) wrap gracefully without truncation.

## Goals
1. Present key human-readable data up front: project name, description, and status.
2. Add a dedicated progress column showing task completion (e.g., `5/10 • 50%`) or `N/A` when unavailable.
3. Keep project names and locations untruncated, relying on multiline wrapping instead of ellipsis.
4. Maintain compatibility with upcoming Last Edited work so the column remains sortable.

## Proposed Column Order
`Project` | `Description` | `Status` | `Category` | `Progress` | `Last Edited` | `📍 Location` | `Type`

## Scope
- Update table generator column order, widths, and wrapping behavior.
- Introduce progress formatter that can ingest outstanding/total TODOs and compute percentages.
- Rename the Git column to Progress and repurpose its content.
- Ensure `Last Edited` column renders absolute dates for sorting while keeping relative display optional.
- Adjust summary and compact views to respect new ordering where relevant.
- Refresh docs/config references to match the revised layout.
- Expand tests to cover progress column and new order.

## Out of Scope
- New data sources for TODO counts (reuse existing tracking info).
- Column hiding/toggle mechanics (stick with defaults for now).
- Rendering progress bars; stay with text + percentage.

## Implementation Steps
1. Update `TableGenerator` headers, column widths, and formatter pipeline to match the new order.
2. Build `formatProgress` helper that prefers TODO counts, gracefully falls back to `N/A`, and applies color cues.
3. Ensure long strings in Project/Location wrap across lines instead of truncating.
4. Update CLI help text and relevant docs describing table layout.
5. Modify tests (table generator, summary) to assert new column order and progress formatting.
6. Add manual testing checklist for multiline wrapping and progress display.

## Risks & Mitigations
- **Wide terminals**: confirm cli-table3 can handle wider columns; adjust widths iteratively.
- **Missing data**: progress must degrade to `N/A` without undefined showing up; add tests.
- **Sorting dependencies**: coordinate with Feature 0020 Last Edited so both relative and absolute formatters coexist.

## Dependencies & Follow-up
- Relies on Last Edited (0020) for sortable datetime column.
- Builds on Category column work (0014) so category placement must align.
- Follow-up: expose flags/config to toggle progress data sources and default column order.
