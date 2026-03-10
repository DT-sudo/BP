from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from .models import Assignment, EmployeeUnavailability, Shift, ShiftStatus

def _normalize_employee_ids(employee_ids: list[int]) -> list[int]:
    return list(dict.fromkeys(employee_ids))


def _check_position_match(shift: Shift, employee_ids: list[int]) -> None:
    if not employee_ids:
        return

    User = get_user_model()
    valid_ids = set(
        User.objects.filter(
            id__in=employee_ids,
            role="employee",
            is_active=True,
            position_id=shift.position_id,
        ).values_list("id", flat=True)
    )
    if len(valid_ids) != len(employee_ids):
        raise ValidationError("Selected employees must match the shift position.")


def _check_capacity(shift: Shift, employee_ids: list[int]) -> None:
    if len(employee_ids) > shift.capacity:
        raise ValidationError("Cannot assign more employees than shift capacity.")


def _check_availability(shift: Shift, employee_ids: list[int]) -> None:
    if not employee_ids:
        return
    has_unavailable = EmployeeUnavailability.objects.filter(
        employee_id__in=employee_ids,
        date=shift.date,
    ).exists()
    if has_unavailable:
        raise ValidationError(f"Employee is unavailable on {shift.date.isoformat()}.")


def _check_no_overlap(shift: Shift, employee_ids: list[int]) -> None:
    if not employee_ids:
        return

    conflict = (
        Assignment.objects.filter(
            employee_id__in=employee_ids,
            shift__date=shift.date,
            shift__start_time__lt=shift.end_time,
            shift__end_time__gt=shift.start_time,
        )
        .exclude(shift_id=shift.id)
        .select_related("shift__position")
        .order_by("shift__start_time")
        .first()
    )
    if not conflict:
        return

    overlapping = conflict.shift
    start = overlapping.start_time.strftime("%H:%M")
    end = overlapping.end_time.strftime("%H:%M")
    day = overlapping.date.strftime("%b %d")
    raise ValidationError(f"Employee already assigned to: {overlapping.position} {start}–{end} ({day})")


def _sync_assignments(shift: Shift, employee_ids: list[int]) -> None:
    Assignment.objects.filter(shift=shift).delete()
    if not employee_ids:
        return
    Assignment.objects.bulk_create([Assignment(shift=shift, employee_id=eid) for eid in employee_ids])


def assign_employees_to_shift(shift: Shift, employee_ids: list[int]) -> None:
    employee_ids = _normalize_employee_ids(employee_ids)
    _check_position_match(shift, employee_ids)
    _check_capacity(shift, employee_ids)
    _check_availability(shift, employee_ids)
    _check_no_overlap(shift, employee_ids)
    _sync_assignments(shift, employee_ids)


def shifts_for_manager(
    *,
    manager_id: int,
    start: date,
    end: date,
    position_ids: list[int] | None = None,
    status: str | None = None,
    understaffed_only: bool = False,
):
    
    qs = Shift.objects.filter(created_by_id=manager_id, date__gte=start, date__lte=end).select_related("position")
    if position_ids:
        qs = qs.filter(position_id__in=position_ids)
    if status in (ShiftStatus.DRAFT, ShiftStatus.PUBLISHED):
        qs = qs.filter(status=status)
    if understaffed_only:
        qs = qs.annotate(assigned_total=models.Count("assignments")).filter(assigned_total__lt=models.F("capacity"))
    return qs

def shifts_for_employee(*, employee_id: int, start: date, end: date):
    
    return (
        Shift.objects.filter(
            assignments__employee_id=employee_id,
            date__gte=start,
            date__lte=end,
            status=ShiftStatus.PUBLISHED,
        )
        .select_related("position")
        .distinct()
        .order_by("date", "start_time")
    )
