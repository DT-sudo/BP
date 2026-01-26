"""
=============================================================================
HELPER FUNCTIONS
=============================================================================

Private helper functions used by scheduling views.
These functions handle:
- Date/time parsing and validation
- Date range calculations (week/month bounds)
- URL manipulation for redirects
- Form data reading and state management

Note: These functions are prefixed with underscore (_) to indicate
they are private/internal. They should not be imported outside this package.
=============================================================================
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from ..models import Shift, ShiftStatus
from ..services import set_shift_assignments


# =============================================================================
# DATE/TIME PARSING
# =============================================================================


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
# DATE RANGE CALCULATIONS
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
# REDIRECT & URL HANDLING
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
# FORM DATA HANDLING
# =============================================================================


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
    """
    from django.contrib import messages

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
