from __future__ import annotations

import json

from django.contrib import messages
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from apps.accounts.decorators import manager_required
from apps.accounts.models import User, UserRole

from ..models import Position, Shift, ShiftStatus
from ..services import shifts_for_manager
from .helpers import (
    _parse_date,
    _week_bounds,
    _month_bounds,
    _redirect_back,
    _manager_shifts_url_showing_shift,
    _save_shift_from_post,
)


def _serialize_shifts(shifts):
    """Serialize shifts using Django values() for efficiency."""
    result = []
    for s in shifts:
        assigned_ids = [a.employee_id for a in s.assignments.all()]
        result.append({
            "id": s.id,
            "date": s.date.isoformat(),
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "position": s.position.name,
            "position_id": s.position_id,
            "capacity": s.capacity,
            "assigned_count": len(assigned_ids),
            "assigned_employee_ids": assigned_ids,
            "status": s.status,
            "is_past": s.is_past,
        })
    return result


def _serialize_employees(employees):
    """Serialize employees list for JSON."""
    return [
        {
            "id": e.id,
            "name": e.get_full_name() or e.username,
            "position_id": e.position_id,
            "position": e.position.name if e.position else "",
        }
        for e in employees
    ]

@manager_required
@require_http_methods(["GET", "POST"])
def manager_shifts(request: HttpRequest) -> HttpResponse:
    
    today = timezone.localdate()
    view = (request.GET.get("view") or "week").lower()
    anchor = _parse_date(request.GET.get("date"), today)

    if view == "month":
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

    shift_qs = shifts_for_manager(
        manager_id=request.user.id,
        start=start,
        end=end,
        position_ids=selected_positions or None,
        status=status or None,
        understaffed_only=understaffed,
    ).prefetch_related("assignments")

    employees = list(
        User.objects.filter(role=UserRole.EMPLOYEE, is_active=True)
        .select_related("position")
        .order_by("last_name", "first_name", "username")
    )

    shift_form_state = request.session.pop("shift_form_state", None)

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
            "shifts_json": json.dumps(_serialize_shifts(shift_qs), cls=DjangoJSONEncoder),
            "employees_json": json.dumps(_serialize_employees(employees), cls=DjangoJSONEncoder),
            "shift_form_state_json": json.dumps(shift_form_state, cls=DjangoJSONEncoder) if shift_form_state else "",
        },
    )


@manager_required
@require_http_methods(["POST"])
def create_shift(request: HttpRequest) -> HttpResponse:
    
    shift = Shift(created_by=request.user)
    return _save_shift_from_post(
        request,
        shift=shift,
        mode="create",
        success_message="Shift created.",
    )

@manager_required
@require_http_methods(["POST"])
def update_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    
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
    
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    shift.is_deleted = True
    shift.save(update_fields=["is_deleted", "updated_at"])
    messages.success(request, "Shift deleted.")
    return _redirect_back(request, "manager_shifts")


@manager_required
@require_http_methods(["POST"])
def publish_all_shifts(request: HttpRequest) -> HttpResponse:
    """Publish all draft shifts in the visible date range."""
    today = timezone.localdate()
    view = (request.POST.get("view") or "week").lower()
    anchor = _parse_date(request.POST.get("date"), today)
    
    if view == "month":
        start, end = _month_bounds(anchor)
    else:
        start, end = _week_bounds(anchor)
    
    drafts = Shift.objects.active().filter(
        created_by=request.user,
        status=ShiftStatus.DRAFT,
        date__gte=start,
        date__lte=end,
    )
    
    # Exclude shifts with unavailable employees
    blocked_ids = list(
        drafts.filter(assignments__employee__unavailability__date=models.F("date"))
        .values_list("id", flat=True)
        .distinct()
    )
    
    publishable = drafts.exclude(id__in=blocked_ids)
    count = publishable.update(status=ShiftStatus.PUBLISHED)
    
    if count:
        messages.success(request, f"Published {count} shift{'s' if count != 1 else ''}.")
    else:
        messages.info(request, "No draft shifts to publish.")
    
    return _redirect_back(request, "manager_shifts")


@manager_required
@require_http_methods(["POST"])
def publish_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    if shift.status != ShiftStatus.PUBLISHED:
        if shift.assignments.filter(employee__unavailability__date=shift.date).exists():
            messages.error(request, "Cannot publish shift: one or more assigned employees are unavailable that day.")
            return redirect(_manager_shifts_url_showing_shift(request, shift))
        shift.status = ShiftStatus.PUBLISHED
        shift.save(update_fields=["status", "updated_at"])
        messages.success(request, "Shift published.")
    else:
        messages.info(request, "Shift is already published.")
    return redirect(_manager_shifts_url_showing_shift(request, shift))

@manager_required
@require_http_methods(["GET"])
def shift_details(request: HttpRequest, shift_id: int) -> JsonResponse:
    
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
    return JsonResponse({
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
            {"id": e.id, "name": e.get_full_name() or e.username, "employee_id": e.employee_id}
            for e in assigned
        ],
        "created_by": shift.created_by.get_full_name() or shift.created_by.username,
        "updated_at": shift.updated_at.isoformat(),
    })
