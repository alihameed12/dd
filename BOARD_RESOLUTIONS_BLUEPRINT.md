# Board Resolutions Database Blueprint (Legal Operations + UX)

## 1) Assumptions (No Questions Asked)

### Setup A — SQL Database + Web App
**Assumptions A1–A12**
1. Stack: PostgreSQL 15+ for data, web app in React (or equivalent), API layer in Node/Python/.NET.
2. Multi-entity corporate group with 10–500 legal entities across 1–25 jurisdictions.
3. A single group legal team supports local company secretaries and external counsel.
4. Users authenticate via SSO (Azure AD/Okta) and can be mapped to RBAC roles.
5. Resolution documents are stored in object storage (e.g., S3/SharePoint) with immutable hashes.
6. Digital signatures may come from DocuSign/Adobe Sign; signed file metadata is synced.
7. Filing data can be entered manually or imported from regulator portals.
8. All status changes must be auditable and attributable (user, timestamp, reason).
9. System must support draft versioning of resolution text and final executed copies.
10. Data residency and confidentiality rules vary by jurisdiction and are enforced by policy.
11. Reminder workflows (deadlines, missing approvals, pending signatures) run daily.
12. Reporting is needed for board packs, compliance evidence, and regulator/ auditor requests.

### Setup B — No-Code Base (Airtable / Notion / SharePoint Lists)
**Assumptions B1–B12**
1. Primary system is one no-code base with linked tables/lists and role-restricted views.
2. Data scale is moderate (up to ~100k rows across all tables).
3. Complex constraints (strict FK, triggers) are emulated with automations + validation formulas.
4. Versioning is done via “ResolutionVersions” table plus snapshots of key text fields.
5. Signatures and filings are captured by linked records and document URLs/files.
6. Audit trail relies on platform history + explicit AuditLog table entries via automations.
7. Advanced search/reporting uses filtered views, pivot dashboards, and exported BI extracts.
8. Record-level permissions are approximated via per-entity views and sensitivity flags.
9. SLA alerts are implemented with automations (email/Teams/Slack).
10. Attachments stored in platform files or linked DMS (SharePoint/Drive).
11. External integrations are low-code (Power Automate/Zapier/Make).
12. Governance requires admin controls for schema changes and locked formula fields.

---

## 2) Workflow + Status Lifecycle

### Canonical lifecycle
`Draft → Legal Review → Board Approved → Signed → Filed/Registered → Archived`

### Status transition authority matrix

| From Status | To Status | Who can move | Preconditions | Required evidence |
|---|---|---|---|---|
| Draft | Legal Review | Legal Counsel, Legal Director | Draft text exists; entity + meeting assigned | Draft version saved |
| Legal Review | Draft | Legal Counsel, Legal Director | Review comments need redraft | Review notes |
| Legal Review | Board Approved | Company Secretary, Legal Director | Meeting held, quorum met, vote recorded/passed | Attendance + vote records |
| Board Approved | Signed | Company Secretary, Legal Director | Approvals complete; final text frozen | Signature request initiated/completed |
| Signed | Filed/Registered | Company Secretary, Legal Counsel | Filing obligation identified | Filing submission reference |
| Filed/Registered | Archived | Legal Director, Admin (policy-based) | Retention and closure checks passed | Retention checkpoint + closure note |
| Any non-final | Archived (exception) | Legal Director only | Cancelled/superseded with reason | Exception reason + approval |

### SLA suggestions
- Draft → Legal Review: **2 business days**
- Legal Review → Board Approved: **by next board meeting date**
- Board Approved → Signed: **5 business days**
- Signed → Filed/Registered: **jurisdictional deadline (e.g., 7/15/30 days)**
- Filed/Registered → Archived: **after evidence complete + retention tagging**

---

## 3) Data Model

