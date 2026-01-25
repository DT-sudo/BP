"""
=============================================================================
SCHEDULING SERVICES (Business Logic Layer)
=============================================================================

This module contains the core business logic for shift scheduling,
separated from views to keep views thin and logic reusable/testable.

Key responsibilities:

1. VALIDATION
   - Capacity constraints (can't over-assign shifts)
   - Overlap detection (employee can't work two shifts at once)
   - Availability checks (can't assign unavailable employees)
   - Position matching (employees must match shift's required position)

2. ASSIGNMENT MANAGEMENT
   - set_shift_assignments() - atomic update of shift's employee list

3. BULK OPERATIONS
   - publish_drafts_in_range() - publish all drafts in date range
   - publish_draft_ids() - publish specific shifts by ID
   - delete_drafts_in_range() - soft-delete drafts in date range
   - delete_shift_ids() - soft-delete specific shifts by ID

4. QUERY HELPERS
   - shifts_for_manager() - filtered shift list for manager view
   - shifts_for_employee() - shifts assigned to specific employee

All validation raises django.core.exceptions.ValidationError with
user-friendly messages suitable for display.

=============================================================================
"""
from __future__ import annotations

from datetime import date, time

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db import models
from django.db.models import Count
from .models import Assignment, EmployeeUnavailability, Shift, ShiftStatus


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _overlaps(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    """
    Checks if two time ranges overlap.
    
    Uses the standard interval overlap formula:
    Two ranges [A_start, A_end) and [B_start, B_end) overlap if:
        A_start < B_end AND A_end > B_start
    
    Returns True if ranges overlap, False otherwise.
    """
    return start_a < end_b and end_a > start_b


def _manager_shifts_qs(
    *,
    manager_id: int,
    start: date | None = None,
    end: date | None = None,
    shift_ids: list[int] | None = None,
):
    """
    Base QuerySet builder for manager's shifts.
    
    Filters:
    - Only active (non-deleted) shifts
    - Only shifts created by this manager
    - Optional date range (start/end)
    - Optional specific shift IDs
    
    Used internally by publish/delete operations.
    """
    qs = Shift.objects.active().filter(created_by_id=manager_id)
    if shift_ids is not None:
        qs = qs.filter(id__in=shift_ids)
    if start is not None:
        qs = qs.filter(date__gte=start)
    if end is not None:
        qs = qs.filter(date__lte=end)
    return qs


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================
# These functions validate business rules and raise ValidationError if violated.
# Called during shift creation/update to ensure data integrity.

def validate_shift_capacity(shift: Shift, desired_assigned_count: int) -> None:
    """
    Ensures the number of assigned employees doesn't exceed shift capacity.
    
    Args:
        shift: The shift being validated
        desired_assigned_count: How many employees would be assigned
    
    Raises:
        ValidationError if assigned count > capacity
    """
    if desired_assigned_count > shift.capacity:
        raise ValidationError("Cannot assign more employees than shift capacity.")


def validate_employee_no_overlap(employee_id: int, shift: Shift) -> None:
    """
    Ensures an employee isn't assigned to overlapping shifts on the same day.
    
    Algorithm:
    1. Find all other shifts on the same day where this employee is assigned
    2. Check if any of them overlap in time with the target shift
    3. If overlap found, raise ValidationError with details
    
    This prevents double-booking employees.
    """
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
    """
    Ensures an employee hasn't marked themselves unavailable on the shift date.
    
    Checks EmployeeUnavailability records. Raises ValidationError if found.
    """
    if EmployeeUnavailability.objects.filter(employee_id=employee_id, date=shift.date).exists():
        raise ValidationError(f"Employee is unavailable on {shift.date.isoformat()}.")


def validate_employees_match_shift_position(shift: Shift, employee_ids: list[int]) -> None:
    """
    Ensures all assigned employees have the same position as the shift requires.
    
    A Barista shift should only have Baristas assigned, etc.
    
    Also validates that employees exist, are active, and have the employee role.
    """
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


# =============================================================================
# ASSIGNMENT MANAGEMENT
# =============================================================================

@transaction.atomic
def set_shift_assignments(shift: Shift, employee_ids: list[int]) -> None:
    """
    Atomically replaces all assignments for a shift with a new employee list.
    
    This is the main function for updating who's assigned to a shift.
    
    Process:
    1. Deduplicate employee IDs
    2. Validate position matching
    3. Validate capacity constraint
    4. Validate each employee's availability and no overlaps
    5. Remove assignments for employees not in new list
    6. Create new assignments for employees not already assigned
    
    Uses @transaction.atomic to ensure all-or-nothing update.
    If any validation fails, no changes are persisted.
    """
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
    """
    Finds shifts that can't be published because assigned employees are unavailable.
    
    Uses a join query to find shifts where:
    - An employee is assigned to the shift
    - That employee has an unavailability record for the shift's date
    
    Returns list of shift IDs that are blocked.
    """
    return list(
        qs.filter(assignments__employee__unavailability__date=models.F("date"))
        .values_list("id", flat=True)
        .distinct()
    )


# =============================================================================
# BULK OPERATIONS
# =============================================================================
# These functions handle batch publish/delete operations from the manager UI.
# They return lists of affected IDs for undo functionality.

def publish_drafts_in_range(*, manager_id: int, start: date, end: date) -> tuple[list[int], list[int]]:
    """
    Publishes all draft shifts in a date range.
    
    Args:
        manager_id: The manager whose shifts to publish
        start, end: Date range (inclusive)
    
    Returns:
        (published_ids, blocked_ids) - IDs that were published vs blocked
    
    Shifts are blocked if assigned employees are unavailable on the shift date.
    Blocked shifts remain as drafts with no changes.
    """
    qs = _manager_shifts_qs(manager_id=manager_id, start=start, end=end).filter(status=ShiftStatus.DRAFT)
    blocked_ids = shift_ids_blocked_by_unavailability(qs)
    publish_qs = qs.exclude(id__in=blocked_ids)
    published_ids = list(publish_qs.values_list("id", flat=True))
    if published_ids:
        publish_qs.update(status=ShiftStatus.PUBLISHED)
    return published_ids, blocked_ids


def publish_draft_ids(*, manager_id: int, shift_ids: list[int]) -> tuple[list[int], list[int]]:
    """
    Publishes specific draft shifts by ID.
    
    Same as publish_drafts_in_range but for explicit shift selection.
    Used by the "publish selected" feature in selection mode.
    """
    qs = _manager_shifts_qs(manager_id=manager_id, shift_ids=shift_ids).filter(status=ShiftStatus.DRAFT)
    blocked_ids = shift_ids_blocked_by_unavailability(qs)
    publish_qs = qs.exclude(id__in=blocked_ids)
    published_ids = list(publish_qs.values_list("id", flat=True))
    if published_ids:
        publish_qs.update(status=ShiftStatus.PUBLISHED)
    return published_ids, blocked_ids


def delete_drafts_in_range(*, manager_id: int, start: date, end: date) -> list[int]:
    """
    Soft-deletes all draft shifts in a date range.
    
    Only affects drafts (published shifts are not deleted).
    Returns list of deleted IDs for undo functionality.
    """
    qs = _manager_shifts_qs(manager_id=manager_id, start=start, end=end).filter(status=ShiftStatus.DRAFT)
    ids = list(qs.values_list("id", flat=True))
    if ids:
        qs.update(is_deleted=True)
    return ids


def delete_shift_ids(*, manager_id: int, shift_ids: list[int]) -> list[int]:
    """
    Soft-deletes specific shifts by ID.
    
    Unlike delete_drafts_in_range, this can delete published shifts too.
    Used by the "delete selected" feature in selection mode.
    """
    qs = _manager_shifts_qs(manager_id=manager_id, shift_ids=shift_ids)
    ids = list(qs.values_list("id", flat=True))
    if ids:
        qs.update(is_deleted=True)
    return ids


# =============================================================================
# QUERY FUNCTIONS
# =============================================================================
# These functions build filtered QuerySets for the view layer.

def shifts_for_manager(
    *,
    manager_id: int,
    start: date,
    end: date,
    position_ids: list[int] | None = None,
    status: str | None = None,
    understaffed_only: bool = False,
):
    """
    Returns shifts for the manager calendar view with optional filters.
    
    Filters:
    - Date range (required)
    - Position IDs (optional, shows all if None)
    - Status (optional, 'draft' or 'published')
    - Understaffed only (optional, shows shifts with assigned < capacity)
    
    Returns a QuerySet with position pre-fetched for efficiency.
    """
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
    """
    Returns published shifts assigned to a specific employee.
    
    Used for the employee's "My Shifts" calendar view.
    Only returns PUBLISHED shifts (employees don't see drafts).
    
    Returns a QuerySet ordered by date/time with position pre-fetched.
    """
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
