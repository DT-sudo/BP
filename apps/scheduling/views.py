from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.serializers.json import DjangoJSONEncoder
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from apps.accounts.decorators import employee_required, manager_required
from apps.accounts.models import User, UserRole

from .forms import PositionForm, ShiftTemplateForm
from .models import Position, Shift, ShiftStatus, ShiftTemplate
from .services import (
    delete_drafts_in_range,
    publish_drafts_in_range,
    set_shift_assignments,
    shifts_for_employee,
    shifts_for_manager,
)


def _parse_date(value: str | None, default: date) -> date:
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _parse_positive_int(value: str | None, field: str) -> int:
    raw = (value or "").strip()
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({field: "Enter a valid whole number."})
    if parsed < 1:
        raise ValidationError({field: "Must be at least 1."})
    return parsed


def _week_bounds(anchor: date) -> tuple[date, date]:
    start = anchor - timedelta(days=anchor.weekday())
    return start, start + timedelta(days=6)


def _month_bounds(anchor: date) -> tuple[date, date]:
    start = anchor.replace(day=1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = next_month - timedelta(days=1)
    return start, end


def _redirect_back(request: HttpRequest, fallback_url_name: str) -> HttpResponse:
    ref = request.META.get("HTTP_REFERER")
    if ref and url_has_allowed_host_and_scheme(
        url=ref,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return redirect(ref)
    return redirect(fallback_url_name)


def _manager_shifts_url_showing_shift(request: HttpRequest, shift: Shift) -> str:
    base = request.META.get("HTTP_REFERER") or request.session.get("manager_shifts_last_url") or ""
    if not base:
        base = reverse("manager_shifts")

    if base.startswith("/"):
        parsed = urlparse(base)
    elif url_has_allowed_host_and_scheme(
        url=base,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        parsed = urlparse(base)
    else:
        parsed = urlparse(reverse("manager_shifts"))

    manager_path = reverse("manager_shifts")
    if parsed.path != manager_path:
        parsed = urlparse(manager_path)

    qs = parse_qs(parsed.query)

    # Always jump to the created/updated shift date so it's in the visible period.
    qs["date"] = [shift.date.isoformat()]

    # If filters would hide the shift, relax them so the shift is visible.
    status = (qs.get("status", [""])[0] or "").lower()
    if status in (ShiftStatus.DRAFT, ShiftStatus.PUBLISHED) and status != shift.status:
        qs.pop("status", None)

    show = (qs.get("show", [""])[0] or "").lower()
    if show == "understaffed":
        qs.pop("show", None)

    positions = [p for p in qs.get("positions", []) if str(p).isdigit()]
    if positions and str(shift.position_id) not in positions:
        positions.append(str(shift.position_id))
        qs["positions"] = positions

    query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=query))


@manager_required
@require_http_methods(["GET", "POST"])
def manager_shifts(request: HttpRequest) -> HttpResponse:
    today = timezone.localdate()
    view = (request.GET.get("view") or "week").lower()
    anchor = _parse_date(request.GET.get("date"), today)

    if view == "day":
        start, end = anchor, anchor
        period_label = f"{anchor.strftime('%a')} • {anchor.strftime('%d')}. {anchor.strftime('%b')}"
    elif view == "month":
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

    if request.method == "POST" and request.POST.get("action") == "publish":
        ids = publish_drafts_in_range(manager_id=request.user.id, start=start, end=end)
        if ids:
            request.session["manager_last_action"] = {"action": "publish", "shift_ids": ids}
            messages.success(request, f"Published {len(ids)} draft shift(s).")
        else:
            messages.info(request, "No draft shifts to publish.")
        return _redirect_back(request, "manager_shifts")

    if request.method == "POST" and request.POST.get("action") == "delete_drafts":
        ids = delete_drafts_in_range(manager_id=request.user.id, start=start, end=end)
        if ids:
            request.session["manager_last_action"] = {"action": "delete", "shift_ids": ids}
            messages.success(request, f"Deleted {len(ids)} draft shift(s).")
        else:
            messages.info(request, "No draft shifts to delete.")
        return _redirect_back(request, "manager_shifts")

    if request.method == "POST" and request.POST.get("action") in ("publish_selected", "delete_selected"):
        raw_ids = request.POST.get("shift_ids") or ""
        ids = [int(x) for x in raw_ids.split(",") if x.strip().isdigit()]
        ids += [int(x) for x in request.POST.getlist("shift_ids") if str(x).isdigit()]
        ids = sorted(set(ids))

        if not ids:
            messages.info(request, "No shifts selected.")
            return _redirect_back(request, "manager_shifts")

        if request.POST.get("action") == "publish_selected":
            qs = Shift.objects.filter(
                created_by_id=request.user.id,
                id__in=ids,
                status=ShiftStatus.DRAFT,
                is_deleted=False,
            )
            changed_ids = list(qs.values_list("id", flat=True))
            if changed_ids:
                qs.update(status=ShiftStatus.PUBLISHED)
                request.session["manager_last_action"] = {"action": "publish", "shift_ids": changed_ids}
                messages.success(request, f"Published {len(changed_ids)} selected shift(s).")
            else:
                messages.info(request, "No draft shifts selected to publish.")
            return _redirect_back(request, "manager_shifts")

        # delete_selected
        qs = Shift.objects.filter(created_by_id=request.user.id, id__in=ids, is_deleted=False)
        deleted_ids = list(qs.values_list("id", flat=True))
        if deleted_ids:
            qs.update(is_deleted=True)
            request.session["manager_last_action"] = {"action": "delete", "shift_ids": deleted_ids}
            messages.success(request, f"Deleted {len(deleted_ids)} selected shift(s).")
        else:
            messages.info(request, "No shifts deleted.")
        return _redirect_back(request, "manager_shifts")

    shift_qs = shifts_for_manager(
        manager_id=request.user.id,
        start=start,
        end=end,
        position_ids=selected_positions or None,
        status=status or None,
        understaffed_only=understaffed,
    ).prefetch_related("assignments")

    shifts_payload = []
    for s in shift_qs:
        shifts_payload.append(
            {
                "id": s.id,
                "date": s.date.isoformat(),
                "start_time": s.start_time.strftime("%H:%M"),
                "end_time": s.end_time.strftime("%H:%M"),
                "position": s.position.name,
                "position_id": s.position_id,
                "capacity": s.capacity,
                "assigned_count": s.assignments.count(),
                "status": s.status,
                "is_past": s.is_past,
            }
        )

    employees = (
        User.objects.filter(role=UserRole.EMPLOYEE, is_active=True)
        .select_related("position")
        .order_by("last_name", "first_name", "username")
    )

    shift_form_state = request.session.pop("shift_form_state", None)
    can_undo = bool(request.session.get("manager_last_action"))

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
            "shifts_json": json.dumps(shifts_payload, cls=DjangoJSONEncoder),
            "shift_form_state_json": json.dumps(shift_form_state, cls=DjangoJSONEncoder) if shift_form_state else "",
            "can_undo": can_undo,
        },
    )