## 3.1 ER Overview (Core Entities + Relationships)
- **Entities** (legal entities) have many **Meetings** and many **Resolutions**.
- **Resolutions** belong to one **ResolutionType**, one **Entity**, optionally one **Meeting**.
- **People** are assigned **Roles** globally and/or per entity via **PersonRoleAssignments**.
- **Attendance** links People to Meetings with attendance/quorum attributes.
- **Votes** link People to Resolutions (or meeting agenda item) with vote outcome.
- **Approvals** capture workflow approvals per resolution and stage.
- **Signatures** capture signer events and signature artifacts.
- **FilingsRegisters** track statutory filing/registration duties and outcomes.
- **Documents** and **Attachments** store supporting files and version artifacts.
- **Tags** classify resolutions via many-to-many (**ResolutionTags**).
- **AuditLog** stores immutable event history across all objects.
- **ResolutionVersions** maintain text/version history independent of status.

## 3.2 Normalized Relational Schema (3NF-oriented)

| Table | PK | Key FKs | Purpose | Key Constraints / Indexes |
|---|---|---|---|---|
| entities | entity_id | parent_entity_id→entities | Legal entity master | UNIQUE(entity_code), UNIQUE(registration_number,jurisdiction_code), idx_entity_name |
| meetings | meeting_id | entity_id→entities | Board/shareholder meeting record | UNIQUE(entity_id,meeting_date,meeting_type), idx_meeting_date |
| resolution_types | resolution_type_id | — | Controlled taxonomy | UNIQUE(type_code), UNIQUE(type_name) |
| resolutions | resolution_id | entity_id→entities, meeting_id→meetings, resolution_type_id→resolution_types, current_version_id→resolution_versions | Main resolution record | UNIQUE(entity_id,resolution_number), idx_status, idx_deadline, idx_entity_status |
| resolution_versions | version_id | resolution_id→resolutions | Versioned text + redlines | UNIQUE(resolution_id,version_number), idx_version_created |
| people | person_id | — | Internal/external participants | UNIQUE(email), idx_person_name |
| roles | role_id | — | RBAC role catalog | UNIQUE(role_code) |
| person_role_assignments | assignment_id | person_id→people, role_id→roles, entity_id→entities(nullable) | Scoped role assignment | UNIQUE(person_id,role_id,entity_id), idx_role_scope |
| attendance | attendance_id | meeting_id→meetings, person_id→people | Quorum/attendance evidence | UNIQUE(meeting_id,person_id), idx_attendance_quorum |
| votes | vote_id | resolution_id→resolutions, person_id→people, meeting_id→meetings | Individual votes | UNIQUE(resolution_id,person_id), idx_vote_result |
| approvals | approval_id | resolution_id→resolutions, approver_id→people | Workflow approvals | UNIQUE(resolution_id,stage,approver_id), idx_approval_status_due |
| signatures | signature_id | resolution_id→resolutions, signer_id→people, document_id→documents | Signature trail | UNIQUE(resolution_id,signer_id,signature_sequence), idx_signature_status |
| filings_registers | filing_id | resolution_id→resolutions, entity_id→entities | Filing/register obligations | UNIQUE(resolution_id,register_name,jurisdiction_code), idx_filing_due_status |
| documents | document_id | resolution_id→resolutions(nullable), uploaded_by→people | File metadata + hash | UNIQUE(file_hash_sha256), idx_doc_type_created |
| attachments | attachment_id | resolution_id→resolutions, document_id→documents | Link supporting docs | UNIQUE(resolution_id,document_id,attachment_role) |
| tags | tag_id | — | Tag catalog | UNIQUE(tag_name) |
| resolution_tags | resolution_tag_id | resolution_id→resolutions, tag_id→tags | M:N resolution tagging | UNIQUE(resolution_id,tag_id) |
| audit_log | audit_id | actor_person_id→people | Immutable audit events | idx_audit_object, idx_audit_time, idx_audit_actor |

**Note:** In SQL implementation, enforce `ON UPDATE RESTRICT` and conservative `ON DELETE RESTRICT` for compliance integrity. Use soft-delete flags instead of hard delete for business records.

---

## 4) Data Dictionary (Implementable)

