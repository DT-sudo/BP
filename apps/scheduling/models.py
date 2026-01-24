from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Position(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    def clean(self) -> None:
        name = (self.name or "").strip()
        if len(name) > 25:
            raise ValidationError({"name": "Role name must be 25 characters or fewer."})
        self.name = name

    def __str__(self) -> str:
        return self.name


class ShiftStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class Shift(models.Model):
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="shifts")
    capacity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=ShiftStatus.choices, default=ShiftStatus.DRAFT)
    is_deleted = models.BooleanField(default=False, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_shifts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start_time"]

    def clean(self) -> None:
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({"end_time": "End time must be after start time."})
        if self.capacity < 1:
            raise ValidationError({"capacity": "Capacity must be at least 1."})

    @property
    def assigned_count(self) -> int:
        return self.assignments.count()

    @property
    def is_past(self) -> bool:
        dt_end = datetime.combine(self.date, self.end_time, tzinfo=timezone.get_current_timezone())
        return dt_end < timezone.now()


class Assignment(models.Model):
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE, related_name="assignments")
    employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assignments")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["shift", "employee"], name="unique_employee_per_shift"),
        ]

    def __str__(self) -> str:
        return f"{self.employee.employee_id} -> {self.shift_id}"


class ShiftTemplate(models.Model):
    name = models.CharField(max_length=120)
    start_time = models.TimeField()
    end_time = models.TimeField()
    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="templates")
    capacity = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["created_by", "name"], name="unique_template_name_per_manager"),
        ]

    def clean(self) -> None:
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({"end_time": "End time must be after start time."})
        if self.capacity < 1:
            raise ValidationError({"capacity": "Capacity must be at least 1."})
