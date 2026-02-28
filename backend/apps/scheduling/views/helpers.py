"""
Simplified helper functions for scheduling views.
Uses Django Forms for validation instead of manual parsing.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from django.contrib import messages
from django.db import transaction
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme

from apps.accounts.models import User, UserRole
from django.core.exceptions import ValidationError
from ..forms import ShiftForm
from ..models import Shift
from ..services import set_shift_assignments


def _parse_date(value: str | None, default: date) -> date:
    """Parse YYYY-MM-DD date string, return default if invalid."""
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _parse_required_date(value: str | None, field: str) -> date:
    """Parse required YYYY-MM-DD date string, raise ValidationError if invalid."""
    raw = (value or "").strip()
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValidationError({field: "Enter a valid date."})


def _week_bounds(anchor: date) -> tuple[date, date]:
    """Return (start_of_week, end_of_week) for the given anchor date."""
    start = anchor - timedelta(days=anchor.weekday())
    return start, start + timedelta(days=6)


def _month_bounds(anchor: date) -> tuple[date, date]:
    """Return (first_day, last_day) of the month for the given anchor date."""
    start = anchor.replace(day=1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, next_month - timedelta(days=1)


def _redirect_back(request: HttpRequest, fallback: str = "manager_shifts") -> HttpResponse:
    """Redirect to HTTP_REFERER if safe, otherwise to fallback URL."""
    ref = request.META.get("HTTP_REFERER")
    if ref and url_has_allowed_host_and_scheme(
        url=ref,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return redirect(ref)
    return redirect(fallback)


def _manager_shifts_url_showing_shift(request: HttpRequest, shift: Shift) -> str:
    """Generate URL to manager_shifts page showing the given shift's date, preserving view."""
    from urllib.parse import urlparse, parse_qs
    ref = request.META.get("HTTP_REFERER", "")
    view = "week"
    if ref:
        qs = parse_qs(urlparse(ref).query)
        view = qs.get("view", ["week"])[0]
    return f"{reverse('manager_shifts')}?view={view}&date={shift.date.isoformat()}"


def _save_shift_from_post(
    request: HttpRequest,
    *,
    shift: Shift,
    mode: str,
    shift_id: int | None = None,
    success_message: str,
) -> HttpResponse:
    """Validate and save shift using ShiftForm, handle errors gracefully."""
    employees = User.objects.filter(role=UserRole.EMPLOYEE, is_active=True)

    data = request.POST.copy()
    data["position"] = data.get("position_id", "")

    form = ShiftForm(data, instance=shift, employees=employees)

    if form.is_valid():
        try:
            with transaction.atomic():
                saved_shift = form.save()
                employee_ids = form.cleaned_data.get("employee_ids") or []
                set_shift_assignments(saved_shift, employee_ids)

            messages.success(request, success_message)
            return redirect(_manager_shifts_url_showing_shift(request, saved_shift))
        except Exception as exc:
            messages.error(request, f"Could not {mode} shift: {exc}")
    else:
        for field, errors in form.errors.items():
            field_name = field.replace("_", " ").title()
            messages.error(request, f"{field_name}: {errors[0]}")
            break

        request.session["shift_form_state"] = {
            "mode": mode,
            "shift_id": shift_id,
            "date": request.POST.get("date"),
            "start_time": request.POST.get("start_time"),
            "end_time": request.POST.get("end_time"),
            "position_id": request.POST.get("position_id"),
            "capacity": request.POST.get("capacity"),
            "publish": request.POST.get("publish") == "1",
            "employee_ids": [int(e) for e in request.POST.getlist("employee_ids") if e.isdigit()],
            "error_field": list(form.errors.keys())[0] if form.errors else None,
        }

    return _redirect_back(request)