## 4.1 entities

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| entity_id | UUID | Required | PK, generated | `5f2e...` |
| parent_entity_id | UUID | Optional | FK to entities.entity_id | `null` |
| entity_code | VARCHAR(30) | Required | Uppercase unique code | `UK-HOLDCO` |
| legal_name | VARCHAR(255) | Required | Non-empty | `Example Holdings Ltd` |
| jurisdiction_code | CHAR(2) | Required | ISO country code | `GB` |
| registration_number | VARCHAR(60) | Required | Unique per jurisdiction | `12345678` |
| entity_type | VARCHAR(50) | Required | Enum: LTD/PLC/LLC/etc. | `LTD` |
| incorporation_date | DATE | Optional | Must be <= current date | `2019-03-21` |
| status | VARCHAR(20) | Required | Enum: ACTIVE/DORMANT/LIQUIDATED | `ACTIVE` |
| confidentiality_level | SMALLINT | Required | 1–4 | `2` |
| created_at | TIMESTAMPTZ | Required | default now() | `2026-02-01T09:00Z` |
| created_by | UUID | Required | FK people.person_id | `a12b...` |

## 4.2 meetings

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| meeting_id | UUID | Required | PK | `7c1d...` |
| entity_id | UUID | Required | FK entities | `5f2e...` |
| meeting_type | VARCHAR(30) | Required | Enum: BOARD/SHAREHOLDER/COMMITTEE | `BOARD` |
| meeting_date | DATE | Required | Valid date | `2026-03-20` |
| meeting_time | TIME | Optional | 24-hour | `14:00:00` |
| timezone | VARCHAR(50) | Required | IANA timezone | `Europe/London` |
| location | VARCHAR(255) | Optional | Physical or virtual | `MS Teams` |
| quorum_required | INTEGER | Required | >=1 | `2` |
| quorum_achieved | BOOLEAN | Required | Derived from attendance | `true` |
| minutes_document_id | UUID | Optional | FK documents | `9a88...` |
| created_at | TIMESTAMPTZ | Required | default now() | `2026-03-01T10:00Z` |

## 4.3 resolution_types

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| resolution_type_id | UUID | Required | PK | `2b3c...` |
| type_code | VARCHAR(30) | Required | Unique uppercase | `APPOINT_DIR` |
| type_name | VARCHAR(120) | Required | Unique | `Director Appointment` |
| description | TEXT | Optional | Free text | `Appointment of new board member.` |
| filing_required_default | BOOLEAN | Required | default false | `true` |
| default_deadline_days | INTEGER | Optional | >=0 | `14` |

## 4.4 resolutions

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| resolution_id | UUID | Required | PK | `aa11...` |
| entity_id | UUID | Required | FK entities | `5f2e...` |
| meeting_id | UUID | Optional | FK meetings | `7c1d...` |
| resolution_type_id | UUID | Required | FK resolution_types | `2b3c...` |
| resolution_number | VARCHAR(50) | Required | Unique per entity | `2026-UK-015` |
| title | VARCHAR(255) | Required | Non-empty | `Approval of FY2026 Budget` |
| summary | TEXT | Optional | <=4000 chars | `Board approves annual budget.` |
| status | VARCHAR(30) | Required | Enum lifecycle states | `Legal Review` |
| current_version_id | UUID | Optional | FK resolution_versions | `vv01...` |
| effective_date | DATE | Optional | >= meeting_date if tied | `2026-03-20` |
| filing_due_date | DATE | Optional | >= signed_date | `2026-04-03` |
| archived_at | TIMESTAMPTZ | Optional | Set when archived | `null` |
| confidentiality_level | SMALLINT | Required | 1–4 | `3` |
| created_at | TIMESTAMPTZ | Required | default now() | `2026-03-05T11:00Z` |
| created_by | UUID | Required | FK people | `a12b...` |

