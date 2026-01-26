"""
=============================================================================
SCHEDULING VIEWS
=============================================================================

This module contains all HTTP view functions for the scheduling app.
Views handle request/response logic and delegate business logic to services.py.

Organization:

1. HELPER FUNCTIONS (Private)
   - Date/time parsing and validation
   - URL manipulation for redirects
   - Form data reading and state management

2. MANAGER SHIFT VIEWS
   - manager_shifts() - Main calendar page (GET/POST for bulk actions)
   - create_shift() - Create new shift
   - update_shift() - Update existing shift
   - delete_shift() - Soft delete shift
   - publish_shift() - Change status to published
   - shift_details() - JSON endpoint for shift popup
   - undo_last_action() - Restore/revert last action

3. MANAGER RESOURCE VIEWS
   - templates_list(), template_create/update/delete() - Shift templates
   - positions_list(), position_create/update/delete() - Position management

4. EMPLOYEE VIEWS
   - employee_shifts_view() - Employee's assigned shifts calendar
   - employee_unavailability_view() - Mark unavailable dates
   - employee_unavailability_toggle() - Toggle date availability

Design Patterns:
- Uses @manager_required and @employee_required decorators for access control
- Session-based undo system stores last action IDs
- Shift form state preserved in session on validation errors
- Smart redirect back to referring URL with filter preservation

=============================================================================
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from django.contrib import messages
from django.core.serializers.json import DjangoJSONEncoder
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from apps.accounts.decorators import employee_required, manager_required
from apps.accounts.models import User, UserRole

from .forms import PositionForm, ShiftTemplateForm
from .models import EmployeeUnavailability, Position, Shift, ShiftStatus, ShiftTemplate
from .services import (
    delete_shift_ids,
    delete_drafts_in_range,
    publish_draft_ids,
    publish_drafts_in_range,
    set_shift_assignments,
    shifts_for_employee,
    shifts_for_manager,
)


# =============================================================================
# HELPER FUNCTIONS - Date/Time Parsing
# =============================================================================
# These functions parse and validate user input from request parameters.
# They raise ValidationError with field-specific messages for form handling.


def _parse_date(value: str | None, default: date) -> date:
    """
    Parses a date string in YYYY-MM-DD format.
    Returns default if value is empty or invalid.
    Used for optional date parameters (e.g., ?date=2024-01-15).
    """
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _parse_positive_int(value: str | None, field: str) -> int:
    """
    Parses a string to a positive integer (>= 1).
    Raises ValidationError with field name if invalid or < 1.
    Used for capacity and position_id form fields.
    """
    raw = (value or "").strip()
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({field: "Enter a valid whole number."})
    if parsed < 1:
        raise ValidationError({field: "Must be at least 1."})
    return parsed


def _parse_required_date(value: str | None, field: str) -> date:
    """
    Parses a required date string in YYYY-MM-DD format.
    Raises ValidationError with field name if invalid.
    """
    raw = (value or "").strip()
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValidationError({field: "Enter a valid date."})


def _parse_required_time(value: str | None, field: str):
    """
    Parses a required time string in HH:MM format.
    Raises ValidationError with field name if invalid.
    """
    raw = (value or "").strip()
    try:
        return datetime.strptime(raw, "%H:%M").time()
    except (TypeError, ValueError):
        raise ValidationError({field: "Enter a valid time."})


# =============================================================================
# HELPER FUNCTIONS - Date Range Calculation
# =============================================================================


# =============================================================================

def _week_bounds(anchor: date) -> tuple[date, date]:
    """
    Returns (start, end) dates for the week containing anchor.
    Week starts on Monday (weekday() == 0).
    """
    start = anchor - timedelta(days=anchor.weekday())
    return start, start + timedelta(days=6)


def _month_bounds(anchor: date) -> tuple[date, date]:
    """
    Returns (start, end) dates for the month containing anchor.
    Uses a trick: go to day 28, add 4 days (guaranteed to be next month),
    then replace with day 1 and subtract 1 day to get last day of original month.
    """
    start = anchor.replace(day=1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = next_month - timedelta(days=1)
    return start, end


# =============================================================================
# HELPER FUNCTIONS - Redirect & URL Handling
# =============================================================================


# =============================================================================

def _redirect_back(request: HttpRequest, fallback_url_name: str) -> HttpResponse:
    """
    Redirects to HTTP_REFERER if it's a safe URL, otherwise to fallback.
    Prevents open redirect vulnerabilities by validating the host.
    """
    ref = request.META.get("HTTP_REFERER")
    if ref and url_has_allowed_host_and_scheme(
        url=ref,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return redirect(ref)
    return redirect(fallback_url_name)


def _manager_shifts_url_showing_shift(request: HttpRequest, shift: Shift) -> str:
    """
    Builds a URL for manager_shifts that ensures a specific shift is visible.
    
    This function is called after creating/updating a shift to redirect
    the manager to a view where the shift will be displayed.
    
    Logic:
    1. Start with referer URL or last saved manager_shifts URL
    2. Always set ?date= to the shift's date so it's in the visible period
    3. If filters would hide the shift (wrong status, understaffed, position),
       relax those filters so the shift appears
    
    This provides a good UX where the user sees their change immediately.
    """
    base = request.META.get("HTTP_REFERER") or request.session.get("manager_shifts_last_url") or ""
    if not base:
        base = reverse("manager_shifts")

    if base.startswith("/"):
        parsed = urlparse(base)
    elif url_has_allowed_host_and_scheme(
        url=base,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        parsed = urlparse(base)
    else:
        parsed = urlparse(reverse("manager_shifts"))

    manager_path = reverse("manager_shifts")
    if parsed.path != manager_path:
        parsed = urlparse(manager_path)

    qs = parse_qs(parsed.query)

    # Always jump to the created/updated shift date so it's in the visible period.
    qs["date"] = [shift.date.isoformat()]

    # If filters would hide the shift, relax them so the shift is visible.
    status = (qs.get("status", [""])[0] or "").lower()
    if status in (ShiftStatus.DRAFT, ShiftStatus.PUBLISHED) and status != shift.status:
        qs.pop("status", None)

    show = (qs.get("show", [""])[0] or "").lower()
    if show == "understaffed":
        qs.pop("show", None)

    positions = [p for p in qs.get("positions", []) if str(p).isdigit()]
    if positions and str(shift.position_id) not in positions:
        positions.append(str(shift.position_id))
        qs["positions"] = positions

    query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=query))


# =============================================================================
# HELPER FUNCTIONS - Form Data Handling
# =============================================================================
# These functions handle reading, validating, and preserving shift form state.
# Form state is stored in session when validation fails so the modal can
# reopen with the user's entered values and highlight the error field.

def _read_shift_form_input(request: HttpRequest) -> dict:
    """
    Extracts all shift form fields from POST data into a dict.
    Returns raw values; validation happens in _save_shift_from_request.
    """
    return {
        "date": request.POST.get("date"),
        "start_time": request.POST.get("start_time"),
        "end_time": request.POST.get("end_time"),
        "position_id": request.POST.get("position_id"),
        "capacity": request.POST.get("capacity"),
        "publish": request.POST.get("publish") == "1",
        "employee_ids": [int(e) for e in request.POST.getlist("employee_ids") if e.isdigit()],
    }


def _shift_form_state(
    *,
    mode: str,
    data: dict,
    shift_id: int | None = None,
    error_field: str | None = None,
) -> dict:
    """
    Builds a JSON-serializable dict representing shift form state.
    
    Stored in session when validation fails, then passed to the template
    as shift_form_state_json. JavaScript reads this to:
    - Reopen the shift modal automatically
    - Populate fields with the user's entered values  
    - Highlight the field that caused the error
    
    Args:
        mode: 'create' or 'update'
        data: The form data dict from _read_shift_form_input
        shift_id: For update mode, the ID being edited
        error_field: Which field caused validation to fail
    """
    state = {
        "mode": mode,
        "date": data.get("date"),
        "start_time": data.get("start_time"),
        "end_time": data.get("end_time"),
        "position_id": data.get("position_id"),
        "capacity": data.get("capacity"),
        "publish": bool(data.get("publish")),
        "employee_ids": list(data.get("employee_ids") or []),
    }
    if shift_id is not None:
        state["shift_id"] = shift_id
    if error_field:
        state["error_field"] = error_field
    return state


def _error_field_from_validation_error(exc: ValidationError) -> str | None:
    """
    Attempts to determine which form field caused a ValidationError.
    
    Django ValidationError can have a message_dict with field -> messages.
    Falls back to keyword matching in the error string.
    
    Returns field name (e.g., 'capacity', 'employee_ids') or None.
    Used to highlight the error field in the shift form modal.
    """
    msg_dict = getattr(exc, "message_dict", None)
    if isinstance(msg_dict, dict):
        if msg_dict.get("capacity"):
            return "capacity"
        if msg_dict.get("employee_ids"):
            return "employee_ids"
        if msg_dict.get("position") or msg_dict.get("position_id"):
            return "position_id"
        if msg_dict.get("date"):
            return "date"
        if msg_dict.get("start_time"):
            return "start_time"
        if msg_dict.get("end_time"):
            return "end_time"

    msg = str(exc).lower()
    if "capacity" in msg:
        return "capacity"
    if "employee" in msg or "assign" in msg:
        return "employee_ids"
    if "position" in msg or "role" in msg:
        return "position_id"
    if "date" in msg:
        return "date"
    if "time" in msg:
        return "end_time"
    return None


def _save_shift_from_request(*, shift: Shift, data: dict) -> None:
    """
    Populates and saves a Shift instance from parsed form data.
    
    Validates all fields, saves the shift, then updates assignments.
    Raises ValidationError if any validation fails.
    
    Note: This should be called within a transaction to ensure
    shift and assignments are saved atomically.
    """
    shift.date = _parse_required_date(data.get("date"), "date")
    shift.start_time = _parse_required_time(data.get("start_time"), "start_time")
    shift.end_time = _parse_required_time(data.get("end_time"), "end_time")
    shift.position_id = _parse_positive_int(data.get("position_id"), "position")
    shift.capacity = _parse_positive_int(data.get("capacity"), "capacity")
    shift.status = ShiftStatus.PUBLISHED if data.get("publish") else ShiftStatus.DRAFT
    shift.full_clean()  # Run Django model validation
    shift.save()
    set_shift_assignments(shift, data.get("employee_ids") or [])


def _save_shift_from_post(
    request: HttpRequest,
    *,
    shift: Shift,
    mode: str,
    shift_id: int | None = None,
    success_message: str,
    last_action: str | None = None,
) -> HttpResponse:
    """
    Complete flow for saving a shift from a POST request.
    
    1. Read form data from request.POST
    2. Attempt to save within a transaction
    3. On success: flash message, store undo action, redirect to show shift
    4. On failure: flash error, store form state in session, redirect back
    
    Args:
        request: The HTTP request
        shift: Shift instance (new for create, existing for update)
        mode: 'create' or 'update' (for form state)
        shift_id: For update, the ID being edited
        success_message: Flash message on success
        last_action: If set, store in session for undo (e.g., 'create')
    """
    data = _read_shift_form_input(request)

    try:
        with transaction.atomic():
            _save_shift_from_request(shift=shift, data=data)
    except ValidationError as exc:
        messages.error(request, str(exc))
        request.session["shift_form_state"] = _shift_form_state(
            mode=mode,
            shift_id=shift_id,
            data=data,
            error_field=_error_field_from_validation_error(exc),
        )
        return _redirect_back(request, "manager_shifts")
    except Exception as exc:
        messages.error(request, f"Could not {mode} shift: {exc}")
        request.session["shift_form_state"] = _shift_form_state(mode=mode, shift_id=shift_id, data=data)
        return _redirect_back(request, "manager_shifts")

    messages.success(request, success_message)
    if last_action:
        request.session["manager_last_action"] = {"action": last_action, "shift_ids": [shift.id]}
    return redirect(_manager_shifts_url_showing_shift(request, shift))


# =============================================================================
# MANAGER SHIFT VIEWS - Main Calendar
# =============================================================================
# The main manager_shifts view handles both GET (display) and POST (bulk actions).
# Individual shift CRUD operations are separate views for cleaner organization.

@manager_required
@require_http_methods(["GET", "POST"])
def manager_shifts(request: HttpRequest) -> HttpResponse:
    """
    Main manager shift scheduling view.
    
    GET: Renders the shift calendar with filters
    POST: Handles bulk actions (publish all, delete drafts, selection mode actions)
    
    Query Parameters:
    - view: 'day', 'week', or 'month' (default: week)
    - date: Anchor date in YYYY-MM-DD format (default: today)
    - positions: Comma-separated position IDs to filter
    - status: 'draft' or 'published' to filter
    - show: 'understaffed' to show only understaffed shifts
    
    POST Actions:
    - action=publish: Publish all drafts in current date range
    - action=delete_drafts: Delete all drafts in current date range
    - action=publish_selected: Publish selected shift IDs
    - action=delete_selected: Delete selected shift IDs
    
    Template receives:
    - shifts_json: All visible shifts as JSON for calendar rendering
    - employees_json: All employees for assignment dropdowns
    - shift_form_state_json: Preserved form state if validation failed
    - can_undo: Whether an undo action is available
    """
    today = timezone.localdate()
    view = (request.GET.get("view") or "week").lower()
    anchor = _parse_date(request.GET.get("date"), today)

    if view == "day":
        start, end = anchor, anchor
        period_label = f"{anchor.strftime('%a')} • {anchor.strftime('%d')}. {anchor.strftime('%b')}"
    elif view == "month":
        start, end = _month_bounds(anchor)
        period_label = anchor.strftime("%B %Y")
    else:
        view = "week"
        start, end = _week_bounds(anchor)
        if start.month == end.month and start.year == end.year:
            period_label = f"{start.strftime('%d')}. - {end.strftime('%d')}. {start.strftime('%b')}"
        else:
            period_label = f"{start.strftime('%d')}. {start.strftime('%b')} - {end.strftime('%d')}. {end.strftime('%b')}"

    request.session["manager_shifts_last_url"] = request.get_full_path()

    positions = Position.objects.filter(is_active=True).order_by("name")
    selected_positions = [int(p) for p in request.GET.getlist("positions") if p.isdigit()]
    status = (request.GET.get("status") or "").lower()
    understaffed = (request.GET.get("show") or "").lower() == "understaffed"

    if request.method == "POST" and request.POST.get("action") == "publish":
        published_ids, blocked_ids = publish_drafts_in_range(manager_id=request.user.id, start=start, end=end)
        if published_ids:
            request.session["manager_last_action"] = {"action": "publish", "shift_ids": published_ids}
            messages.success(request, f"Published {len(published_ids)} draft shift(s).")
        if blocked_ids:
            messages.error(
                request,
                f"{len(blocked_ids)} draft shift(s) were not published because assigned employees are unavailable.",
            )
        if not published_ids and not blocked_ids:
            messages.info(request, "No draft shifts to publish.")
        return _redirect_back(request, "manager_shifts")

    if request.method == "POST" and request.POST.get("action") == "delete_drafts":
        ids = delete_drafts_in_range(manager_id=request.user.id, start=start, end=end)
        if ids:
            request.session["manager_last_action"] = {"action": "delete", "shift_ids": ids}
            messages.success(request, f"Deleted {len(ids)} draft shift(s).")
        else:
            messages.info(request, "No draft shifts to delete.")
        return _redirect_back(request, "manager_shifts")

    if request.method == "POST" and request.POST.get("action") in ("publish_selected", "delete_selected"):
        raw_ids = request.POST.get("shift_ids") or ""
        ids = [int(x) for x in raw_ids.split(",") if x.strip().isdigit()]
        ids += [int(x) for x in request.POST.getlist("shift_ids") if str(x).isdigit()]
        ids = sorted(set(ids))

        if not ids:
            messages.info(request, "No shifts selected.")
            return _redirect_back(request, "manager_shifts")

        if request.POST.get("action") == "publish_selected":
            published_ids, blocked_ids = publish_draft_ids(manager_id=request.user.id, shift_ids=ids)
            if published_ids:
                request.session["manager_last_action"] = {"action": "publish", "shift_ids": published_ids}
                messages.success(request, f"Published {len(published_ids)} selected shift(s).")
            if blocked_ids:
                messages.error(
                    request,
                    f"{len(blocked_ids)} selected shift(s) were not published because assigned employees are unavailable.",
                )
            if not published_ids and not blocked_ids:
                messages.info(request, "No draft shifts selected to publish.")
            return _redirect_back(request, "manager_shifts")

        # delete_selected
        deleted_ids = delete_shift_ids(manager_id=request.user.id, shift_ids=ids)
        if deleted_ids:
            request.session["manager_last_action"] = {"action": "delete", "shift_ids": deleted_ids}
            messages.success(request, f"Deleted {len(deleted_ids)} selected shift(s).")
        else:
            messages.info(request, "No shifts deleted.")
        return _redirect_back(request, "manager_shifts")

    shift_qs = shifts_for_manager(
        manager_id=request.user.id,
        start=start,
        end=end,
        position_ids=selected_positions or None,
        status=status or None,
        understaffed_only=understaffed,
    ).prefetch_related("assignments")

    shifts_payload = []
    for s in shift_qs:
        assigned_employee_ids = [a.employee_id for a in s.assignments.all()]
        shifts_payload.append(
            {
                "id": s.id,
                "date": s.date.isoformat(),
                "start_time": s.start_time.strftime("%H:%M"),
                "end_time": s.end_time.strftime("%H:%M"),
                "position": s.position.name,
                "position_id": s.position_id,
                "capacity": s.capacity,
                "assigned_count": len(assigned_employee_ids),
                "assigned_employee_ids": assigned_employee_ids,
                "status": s.status,
                "is_past": s.is_past,
            }
        )

    employees = list(
        User.objects.filter(role=UserRole.EMPLOYEE, is_active=True)
        .select_related("position")
        .order_by("last_name", "first_name", "username")
    )
    employees_payload = [
        {
            "id": e.id,
            "name": e.get_full_name() or e.username,
            "position_id": e.position_id,
            "position": e.position.name if e.position else "",
        }
        for e in employees
    ]

    shift_form_state = request.session.pop("shift_form_state", None)
    can_undo = bool(request.session.get("manager_last_action"))

    return render(
        request,
        "manager/manager-shifts.html",
        {
            "view": view,
            "anchor": anchor,
            "start": start,
            "end": end,
            "period_label": period_label,
            "today": today,
            "positions": positions,
            "employees": employees,
            "selected_positions": selected_positions,
            "status": status,
            "understaffed": understaffed,
            "shifts_json": json.dumps(shifts_payload, cls=DjangoJSONEncoder),
            "employees_json": json.dumps(employees_payload, cls=DjangoJSONEncoder),
            "shift_form_state_json": json.dumps(shift_form_state, cls=DjangoJSONEncoder) if shift_form_state else "",
            "can_undo": can_undo,
        },
    )


# =============================================================================
# MANAGER SHIFT VIEWS - Individual Shift CRUD
# =============================================================================

@manager_required
@require_http_methods(["POST"])
def create_shift(request: HttpRequest) -> HttpResponse:
    """
    Creates a new shift from the shift form modal.
    Stores shift ID in session for undo capability.
    """
    shift = Shift(created_by=request.user)
    return _save_shift_from_post(
        request,
        shift=shift,
        mode="create",
        success_message="Shift created.",
        last_action="create",
    )


@manager_required
@require_http_methods(["POST"])
def update_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    """
    Updates an existing shift from the shift form modal.
    Only allows updating shifts created by this manager.
    """
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    return _save_shift_from_post(
        request,
        shift=shift,
        mode="update",
        shift_id=shift_id,
        success_message="Shift updated.",
    )


@manager_required
@require_http_methods(["POST"])
def delete_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    """
    Soft-deletes a shift (sets is_deleted=True).
    Stores shift ID in session for undo capability.
    """
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    shift.is_deleted = True
    shift.save(update_fields=["is_deleted", "updated_at"])
    request.session["manager_last_action"] = {"action": "delete", "shift_ids": [shift.id]}
    messages.success(request, "Shift deleted.")
    return _redirect_back(request, "manager_shifts")


@manager_required
@require_http_methods(["POST"])
def publish_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    """
    Publishes a single draft shift (changes status to PUBLISHED).
    
    Validates that no assigned employees are unavailable on the shift date.
    If validation fails, shows error and redirects without publishing.
    """
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    if shift.status != ShiftStatus.PUBLISHED:
        if shift.assignments.filter(employee__unavailability__date=shift.date).exists():
            messages.error(request, "Cannot publish shift: one or more assigned employees are unavailable that day.")
            return redirect(_manager_shifts_url_showing_shift(request, shift))
        shift.status = ShiftStatus.PUBLISHED
        shift.save(update_fields=["status", "updated_at"])
        request.session["manager_last_action"] = {"action": "publish", "shift_ids": [shift.id]}
        messages.success(request, "Shift published.")
    else:
        messages.info(request, "Shift is already published.")
    return redirect(_manager_shifts_url_showing_shift(request, shift))


@manager_required
def shift_details(request: HttpRequest, shift_id: int) -> JsonResponse:
    """
    JSON endpoint returning full shift details for the popup modal.
    
    Called when clicking a shift card to view/edit.
    Includes assigned employees with their names for display.
    """
    shift = get_object_or_404(
        Shift.objects.active().select_related("position"),
        pk=shift_id,
        created_by=request.user,
    )
    assigned = (
        User.objects.filter(assignments__shift=shift, role=UserRole.EMPLOYEE)
        .select_related("position")
        .order_by("last_name", "first_name")
    )
    return JsonResponse(
        {
            "id": shift.id,
            "date": shift.date.isoformat(),
            "start_time": shift.start_time.strftime("%H:%M"),
            "end_time": shift.end_time.strftime("%H:%M"),
            "position_id": shift.position_id,
            "position": shift.position.name,
            "status": shift.status,
            "capacity": shift.capacity,
            "assigned_count": shift.assignments.count(),
            "assigned_employees": [
                {"id": e.id, "name": e.get_full_name() or e.username, "employee_id": e.employee_id} for e in assigned
            ],
            "created_by": shift.created_by.get_full_name() or shift.created_by.username,
            "updated_at": shift.updated_at.isoformat(),
        }
    )


# =============================================================================
# MANAGER SHIFT VIEWS - Undo System
# =============================================================================

@manager_required
@require_http_methods(["POST"])
def undo_last_action(request: HttpRequest) -> HttpResponse:
    """
    Undoes the most recent shift action.
    
    Undo behavior by action type:
    - 'create': Soft-delete the created shift(s)
    - 'delete': Restore deleted shift(s) by setting is_deleted=False
    - 'publish': Revert published shift(s) back to draft status
    
    Only one undo is available (no redo, no undo history).
    Session key 'manager_last_action' is consumed on use.
    """
    last = request.session.pop("manager_last_action", None)
    if not last or not isinstance(last, dict):
        messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    action = (last.get("action") or "").lower()
    ids = [int(x) for x in (last.get("shift_ids") or []) if str(x).isdigit()]
    ids = sorted(set(ids))
    if not ids:
        messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    if action == "create":
        # Undo create => hide the created shift(s).
        count = Shift.objects.active().filter(created_by_id=request.user.id, id__in=ids).update(is_deleted=True)
        if count:
            messages.success(request, f"Undid create ({count} shift).")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    if action == "delete":
        count = Shift.objects.filter(created_by_id=request.user.id, id__in=ids, is_deleted=True).update(is_deleted=False)
        if count:
            messages.success(request, f"Restored {count} shift(s).")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    if action == "publish":
        count = Shift.objects.active().filter(
            created_by_id=request.user.id,
            id__in=ids,
            status=ShiftStatus.PUBLISHED,
        ).update(status=ShiftStatus.DRAFT)
        if count:
            messages.success(request, f"Reverted {count} shift(s) back to Draft.")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    messages.info(request, "Nothing to undo.")
    return _redirect_back(request, "manager_shifts")


# =============================================================================
# MANAGER RESOURCE VIEWS - Shift Templates
# =============================================================================
# Templates are reusable shift configurations (position, times, capacity).
# Managers can apply templates when creating new shifts to save time.

@manager_required
@require_http_methods(["GET"])
def templates_list(request: HttpRequest) -> JsonResponse:
    """
    JSON endpoint returning all shift templates for this manager.
    Used to populate the template dropdown in the shift form.
    """
    templates = (
        ShiftTemplate.objects.filter(created_by=request.user)
        .select_related("position")
        .order_by("name")
    )
    return JsonResponse(
        {
            "templates": [
                {
                    "id": t.id,
                    "name": t.name,
                    "position_id": t.position_id,
                    "position": t.position.name,
                    "start_time": t.start_time.strftime("%H:%M"),
                    "end_time": t.end_time.strftime("%H:%M"),
                    "capacity": t.capacity,
                }
                for t in templates
            ]
        }
    )


@manager_required
@require_http_methods(["POST"])
def template_create(request: HttpRequest) -> JsonResponse:
    """Creates a new shift template. Returns {ok: true, id: <new_id>}."""
    form = ShiftTemplateForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    template = form.save(commit=False)
    template.created_by = request.user
    template.full_clean()
    template.save()
    return JsonResponse({"ok": True, "id": template.id})


@manager_required
@require_http_methods(["POST"])
def template_update(request: HttpRequest, template_id: int) -> JsonResponse:
    """Updates an existing shift template. Returns {ok: true}."""
    template = get_object_or_404(ShiftTemplate, pk=template_id, created_by=request.user)
    form = ShiftTemplateForm(request.POST, instance=template)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    template = form.save(commit=False)
    template.full_clean()
    template.save()
    return JsonResponse({"ok": True})


@manager_required
@require_http_methods(["POST"])
def template_delete(request: HttpRequest, template_id: int) -> JsonResponse:
    """Deletes a shift template. Returns {ok: true}."""
    template = get_object_or_404(ShiftTemplate, pk=template_id, created_by=request.user)
    template.delete()
    return JsonResponse({"ok": True})


# =============================================================================
# MANAGER RESOURCE VIEWS - Positions
# =============================================================================
# Positions define job roles (e.g., Barista, Cashier).
# Employees have one position; shifts require a specific position.


@manager_required
@require_http_methods(["GET"])
def positions_list(request: HttpRequest) -> JsonResponse:
    """JSON endpoint returning all positions for the positions manager."""
    roles = Position.objects.order_by("name")
    return JsonResponse({"positions": [{"id": p.id, "name": p.name, "is_active": p.is_active} for p in roles]})


@manager_required
@require_http_methods(["POST"])
def position_create(request: HttpRequest) -> JsonResponse:
    """Creates a new position. Returns {ok: true, id: <new_id>}."""
    form = PositionForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    position = form.save()
    return JsonResponse({"ok": True, "id": position.id})


@manager_required
@require_http_methods(["POST"])
def position_update(request: HttpRequest, position_id: int) -> JsonResponse:
    """Updates an existing position. Returns {ok: true}."""
    position = get_object_or_404(Position, pk=position_id)
    form = PositionForm(request.POST, instance=position)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    form.save()
    return JsonResponse({"ok": True})


@manager_required
@require_http_methods(["POST"])
def position_delete(request: HttpRequest, position_id: int) -> JsonResponse:
    """
    Deletes a position if not in use.
    
    Checks for:
    - Employees assigned to this position
    - Shifts requiring this position
    - Templates using this position
    
    Returns error if any references exist (cannot orphan data).
    """
    position = get_object_or_404(Position, pk=position_id)
    if position.employees.exists():
        return JsonResponse({"ok": False, "error": "Cannot delete role: employees are assigned."}, status=400)
    if position.shifts.exists():
        return JsonResponse({"ok": False, "error": "Cannot delete role: shifts are using this role."}, status=400)
    if position.templates.exists():
        return JsonResponse({"ok": False, "error": "Cannot delete role: templates are using this role."}, status=400)
    try:
        position.delete()
    except ProtectedError:
        return JsonResponse(
            {"ok": False, "error": "Cannot delete role: it is referenced by existing data."},
            status=400,
        )
    return JsonResponse({"ok": True})


# =============================================================================
# EMPLOYEE VIEWS
# =============================================================================
# These views are for employees to view their assigned shifts and
# manage their unavailability (days they can't work).

@employee_required
@require_http_methods(["GET"])
def employee_shifts_view(request: HttpRequest) -> HttpResponse:
    """
    Employee's "My Shifts" calendar view.
    
    Shows only PUBLISHED shifts assigned to this employee.
    Supports week and month views (default: month).
    
    Also displays an "upcoming shifts" sidebar with the next 5 shifts
    including calculated hours for each.
    """
    today = timezone.localdate()
    view = (request.GET.get("view") or "month").lower()
    anchor = _parse_date(request.GET.get("date"), today)
    if view == "week":
        start, end = _week_bounds(anchor)
        if start.month == end.month and start.year == end.year:
            period_label = f"{start.strftime('%B %-d')}–{end.strftime('%-d')}"
        else:
            period_label = f"{start.strftime('%B %-d')}–{end.strftime('%B %-d')}"
    else:
        view = "month"
        start, end = _month_bounds(anchor)
        period_label = anchor.strftime("%B %Y")

    shift_qs = shifts_for_employee(employee_id=request.user.id, start=start, end=end)
    shifts_payload = [
        {
            "id": s.id,
            "date": s.date.isoformat(),
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "position": s.position.name,
            "is_past": s.is_past,
        }
        for s in shift_qs
    ]

    upcoming = list(shift_qs.filter(date__gte=today).order_by("date", "start_time")[:5])
    upcoming_items = []
    for s in upcoming:
        start_minutes = s.start_time.hour * 60 + s.start_time.minute
        end_minutes = s.end_time.hour * 60 + s.end_time.minute
        hours = max(0, end_minutes - start_minutes) / 60
        upcoming_items.append({"shift": s, "hours": hours})
    return render(
        request,
        "employee/employee-shifts.html",
        {
            "view": view,
            "anchor": anchor,
            "start": start,
            "end": end,
            "period_label": period_label,
            "today": today,
            "shifts_json": json.dumps(shifts_payload, cls=DjangoJSONEncoder),
            "upcoming": upcoming_items,
        },
    )


@employee_required
@require_http_methods(["GET"])
def employee_unavailability_view(request: HttpRequest) -> HttpResponse:
    """
    Employee's unavailability calendar view.
    
    Displays a month calendar where employees can click days to toggle
    their availability. Unavailable days are highlighted.
    
    Only supports month view (makes sense for availability planning).
    """
    today = timezone.localdate()
    anchor = _parse_date(request.GET.get("date"), today)
    start, end = _month_bounds(anchor)

    unavailable_days = list(
        EmployeeUnavailability.objects.filter(
            employee_id=request.user.id,
            date__gte=start,
            date__lte=end,
        ).values_list("date", flat=True)
    )

    return render(
        request,
        "employee/employee-unavailability.html",
        {
            "view": "month",
            "anchor": anchor,
            "start": start,
            "end": end,
            "period_label": anchor.strftime("%B %Y"),
            "today": today,
            "unavailable_json": json.dumps([d.isoformat() for d in unavailable_days], cls=DjangoJSONEncoder),
        },
    )


@employee_required
@require_http_methods(["POST"])
def employee_unavailability_toggle(request: HttpRequest) -> JsonResponse:
    """
    Toggles unavailability for a specific date.
    
    If employee is marked unavailable on that date, removes the record.
    If employee is available, creates an unavailability record.
    
    Returns {ok: true, date: 'YYYY-MM-DD', unavailable: true/false}.
    Called via AJAX when clicking a calendar day.
    """
    try:
        day = _parse_required_date(request.POST.get("date"), "date")
    except ValidationError as exc:
        msg_dict = getattr(exc, "message_dict", None)
        if isinstance(msg_dict, dict) and msg_dict.get("date"):
            msg = msg_dict["date"][0]
        else:
            msg = str(exc)
        return JsonResponse({"ok": False, "error": msg}, status=400)

    obj = EmployeeUnavailability.objects.filter(employee_id=request.user.id, date=day).first()
    if obj:
        obj.delete()
        return JsonResponse({"ok": True, "date": day.isoformat(), "unavailable": False})

    EmployeeUnavailability.objects.create(employee_id=request.user.id, date=day)
    return JsonResponse({"ok": True, "date": day.isoformat(), "unavailable": True})
