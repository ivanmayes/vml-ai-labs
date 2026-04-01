---
title: PrimeFlex CSS classes broken — PrimeFlex is NOT installed in this project
date: "2026-04-01"
category: ui-bugs
module: wpp-open-agent-updater
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - "Form fields rendered horizontally in a single row instead of vertically stacked"
  - "PrimeFlex CSS utility classes (flex-column, flex-grow-1, justify-content-between) had no effect"
  - "PrimeFlex grid system classes (grid, col-12, md:col-3) produced no responsive layout"
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - primeflex
  - tailwind-css
  - primeng
  - css-utility-classes
  - angular
  - layout-bug
  - flex
  - grid
---

# PrimeFlex CSS classes broken — PrimeFlex is NOT installed in this project

## Problem

Angular templates across multiple mini apps and pages used PrimeFlex CSS utility classes (`flex-column`, `flex-grow-1`, `justify-content-between`, `align-items-center`, `border-round`, `col-12 md:col-3`) for layout. **PrimeFlex is NOT installed in this project** — it is not in `package.json`, not in `node_modules/`, and not imported in any stylesheet. PrimeFlex was the utility CSS library bundled with older PrimeNG versions but was dropped in PrimeNG v20 in favor of Tailwind CSS v4. Since PrimeFlex is completely absent, those classes resolved to nothing and all flex/grid layouts broke.

## Symptoms

- Form fields on the "New Task" page rendered horizontally in a single row instead of vertically stacked
- Input fields and buttons overflowed their container horizontally
- Summary stat cards on the run-detail page displayed with no responsive grid
- Action buttons were not right-aligned (sat at default flex start position)
- Folder validation success banner had no border-radius despite specifying `border-round`

## What Didn't Work

No failed attempts -- the broken visual (screenshot showing horizontal form layout) immediately pointed to CSS utility class resolution failures. Inspecting the template source and cross-referencing PrimeFlex docs against Tailwind CSS v4 docs confirmed every broken class was a PrimeFlex-only name with a different Tailwind equivalent.

## Solution

Replace every PrimeFlex utility class with its Tailwind CSS v4 equivalent across all 4 component templates.

**Complete class mapping:**

| PrimeFlex (broken) | Tailwind (working) | CSS Property |
|---|---|---|
| `flex-column` | `flex-col` | `flex-direction: column` |
| `flex-grow-1` | `grow` | `flex-grow: 1` |
| `justify-content-between` | `justify-between` | `justify-content: space-between` |
| `justify-content-end` | `justify-end` | `justify-content: flex-end` |
| `align-items-center` | `items-center` | `align-items: center` |
| `border-round` | `rounded` | `border-radius: 0.25rem` |
| `grid` + `col-12 md:col-3` | `grid grid-cols-1 md:grid-cols-4 gap-4` | CSS Grid layout |

Classes identical in both systems were left unchanged: `flex`, `gap-2`, `gap-4`, `p-2`, `p-4`, `mb-4`, `m-0`, `text-center`, `font-bold`, `py-4`, `py-5`.

**Before (task-form.component.ts):**
```html
<div class="flex flex-column gap-4">
  <div class="flex flex-column gap-2">
    <label for="name">Task Name</label>
    <input pInputText id="name" formControlName="name" />
  </div>
  <div class="flex gap-2">
    <input pInputText class="flex-grow-1" formControlName="boxFolderId" />
    <p-button label="Validate" />
  </div>
  <div class="mt-1 p-2 border-round">Folder info...</div>
  <div class="flex gap-2 justify-content-end">
    <p-button label="Cancel" />
    <p-button label="Save" />
  </div>
</div>
```

**After:**
```html
<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <label for="name">Task Name</label>
    <input pInputText id="name" formControlName="name" />
  </div>
  <div class="flex gap-2">
    <input pInputText class="grow" formControlName="boxFolderId" />
    <p-button label="Validate" />
  </div>
  <div class="mt-1 p-2 rounded">Folder info...</div>
  <div class="flex gap-2 justify-end">
    <p-button label="Cancel" />
    <p-button label="Save" />
  </div>
</div>
```

**Before (run-detail.component.ts -- grid):**
```html
<div class="flex justify-content-between align-items-center mb-4">...</div>
<div class="grid mb-4">
  <div class="col-12 md:col-3"><p-card>...</p-card></div>
  <div class="col-12 md:col-3"><p-card>...</p-card></div>
</div>
```

**After:**
```html
<div class="flex justify-between items-center mb-4">...</div>
<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
  <p-card>...</p-card>
  <p-card>...</p-card>
</div>
```

For the grid conversion, PrimeFlex wrapper `<div class="col-12 md:col-3">` divs were removed. Tailwind uses `grid-cols-*` on the parent with cards as direct children.

**Files changed:**
- `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/task-form/task-form.component.ts`
- `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/task-list/task-list.component.ts`
- `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/task-detail/task-detail.component.ts`
- `apps/web/src/app/mini-apps/wpp-open-agent-updater/components/run-detail/run-detail.component.ts`
- `apps/web/src/app/mini-apps/site-scraper/pages/site-scraper-home/site-scraper-home.component.html`
- `apps/web/src/app/mini-apps/document-converter/components/document-converter.component.ts`
- `apps/web/src/app/pages/space-admin/settings/settings.page.html`
- `apps/web/src/app/pages/organization-admin/settings/settings.page.html`

## Why This Works

PrimeFlex and Tailwind CSS are both utility-class frameworks but use different naming conventions for the same CSS properties. PrimeNG v20 officially dropped PrimeFlex and recommends Tailwind as its companion utility framework. Since this project uses PrimeNG v20 + Tailwind CSS v4, PrimeFlex classes simply do not exist in the stylesheet -- they produce no CSS output. Replacing them with the correct Tailwind equivalents makes the utility classes resolve to actual CSS rules.

## Prevention

1. **Reference this class mapping** when writing or reviewing Angular templates. The mapping table above covers the most common PrimeFlex → Tailwind translations.

2. **Remaining PrimeFlex color classes.** All layout-breaking PrimeFlex classes (`flex-column`, `justify-content-*`, `align-items-*`, `border-round`, `flex-grow-1`) have been removed across the entire codebase. The `text-color-secondary` utility class remains in ~20 HTML templates — this is cosmetic (text color), not layout-breaking. The Tailwind equivalent is `text-[--p-text-muted-color]` (already used in site-scraper templates as the pattern to follow).

3. **Update `apps/web/src/theme/README.md`** which actively recommends PrimeFlex classes (lines 97-106). This file should be updated to reference Tailwind CSS v4 utilities instead.

4. **Add a grep-based CI check** to flag known PrimeFlex-only class names in Angular templates:
   ```bash
   grep -rn 'flex-column\|flex-grow-1\|justify-content-\|align-items-\|border-round\|"col-[0-9]' apps/web/src --include='*.ts' --include='*.html'
   ```

5. **Visual regression testing** on form-heavy pages would catch layout breaks immediately, since the symptoms are dramatic.

## Related Issues

- `apps/web/src/theme/README.md` -- actively recommends PrimeFlex classes; needs refresh
- No existing GitHub issues or prior solution docs on this topic