## 4.5 resolution_versions

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| version_id | UUID | Required | PK | `vv01...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| version_number | INTEGER | Required | >=1, unique per resolution | `3` |
| text_markdown | TEXT | Required | Canonical drafting text | `Resolved that...` |
| redline_from_version_id | UUID | Optional | FK self | `vv00...` |
| change_summary | TEXT | Optional | Brief description | `Added filing clause.` |
| is_final | BOOLEAN | Required | true only when locked for signing | `false` |
| created_at | TIMESTAMPTZ | Required | default now() | `2026-03-08T09:30Z` |
| created_by | UUID | Required | FK people | `b34c...` |

## 4.6 people

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| person_id | UUID | Required | PK | `a12b...` |
| first_name | VARCHAR(80) | Required | Non-empty | `Maya` |
| last_name | VARCHAR(80) | Required | Non-empty | `Patel` |
| email | VARCHAR(255) | Required | Unique, valid email | `maya.patel@corp.com` |
| person_type | VARCHAR(20) | Required | INTERNAL/EXTERNAL | `INTERNAL` |
| title | VARCHAR(120) | Optional | Job title | `Legal Director` |
| active | BOOLEAN | Required | default true | `true` |

## 4.7 roles

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| role_id | UUID | Required | PK | `r001...` |
| role_code | VARCHAR(40) | Required | Unique | `LEGAL_DIRECTOR` |
| role_name | VARCHAR(120) | Required | Human-readable | `Legal Director` |
| description | TEXT | Optional | Role scope details | `Final approver for legal workflow.` |

## 4.8 person_role_assignments

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| assignment_id | UUID | Required | PK | `as01...` |
| person_id | UUID | Required | FK people | `a12b...` |
| role_id | UUID | Required | FK roles | `r001...` |
| entity_id | UUID | Optional | Null = global role | `5f2e...` |
| valid_from | DATE | Required | <= valid_to | `2026-01-01` |
| valid_to | DATE | Optional | >= valid_from | `null` |
| granted_by | UUID | Required | FK people | `c56d...` |

## 4.9 attendance

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| attendance_id | UUID | Required | PK | `at01...` |
| meeting_id | UUID | Required | FK meetings | `7c1d...` |
| person_id | UUID | Required | FK people | `a12b...` |
| attendance_status | VARCHAR(20) | Required | PRESENT/ABSENT/APOLOGY | `PRESENT` |
| attended_remotely | BOOLEAN | Required | default false | `true` |
| is_voting_member | BOOLEAN | Required | default true | `true` |
| notes | TEXT | Optional | Attendance notes | `Joined 10 mins late.` |

## 4.10 votes

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| vote_id | UUID | Required | PK | `v001...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| meeting_id | UUID | Optional | FK meetings | `7c1d...` |
| person_id | UUID | Required | FK people | `a12b...` |
| vote_value | VARCHAR(20) | Required | FOR/AGAINST/ABSTAIN | `FOR` |
| voted_at | TIMESTAMPTZ | Required | timestamp | `2026-03-20T14:30Z` |
| comments | TEXT | Optional | Optional rationale | `No concerns.` |

## 4.11 approvals

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| approval_id | UUID | Required | PK | `ap01...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| stage | VARCHAR(30) | Required | DRAFT_REVIEW/LEGAL_REVIEW/FINAL_RELEASE | `LEGAL_REVIEW` |
| approver_id | UUID | Required | FK people | `a12b...` |
| approval_status | VARCHAR(20) | Required | PENDING/APPROVED/REJECTED | `APPROVED` |
| decision_at | TIMESTAMPTZ | Optional | set if decided | `2026-03-09T16:00Z` |
| due_at | TIMESTAMPTZ | Optional | SLA due timestamp | `2026-03-10T17:00Z` |
| comments | TEXT | Optional | Decision note | `Approved with minor edits.` |

## 4.12 signatures

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| signature_id | UUID | Required | PK | `sg01...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| signer_id | UUID | Required | FK people | `d77e...` |
| document_id | UUID | Required | FK documents | `9a88...` |
| signature_sequence | INTEGER | Required | >=1 | `1` |
| signature_status | VARCHAR(20) | Required | REQUESTED/SIGNED/DECLINED | `SIGNED` |
| signature_provider | VARCHAR(50) | Optional | DocuSign etc. | `DocuSign` |
| signed_at | TIMESTAMPTZ | Optional | set when signed | `2026-03-22T13:20Z` |
| envelope_id | VARCHAR(120) | Optional | provider ref | `env_12345` |

