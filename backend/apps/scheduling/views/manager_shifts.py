from __future__ import annotations

import json

from django.contrib import messages
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Count, Prefetch
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from apps.accounts.decorators import manager_required
from apps.accounts.models import User, UserRole

from ..models import Assignment, Position, Shift
from ..services import shifts_for_manager
from ..use_cases import publish_shift as publish_shift_use_case, publish_shifts_in_period
from .helpers import (
    PeriodContext,
    _build_period_context,
    _parse_date,
    _redirect_with_message,
    _manager_shifts_url_showing_shift,
    _save_shift_from_post,
)


def _build_shift_payload(shift_qs):
    shifts = (
        shift_qs.annotate(assigned_count=Count("assignments"))
        .prefetch_related(
            Prefetch(
                "assignments",
                queryset=Assignment.objects.only("employee_id"),
                to_attr="prefetched_assignments",
            )
        )
    )

    now_local = timezone.localtime()
    today = now_local.date()
    current_time = now_local.time().replace(tzinfo=None)

    payload = []
    for shift in shifts:
        assigned_ids = [a.employee_id for a in getattr(shift, "prefetched_assignments", [])]
        shift_date = shift.date
        shift_end = shift.end_time
        is_past = shift_date < today or (shift_date == today and shift_end < current_time)
        payload.append(
            {
                "id": shift.id,
                "date": shift_date.isoformat(),
                "start_time": shift.start_time.strftime("%H:%M"),
                "end_time": shift_end.strftime("%H:%M"),
                "position": shift.position.name,
                "position_id": shift.position_id,
                "capacity": shift.capacity,
                "assigned_count": shift.assigned_count,
                "assigned_employee_ids": assigned_ids,
                "status": shift.status,
                "is_past": is_past,
            }
        )
    return payload


def _build_employee_payload(employee_qs):
    return [
        {
            "id": e.id,
            "name": (e.get_full_name() or "").strip() or e.username,
            "position_id": e.position_id,
            "position": e.position.name if e.position else "",
        }
        for e in employee_qs
    ]


def _get_manager_shift_or_404(request: HttpRequest, shift_id: int) -> Shift:
    return get_object_or_404(Shift.objects, pk=shift_id, created_by=request.user)

@manager_required
@require_GET
def manager_shifts(request: HttpRequest) -> HttpResponse:
    
    today = timezone.localdate()
    anchor = _parse_date(request.GET.get("date"), today)
    period: PeriodContext = _build_period_context(request.GET.get("view") or "week", anchor)

    positions = Position.objects.filter(is_active=True).order_by("name")
    selected_positions = [int(p) for p in request.GET.getlist("positions") if p.isdigit()]
    status = (request.GET.get("status") or "").lower()
    understaffed = (request.GET.get("show") or "").lower() == "understaffed"

    shift_qs = shifts_for_manager(
        manager_id=request.user.id,
        start=period.start,
        end=period.end,
        position_ids=selected_positions or None,
        status=status or None,
        understaffed_only=understaffed,
    )

    employee_qs = User.objects.filter(role=UserRole.EMPLOYEE, is_active=True).select_related("position").order_by(
        "last_name", "first_name", "username"
    )
    employees = list(employee_qs)

    return render(
        request,
        "manager/manager-shifts.html",
        {
            "view": period.view,
            "anchor": period.anchor,
            "start": period.start,
            "end": period.end,
            "period_label": period.label,
            "today": today,
            "positions": positions,
            "employees": employees,
            "selected_positions": selected_positions,
            "status": status,
            "understaffed": understaffed,
            "shifts_json": json.dumps(_build_shift_payload(shift_qs), cls=DjangoJSONEncoder),
            "employees_json": json.dumps(_build_employee_payload(employees), cls=DjangoJSONEncoder),
        },
    )


@manager_required
@require_POST
def save_shift(request: HttpRequest, shift_id: int | None = None) -> HttpResponse:
    is_update = shift_id is not None
    shift = _get_manager_shift_or_404(request, shift_id) if is_update else Shift(created_by=request.user)
    return _save_shift_from_post(
        request,
        shift=shift,
        success_message="Shift updated." if is_update else "Shift created.",
    )

@manager_required
@require_POST
def delete_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    
    shift = _get_manager_shift_or_404(request, shift_id)
    shift.delete()
    return _redirect_with_message(request, level=messages.SUCCESS, text="Shift deleted.")


@manager_required
@require_POST
def publish_all_shifts(request: HttpRequest) -> HttpResponse:
    """Publish all draft shifts in the visible date range."""
    today = timezone.localdate()
    anchor = _parse_date(request.POST.get("date"), today)
    period = _build_period_context(request.POST.get("view") or "week", anchor)

    count = publish_shifts_in_period(
        manager_id=request.user.id,
        start=period.start,
        end=period.end,
    )
    if count:
        return _redirect_with_message(
            request,
            level=messages.SUCCESS,
            text=f"Published {count} shift{'s' if count != 1 else ''}.",
            to="manager_shifts",
        )
    return _redirect_with_message(
        request,
        level=messages.INFO,
        text="No draft shifts to publish.",
        to="manager_shifts",
    )


@manager_required
@require_POST
def publish_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    
    shift = _get_manager_shift_or_404(request, shift_id)
    target_url = _manager_shifts_url_showing_shift(request, shift)
    if publish_shift_use_case(shift=shift):
        return _redirect_with_message(request, level=messages.SUCCESS, text="Shift published.", to=target_url)
    return _redirect_with_message(request, level=messages.INFO, text="Shift is already published.", to=target_url)
