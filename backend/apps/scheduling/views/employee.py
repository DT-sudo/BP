from __future__ import annotations

import json

from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from apps.accounts.decorators import employee_required

from ..models import Assignment, EmployeeUnavailability
from ..services import shifts_for_employee
from .helpers import _parse_date, _parse_required_date, _month_bounds


@employee_required
@require_GET
def employee_shifts_view(request: HttpRequest) -> HttpResponse:

    today = timezone.localdate()
    anchor = _parse_date(request.GET.get("date"), today)
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

    unavailable_days = list(
        EmployeeUnavailability.objects.filter(
            employee_id=request.user.id,
            date__gte=start,
            date__lte=end,
        ).values_list("date", flat=True)
    )

    return render(
        request,
        "employee/employee-shifts.html",
        {
            "anchor": anchor,
            "start": start,
            "end": end,
            "period_label": period_label,
            "today": today,
            "toggle_url": reverse("employee_unavailability_toggle"),
            "shifts_json": json.dumps(shifts_payload, cls=DjangoJSONEncoder),
            "unavailable_json": json.dumps(
                [d.isoformat() for d in unavailable_days],
                cls=DjangoJSONEncoder,
            ),
        },
    )


@employee_required
@require_POST
def employee_unavailability_toggle(request: HttpRequest) -> JsonResponse:

    try:
        day = _parse_required_date(request.POST.get("date"), "date")
    except ValidationError as exc:
        msg_dict = getattr(exc, "message_dict", None)
        if isinstance(msg_dict, dict) and msg_dict.get("date"):
            msg = msg_dict["date"][0]
        else:
            msg = str(exc)
        return JsonResponse({"ok": False, "error": msg}, status=400)

    today = timezone.localdate()

    # Rule 1: only tomorrow or later
    if day <= today:
        return JsonResponse(
            {"ok": False, "error": "Only dates from tomorrow onwards can be marked as unavailable."},
            status=400,
        )

    # Rule 2: cannot mark a day with an active shift assignment
    has_shift = Assignment.objects.filter(
        employee_id=request.user.id,
        shift__date=day,
    ).exists()
    if has_shift:
        return JsonResponse(
            {"ok": False, "error": "You have a shift assigned on this day."},
            status=400,
        )

    obj = EmployeeUnavailability.objects.filter(
        employee_id=request.user.id, date=day
    ).first()

    if obj:
        obj.delete()
        return JsonResponse({"ok": True, "date": day.isoformat(), "unavailable": False})

    EmployeeUnavailability.objects.create(employee_id=request.user.id, date=day)
    return JsonResponse({"ok": True, "date": day.isoformat(), "unavailable": True})
