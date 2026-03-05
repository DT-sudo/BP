# ShiftSync — Technical Documentation

> Last updated: 2026-03-01  
> Stack: Python 3.11, Django 4.x, Vanilla JS, SQLite / PostgreSQL

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Technology Stack](#3-technology-stack)
4. [Data Model](#4-data-model)
5. [Backend — File-by-File](#5-backend--file-by-file)
6. [Frontend — File-by-File](#6-frontend--file-by-file)
7. [URL Routing](#7-url-routing)
8. [Request Lifecycle](#8-request-lifecycle)
9. [Security Mechanisms](#9-security-mechanisms)
10. [Inter-File Dependency Map](#10-inter-file-dependency-map)

---

## 1. Project Overview

ShiftSync is a shift-scheduling web application with two user roles:

| Role | Capabilities |
|---|---|
| **Manager** | Create/edit/delete shifts, publish drafts, assign employees, manage team & positions |
| **Employee** | View own published shifts (month calendar), mark unavailability days |

The application uses **server-side rendering** (Django templates) with **selective client-side interactivity** (Vanilla JS) for the calendar and CRUD modals. There is no SPA framework, no REST API, no npm build step.

---

## 2. Repository Structure

```
BP_proj/
├── backend/                        ← Django project root
│   ├── manage.py
│   ├── db.sqlite3                  ← SQLite database (dev default)
│   ├── shiftflow/                  ← Django configuration module
│   │   ├── settings.py
│   │   ├── urls.py                 ← Root URL dispatcher
│   │   ├── wsgi.py
│   │   └── asgi.py
│   └── apps/                       ← Application packages
│       ├── accounts/               ← Users, auth, employee management
│       │   ├── models.py
│       │   ├── views.py
│       │   ├── forms.py
│       │   ├── urls.py
│       │   ├── decorators.py
│       │   ├── context_processors.py
│       │   ├── admin.py
│       │   └── migrations/
│       └── scheduling/             ← Shifts, positions, unavailability
│           ├── models.py
│           ├── services.py
│           ├── forms.py
│           ├── urls.py
│           ├── admin.py
│           ├── migrations/
│           └── views/
│               ├── __init__.py     ← Re-exports all public views
│               ├── helpers.py      ← Shared private utilities
│               ├── manager_shifts.py
│               ├── manager_resources.py
│               └── employee.py
└── frontend/
    ├── static/
    │   ├── css/
    │   │   └── styles.css          ← Single stylesheet (CSS variables)
    │   └── js/
    │       ├── app.js              ← Global utilities (IIFE)
    │       ├── calendar-utils.js   ← Date/navigation utilities (IIFE)
    │       ├── employee-shifts.js
    │       ├── employee-unavailability.js
    │       ├── manager-employees.js
    │       └── manager-shifts/     ← Modular JS for shift calendar
    │           ├── index.js        ← Entry point / orchestrator
    │           ├── config.js
    │           ├── calendar.js
    │           ├── lane-layout.js
    │           ├── time-utils.js
    │           ├── position-palette.js
    │           ├── filters.js
    │           ├── employee-picker.js
    │           ├── sidebar.js
    │           ├── shift-modal.js
    │           └── layout.js
    └── templates/
        ├── auth/
        │   └── login.html
        ├── manager/
        │   ├── manager-shifts.html
        │   └── manager-employees.html
        ├── employee/
        │   ├── employee-shifts.html
        │   └── employee-unavailability.html
        └── partials/               ← Reusable template fragments
            ├── head.html
            ├── header.html
            ├── scripts.html        ← Conditional JS loader
            ├── calendar_nav.html
            ├── employee_calendar_toolbar.html
            ├── shift_form_fields.html
            ├── confirm_modal.html
            ├── toast_messages.html
            ├── icons/              ← SVG icon partials
            └── options/
                └── positions.html
```

---

## 3. Technology Stack

### 3.1 Framework-level (built into Django)

| Mechanism | Django feature used |
|---|---|
| ORM / DB abstraction | `django.db.models` |
| URL routing | `django.urls.path`, `include` |
| Template rendering | `django.template` (DTL) |
| Form validation | `django.forms.ModelForm` |
| Authentication | `django.contrib.auth` (`AbstractUser`, `login`, `logout`) |
| Session management | `django.contrib.sessions` (server-side, cookie-based session ID) |
| CSRF protection | `CsrfViewMiddleware` + `{% csrf_token %}` |
| Flash messages | `django.contrib.messages` |
| Admin interface | `django.contrib.admin` |
| Static files | `django.contrib.staticfiles` |
| Password hashing | PBKDF2 (default Django hasher) |
| Password validators | 4 built-in validators in `AUTH_PASSWORD_VALIDATORS` |
| HTTP method restriction | `@require_http_methods` decorator |
| Safe redirect validation | `url_has_allowed_host_and_scheme` |
| XFrame protection | `XFrameOptionsMiddleware` |
| JSON serialization | `DjangoJSONEncoder` (handles `date`, `datetime`) |
| Atomic transactions | `django.db.transaction.atomic` |
| DB constraints | `UniqueConstraint`, `PROTECT`, `CASCADE` on ForeignKey |
| Context processors | `django.template.context_processors.*` |

### 3.2 Implemented at application level (custom)

| Mechanism | Where | Description |
|---|---|---|
| Role-based access control | `accounts/decorators.py` | `@manager_required`, `@employee_required` — check auth + role, redirect otherwise |
| Custom user model | `accounts/models.py` | Extends `AbstractUser` with `role`, `employee_id`, `phone`, `position` |
| Cryptographic temp password | `accounts/models.py` | `User.generate_temporary_password()` uses `secrets.choice` |
| Auto-generated employee ID | `accounts/models.py` | `generate_employee_id()` → `EMP-XXXXXX` using `secrets.randbelow` |
| One-time credentials display | `accounts/views.py` | Stored in session, shown once, then `session.pop()` destroys them |
| DEBUG-guarded demo login | `accounts/views.py` | `demo_login` returns `redirect("login")` unless `settings.DEBUG` |
| Service layer | `scheduling/services.py` | Business logic isolated from views; all assignment validation lives here |
| Three-level validation | forms + services + DB | Client JS → Django forms/service layer → DB `UniqueConstraint` / `PROTECT` |
| Form state restoration | `scheduling/views/helpers.py` | On validation error, form values saved to session and re-injected into JS |
| Safe back-redirect | `helpers.py` `_redirect_back` | Validates `HTTP_REFERER` host before redirecting |
| Ownership enforcement | all shift views | `get_object_or_404(Shift.objects, pk=…, created_by=request.user)` |
| Lane layout algorithm | `manager-shifts/lane-layout.js` | Greedy algorithm: places overlapping shifts in parallel columns |
| CSS design system | `styles.css` | All design tokens defined as CSS Custom Properties on `:root` |
| JSON data injection | all calendar pages | Data embedded as `<script type="application/json">` — no extra AJAX on load |
| URL-based filter state | manager shifts | Filters serialized to GET params; shareable/bookmarkable links |
| Cache-busting static URLs | `partials/scripts.html` | `?v={% now 'U' %}` appended to each `<script src>` |
| Context processor | `accounts/context_processors.py` | Injects `user_display_name`, `user_initials`, `user_header_role` into all templates |

---

## 4. Data Model

### 4.1 Entity-Relationship overview

```
accounts.User
  │  role: manager | employee
  │  employee_id: EMP-XXXXXX (unique, auto)
  │  phone
  │  position ──────────────────────────────┐
                                            │
scheduling.Position                         │
  │  name (unique, max 25 chars)            │
  │  is_active                              │
  └──→ scheduling.Shift ────────────────────┘
         │  date, start_time, end_time
         │  capacity (≥1)
         │  status: draft | published
         │  created_by ──→ User (PROTECT)
         └──→ scheduling.Assignment
                │  shift (CASCADE)
                │  employee ──→ User (CASCADE)
                └── UniqueConstraint(shift, employee)

accounts.User
  └──→ scheduling.EmployeeUnavailability
         │  date (db_index)
         └── UniqueConstraint(employee, date)
```

### 4.2 Models detail

#### `accounts.User` (`accounts/models.py`)
Inherits all Django `AbstractUser` fields (`username`, `email`, `first_name`, `last_name`, `password`, `is_active`, `is_staff`, …).

| Field | Type | Notes |
|---|---|---|
| `role` | `CharField(choices)` | `manager` / `employee`; default `employee` |
| `employee_id` | `CharField(unique)` | Auto-generated `EMP-XXXXXX`; not editable |
| `phone` | `CharField` | Validated by regex `[0-9+()\-\s]{6,25}` |
| `position` | `ForeignKey(Position, SET_NULL)` | Nullable; must match shift position for assignment |

Properties: `is_manager`, `is_employee` (read role field).  
Static method: `generate_temporary_password(length=14)` — cryptographically random alphanumeric string.

#### `scheduling.Position` (`scheduling/models.py`)

| Field | Type | Notes |
|---|---|---|
| `name` | `CharField(unique)` | Stripped, max 25 chars enforced in `clean()` |
| `is_active` | `BooleanField` | Inactive positions still referenced by existing shifts/users |

`on_delete=PROTECT` on both `Shift.position` and `User.position` — deletion blocked if referenced.

#### `scheduling.Shift` (`scheduling/models.py`)

| Field | Type | Notes |
|---|---|---|
| `date` | `DateField` | |
| `start_time` | `TimeField` | |
| `end_time` | `TimeField` | Must be > `start_time` — enforced in `clean()` |
| `position` | `ForeignKey(Position, PROTECT)` | |
| `capacity` | `PositiveIntegerField` | ≥1; enforced in `clean()` |
| `status` | `CharField(choices)` | `draft` / `published` |
| `created_by` | `ForeignKey(User, PROTECT)` | Manager who created the shift |
| `created_at` | `DateTimeField(auto_now_add)` | |
| `updated_at` | `DateTimeField(auto_now)` | Updated on every `save()` |

Property: `is_past` — compares `datetime.combine(date, end_time)` with `timezone.now()`.

#### `scheduling.Assignment` (`scheduling/models.py`)

| Field | Type | Notes |
|---|---|---|
| `shift` | `ForeignKey(Shift, CASCADE)` | Deleted when shift deleted |
| `employee` | `ForeignKey(User, CASCADE)` | Deleted when user deleted |

DB constraint: `UniqueConstraint(shift, employee)` — last-resort duplicate guard.

#### `scheduling.EmployeeUnavailability` (`scheduling/models.py`)

| Field | Type | Notes |
|---|---|---|
| `employee` | `ForeignKey(User, CASCADE)` | |
| `date` | `DateField(db_index)` | Indexed for fast availability lookups |
| `created_at` | `DateTimeField(auto_now_add)` | |

DB constraint: `UniqueConstraint(employee, date)`.

### 4.3 Migration history

| File | Change |
|---|---|
| `0001_initial.py` | Creates `Position`, `Shift`, `Assignment` |
| `0002_shift_is_deleted.py` | Added `is_deleted` (historical — now removed) |
| `0003_employee_unavailability.py` | Creates `EmployeeUnavailability` |
| `0004_remove_shift_is_deleted.py` | Drops `is_deleted` column |

---

## 5. Backend — File-by-File

### 5.1 `shiftflow/settings.py`

**Role:** Global Django configuration.

Key decisions:
- `AUTH_USER_MODEL = "accounts.User"` — custom user model must be set before first migration.
- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `TIME_ZONE`, all DB credentials read from **environment variables** with safe dev defaults.
- Templates resolved from `PROJECT_ROOT / "frontend" / "templates"` — requires `PROJECT_ROOT` (one level above `BASE_DIR`).
- Static files from `PROJECT_ROOT / "frontend" / "static"`.
- Custom context processor `apps.accounts.context_processors.user_ui_context` registered globally.
- DB configurable: SQLite (default) → PostgreSQL via env `DB_ENGINE`, `DB_NAME`, etc.

Middleware chain (order matters):
```
SecurityMiddleware → SessionMiddleware → CommonMiddleware →
CsrfViewMiddleware → AuthenticationMiddleware →
MessageMiddleware → XFrameOptionsMiddleware
```

### 5.2 `shiftflow/urls.py`

**Role:** Root URL dispatcher.

- Delegates to `apps.accounts.urls` and `apps.scheduling.urls` (both at prefix `""`).
- Mounts Django admin at `/admin/`.
- In `DEBUG` mode only: serves static files via `staticfiles_urlpatterns()`.

### 5.3 `apps/accounts/models.py`

**Role:** Custom user model.

- `generate_employee_id()` — module-level function used as `default=` for `employee_id`. Calls `secrets.randbelow(900000) + 100000` to get 6-digit suffix.
- `User.generate_temporary_password()` — `@staticmethod`, uses `secrets.choice` over alphanumeric alphabet. Called from `views.py` on create and reset.
- `UserRole(TextChoices)` — defines `MANAGER` / `EMPLOYEE` string choices. Used in queries (`role=UserRole.EMPLOYEE`), forms, and templates.

**Used by:** `accounts/views.py`, `accounts/forms.py`, `accounts/decorators.py`, `scheduling/services.py`, `scheduling/views/*`.

### 5.4 `apps/accounts/decorators.py`

**Role:** Role-based access control via view decorators.

```
role_required(user_attr, redirect_to)  ← parametrized factory
    ↳ manager_required   → checks is_manager, redirects to employee_shifts
    ↳ employee_required  → checks is_employee, redirects to manager_shifts
```

Logic: if not authenticated → `redirect("login")`; if authenticated but wrong role → `redirect(redirect_to)`.  
Uses `functools.wraps` to preserve view function metadata.

**Used by:** all manager views, all employee views.

### 5.5 `apps/accounts/context_processors.py`

**Role:** Injects UI state into every template context automatically.

Returns dict with:
- `user_display_name` — `get_full_name()` or `username`
- `user_initials` — first letter of first two name parts (uppercase)
- `user_header_role` — `"Manager"` or position name or `"Employee"`

Guards against unauthenticated requests with `getattr` checks.  
Registered in `settings.TEMPLATES[0]["OPTIONS"]["context_processors"]`.

**Used by:** `partials/header.html` (avatar initials, role badge, display name).

### 5.6 `apps/accounts/forms.py`

**Role:** Validation and saving of employee data.

```
EmployeeBaseForm(ModelForm)       ← fields: email, phone, position + custom full_name
    ├── clean_phone()             ← regex PHONE_RE = [0-9+()\-\s]{6,25}
    ├── clean_email()             ← lowercase, strip, unique-per-user check
    ├── _apply_full_name()        ← splits "First Last" into first_name + last_name
    ├── _apply_common()           ← sets username = email
    └── save()

CreateEmployeeForm(EmployeeBaseForm)
    └── save()                    ← additionally sets role=EMPLOYEE, is_staff=False, is_superuser=False

UpdateEmployeeForm(EmployeeBaseForm)
                                  ← inherits everything; save() does NOT touch role/is_staff
```

`_split_full_name(full_name)` — module-level helper, splits on whitespace: first word = first_name, remainder = last_name.

**Used by:** `accounts/views.py` (`manager_employees`, `employee_update`).

### 5.7 `apps/accounts/views.py`

**Role:** Auth + employee CRUD HTTP handlers.

| View | Method | URL | Description |
|---|---|---|---|
| `login_view` | GET, POST | `/login/` | Django `AuthenticationForm`; redirects to `home` on success |
| `logout_view` | GET | `/logout/` | `logout()` then redirect to `login` |
| `home` | GET | `/` | Redirects manager to last visited shifts URL (from session) or `manager_shifts`; employee → `employee_shifts` |
| `demo_login` | GET | `/login/demo/<role>/` | Creates/resets demo accounts, logs in. Blocked in production (`settings.DEBUG` guard) |
| `manager_employees` | GET, POST | `/manager/employees/` | GET: list + search + position filter. POST: create employee via `CreateEmployeeForm` |
| `employee_details` | GET | `/manager/employees/<id>/json/` | Returns JSON payload of one employee |
| `employee_update` | POST | `/manager/employees/<id>/update/` | Updates via `UpdateEmployeeForm`, returns JSON |
| `reset_employee_password` | POST | `/manager/employees/<id>/reset-password/` | Generates new temp password, stores in session |
| `employee_delete` | POST | `/manager/employees/<id>/delete/` | Hard delete; redirects with success message |

**One-time credentials flow:**  
`_store_one_time_credentials(request, employee, temp_password)` saves to `request.session["one_time_credentials"]`.  
`manager_employees` GET pops it: `creds = request.session.pop("one_time_credentials", None)` — shown once in template then gone.

**Employee search** filters on `Q(employee_id__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q)`.

### 5.8 `apps/accounts/admin.py`

**Role:** Django admin configuration for users.

- Unregisters default `Group` model (not used).
- Extends `UserAdmin.fieldsets` with a `"ShiftSync"` section showing `role`, `employee_id`, `phone`, `position`.
- `employee_id` is `readonly_fields` (auto-generated, must not be edited).

### 5.9 `apps/scheduling/models.py`

**Role:** Core domain models — `Position`, `Shift`, `Assignment`, `EmployeeUnavailability`.

Module-level validator `_validate_time_range_and_capacity()` called from `Shift.clean()`:
- `end_time > start_time`
- `capacity >= 1`

### 5.10 `apps/scheduling/forms.py`

**Role:** Shift and position form validation.

```
PositionForm(ModelForm)
    fields: name, is_active
    (Position.clean() enforces max 25 chars and strips whitespace)

ShiftForm(ModelForm)
    fields: date, start_time, end_time, position, capacity
    + publish: BooleanField(required=False)
    + employee_ids: TypedMultipleChoiceField(coerce=int, required=False)
    
    __init__(employees=None) → populates employee_ids choices
    save()                   → sets status=PUBLISHED if publish=True, else DRAFT
```

`ShiftForm` does not call `set_shift_assignments`. Assignment saving is delegated to `helpers._save_shift_from_post` which calls `services.set_shift_assignments` in a `transaction.atomic` block.

**Used by:** `scheduling/views/helpers.py`.

### 5.11 `apps/scheduling/services.py`

**Role:** Business logic layer — all rules about who can be assigned where.

| Function | Purpose |
|---|---|
| `_overlaps(a_start, a_end, b_start, b_end)` | Returns `True` if two time intervals overlap: `a_start < b_end and a_end > b_start` |
| `_manager_shifts_qs(manager_id, start, end)` | Base queryset: shifts owned by manager in date range |
| `validate_shift_capacity(shift, count)` | Raises `ValidationError` if `count > shift.capacity` |
| `validate_employee_no_overlap(employee_id, shift)` | Queries all shifts for employee on same date, checks `_overlaps` against each |
| `validate_employee_available(employee_id, shift)` | Raises if `EmployeeUnavailability` exists for that employee+date |
| `validate_employees_match_shift_position(shift, ids)` | Filters valid IDs: `role=employee, is_active=True, position_id=shift.position_id` |
| `set_shift_assignments(shift, employee_ids)` | `@transaction.atomic` — runs all 4 validations, then does `bulk_create` for new + `delete` for removed |
| `shifts_for_manager(...)` | Returns filtered queryset for calendar rendering; supports position_ids, status, understaffed_only |
| `shifts_for_employee(employee_id, start, end)` | Returns published shifts where employee is assigned; `select_related("position").distinct()` |

`set_shift_assignments` deduplicates `employee_ids` with `dict.fromkeys` before processing.

**Used by:** `scheduling/views/helpers.py` (via `_save_shift_from_post`), `scheduling/views/manager_shifts.py`.

### 5.12 `apps/scheduling/views/__init__.py`

**Role:** Re-exports all public view functions so `urls.py` can do `from . import views` and access everything via `views.manager_shifts`, etc.

Exports: `manager_shifts`, `create_shift`, `update_shift`, `delete_shift`, `publish_shift`, `publish_all_shifts`, `shift_details`, `positions_list`, `position_create`, `position_update`, `position_delete`, `employee_shifts_view`, `employee_unavailability_view`, `employee_unavailability_toggle`.

### 5.13 `apps/scheduling/views/helpers.py`

**Role:** Private utilities shared across scheduling views.

| Function | Description |
|---|---|
| `_parse_date(value, default)` | Parses `YYYY-MM-DD` string; returns `default` on failure. Safe. |
| `_parse_required_date(value, field)` | Same but raises `ValidationError({field: …})` on failure. Used in AJAX endpoints. |
| `_week_bounds(anchor)` | Returns `(monday, sunday)` of the ISO week containing `anchor` |
| `_month_bounds(anchor)` | Returns `(first_day, last_day)` of the month. Uses `timedelta` arithmetic to find month end. |
| `_redirect_back(request, fallback)` | Validates `HTTP_REFERER` via `url_has_allowed_host_and_scheme`; redirects there or to fallback. |
| `_manager_shifts_url_showing_shift(request, shift)` | Builds `/manager/shifts/?view=…&date=…` URL preserving current view mode from referer. |
| `_save_shift_from_post(request, shift, mode, shift_id, success_message)` | Full shift save pipeline: builds `ShiftForm`, validates, calls `set_shift_assignments` in atomic block, handles errors by saving form state to session. |

**Form state restoration:** On validation error, `_save_shift_from_post` stores POST values + error info in `request.session["shift_form_state"]`. The manager_shifts view pops this on GET and passes it as `shift_form_state_json` to the template, where JS reopens the modal pre-filled.

### 5.14 `apps/scheduling/views/manager_shifts.py`

**Role:** Manager-facing shift calendar and CRUD.

| View | Method | Description |
|---|---|---|
| `manager_shifts` | GET | Renders calendar page. Parses `view`/`date`/`positions`/`status`/`show` from GET params. Embeds `shifts_json` + `employees_json` as `<script type="application/json">`. Saves last URL to session. |
| `create_shift` | POST | Delegates to `_save_shift_from_post` with a new `Shift(created_by=request.user)` |
| `update_shift` | POST | Fetches shift by `pk + created_by`, delegates to `_save_shift_from_post` |
| `delete_shift` | POST | `shift.delete()` (hard delete, assignments cascade) |
| `publish_all_shifts` | POST | Finds all DRAFT shifts in range owned by manager; excludes any with unavailable employees; batch `update(status=PUBLISHED)` |
| `publish_shift` | POST | Publishes one shift; first checks `assignments.filter(employee__unavailability__date=shift.date)` |
| `shift_details` | GET | Returns full shift JSON including assigned employees list; used by modal |

Private serializers (module-level):
- `_serialize_shifts(shifts)` → list of dicts with all fields JS needs per shift chip
- `_serialize_employees(employees)` → list of `{id, name, position_id, position}`

### 5.15 `apps/scheduling/views/manager_resources.py`

**Role:** Position CRUD — all endpoints return JSON.

| View | Method | Returns |
|---|---|---|
| `positions_list` | GET | `{"positions": [{id, name, is_active}, …]}` |
| `position_create` | POST | `{"ok": true, "id": …}` or `{"ok": false, "errors": …}` |
| `position_update` | POST | `{"ok": true}` or `{"ok": false, "errors": …}` |
| `position_delete` | POST | `{"ok": true}` or `{"ok": false, "error": "…"}` with 400 |

`position_delete` explicitly checks `position.employees.exists()` and `position.shifts.exists()` before attempting delete, and also catches `ProtectedError` as a final safeguard.

### 5.16 `apps/scheduling/views/employee.py`

**Role:** Employee-facing shift calendar and unavailability management.

| View | Method | Description |
|---|---|---|
| `employee_shifts_view` | GET | Renders month calendar with `shifts_for_employee` queryset; data embedded as JSON |
| `employee_unavailability_view` | GET | Renders month calendar + current month's unavailable dates as JSON |
| `employee_unavailability_toggle` | POST | Parses date, `get_or_create` / delete `EmployeeUnavailability`; returns `{"ok", "date", "unavailable"}` |

### 5.17 `apps/scheduling/admin.py`

Registers `Position`, `Shift`, `Assignment`, `EmployeeUnavailability` in Django admin with list_display, list_filter, and search_fields.

---

## 6. Frontend — File-by-File

### 6.1 JS Loading Strategy

All pages include `app.js`. Pages with calendars also get `calendar-utils.js`. The manager shifts page loads 11 module files in dependency order via `partials/scripts.html`:

```
app.js                    ← always
calendar-utils.js         ← if include_calendar=1
manager-shifts/config.js
manager-shifts/time-utils.js
manager-shifts/lane-layout.js
manager-shifts/position-palette.js
manager-shifts/filters.js
manager-shifts/employee-picker.js
manager-shifts/sidebar.js
manager-shifts/calendar.js
manager-shifts/shift-modal.js
manager-shifts/layout.js
manager-shifts/index.js   ← entry point, runs last
```

Each file is an **IIFE** that exposes one `window.ManagerShifts*` namespace object. `index.js` validates all modules are present before running.

Cache busting: every `<script src>` ends with `?v={% now 'U' %}` (Unix timestamp at render time).

### 6.2 `app.js` — Global utilities

Exposes on `window`:
- `getById(id)` — shorthand for `getElementById`
- `getCsrfToken()` — reads `csrftoken` cookie or hidden input
- `urlFromTemplate(template, id)` — replaces `/0/` with `/id/` in URL templates from `data-*` attributes
- `postFormJson(url, data)` — `fetch` POST with CSRF header, parses JSON response
- `openModal(id)` / `closeModal(id)` — add/remove `.hidden` class
- `showToast(type, title, message)` — renders dismissible toast notification
- `toggleDropdown(btn)` / global click handler to close dropdowns
- `toggleUserMenu(btn)` — opens user profile dropdown in header

### 6.3 `calendar-utils.js` — Date and navigation

Exposes on `window`:
- `toISODate(date)` — `Date` → `"YYYY-MM-DD"`
- `dateFromISO(str)` — `"YYYY-MM-DD"` → `Date` (parses as local midnight to avoid timezone shift)
- `addDays(iso, n)`, `addMonths(iso, n)` — date arithmetic
- `navigateWith(params)` — updates URL search params and reloads
- `parseJsonScript(id, fallback)` — safely parses `<script type="application/json">` by `id`
- `prevPeriod()`, `nextPeriod()`, `goToToday()` — calendar nav buttons

### 6.4 `manager-shifts/config.js`

Reads `data-*` attributes from `#managerShiftPage` DOM element (injected by server):  
`view`, `anchor`, `start`, `today`, and URL templates for shift CRUD endpoints.  
Exposes `window.ManagerShiftsConfig = { getEl, getConfig, … }`.

### 6.5 `manager-shifts/time-utils.js`

String time helpers: `parseTimeToMinutes("HH:MM")`, `formatMinutesToTime(mins)`, `minutesToLabel(mins)` (e.g. `"8h 30m"`).

### 6.6 `manager-shifts/lane-layout.js`

**Greedy lane-placement algorithm** for overlapping time shifts:
1. Sort shifts by `start_time` (then `end_time`)
2. For each shift, walk `laneEnds[]` — find first lane where `shift.start >= lane.end`
3. If found: occupy that lane. If not: create a new lane.
4. Returns `{ laneById: Map<id, laneIndex>, laneCount }` — used by `calendar.js` to set `left` and `width` via CSS percentage.

### 6.7 `manager-shifts/position-palette.js`

Assigns a deterministic HSL color to each position ID using a hue formula: `hue = ((id * 47) % 360)`. This guarantees visually distinct, stable colors without a fixed palette.

Functions:
- `computePositionPalette(positionId)` — returns `{ bg, border, fg }` as HSL strings
- `applyPositionPaletteToElement(el, positionId)` — adds `.shift-chip-position` class and sets `--position-bg`, `--position-border`, `--position-fg` inline CSS variables on the element
- `collectPositionsFromDom()` — reads position list from the `#positionMulti` multiselect DOM
- `renderPositionLegend(positions, shifts)` — populates `#positionLegend` inside the fixed `#positionLegendBar` at the bottom of the page. Shows only positions that have at least one published shift in the current period, plus a "Draft" swatch if any draft shifts exist. After rendering, calls `window.ManagerShiftsLayout.syncLayout()` via `requestAnimationFrame` so the calendar fill-height recalculates if the legend row changed height.

### 6.8 `manager-shifts/filters.js`

Manages the position multi-select dropdown state:
- `toggleMulti(id)` — opens/closes the dropdown panel
- `updatePositionMulti()` — updates trigger button label ("All positions" / "3 selected" / etc.)
- `selectAllPositions(checked)` — batch check/uncheck
- `submitFilters()` — validates and submits the filter form (GET navigation)

### 6.9 `manager-shifts/employee-picker.js`

Pre-groups employees by `position_id` at init time (`employeeBuckets` Map).  
On position selection change, replaces the visible employee list with only the matching bucket.  
Tracks selected employee IDs via `Set`. Exposes `getSelectedEmployeeIds()`.

### 6.10 `manager-shifts/sidebar.js`

Renders the employee sidebar:
- Filters by position dropdown (client-side, no roundtrip)
- Computes total scheduled hours per employee from the current `shifts` array
- Each sidebar row (`role="button"`, `tabindex="0"`) is the full click/keyboard target — clicking toggles highlight mode for that employee
- Highlight mode: `toggleEmployeeHighlight(id)` sets `activeHighlightId`; `applyEmployeeShiftHighlight()` adds/removes `.shift-chip-employee-highlight` CSS class on matching shift chips
- `syncEmployeeSidebarActiveState()` mirrors `activeHighlightId` onto `aria-pressed` and `.active` class of each row
- Avatar element is `aria-hidden="true"` (decorative only)

### 6.11 `manager-shifts/calendar.js`

Renders two calendar views from the `shifts` data array:

**Week view** (`renderWeekGrid`):
- CSS Grid: 1 label column + 7 day columns × 24 hour rows
- Base column width: `--week-day-col-width: 240px`. **Dynamic column widths**: after computing lane layout per day, each column's width is `Math.ceil(laneCount / 2) * 240px` — days with ≥3 overlapping shifts get a wider column so chips never shrink below 50% of the base width. The grid grows wider (scrollable) instead of other columns shrinking.
- Shift chips positioned with `top` / `height` as pixel values derived from `start_time` / `duration` × `hourHeightPx` (measured from a live cell via `getBoundingClientRect`)
- Calls `lane-layout.js` per day; `left` / `width` calculated as `laneIndex/laneCount * 100%` relative to the column
- Click on empty time slot → opens create modal pre-filled with date + time

**Month view** (`renderMonthGrid`):
- CSS Grid: 7-column month grid
- Shift chips are simple color blocks with position label and fill indicator
- Click on chip → `openShiftDetails(id)`

### 6.12 `manager-shifts/shift-modal.js`

Manages create, edit, and details modals:
- `openCreateShiftModal(dateStr, startTime)` — resets form, optionally pre-fills date/time, calls `filterEmployeePicker()`
- `openShiftDetails(id)` — fetches `shift_details` JSON endpoint, populates details modal
- `editShift()` — populates edit form from details modal data
- `publishShift()` — submits `#publishShiftForm` to `publish_shift` URL
- `deleteShift()` — shows confirm modal then submits `#deleteShiftForm`
- `refreshPositionsFromServer()` — fetches `/manager/positions/json/` and rebuilds position `<select>` options

### 6.13 `manager-shifts/layout.js`

Handles all layout calculations that depend on measured DOM dimensions:

`wireStickyOffsets()` — called once at init and on `resize` (debounced 50ms):
- Measures `header` height → `--header-sticky-height`
- Measures `page-toolbar-card` height → `--toolbar-sticky-height`
- Reads `--legend-bar-height` (a fixed CSS constant, `42px`) — no DOM measurement needed since the legend bar is always the same height
- Reads the active calendar card's `margin-top` → treats it as equal top and bottom gap
- Computes `--manager-calendar-fill-height = innerHeight − headerHeight − toolbarHeight − legendBarHeight − viewMargin×2` (min 320px)
- Immediately assigns `window.ManagerShiftsLayout.syncLayout = sync` so `position-palette.js` can call it after the legend content updates

Also exposes global navigation functions wired to calendar-utils: `switchView`, `prevPeriod`, `nextPeriod`, `goToToday`.

### 6.14 `manager-shifts/index.js`

**Entry point.** Runs after all modules loaded:
1. Validates all `window.ManagerShifts*` namespaces are present
2. Reads config from `#managerShiftPage` data attributes
3. Parses shift + employee JSON from `<script type="application/json">` elements
4. Initializes position palette, sidebar, employee picker
5. Calls `Calendar.renderWeekGrid` or `Calendar.renderMonthGrid` depending on `config.view`
6. Re-opens shift modal if `#shiftFormState` is present (form state restoration after server error)

### 6.15 `employee-shifts.js`

Renders the employee month calendar. Simpler than manager version: no lane layout (employee can't have overlapping shifts), no editing. Click on chip → compact popup → "Details" button → full detail modal. Uses `calendar-utils.js` for navigation.

### 6.16 `employee-unavailability.js`

Renders month calendar with toggle-able dates. Click → POST to `/employee/unavailability/toggle/` with CSRF token. On success toggles `.unavailable` CSS class on the cell and updates the chip list below the calendar.

### 6.17 `manager-employees.js`

Handles the Team page:
- Client-side search + position filter (`applyEmployeeFilters()`) on employee table rows via `data-position` attributes — no server roundtrip
- Add employee: standard form POST via modal
- Edit employee: fetches `/manager/employees/<id>/json/`, populates edit modal, submits AJAX POST to `/update/`
- Delete: confirm modal → POST to `/delete/`
- Reset password: form POST to `/reset-password/`
- Positions modal (Manage positions): AJAX CRUD against `/manager/positions/*` JSON endpoints

### 6.18 `styles.css`

Single stylesheet for the entire application. Key structure:
- **`:root`** — all design tokens as CSS Custom Properties: colors, spacing, radius, shadows, typography. Layout constants include `--legend-bar-height: 42px`.
- **Shift status colors**: `--shift-published`, `--shift-past`, `--shift-future`
- **Position chip colors**: `--position-bg`, `--position-border`, `--position-fg` — set inline by `position-palette.js` per element
- **Calendar grid**: CSS Grid layout with `grid-template-columns` / `grid-template-rows`; week view base column is `--week-day-col-width: 240px`, JS overrides `grid-template-columns` inline for dynamic column widths; week grid height is `clamp(520px, 72vh, 980px)`
- **Sticky headers**: `.week-time-day-header { position: sticky; top: 0; z-index: 30 }`, hour labels `left: 0; z-index: 25`
- **`body.manager-shifts-page`**: overrides `main-content` `padding-bottom: var(--legend-bar-height)`; sets calendar fill heights using `--manager-calendar-fill-height` (computed by `layout.js`)
- **`#positionLegendBar`**: `position: fixed; bottom: 0; left: 0; right: 0; height: var(--legend-bar-height)` — always visible fixed bar outside the scrollable page content; `#positionLegend` renders centered inside it
- **Responsive breakpoints**: 1024px (sidebar reflow to single column, auto height), 768px (toolbar stacks vertically, table compact), 480px (mobile nav)
- **Components**: `.card`, `.btn`, `.badge`, `.modal`, `.dropdown`, `.multiselect`, `.toast`, `.form-input`, `.form-select`, `.table`
- **Page padding**: `--page-padding: 1rem` (uniform across all pages)

---

## 7. URL Routing

### `accounts/urls.py`

| Name | Path | View |
|---|---|---|
| `home` | `/` | `home` |
| `login` | `/login/` | `login_view` |
| `demo_login` | `/login/demo/<role>/` | `demo_login` |
| `logout` | `/logout/` | `logout_view` |
| `manager_employees` | `/manager/employees/` | `manager_employees` |
| `employee_details` | `/manager/employees/<id>/json/` | `employee_details` |
| `employee_update` | `/manager/employees/<id>/update/` | `employee_update` |
| `reset_employee_password` | `/manager/employees/<id>/reset-password/` | `reset_employee_password` |
| `employee_delete` | `/manager/employees/<id>/delete/` | `employee_delete` |

### `scheduling/urls.py`

| Name | Path | View |
|---|---|---|
| `manager_shifts` | `/manager/shifts/` | `manager_shifts` |
| `create_shift` | `/manager/shifts/create/` | `create_shift` |
| `publish_all_shifts` | `/manager/shifts/publish-all/` | `publish_all_shifts` |
| `shift_details` | `/manager/shifts/<id>/json/` | `shift_details` |
| `update_shift` | `/manager/shifts/<id>/update/` | `update_shift` |
| `delete_shift` | `/manager/shifts/<id>/delete/` | `delete_shift` |
| `publish_shift` | `/manager/shifts/<id>/publish/` | `publish_shift` |
| `positions_list` | `/manager/positions/json/` | `positions_list` |
| `position_create` | `/manager/positions/create/` | `position_create` |
| `position_update` | `/manager/positions/<id>/update/` | `position_update` |
| `position_delete` | `/manager/positions/<id>/delete/` | `position_delete` |
| `employee_shifts` | `/employee/shifts/` | `employee_shifts_view` |
| `employee_unavailability` | `/employee/unavailability/` | `employee_unavailability_view` |
| `employee_unavailability_toggle` | `/employee/unavailability/toggle/` | `employee_unavailability_toggle` |

---

## 8. Request Lifecycle

### Full-page render (e.g. GET `/manager/shifts/`)

```
Browser GET
  → Django SecurityMiddleware (HSTS headers)
  → SessionMiddleware (loads session from DB)
  → CsrfViewMiddleware (validates cookie presence for GET; enforces token on POST)
  → AuthenticationMiddleware (attaches request.user from session)
  → MessageMiddleware (loads flash messages)
  → URL router → manager_shifts view
  → @manager_required: checks request.user.is_authenticated + is_manager
  → shifts_for_manager() queryset with select_related + prefetch_related
  → _serialize_shifts() → JSON string
  → render() → DTL template → HTML
  → context_processors inject user_display_name, user_initials, user_header_role
  → Response: full HTML page

Browser receives HTML → loads scripts.html → IIFE modules execute →
  parseJsonScript('managerShiftsData') → Calendar.renderWeekGrid()
```

### AJAX mutation (e.g. POST `/manager/shifts/<id>/update/`)

```
JS submits form via fetch() or native form submit
  → X-CSRFToken header from getCsrfToken()
  → CsrfViewMiddleware validates token
  → @manager_required
  → get_object_or_404(Shift.objects, pk=id, created_by=request.user)   ← ownership
  → _save_shift_from_post()
      → ShiftForm.is_valid()   ← field validation
      → transaction.atomic()
          → ShiftForm.save()
          → set_shift_assignments()   ← 4 business rules
  → messages.success() + redirect (PRG pattern)
  OR
  → session["shift_form_state"] + redirect → form reopens pre-filled
```

---

## 9. Security Mechanisms

| Threat | Countermeasure |
|---|---|
| CSRF | `CsrfViewMiddleware`; `{% csrf_token %}` in all forms; `getCsrfToken()` in AJAX headers |
| XSS | DTL autoescaping; JS data via `<script type="application/json">` (not template interpolation) |
| SQL Injection | Django ORM — all queries use parameterized SQL |
| Broken access control | `@manager_required` / `@employee_required` on every protected view |
| IDOR (insecure direct object reference) | `get_object_or_404(..., created_by=request.user)` — shifts filtered by owner |
| Open redirect | `url_has_allowed_host_and_scheme` in `_redirect_back` and `home` |
| Clickjacking | `XFrameOptionsMiddleware` (DENY by default) |
| Weak credentials | 4 `AUTH_PASSWORD_VALIDATORS`; temp passwords via `secrets` module |
| Demo access in production | `demo_login` returns `redirect("login")` when `settings.DEBUG=False` |
| Partial update integrity | `@transaction.atomic` in `set_shift_assignments` — all-or-nothing |
| Duplicate assignments | `UniqueConstraint(shift, employee)` at DB level |

---

## 10. Inter-File Dependency Map

```
settings.py
  └─ configures → all apps, middleware, templates, static, AUTH_USER_MODEL

shiftflow/urls.py
  ├─ includes → accounts/urls.py
  └─ includes → scheduling/urls.py

accounts/urls.py → accounts/views.py
scheduling/urls.py → scheduling/views/__init__.py
                        ├─ manager_shifts.py
                        ├─ manager_resources.py
                        └─ employee.py

accounts/views.py
  ├─ imports → accounts/models.py (User, UserRole)
  ├─ imports → accounts/forms.py (CreateEmployeeForm, UpdateEmployeeForm)
  ├─ imports → accounts/decorators.py (@manager_required)
  └─ imports → scheduling/models.py (Position) [for demo_login]

scheduling/views/manager_shifts.py
  ├─ imports → accounts/models.py (User, UserRole)
  ├─ imports → scheduling/models.py (Position, Shift, ShiftStatus)
  ├─ imports → scheduling/services.py (shifts_for_manager)
  ├─ imports → accounts/decorators.py (@manager_required)
  └─ imports → scheduling/views/helpers.py (_parse_date, …)

scheduling/views/helpers.py
  ├─ imports → accounts/models.py (User, UserRole)
  ├─ imports → scheduling/forms.py (ShiftForm)
  ├─ imports → scheduling/models.py (Shift)
  └─ imports → scheduling/services.py (set_shift_assignments)

scheduling/services.py
  ├─ imports → scheduling/models.py (Assignment, EmployeeUnavailability, Shift, ShiftStatus)
  └─ imports → accounts/models.py (User) [via get_user_model()]

scheduling/views/employee.py
  ├─ imports → accounts/decorators.py (@employee_required)
  ├─ imports → scheduling/models.py (EmployeeUnavailability)
  ├─ imports → scheduling/services.py (shifts_for_employee)
  └─ imports → scheduling/views/helpers.py (_parse_date, …)

scheduling/views/manager_resources.py
  ├─ imports → accounts/decorators.py (@manager_required)
  └─ imports → scheduling/forms.py (PositionForm), scheduling/models.py (Position)

accounts/context_processors.py
  └─ reads → request.user (User model)

--- Frontend ---

templates/partials/scripts.html → loads JS conditionally
templates/*/  →  include partials/*

app.js            (no imports; exposes window.*; required by all pages)
calendar-utils.js (no imports; exposes window.*; required by calendar pages)

manager-shifts/index.js
  ├─ depends on → window.ManagerShiftsConfig    (config.js)
  ├─ depends on → window.ManagerShiftsFilters   (filters.js)
  ├─ depends on → window.ManagerShiftsEmployeePicker (employee-picker.js)
  ├─ depends on → window.ManagerShiftsSidebar   (sidebar.js)
  ├─ depends on → window.ManagerShiftsCalendar  (calendar.js)
  │     └─ uses → window.ManagerShiftsLaneLayout (lane-layout.js)
  │     └─ uses → window.ManagerShiftsTimeUtils (time-utils.js)
  ├─ depends on → window.ManagerShiftsPositionPalette (position-palette.js)
  │     └─ calls → window.ManagerShiftsLayout.syncLayout (after legend render)
  ├─ depends on → window.ManagerShiftsModal     (shift-modal.js)
  └─ depends on → window.ManagerShiftsLayout    (layout.js)
        └─ exposes → syncLayout (assigned after wireStickyOffsets() runs)

employee-shifts.js       → uses window.* from app.js + calendar-utils.js
employee-unavailability.js → uses window.* from app.js + calendar-utils.js
manager-employees.js     → uses window.* from app.js only
```