## 4.13 filings_registers

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| filing_id | UUID | Required | PK | `fl01...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| entity_id | UUID | Required | FK entities | `5f2e...` |
| jurisdiction_code | CHAR(2) | Required | ISO code | `GB` |
| register_name | VARCHAR(120) | Required | e.g., Companies House | `Companies House` |
| filing_type | VARCHAR(80) | Required | e.g., AP01/SH01 | `AP01` |
| due_date | DATE | Required | Must be set | `2026-04-05` |
| filed_date | DATE | Optional | <= today | `2026-04-01` |
| filing_status | VARCHAR(20) | Required | NOT_REQUIRED/PENDING/FILED/REJECTED | `FILED` |
| submission_reference | VARCHAR(120) | Optional | External reference | `CH-2026-9988` |
| evidence_document_id | UUID | Optional | FK documents | `e991...` |

## 4.14 documents

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| document_id | UUID | Required | PK | `9a88...` |
| resolution_id | UUID | Optional | FK resolutions | `aa11...` |
| document_type | VARCHAR(40) | Required | DRAFT/MINUTES/SIGNED_COPY/FILING_RECEIPT | `SIGNED_COPY` |
| file_name | VARCHAR(255) | Required | Non-empty | `resolution_2026_015_signed.pdf` |
| file_uri | TEXT | Required | Valid URL/path | `s3://legal-docs/...` |
| file_hash_sha256 | CHAR(64) | Required | Unique hash | `4f2a...` |
| mime_type | VARCHAR(100) | Required | Valid MIME | `application/pdf` |
| uploaded_by | UUID | Required | FK people | `a12b...` |
| uploaded_at | TIMESTAMPTZ | Required | default now() | `2026-03-22T13:21Z` |

## 4.15 attachments

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| attachment_id | UUID | Required | PK | `att1...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| document_id | UUID | Required | FK documents | `9a88...` |
| attachment_role | VARCHAR(40) | Required | SUPPORTING/PACK/MINUTES/EXECUTED | `SUPPORTING` |
| sort_order | INTEGER | Required | >=1 | `1` |

## 4.16 tags

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| tag_id | UUID | Required | PK | `tg01...` |
| tag_name | VARCHAR(80) | Required | Unique case-insensitive | `Capital Raise` |
| tag_color | VARCHAR(7) | Optional | Hex color | `#60A5FA` |

## 4.17 resolution_tags

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| resolution_tag_id | UUID | Required | PK | `rt01...` |
| resolution_id | UUID | Required | FK resolutions | `aa11...` |
| tag_id | UUID | Required | FK tags | `tg01...` |
| created_at | TIMESTAMPTZ | Required | default now() | `2026-03-07T12:00Z` |

## 4.18 audit_log

| Field | Type | Req? | Validation / Rule | Example |
|---|---|---|---|---|
| audit_id | BIGSERIAL | Required | PK, append-only | `102399` |
| event_time | TIMESTAMPTZ | Required | default now() | `2026-03-09T16:00Z` |
| actor_person_id | UUID | Optional | FK people | `a12b...` |
| actor_role_code | VARCHAR(40) | Optional | Snapshot of role | `LEGAL_DIRECTOR` |
| action | VARCHAR(60) | Required | CREATE/UPDATE/STATUS_CHANGE/EXPORT | `STATUS_CHANGE` |
| object_type | VARCHAR(40) | Required | RESOLUTION/MEETING/... | `RESOLUTION` |
| object_id | UUID | Required | Target record ID | `aa11...` |
| before_state_json | JSONB | Optional | Previous values | `{...}` |
| after_state_json | JSONB | Optional | New values | `{...}` |
| ip_address | INET | Optional | Source IP | `10.20.30.40` |
| user_agent | TEXT | Optional | Client metadata | `Mozilla/5.0 ...` |
| reason_code | VARCHAR(40) | Optional | Override reason etc. | `EXCEPTION_ARCHIVE` |

---

## 5) Governance Controls

### 5.1 RBAC Matrix (minimum)

| Role | Core permissions |
|---|---|
| Legal Director | Full CRUD on resolutions, final status overrides, archive authority, policy admin, all reports |
| Legal Counsel | Create/edit drafts, legal review actions, propose approvals, manage filings, upload evidence |
| Company Secretary | Meeting setup, attendance/vote capture, board approval transition, signature execution, filings |
| Admin | User/role management, taxonomy setup, technical config, no legal text edits by policy (optional) |
| Read-only | View permitted entities/resolutions, export permitted reports, no edits |