@manager_required
@require_http_methods(["POST"])
def create_shift(request: HttpRequest) -> HttpResponse:
    date_str = request.POST.get("date")
    start_time = request.POST.get("start_time")
    end_time = request.POST.get("end_time")
    position_id = request.POST.get("position_id")
    capacity = request.POST.get("capacity")
    publish = request.POST.get("publish") == "1"

    employee_ids = [int(e) for e in request.POST.getlist("employee_ids") if e.isdigit()]

    try:
        with transaction.atomic():
            parsed_position_id = _parse_positive_int(position_id, "position")
            parsed_capacity = _parse_positive_int(capacity, "capacity")
            shift = Shift(
                date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                start_time=datetime.strptime(start_time, "%H:%M").time(),
                end_time=datetime.strptime(end_time, "%H:%M").time(),
                position_id=parsed_position_id,
                capacity=parsed_capacity,
                status=ShiftStatus.PUBLISHED if publish else ShiftStatus.DRAFT,
                created_by=request.user,
            )
            shift.full_clean()

            shift.save()
            set_shift_assignments(shift, employee_ids)
    except ValidationError as exc:
        messages.error(request, str(exc))
        msg = str(exc).lower()
        request.session["shift_form_state"] = {
            "mode": "create",
            "date": date_str,
            "start_time": start_time,
            "end_time": end_time,
            "position_id": position_id,
            "capacity": capacity,
            "publish": publish,
            "employee_ids": employee_ids,
            "error_field": "capacity" if "capacity" in msg else "employee_ids",
        }
        return _redirect_back(request, "manager_shifts")
    except Exception as exc:
        messages.error(request, f"Could not create shift: {exc}")
        request.session["shift_form_state"] = {
            "mode": "create",
            "date": date_str,
            "start_time": start_time,
            "end_time": end_time,
            "position_id": position_id,
            "capacity": capacity,
            "publish": publish,
            "employee_ids": employee_ids,
        }
        return _redirect_back(request, "manager_shifts")

    messages.success(request, "Shift created.")
    request.session["manager_last_action"] = {"action": "create", "shift_ids": [shift.id]}
    return redirect(_manager_shifts_url_showing_shift(request, shift))


