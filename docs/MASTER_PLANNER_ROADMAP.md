# Master Planner — roadmap and architecture

Baseline repository: `olshannikovd-cpu/master-planner`  
Upstream: `super-productivity/super-productivity`  
Baseline branch: `master`  
Baseline commit: `a1743173e923492bc15e9e1b3d96d92e8d2c8b94`  
Baseline app version: `19.1.0`

## 1. Goal

Build a Windows 11 personal planner for a self-employed tradesperson on top of Super Productivity.

Primary navigation target:

- Today
- Tomorrow
- Week
- Month
- Year
- Customers
- Work Sites
- Work Orders
- Projects
- All Tasks
- Completed
- Settings

The product should remain local-first and work offline. Existing Super Productivity task, reminder, repeat, planner, backup, import/export, and sync mechanisms should be preserved unless there is a proven reason to replace them.

## 2. Baseline findings

The fork already contains the core systems needed for the planner:

- Angular + TypeScript frontend
- NgRx state
- Electron desktop shell
- Windows packaging through `electron-builder`
- `npm run dist:win`
- planner with drag and drop
- task scheduling through `dueDay` / `dueWithTime`
- repeating tasks
- reminders
- backup / restore
- import / export
- operation-log persistence
- sync
- plugin API and plugin-synced persistence
- local REST API

Important existing files:

- Routes: `src/app/app.routes.ts`
- Sidebar configuration: `src/app/core-ui/magic-side-nav/magic-nav-config.service.ts`
- Tasks: `src/app/features/tasks/`
- Task model: `src/app/features/tasks/task.model.ts`
- Planner: `src/app/features/planner/`
- Planner state: `src/app/features/planner/store/`
- NgRx root state: `src/app/root-store/root-state.ts`
- Feature-store registration: `src/app/root-store/feature-stores.module.ts`
- Persistence model config: `src/app/op-log/model/model-config.ts`
- Entity registry: `src/app/op-log/core/entity-registry.ts`
- Backup snapshot: `src/app/op-log/backup/state-snapshot.service.ts`
- Shared entity types: `packages/shared-schema/src/entity-types.ts`
- Schema version: `packages/shared-schema/src/schema-version.ts`
- Plugin persistence: `src/app/plugins/plugin-user-persistence.service.ts`
- Windows build config: `electron-builder.yaml`

## 3. Critical sync decision for v1

Do NOT add `CUSTOMER`, `WORK_SITE`, `WORK_ORDER`, `PAYMENT`, or `MATERIAL` to the shared sync `ENTITY_TYPES` in v1.

Reason:

`packages/super-sync-server/src/sync/services/validation.service.ts` validates incoming operation entity types against `ENTITY_TYPES` from `@sp/shared-schema` and rejects unknown entity types.

Adding custom entity types to the fork would therefore require a compatible forked SuperSync server. It would reduce compatibility with existing Super Productivity sync infrastructure.

For v1, use the existing `PLUGIN_USER_DATA` persistence channel as a compatibility layer for Master Planner CRM data.

Benefits:

- already persisted
- already included in backup snapshots
- already included in sync
- already accepted by the existing SuperSync protocol
- gzip-compressed
- keyed data supported
- no schema-version bump required
- no custom server required

This is a deliberate v1 architecture choice, not a permanent commitment.

## 4. Native CRM UI, existing synced storage

The CRM screens should be native Angular components in the fork, not an iframe plugin.

Create a native service layer such as:

`src/app/features/master-planner-data/`

This layer may use the existing `PluginUserPersistenceService` internally with a reserved namespace:

`master-planner-crm`

Recommended key layout:

- `master-planner-crm:customer:<id>`
- `master-planner-crm:site:<id>`
- `master-planner-crm:order:<id>`
- `master-planner-crm:payment:<id>`
- `master-planner-crm:material:<id>`
- `master-planner-crm:settings`

Each individual record must stay below the existing plugin persistence limit.

Do not put the complete CRM database in one JSON blob.

## 5. Domain model

Use discriminated records and foreign keys. Avoid duplicating child-id arrays when they can be derived.

### Customer

Fields:

- `id`
- `recordType: 'customer'`
- `name`
- `phone`
- optional `phone2`
- optional `email`
- optional `notes`
- `createdAt`
- `updatedAt`
- optional `archivedAt`

### WorkSite

Fields:

- `id`
- `recordType: 'site'`
- `customerId`
- `name`
- `address`
- optional `notes`
- `createdAt`
- `updatedAt`
- optional `archivedAt`

### WorkOrder

Fields:

- `id`
- `recordType: 'order'`
- `customerId`
- optional `workSiteId`
- `title`
- optional `description`
- `status`
- optional `scheduledDay`
- optional `scheduledStart`
- optional `scheduledEnd`
- optional `workPrice`
- `taskIds`
- optional `notes`
- `createdAt`
- `updatedAt`
- optional `completedAt`
- optional `archivedAt`

Initial statuses:

- `planned`
- `in_progress`
- `waiting`
- `completed`
- `cancelled`

### Payment

Fields:

- `id`
- `recordType: 'payment'`
- `workOrderId`
- `amount`
- `date`
- optional `method`
- optional `notes`
- `createdAt`
- `updatedAt`

Do not persist a calculated balance. Calculate balance from work-order price and payments.

### Material

Fields:

- `id`
- `recordType: 'material'`
- `workOrderId`
- `name`
- `quantity`
- optional `unit`
- `unitPrice`
- optional `notes`
- `createdAt`
- `updatedAt`

Calculate total material cost from quantity × unitPrice.

## 6. Task linkage

For v1, do NOT add a required CRM field to the core `Task` model.

Store task links in `WorkOrder.taskIds`.

