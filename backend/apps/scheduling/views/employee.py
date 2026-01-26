"""
=============================================================================
EMPLOYEE VIEWS
=============================================================================

Views for employee-facing functionality:
- employee_shifts_view() - Employee's assigned shifts calendar
- employee_unavailability_view() - Mark unavailable dates calendar
- employee_unavailability_toggle() - Toggle date availability (AJAX)

=============================================================================
"""
from __future__ import annotations

import json

from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from apps.accounts.decorators import employee_required

from ..models import EmployeeUnavailability
from ..services import shifts_for_employee
from .helpers import _parse_date, _parse_required_date, _week_bounds, _month_bounds


# =============================================================================
# MY SHIFTS
# =============================================================================


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

    # Build upcoming shifts list
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


# =============================================================================
# UNAVAILABILITY
# =============================================================================


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
            "unavailable_json": json.dumps(
                [d.isoformat() for d in unavailable_days],
                cls=DjangoJSONEncoder
            ),
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

    obj = EmployeeUnavailability.objects.filter(
        employee_id=request.user.id, date=day
    ).first()
    
    if obj:
        obj.delete()
        return JsonResponse({"ok": True, "date": day.isoformat(), "unavailable": False})

    EmployeeUnavailability.objects.create(employee_id=request.user.id, date=day)
    return JsonResponse({"ok": True, "date": day.isoformat(), "unavailable": True})