@manager_required
@require_http_methods(["POST"])
def update_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    shift = get_object_or_404(Shift, pk=shift_id, created_by=request.user)

    date_str = request.POST.get("date")
    start_time = request.POST.get("start_time")
    end_time = request.POST.get("end_time")
    position_id = request.POST.get("position_id")
    capacity = request.POST.get("capacity")
    publish = request.POST.get("publish") == "1"

    employee_ids = [int(e) for e in request.POST.getlist("employee_ids") if e.isdigit()]

    try:
        with transaction.atomic():
            shift.date = datetime.strptime(date_str, "%Y-%m-%d").date()
            shift.start_time = datetime.strptime(start_time, "%H:%M").time()
            shift.end_time = datetime.strptime(end_time, "%H:%M").time()
            shift.position_id = _parse_positive_int(position_id, "position")
            shift.capacity = _parse_positive_int(capacity, "capacity")
            shift.status = ShiftStatus.PUBLISHED if publish else ShiftStatus.DRAFT
            shift.full_clean()

            shift.save()
            set_shift_assignments(shift, employee_ids)
    except ValidationError as exc:
        messages.error(request, str(exc))
        msg = str(exc).lower()
        request.session["shift_form_state"] = {
            "mode": "update",
            "shift_id": shift_id,
            "date": date_str,
            "start_time": start_time,
            "end_time": end_time,
            "position_id": position_id,
            "capacity": capacity,
            "publish": publish,
            "employee_ids": employee_ids,
            "error_field": "capacity" if "capacity" in msg else "employee_ids",
        }
        return _redirect_back(request, "manager_shifts")
    except Exception as exc:
        messages.error(request, f"Could not update shift: {exc}")
        request.session["shift_form_state"] = {
            "mode": "update",
            "shift_id": shift_id,
            "date": date_str,
            "start_time": start_time,
            "end_time": end_time,
            "position_id": position_id,
            "capacity": capacity,
            "publish": publish,
            "employee_ids": employee_ids,
        }
        return _redirect_back(request, "manager_shifts")

    messages.success(request, "Shift updated.")
    return redirect(_manager_shifts_url_showing_shift(request, shift))


@manager_required
@require_http_methods(["POST"])
def delete_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    shift = get_object_or_404(Shift, pk=shift_id, created_by=request.user, is_deleted=False)
    shift.is_deleted = True
    shift.save(update_fields=["is_deleted", "updated_at"])
    request.session["manager_last_action"] = {"action": "delete", "shift_ids": [shift.id]}
    messages.success(request, "Shift deleted.")
    return _redirect_back(request, "manager_shifts")