### 5.2 Confidentiality levels
- **Level 1 (Internal):** Broad legal/finance access.
- **Level 2 (Restricted):** Legal + entity leadership.
- **Level 3 (Highly Restricted):** Named individuals only (deal-sensitive).
- **Level 4 (Privileged/Secret):** Legal Director + explicitly assigned counsel.

Enforcement rules:
1. Row-level access predicate: `user_clearance >= resolution.confidentiality_level`.
2. Attachment inherits max(confidentiality of linked resolution, document override).
3. Exports watermark with user, timestamp, and confidentiality banner.

### 5.3 Audit trail mandatory fields
- `created_at`, `created_by`, `updated_at`, `updated_by` on all mutable tables.
- Immutable `audit_log` append entries for:
  - Status changes
  - Approval decisions
  - Signature status updates
  - Filing status updates
  - Export/download of high-confidentiality items

### 5.4 Retention rules (policy example)
- Resolution records + executed documents: **7 years minimum** after archive, or longer by jurisdiction.
- Audit logs: **10 years** immutable retention.
- Draft versions: keep all versions; never hard delete (mark superseded).
- Litigation hold flag blocks archival purge workflows.

### 5.5 Versioning for resolution text
- Every text change creates `resolution_versions` row.
- `resolutions.current_version_id` always points to latest working version.
- Before moving to **Signed**, enforce `is_final=true` on selected version and lock editing.
- Any post-sign amendment creates a new resolution linked by tag `Amendment` or reference field (optional extension).

---

## 6) Sample Content

### 6.1 Five realistic example resolutions

| Resolution # | Title | Entity | Type | Meeting Date | Status | Filing Due | Confidentiality |
|---|---|---|---|---|---|---|---|
| 2026-UK-001 | Appointment of Non-Executive Director (A. Khan) | Example Holdings Ltd (GB) | Director Appointment | 2026-01-14 | Filed/Registered | 2026-01-28 | 2 |
| 2026-FR-004 | Approval of Intercompany Loan Agreement | Example France SAS (FR) | Financing | 2026-02-03 | Signed | 2026-02-18 | 3 |
| 2026-US-009 | Adoption of 2026 Equity Incentive Plan | Example Inc. (US-DE) | Equity / Compensation | 2026-02-20 | Board Approved | 2026-03-15 | 4 |
| 2026-SG-003 | Opening of New Corporate Bank Account | Example Pte. Ltd. (SG) | Banking Authority | 2026-03-02 | Legal Review | 2026-03-16 | 2 |
| 2026-UK-015 | Approval of FY2026 Group Budget | Example Holdings Ltd (GB) | Budget / Finance | 2026-03-20 | Draft | N/A | 1 |

### 6.2 Ten example Legal Director search queries
1. “Show all resolutions in **Legal Review** older than 5 business days.”
2. “List filings due in the next 14 days by jurisdiction.”
3. “Find all **director appointment** resolutions filed late in the last 12 months.”
4. “Show resolutions where quorum was not achieved but status progressed beyond Legal Review.”
5. “Which entity has the most pending signatures this quarter?”
6. “All Level 4 confidentiality resolutions involving M&A tags.”
7. “Resolutions approved by board but missing signed copy attachment.”
8. “Average cycle time by resolution type (Draft to Filed/Registered).”
9. “All records changed by user X in the last 30 days (audit trail).”
10. “Export complete evidence pack for resolution 2026-UK-001 (text versions, votes, signatures, filing receipt).”

---

## 7) UI/UX Specification (Densely Visualized, Light-Blue Theme)

## 7.1 Design tokens (light-blue + accessibility)

| Token | Value | Usage |
|---|---|---|
| `--color-primary-500` | `#4F9CF9` | Primary actions, selected states |
| `--color-primary-100` | `#EAF4FF` | Card backgrounds, filters, subtle highlights |
| `--color-accent-400` | `#38BDF8` | Chart accents, links, tags |
| `--color-neutral-900` | `#0F172A` | Main text |
| `--color-neutral-600` | `#475569` | Secondary text, labels |
| `--color-success-500` | `#22C55E` | Filed/completed states |
| `--color-warning-500` | `#F59E0B` | Upcoming deadlines / SLA risk |

