"""
=============================================================================
SCHEDULING MODELS
=============================================================================

Core data models for the shift scheduling system:

1. Position - Job roles/positions (e.g., "Barista", "Cashier")
2. Shift - Scheduled work shifts with date, time, position, capacity
3. Assignment - Links employees to shifts (many-to-many through model)
4. EmployeeUnavailability - Days when employees can't work

Key patterns used:
- Soft delete (is_deleted flag) for Shift model
- Custom QuerySet manager for filtering active shifts
- Shared validation function for time/capacity constraints
- TextChoices for type-safe status values

=============================================================================
"""
from __future__ import annotations

from datetime import datetime

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


# =============================================================================
# SHARED VALIDATION
# =============================================================================

def _validate_time_range_and_capacity(*, start_time, end_time, capacity) -> None:
    """
    Validates common constraints for shifts.
    
    Checks:
    - End time must be after start time
    - Capacity must be at least 1
    
    Raises ValidationError with field-specific messages if invalid.
    """
    errors: dict[str, str] = {}
    if start_time and end_time and start_time >= end_time:
        errors["end_time"] = "End time must be after start time."
    if capacity is not None and capacity < 1:
        errors["capacity"] = "Capacity must be at least 1."
    if errors:
        raise ValidationError(errors)


# =============================================================================
# POSITION MODEL
# =============================================================================

class Position(models.Model):
    """
    Represents a job role/position in the organization.
    Examples: "Barista", "Cashier", "Shift Supervisor"
    Each employee is assigned one position, and each shift requires
    employees of a specific position.
    Soft-deactivation via is_active allows hiding positions without
    breaking existing shift/employee relationships.
    """
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True) 

    def clean(self) -> None:
        """Validates and normalizes the position name."""
        name = (self.name or "").strip()
        if len(name) > 25:
            raise ValidationError({"name": "Position name must be max 25 characters."})
        self.name = name

    def __str__(self) -> str:
        return self.name


# =============================================================================
# SHIFT MODEL
# =============================================================================

#     ShiftStatus — это по сути контейнер (класс-список) для статусов, который делает код удобнее, безопаснее и чище.
#     Технически, можно было бы просто писать строки ("draft", "published") везде вручную, но: 
#     С классом меньше ошибок (опечаток).
#     Легче менять и поддерживать.
#     Удобнее автодополнение и поиск по коду.
#     Django автоматически даёт методы для работы с такими статусами.
class ShiftStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class ShiftQuerySet(models.QuerySet):
    """
    Custom QuerySet providing soft-delete filtering.
    
    Usage:
        Shift.objects.active()  # Excludes soft-deleted shifts
        Shift.objects.all()     # Includes everything (for admin)
    """
    def active(self):
        """Returns only non-deleted shifts."""
        return self.filter(is_deleted=False)


class Shift(models.Model):
    """
    Represents a scheduled work shift.
    
    A shift defines:
    - When: date + start_time/end_time
    - What role: position (ForeignKey to Position)
    - How many: capacity (max employees assignable)
    - State: draft (editable) or published (visible to employees)
    
    Employees are assigned via the Assignment model (many-to-many).
    
    Soft Delete Pattern:
    - is_deleted=True hides shift from normal queries
    - Use Shift.objects.active() to get only visible shifts
    - Allows undo functionality without losing data
    
    Ownership:
    - created_by tracks which manager created the shift
    - Managers can only edit/delete their own shifts
    """
    # Schedule fields
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    
    # Position/role requirement
    position = models.ForeignKey(
        Position, 
        on_delete=models.PROTECT,  # Can't delete position with existing shifts
        related_name="shifts"
    )
    
    # Staffing
    capacity = models.PositiveIntegerField(default=1)  # Max assignable employees
    
    # Workflow state
    status = models.CharField(
        max_length=20, 
        choices=ShiftStatus.choices, 
        default=ShiftStatus.DRAFT
    )
    
    # Soft delete flag (indexed for query performance)
    is_deleted = models.BooleanField(default=False, db_index=True)

    # Ownership and timestamps
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,  # Can't delete user with existing shifts
        related_name="created_shifts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Custom manager with .active() method
    objects = ShiftQuerySet.as_manager()

    class Meta:
        ordering = ["date", "start_time"]  # Chronological by default

    def clean(self) -> None:
        """Validates time range and capacity constraints."""
        _validate_time_range_and_capacity(
            start_time=self.start_time,
            end_time=self.end_time,
            capacity=self.capacity,
        )

    @property
    def is_past(self) -> bool:
        """
        Returns True if the shift has already ended.
        
        Uses the shift's end_time combined with date, compared to current time.
        Used for visual styling (graying out past shifts) and business logic.
        """
        dt_end = datetime.combine(self.date, self.end_time, tzinfo=timezone.get_current_timezone())
        return dt_end < timezone.now()


# =============================================================================
# ASSIGNMENT MODEL (Many-to-Many Through Table)
# =============================================================================

class Assignment(models.Model):
    """
    Links employees to shifts (explicit many-to-many relationship).
    
    Why an explicit model instead of ManyToManyField?
    - Allows adding extra fields later (e.g., confirmed_at, notes)
    - More explicit control over the relationship
    - Easier to query/filter assignments directly
    
    The unique constraint prevents assigning the same employee twice.
    CASCADE delete ensures assignments are removed when shift/employee is deleted.
    """
    shift = models.ForeignKey(
        Shift, 
        on_delete=models.CASCADE,  # Delete assignments when shift deleted
        related_name="assignments"
    )
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE,  # Delete assignments when employee deleted
        related_name="assignments"
    )

    class Meta:
        constraints = [
            # Prevent duplicate assignments
            models.UniqueConstraint(
                fields=["shift", "employee"], 
                name="unique_employee_per_shift"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.employee.employee_id} -> {self.shift_id}"


# =============================================================================
# EMPLOYEE UNAVAILABILITY MODEL
# =============================================================================

class EmployeeUnavailability(models.Model):
    """
    Records dates when an employee is unavailable to work.

    Simple design: one record per employee per day.
    Toggle on/off by creating/deleting records.
    """
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="unavailability",
    )
    date = models.DateField(db_index=True)  # Indexed for date-range queries
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [
            # One unavailability record per employee per day
            models.UniqueConstraint(
                fields=["employee", "date"], 
                name="unique_employee_unavailability_day"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.employee.employee_id} unavailable on {self.date.isoformat()}"