@manager_required
@require_http_methods(["POST"])
def publish_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    shift = get_object_or_404(Shift, pk=shift_id, created_by=request.user, is_deleted=False)
    if shift.status != ShiftStatus.PUBLISHED:
        shift.status = ShiftStatus.PUBLISHED
        shift.save(update_fields=["status", "updated_at"])
        request.session["manager_last_action"] = {"action": "publish", "shift_ids": [shift.id]}
        messages.success(request, "Shift published.")
    else:
        messages.info(request, "Shift is already published.")
    return redirect(_manager_shifts_url_showing_shift(request, shift))


@manager_required
def shift_details(request: HttpRequest, shift_id: int) -> JsonResponse:
    shift = get_object_or_404(
        Shift.objects.select_related("position"),
        pk=shift_id,
        created_by=request.user,
        is_deleted=False,
    )
    assigned = (
        User.objects.filter(assignments__shift=shift, role=UserRole.EMPLOYEE)
        .select_related("position")
        .order_by("last_name", "first_name")
    )
    return JsonResponse(
        {
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
                {"id": e.id, "name": e.get_full_name() or e.username, "employee_id": e.employee_id} for e in assigned
            ],
            "created_by": shift.created_by.get_full_name() or shift.created_by.username,
            "updated_at": shift.updated_at.isoformat(),
        }
    )


@manager_required
@require_http_methods(["POST"])
def undo_last_action(request: HttpRequest) -> HttpResponse:
    last = request.session.pop("manager_last_action", None)
    if not last or not isinstance(last, dict):
        messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    action = (last.get("action") or "").lower()
    ids = [int(x) for x in (last.get("shift_ids") or []) if str(x).isdigit()]
    ids = sorted(set(ids))
    if not ids:
        messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    if action == "create":
        # Undo create => hide the created shift(s).
        count = Shift.objects.filter(created_by_id=request.user.id, id__in=ids, is_deleted=False).update(is_deleted=True)
        if count:
            messages.success(request, f"Undid create ({count} shift).")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    if action == "delete":
        count = Shift.objects.filter(created_by_id=request.user.id, id__in=ids, is_deleted=True).update(is_deleted=False)
        if count:
            messages.success(request, f"Restored {count} shift(s).")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    if action == "publish":
        count = Shift.objects.filter(created_by_id=request.user.id, id__in=ids, status=ShiftStatus.PUBLISHED, is_deleted=False).update(
            status=ShiftStatus.DRAFT
        )
        if count:
            messages.success(request, f"Reverted {count} shift(s) back to Draft.")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    messages.info(request, "Nothing to undo.")
    return _redirect_back(request, "manager_shifts")


@manager_required
@require_http_methods(["GET"])
def templates_list(request: HttpRequest) -> JsonResponse:
    templates = (
        ShiftTemplate.objects.filter(created_by=request.user)
        .select_related("position")
        .order_by("name")
    )
    return JsonResponse(
        {
            "templates": [
                {
                    "id": t.id,
                    "name": t.name,
                    "position_id": t.position_id,
                    "position": t.position.name,
                    "start_time": t.start_time.strftime("%H:%M"),
                    "end_time": t.end_time.strftime("%H:%M"),
                    "capacity": t.capacity,
                }
                for t in templates
            ]
        }
    )


@manager_required
@require_http_methods(["POST"])
def template_create(request: HttpRequest) -> JsonResponse:
    form = ShiftTemplateForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    template = form.save(commit=False)
    template.created_by = request.user
    template.full_clean()
    template.save()
    return JsonResponse({"ok": True, "id": template.id})


