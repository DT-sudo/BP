from __future__ import annotations

from django.conf import settings
from django.contrib.auth import login
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.views.decorators.http import require_GET

from apps.scheduling.models import Position

from .models import User, UserRole


@require_GET
def demo_login(request: HttpRequest, role: str) -> HttpResponse:
    if not settings.DEBUG:
        return redirect("login")
    demo_password = "demo12345!"

    barista, _ = Position.objects.get_or_create(name="Barista", defaults={"is_active": True})

    manager, _ = User.objects.get_or_create(
        username="manager_demo@example.com",
        defaults={
            "email": "manager_demo@example.com",
            "first_name": "Demo",
            "last_name": "Manager",
            "role": UserRole.MANAGER,
            "is_staff": True,
        },
    )
    manager.role = UserRole.MANAGER
    manager.email = manager.email or "manager_demo@example.com"
    manager.is_staff = True
    manager.set_password(demo_password)
    manager.save()

    employee, _ = User.objects.get_or_create(
        username="employee_demo@example.com",
        defaults={
            "email": "employee_demo@example.com",
            "first_name": "Demo",
            "last_name": "Employee",
            "role": UserRole.EMPLOYEE,
            "position": barista,
        },
    )
    employee.role = UserRole.EMPLOYEE
    employee.email = employee.email or "employee_demo@example.com"
    employee.position = employee.position or barista
    employee.set_password(demo_password)
    employee.save()
    user = manager if role == "manager" else employee
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return redirect("home")