This avoids changing the synced task schema and avoids compatibility risk with older clients.

Later, if a reverse task → work-order reference becomes necessary, it may be added as an optional field only after compatibility review.

## 7. Planner strategy

Reuse the existing planner engine rather than replacing it.

Existing useful pieces:

- `PlannerService.days$`
- `PlannerService.tomorrow$`
- `PlannerService.getDayOnce$(dayStr)`
- `PlannerDay`
- planner drag/drop actions
- `dueDay`
- `dueWithTime`
- repeat projections
- calendar integration

New routes/views should compose this existing planner data with WorkOrder appointments.

Planned routes:

- `/today`
- `/tomorrow`
- `/week`
- `/month`
- `/year`
- `/customers`
- `/customers/:id`
- `/sites`
- `/sites/:id`
- `/work-orders`
- `/work-orders/:id`

Do not remove `/planner` yet.

## 8. Today / Tomorrow

Create a unified day page that can show:

- scheduled tasks
- unscheduled tasks planned for the day
- deadlines
- work orders / appointments
- overdue items

Today and Tomorrow should share one component with a date parameter where practical.

## 9. Week

Week view:

- 7 day columns
- task and work-order cards
- drag/drop between days
- visible day workload
- quick-add

Reuse existing CDK drag/drop patterns from `planner-day.component.ts`.

## 10. Month

Month view:

- standard calendar grid
- compact task/work-order indicators
- click day to open day details
- drag work orders/tasks between dates where safe
- no attempt to render every task detail inside the month cell

## 11. Year

Year view:

- 12 compact months
- show counts / important appointments / deadlines
- click month to open Month view
- keep the view lightweight

## 12. Customers / sites / work orders

Customer detail:

- contact details
- sites
- active work orders
- completed work orders
- payment summary

Work-site detail:

- address
- customer
- work-order history
- notes

Work-order detail:

- customer
- site
- date/time
- status
- linked tasks
- materials
- payments
- work price
- paid amount
- remaining balance
- notes

## 13. Financial calculations

Do not store values that can be derived reliably.

Derived values:

- materials total = sum(quantity × unitPrice)
- paid = sum(payments)
- remaining = workPrice - paid
- monthly revenue = sum(payments in month)
- unpaid work = positive remaining balances on eligible orders

Keep financial logic in pure utility functions with unit tests.

## 14. Navigation

The existing sidebar is controlled primarily by:

`src/app/core-ui/magic-side-nav/magic-nav-config.service.ts`

Do not delete original features first.

Initial change strategy:

1. add Master Planner routes
2. add Master Planner sidebar items
3. keep Projects
4. keep Settings
5. hide developer/office-oriented entries later through configuration or fork-specific navigation rules
6. do not physically delete Jira/GitHub/GitLab/etc. integrations until the fork is stable

## 15. Branding

Branding is a later isolated phase.

Current Windows packaging identifiers are in `electron-builder.yaml`, including:

- `appId`
- `productName`
- NSIS `artifactName`
- AppX metadata

Do not change these before the baseline Windows build has been successfully produced.

When rebranding, review user-data path, protocol handlers, app identifiers, update metadata, and installer behavior before changing identifiers.

## 16. Windows baseline

Current Windows build command:

```bash
npm run dist:win
```

Current output directory from `electron-builder.yaml`:

`.tmp/app-builds`

The build currently produces NSIS and portable Windows targets.

Before branding or deep code changes, confirm a baseline Windows build.

## 17. Development order

### Phase 0 — baseline

- keep `master` clean
- create `master-planner-dev`
- record baseline commit
- install dependencies
- run app
- run baseline checks
- build Windows package

### Phase 1 — shell/navigation

- add Master Planner routes
- add Today/Tomorrow/Week/Month/Year
- add Customers/Sites/Work Orders menu entries
- keep original functionality accessible

### Phase 2 — CRM persistence layer

- native `MasterPlannerDataService`
- namespaced `PLUGIN_USER_DATA`
- typed record codecs
- CRUD
- unit tests
- backup/sync verification

### Phase 3 — Customers and Work Sites

- lists
- detail pages
- create/edit/archive
- search

### Phase 4 — Work Orders

- order CRUD
- task linking
- statuses
- scheduling
- Today integration

### Phase 5 — Payments and Materials

- CRUD
- calculations
- order totals
- monthly summaries

### Phase 6 — calendar views

- Week
- Month
- Year
- drag/drop
- task + order unified rendering

### Phase 7 — UX simplification

- hide unneeded enterprise/developer-oriented UI
- set Russian-first UX
- simplify settings
- Windows 11 visual polish

### Phase 8 — branding

- product name
- app ID
- installer
- icons
- About
- protocol handling review

### Phase 9 — AI / voice / external calendar

Only after the stable local-first product exists:

- natural-language task creation
- voice input
- Google Calendar
- Outlook
- AI planning assistant

## 18. Rules for changes

Follow the repository's `AGENTS.md`.

Especially:

- run `npm run checkFile <filepath>` on modified .ts and .scss
- do not mutate NgRx state
- use standalone components for new code
- do not add new root dependencies without a strong reason
- do not touch sync internals without a reproducible need
- new persisted fields must be optional unless a migration is proven safe
- do not bump schema version by default
- preserve offline-first behavior
- do not add analytics or telemetry

## 19. First implementation boundary

The first product-code PR must NOT implement the full CRM.

It should only:

- add routes/shell for Master Planner
- add navigation entries
- add placeholder pages for Today/Tomorrow/Week/Month/Year/Customers/Sites/Work Orders
- keep all existing core behavior working
- add no new sync entity type
- add no schema bump
- add no new dependency

Only after that PR is stable should the CRM persistence service be implemented.
