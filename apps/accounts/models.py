from __future__ import annotations

import secrets
import string

from django.contrib.auth.models import AbstractUser
from django.db import models


class UserRole(models.TextChoices):
    MANAGER = "manager", "Manager"
    EMPLOYEE = "employee", "Employee"


def generate_employee_id() -> str:
    return f"EMP-{secrets.randbelow(900000) + 100000}"


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.EMPLOYEE)
    employee_id = models.CharField(max_length=20, unique=True, default=generate_employee_id, editable=False)
    phone = models.CharField(max_length=50, blank=True)
    position = models.ForeignKey(
        "scheduling.Position",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )

    @property
    def is_manager(self) -> bool:
        return self.role == UserRole.MANAGER

    @property
    def is_employee(self) -> bool:
        return self.role == UserRole.EMPLOYEE

    @staticmethod
    def generate_temporary_password(length: int = 14) -> str:
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))
