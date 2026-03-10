from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.contrib import messages
from django.core.exceptions import ValidationError
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse

from ..models import Shift
from ..use_cases import save_shift as save_shift_use_case


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


@dataclass(frozen=True)
class PeriodContext:
    view: str
    anchor: date
    start: date
    end: date
    label: str


def _build_period_context(view_raw: str | None, anchor: date) -> PeriodContext:
    view = (view_raw or "week").lower()
    if view == "month":
        start, end = _month_bounds(anchor)
        label = anchor.strftime("%B %Y")
        return PeriodContext(view="month", anchor=anchor, start=start, end=end, label=label)

    start, end = _week_bounds(anchor)
    if start.month == end.month and start.year == end.year:
        label = f"{start.strftime('%d')}. - {end.strftime('%d')}. {start.strftime('%b')}"
    else:
        label = f"{start.strftime('%d')}. {start.strftime('%b')} - {end.strftime('%d')}. {end.strftime('%b')}"
    return PeriodContext(view="week", anchor=anchor, start=start, end=end, label=label)

def _redirect_with_message(
    request: HttpRequest,
    *,
    level: int,
    text: str,
    to: str = "manager_shifts",
) -> HttpResponse:
    """Add flash message and redirect to target route/URL."""
    messages.add_message(request, level, text)
    return redirect(to)


def _manager_shifts_url_showing_shift(request: HttpRequest, shift: Shift) -> str:
    """Generate URL to manager_shifts page showing the given shift's date."""
    view = (request.POST.get("return_view") or "week").strip().lower()
    if view not in {"week", "month"}:
        view = "week"
    return f"{reverse('manager_shifts')}?view={view}&date={shift.date.isoformat()}"


def _save_shift_from_post(
    request: HttpRequest,
    *,
    shift: Shift,
    success_message: str,
) -> HttpResponse:
    result = save_shift_use_case(shift=shift, post_data=request.POST)
    if result.ok:
        saved_shift = result.shift
        return _redirect_with_message(
            request,
            level=messages.SUCCESS,
            text=success_message,
            to=_manager_shifts_url_showing_shift(request, saved_shift),
        )
    return _redirect_with_message(
        request,
        level=messages.ERROR,
        text=result.error or "Could not save shift.",
    )