**Contrast guidance**
- Body text contrast target: **WCAG AA 4.5:1** minimum.
- Avoid white text on `primary-100`; use `neutral-900`.
- Status pills: pair colored border + icon + text label (not color-only encoding).

## 7.2 Information architecture / key views

### A) Resolution Library
- Dense table with sticky columns: Resolution #, Entity, Type, Status, Due Date, Owner, Confidentiality, Last Action.
- Left filter rail: entity tree, jurisdiction, status, type, confidentiality, tags.
- Top command bar: quick search, saved views, export evidence pack.
- Row expander preview: latest version summary + pending tasks.

### B) Entity Matrix
- Grid: rows = entities, columns = statuses (Draft→Archived), cell = count with heat intensity.
- Toggle by quarter/year.
- Click cell to open filtered library list.

### C) Meeting Calendar
- Month/week views with color-coded meeting types.
- Side panel lists “Resolutions linked to selected meeting.”
- Quorum risk badge if expected attendance < threshold.

### D) Kanban by Status
- Columns mirror lifecycle states.
- Cards show: resolution #, entity code, type icon, due-date chip, blockers count.
- WIP limit indicators for Legal Review and Signed.
- Drag-drop restricted by RBAC + precondition checks (with inline errors).

### E) Filing/Deadline Tracker
- Timeline/Gantt-like list of statutory due dates.
- Highlight overdue (red), due soon (amber), on track (blue/green).
- Batch actions: assign filing owner, send reminder, mark filed with reference.

### F) Executive Dashboard (densely visualized)
1. **KPI strip:** total active resolutions, overdue filings, avg cycle time, pending approvals.
2. **Stacked bar:** status distribution by entity.
3. **Donut chart:** resolution type mix.
4. **Line chart:** monthly throughput (created vs filed vs archived).
5. **Heatmap:** bottlenecks by stage vs entity.
6. **Table widget:** top 20 deadlines next 30 days.
7. **Exception panel:** high-confidentiality items with overdue tasks.

### 7.3 Interaction & usability details
- Global quick-search supports `resolution_number`, title, people, tags, filing refs.
- Keyboard shortcuts: `N` new resolution, `G` go to entity, `/` search.
- Bulk operations for tagging, assignment, reminder sending.
- Evidence Pack generator compiles: final text, approvals, attendance/votes, signatures, filings, audit extract.

---

## 8) Implementation Checklist

### Setup A — SQL + Web App

- [ ] Create PostgreSQL schema and migration scripts for all tables above.
- [ ] Add enums/check constraints for lifecycle and status fields.
- [ ] Implement row-level security for confidentiality and entity scope.
- [ ] Build RBAC service and role-assignment admin UI.
- [ ] Implement workflow engine with transition validation + SLA timers.
- [ ] Integrate e-sign provider webhooks into `signatures` updates.
- [ ] Integrate filing tracker and reminder scheduler.
- [ ] Build dashboard queries/materialized views for performance.
- [ ] Implement full-text search on title/summary/version text.
- [ ] Enable immutable audit logging and export/download event capture.
- [ ] Build Evidence Pack export (PDF/ZIP) with watermarking.
- [ ] Configure retention jobs + litigation hold overrides.

### Setup B — Airtable / Notion / SharePoint Lists

- [ ] Create linked tables/lists mirroring schema (including junction tables).
- [ ] Add required fields, validation formulas, and unique-key guard formulas.
- [ ] Build controlled vocab tables for statuses, resolution types, roles, confidentiality.
- [ ] Configure automation for lifecycle transitions and permission checks.
- [ ] Add “ResolutionVersions” table and lock final version on Signed state.
- [ ] Implement reminder automations for approvals/signatures/filings.
- [ ] Create filtered views by role (Legal Director, Counsel, CoSec, Read-only).
- [ ] Build dashboard pages: status Kanban, deadline tracker, entity matrix.
- [ ] Capture audit entries via automation on create/update/status changes.
- [ ] Configure attachment/document conventions + hash/reference fields.
- [ ] Create export templates for compliance evidence packs.
- [ ] Establish admin governance: schema lock, change control, backup policy.

