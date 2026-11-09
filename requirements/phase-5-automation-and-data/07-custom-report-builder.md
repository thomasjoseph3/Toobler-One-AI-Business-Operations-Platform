# Custom report builder

**Phase 5 · Data · HubSpot equivalent: Custom reporting, Dashboards, Data Studio, Datasets**

## What it is

Managers build their own reports from any object and field (including custom), choose a chart, and arrange reports on
their own dashboards. They can also ask the AI: "Show won revenue by city for last year as a bar chart."

## Done when

- [ ] Reports from any fields, with filters, grouping and charts; dashboards can be shared and emailed weekly.

## For developers

- **Code folder:** `apps/api/src/engines/automation/report-builder`
- **API:** [API.md](../API.md), Phase 5 → Custom report builder
- **Code:** query builder over a safe read model; `reports`, `dashboards`, `dashboard_reports`.
