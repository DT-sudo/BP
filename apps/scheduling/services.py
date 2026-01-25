from __future__ import annotations

from datetime import date, time

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db import models
from django.db.models import Count
from .models import Assignment, EmployeeUnavailability, Shift, ShiftStatus


def _overlaps(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    return start_a < end_b and end_a > start_b


def _manager_shifts_qs(
    *,
    manager_id: int,
    start: date | None = None,
    end: date | None = None,
    shift_ids: list[int] | None = None,
):
    qs = Shift.objects.active().filter(created_by_id=manager_id)
    if shift_ids is not None:
        qs = qs.filter(id__in=shift_ids)
    if start is not None:
        qs = qs.filter(date__gte=start)
    if end is not None:
        qs = qs.filter(date__lte=end)
    return qs


def validate_shift_capacity(shift: Shift, desired_assigned_count: int) -> None:
    if desired_assigned_count > shift.capacity:
        raise ValidationError("Cannot assign more employees than shift capacity.")


def validate_employee_no_overlap(employee_id: int, shift: Shift) -> None:
    overlapping = (
        Shift.objects.active().filter(assignments__employee_id=employee_id, date=shift.date)
        .exclude(id=shift.id)
        .only("id", "start_time", "end_time", "position", "date")
    )
    for other in overlapping:
        if _overlaps(shift.start_time, shift.end_time, other.start_time, other.end_time):
            start = other.start_time.strftime("%H:%M")
            end = other.end_time.strftime("%H:%M")
            d = other.date.strftime("%b %d") if hasattr(other.date, "strftime") else str(other.date)
            raise ValidationError(f"Employee already assigned to: {other.position} {start}–{end} ({d})")


def validate_employee_available(employee_id: int, shift: Shift) -> None:
    if EmployeeUnavailability.objects.filter(employee_id=employee_id, date=shift.date).exists():
        raise ValidationError(f"Employee is unavailable on {shift.date.isoformat()}.")


def validate_employees_match_shift_position(shift: Shift, employee_ids: list[int]) -> None:
    User = get_user_model()
    valid_employee_ids = set(
        User.objects.filter(
            id__in=employee_ids,
            role="employee",
            is_active=True,
            position_id=shift.position_id,
        )
        .values_list("id", flat=True)
    )
    invalid = [eid for eid in employee_ids if eid not in valid_employee_ids]
    if invalid:
        raise ValidationError("Selected employees must match the shift position.")


@transaction.atomic
def set_shift_assignments(shift: Shift, employee_ids: list[int]) -> None:
    employee_ids = list(dict.fromkeys(employee_ids))
    validate_employees_match_shift_position(shift, employee_ids)

    current_count = len(employee_ids)
    validate_shift_capacity(shift, current_count)
    for employee_id in employee_ids:
        validate_employee_available(employee_id, shift)
        validate_employee_no_overlap(employee_id, shift)

    Assignment.objects.filter(shift=shift).exclude(employee_id__in=employee_ids).delete()
    existing = set(Assignment.objects.filter(shift=shift, employee_id__in=employee_ids).values_list("employee_id", flat=True))
    to_create = [Assignment(shift=shift, employee_id=eid) for eid in employee_ids if eid not in existing]
    Assignment.objects.bulk_create(to_create)


def shift_ids_blocked_by_unavailability(qs: models.QuerySet[Shift]) -> list[int]:
    return list(
        qs.filter(assignments__employee__unavailability__date=models.F("date"))
        .values_list("id", flat=True)
        .distinct()
    )


def publish_drafts_in_range(*, manager_id: int, start: date, end: date) -> tuple[list[int], list[int]]:
    qs = _manager_shifts_qs(manager_id=manager_id, start=start, end=end).filter(status=ShiftStatus.DRAFT)
    blocked_ids = shift_ids_blocked_by_unavailability(qs)
    publish_qs = qs.exclude(id__in=blocked_ids)
    published_ids = list(publish_qs.values_list("id", flat=True))
    if published_ids:
        publish_qs.update(status=ShiftStatus.PUBLISHED)
    return published_ids, blocked_ids


def publish_draft_ids(*, manager_id: int, shift_ids: list[int]) -> tuple[list[int], list[int]]:
    qs = _manager_shifts_qs(manager_id=manager_id, shift_ids=shift_ids).filter(status=ShiftStatus.DRAFT)
    blocked_ids = shift_ids_blocked_by_unavailability(qs)
    publish_qs = qs.exclude(id__in=blocked_ids)
    published_ids = list(publish_qs.values_list("id", flat=True))
    if published_ids:
        publish_qs.update(status=ShiftStatus.PUBLISHED)
    return published_ids, blocked_ids


def delete_drafts_in_range(*, manager_id: int, start: date, end: date) -> list[int]:
    qs = _manager_shifts_qs(manager_id=manager_id, start=start, end=end).filter(status=ShiftStatus.DRAFT)
    ids = list(qs.values_list("id", flat=True))
    if ids:
        qs.update(is_deleted=True)
    return ids


def delete_shift_ids(*, manager_id: int, shift_ids: list[int]) -> list[int]:
    qs = _manager_shifts_qs(manager_id=manager_id, shift_ids=shift_ids)
    ids = list(qs.values_list("id", flat=True))
    if ids:
        qs.update(is_deleted=True)
    return ids


def shifts_for_manager(
    *,
    manager_id: int,
    start: date,
    end: date,
    position_ids: list[int] | None = None,
    status: str | None = None,
    understaffed_only: bool = False,
):
    qs = (
        _manager_shifts_qs(manager_id=manager_id, start=start, end=end).select_related("position")
    )
    if position_ids:
        qs = qs.filter(position_id__in=position_ids)
    if status in (ShiftStatus.DRAFT, ShiftStatus.PUBLISHED):
        qs = qs.filter(status=status)
    if understaffed_only:
        qs = qs.annotate(assigned_total=Count("assignments")).filter(assigned_total__lt=models.F("capacity"))
    return qs


def shifts_for_employee(*, employee_id: int, start: date, end: date):
    return (
        Shift.objects.active().filter(
            assignments__employee_id=employee_id,
            date__gte=start,
            date__lte=end,
            status=ShiftStatus.PUBLISHED,
        )
        .select_related("position")
        .distinct()
        .order_by("date", "start_time")
    )