@manager_required
@require_http_methods(["POST"])
def template_update(request: HttpRequest, template_id: int) -> JsonResponse:
    template = get_object_or_404(ShiftTemplate, pk=template_id, created_by=request.user)
    form = ShiftTemplateForm(request.POST, instance=template)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    template = form.save(commit=False)
    template.full_clean()
    template.save()
    return JsonResponse({"ok": True})


@manager_required
@require_http_methods(["POST"])
def template_delete(request: HttpRequest, template_id: int) -> JsonResponse:
    template = get_object_or_404(ShiftTemplate, pk=template_id, created_by=request.user)
    template.delete()
    return JsonResponse({"ok": True})


@manager_required
@require_http_methods(["GET"])
def positions_list(request: HttpRequest) -> JsonResponse:
    roles = Position.objects.order_by("name")
    return JsonResponse({"positions": [{"id": p.id, "name": p.name, "is_active": p.is_active} for p in roles]})


@manager_required
@require_http_methods(["POST"])
def position_create(request: HttpRequest) -> JsonResponse:
    form = PositionForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    position = form.save()
    return JsonResponse({"ok": True, "id": position.id})


@manager_required
@require_http_methods(["POST"])
def position_update(request: HttpRequest, position_id: int) -> JsonResponse:
    position = get_object_or_404(Position, pk=position_id)
    form = PositionForm(request.POST, instance=position)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    form.save()
    return JsonResponse({"ok": True})


@manager_required
@require_http_methods(["POST"])
def position_delete(request: HttpRequest, position_id: int) -> JsonResponse:
    position = get_object_or_404(Position, pk=position_id)
    if position.employees.exists():
        return JsonResponse({"ok": False, "error": "Cannot delete role: employees are assigned."}, status=400)
    if position.shifts.exists():
        return JsonResponse({"ok": False, "error": "Cannot delete role: shifts are using this role."}, status=400)
    if position.templates.exists():
        return JsonResponse({"ok": False, "error": "Cannot delete role: templates are using this role."}, status=400)
    try:
        position.delete()
    except ProtectedError:
        return JsonResponse(
            {"ok": False, "error": "Cannot delete role: it is referenced by existing data."},
            status=400,
        )
    return JsonResponse({"ok": True})


@employee_required
@require_http_methods(["GET"])
def employee_shifts_view(request: HttpRequest) -> HttpResponse:
    today = timezone.localdate()
    view = (request.GET.get("view") or "month").lower()
    anchor = _parse_date(request.GET.get("date"), today)
    if view == "week":
        start, end = _week_bounds(anchor)
        if start.month == end.month and start.year == end.year:
            period_label = f"{start.strftime('%B %-d')}–{end.strftime('%-d')}"
        else:
            period_label = f"{start.strftime('%B %-d')}–{end.strftime('%B %-d')}"
    else:
        view = "month"
        start, end = _month_bounds(anchor)
        period_label = anchor.strftime("%B %Y")

    shift_qs = shifts_for_employee(employee_id=request.user.id, start=start, end=end)
    shifts_payload = [
        {
            "id": s.id,
            "date": s.date.isoformat(),
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "position": s.position.name,
            "is_past": s.is_past,
        }
        for s in shift_qs
    ]

    upcoming = list(shift_qs.filter(date__gte=today).order_by("date", "start_time")[:5])
    upcoming_items = []
    for s in upcoming:
        start_minutes = s.start_time.hour * 60 + s.start_time.minute
        end_minutes = s.end_time.hour * 60 + s.end_time.minute
        hours = max(0, end_minutes - start_minutes) / 60
        upcoming_items.append({"shift": s, "hours": hours})
    return render(
        request,
        "employee/employee-shifts.html",
        {
            "view": view,
            "anchor": anchor,
            "start": start,
            "end": end,
            "period_label": period_label,
            "today": today,
            "shifts_json": json.dumps(shifts_payload, cls=DjangoJSONEncoder),
            "upcoming": upcoming_items,
        },
    )
