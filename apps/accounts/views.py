from __future__ import annotations

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.conf import settings
from django.db import models
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods

from datetime import datetime, timedelta

from apps.scheduling.models import Assignment, Position, Shift, ShiftStatus

from .decorators import manager_required
from .forms import CreateEmployeeForm, LoginForm, UpdateEmployeeForm
from .models import User, UserRole


@require_http_methods(["GET", "POST"])
def login_view(request: HttpRequest) -> HttpResponse:
    if request.user.is_authenticated:
        return redirect("home")

    form = LoginForm(request, data=request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = authenticate(
            request,
            username=form.cleaned_data["username"],
            password=form.cleaned_data["password"],
        )
        if user is not None:
            login(request, user)
            return redirect("home")
        messages.error(request, "Invalid login.")

    return render(request, "auth/login.html", {"form": form})


@login_required
def logout_view(request: HttpRequest) -> HttpResponse:
    logout(request)
    return redirect("login")


@login_required
def home(request: HttpRequest) -> HttpResponse:
    if getattr(request.user, "is_manager", False):
        last = request.session.get("manager_shifts_last_url")
        if isinstance(last, str) and url_has_allowed_host_and_scheme(
            url=last,
            allowed_hosts={request.get_host()},
            require_https=request.is_secure(),
        ):
            return redirect(last)
        return redirect("manager_shifts")
    return redirect("employee_shifts")


@login_required
def profile(request: HttpRequest) -> HttpResponse:
    return render(request, "accounts/profile.html")


@require_http_methods(["GET"])
def demo_login(request: HttpRequest, role: str) -> HttpResponse:
    if not settings.DEBUG:
        return redirect("login")

    role = (role or "").lower()
    if role not in ("manager", "employee"):
        return redirect("login")

    demo_password = "demo12345!"

    barista, _ = Position.objects.get_or_create(name="Barista", defaults={"is_active": True})
    cleaner, _ = Position.objects.get_or_create(name="Cleaner", defaults={"is_active": True})

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

    # Seed a few example shifts for the manager (published/draft + past/future).
    today = timezone.localdate()
    if not Shift.objects.filter(created_by=manager).exists():
        past_shift = Shift.objects.create(
            date=today - timedelta(days=3),
            start_time=datetime.strptime("09:00", "%H:%M").time(),
            end_time=datetime.strptime("13:00", "%H:%M").time(),
            position=barista,
            capacity=2,
            status=ShiftStatus.PUBLISHED,
            created_by=manager,
        )
        future_published = Shift.objects.create(
            date=today + timedelta(days=2),
            start_time=datetime.strptime("06:00", "%H:%M").time(),
            end_time=datetime.strptime("14:00", "%H:%M").time(),
            position=barista,
            capacity=3,
            status=ShiftStatus.PUBLISHED,
            created_by=manager,
        )
        future_draft = Shift.objects.create(
            date=today + timedelta(days=3),
            start_time=datetime.strptime("16:00", "%H:%M").time(),
            end_time=datetime.strptime("22:00", "%H:%M").time(),
            position=cleaner,
            capacity=1,
            status=ShiftStatus.DRAFT,
            created_by=manager,
        )
        Assignment.objects.get_or_create(shift=past_shift, employee=employee)
        Assignment.objects.get_or_create(shift=future_published, employee=employee)

    user = manager if role == "manager" else employee
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return redirect("home")


@manager_required
@require_http_methods(["GET", "POST"])
def manager_employees(request: HttpRequest) -> HttpResponse:
    if request.method == "POST":
        form = CreateEmployeeForm(request.POST)
        if form.is_valid():
            employee = form.save(commit=False)
            temp_password = User.generate_temporary_password()
            employee.set_password(temp_password)
            employee.save()
            request.session["one_time_credentials"] = {
                "login": employee.email,
                "temporary_password": temp_password,
                "employee_id": employee.employee_id,
            }
            messages.success(request, "Employee created.")
            return redirect("manager_employees")
        messages.error(request, "Please fix the errors and try again.")
    else:
        form = CreateEmployeeForm()

    q = (request.GET.get("q") or "").strip()
    role_id = (request.GET.get("position") or "").strip()

    creds = request.session.pop("one_time_credentials", None)

    employees = User.objects.filter(role=UserRole.EMPLOYEE).select_related("position").order_by("last_name", "first_name")
    if q:
        employees = employees.filter(
            models.Q(employee_id__icontains=q)
            | models.Q(first_name__icontains=q)
            | models.Q(last_name__icontains=q)
            | models.Q(email__icontains=q)
            | models.Q(phone__icontains=q)
        )
    if role_id:
        employees = employees.filter(position_id=role_id)

    positions = Position.objects.order_by("name")
    return render(
        request,
        "manager/manager-employees.html",
        {"employees": employees, "positions": positions, "form": form, "q": q, "position": role_id, "creds": creds},
    )


@manager_required
@require_http_methods(["GET"])
def employee_details(request: HttpRequest, user_id: int) -> JsonResponse:
    employee = get_object_or_404(User.objects.select_related("position"), pk=user_id, role=UserRole.EMPLOYEE)
    return JsonResponse(
        {
            "id": employee.id,
            "employee_id": employee.employee_id,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "email": employee.email,
            "phone": employee.phone,
            "position_id": employee.position_id,
            "position": employee.position.name if employee.position else "",
        }
    )


@manager_required
@require_http_methods(["POST"])
def employee_update(request: HttpRequest, user_id: int) -> JsonResponse:
    employee = get_object_or_404(User, pk=user_id, role=UserRole.EMPLOYEE)
    form = UpdateEmployeeForm(request.POST, instance=employee)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    updated = form.save()
    return JsonResponse(
        {
            "ok": True,
            "employee": {
                "id": updated.id,
                "employee_id": updated.employee_id,
                "full_name": updated.get_full_name() or updated.username,
                "email": updated.email,
                "phone": updated.phone,
                "position_id": updated.position_id,
                "position": updated.position.name if updated.position else "",
            },
        }
    )


@manager_required
@require_http_methods(["POST"])
def reset_employee_password(request: HttpRequest, user_id: int) -> HttpResponse:
    employee = get_object_or_404(User, pk=user_id, role=UserRole.EMPLOYEE)
    temp_password = User.generate_temporary_password()
    employee.set_password(temp_password)
    employee.save(update_fields=["password"])

    request.session["one_time_credentials"] = {
        "login": employee.email,
        "temporary_password": temp_password,
        "employee_id": employee.employee_id,
    }
    return redirect("manager_employees")


@manager_required
@require_http_methods(["POST"])
def employee_delete(request: HttpRequest, user_id: int) -> HttpResponse:
    employee = get_object_or_404(User, pk=user_id, role=UserRole.EMPLOYEE)
    label = employee.get_full_name() or employee.username
    employee.delete()
    messages.success(request, f"Deleted employee: {label}.")
    return redirect("manager_employees")
