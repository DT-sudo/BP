"""
=============================================================================
MANAGER SHIFT VIEWS
=============================================================================

Views for the main manager shift scheduling interface:
- manager_shifts() - Main calendar page (GET/POST for bulk actions)
- create_shift() - Create new shift
- update_shift() - Update existing shift
- delete_shift() - Soft delete shift
- publish_shift() - Change status to published
- shift_details() - JSON endpoint for shift popup
- undo_last_action() - Restore/revert last action

=============================================================================
"""
from __future__ import annotations

import json

from django.contrib import messages
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from apps.accounts.decorators import manager_required
from apps.accounts.models import User, UserRole

from ..models import Position, Shift, ShiftStatus
from ..services import (
    delete_shift_ids,
    delete_drafts_in_range,
    publish_draft_ids,
    publish_drafts_in_range,
    shifts_for_manager,
)
from .helpers import (
    _parse_date,
    _week_bounds,
    _month_bounds,
    _redirect_back,
    _manager_shifts_url_showing_shift,
    _save_shift_from_post,
)


# =============================================================================
# MAIN CALENDAR VIEW
# =============================================================================


@manager_required
@require_http_methods(["GET", "POST"])
def manager_shifts(request: HttpRequest) -> HttpResponse:
    """
    Main manager shift scheduling view.
    
    GET: Renders the shift calendar with filters
    POST: Handles bulk actions (publish all, delete drafts, selection mode actions)
    
    Query Parameters:
    - view: 'day', 'week', or 'month' (default: week)
    - date: Anchor date in YYYY-MM-DD format (default: today)
    - positions: Comma-separated position IDs to filter
    - status: 'draft' or 'published' to filter
    - show: 'understaffed' to show only understaffed shifts
    
    POST Actions:
    - action=publish: Publish all drafts in current date range
    - action=delete_drafts: Delete all drafts in current date range
    - action=publish_selected: Publish selected shift IDs
    - action=delete_selected: Delete selected shift IDs
    """
    today = timezone.localdate()
    view = (request.GET.get("view") or "week").lower()
    anchor = _parse_date(request.GET.get("date"), today)

    # Calculate date range and period label based on view type
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

    # Save current URL for redirect-back after actions
    request.session["manager_shifts_last_url"] = request.get_full_path()

    # Parse filter parameters
    positions = Position.objects.filter(is_active=True).order_by("name")
    selected_positions = [int(p) for p in request.GET.getlist("positions") if p.isdigit()]
    status = (request.GET.get("status") or "").lower()
    understaffed = (request.GET.get("show") or "").lower() == "understaffed"

    # Handle POST actions
    if request.method == "POST":
        action = request.POST.get("action")
        
        if action == "publish":
            return _handle_publish_all(request, start, end)
        
        if action == "delete_drafts":
            return _handle_delete_drafts(request, start, end)
        
        if action in ("publish_selected", "delete_selected"):
            return _handle_selection_action(request, action)

    # Build shift payload for JavaScript
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
        assigned_employee_ids = [a.employee_id for a in s.assignments.all()]
        shifts_payload.append({
            "id": s.id,
            "date": s.date.isoformat(),
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "position": s.position.name,
            "position_id": s.position_id,
            "capacity": s.capacity,
            "assigned_count": len(assigned_employee_ids),
            "assigned_employee_ids": assigned_employee_ids,
            "status": s.status,
            "is_past": s.is_past,
        })

    # Build employees payload for assignment dropdowns
    employees = list(
        User.objects.filter(role=UserRole.EMPLOYEE, is_active=True)
        .select_related("position")
        .order_by("last_name", "first_name", "username")
    )
    employees_payload = [
        {
            "id": e.id,
            "name": e.get_full_name() or e.username,
            "position_id": e.position_id,
            "position": e.position.name if e.position else "",
        }
        for e in employees
    ]

    # Get form state from session (if validation failed)
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
            "employees_json": json.dumps(employees_payload, cls=DjangoJSONEncoder),
            "shift_form_state_json": json.dumps(shift_form_state, cls=DjangoJSONEncoder) if shift_form_state else "",
            "can_undo": can_undo,
        },
    )


def _handle_publish_all(request: HttpRequest, start, end) -> HttpResponse:
    """Handle the 'publish all drafts' bulk action."""
    published_ids, blocked_ids = publish_drafts_in_range(
        manager_id=request.user.id, start=start, end=end
    )
    if published_ids:
        request.session["manager_last_action"] = {"action": "publish", "shift_ids": published_ids}
        messages.success(request, f"Published {len(published_ids)} draft shift(s).")
    if blocked_ids:
        messages.error(
            request,
            f"{len(blocked_ids)} draft shift(s) were not published because assigned employees are unavailable.",
        )
    if not published_ids and not blocked_ids:
        messages.info(request, "No draft shifts to publish.")
    return _redirect_back(request, "manager_shifts")


def _handle_delete_drafts(request: HttpRequest, start, end) -> HttpResponse:
    """Handle the 'delete all drafts' bulk action."""
    ids = delete_drafts_in_range(manager_id=request.user.id, start=start, end=end)
    if ids:
        request.session["manager_last_action"] = {"action": "delete", "shift_ids": ids}
        messages.success(request, f"Deleted {len(ids)} draft shift(s).")
    else:
        messages.info(request, "No draft shifts to delete.")
    return _redirect_back(request, "manager_shifts")


def _handle_selection_action(request: HttpRequest, action: str) -> HttpResponse:
    """Handle selection-based bulk actions (publish/delete selected)."""
    raw_ids = request.POST.get("shift_ids") or ""
    ids = [int(x) for x in raw_ids.split(",") if x.strip().isdigit()]
    ids += [int(x) for x in request.POST.getlist("shift_ids") if str(x).isdigit()]
    ids = sorted(set(ids))

    if not ids:
        messages.info(request, "No shifts selected.")
        return _redirect_back(request, "manager_shifts")

    if action == "publish_selected":
        published_ids, blocked_ids = publish_draft_ids(manager_id=request.user.id, shift_ids=ids)
        if published_ids:
            request.session["manager_last_action"] = {"action": "publish", "shift_ids": published_ids}
            messages.success(request, f"Published {len(published_ids)} selected shift(s).")
        if blocked_ids:
            messages.error(
                request,
                f"{len(blocked_ids)} selected shift(s) were not published because assigned employees are unavailable.",
            )
        if not published_ids and not blocked_ids:
            messages.info(request, "No draft shifts selected to publish.")
        return _redirect_back(request, "manager_shifts")

    # delete_selected
    deleted_ids = delete_shift_ids(manager_id=request.user.id, shift_ids=ids)
    if deleted_ids:
        request.session["manager_last_action"] = {"action": "delete", "shift_ids": deleted_ids}
        messages.success(request, f"Deleted {len(deleted_ids)} selected shift(s).")
    else:
        messages.info(request, "No shifts deleted.")
    return _redirect_back(request, "manager_shifts")


# =============================================================================
# INDIVIDUAL SHIFT CRUD
# =============================================================================


@manager_required
@require_http_methods(["POST"])
def create_shift(request: HttpRequest) -> HttpResponse:
    """
    Creates a new shift from the shift form modal.
    Stores shift ID in session for undo capability.
    """
    shift = Shift(created_by=request.user)
    return _save_shift_from_post(
        request,
        shift=shift,
        mode="create",
        success_message="Shift created.",
        last_action="create",
    )


@manager_required
@require_http_methods(["POST"])
def update_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    """
    Updates an existing shift from the shift form modal.
    Only allows updating shifts created by this manager.
    """
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
    """
    Soft-deletes a shift (sets is_deleted=True).
    Stores shift ID in session for undo capability.
    """
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    shift.is_deleted = True
    shift.save(update_fields=["is_deleted", "updated_at"])
    request.session["manager_last_action"] = {"action": "delete", "shift_ids": [shift.id]}
    messages.success(request, "Shift deleted.")
    return _redirect_back(request, "manager_shifts")


@manager_required
@require_http_methods(["POST"])
def publish_shift(request: HttpRequest, shift_id: int) -> HttpResponse:
    """
    Publishes a single draft shift (changes status to PUBLISHED).
    
    Validates that no assigned employees are unavailable on the shift date.
    If validation fails, shows error and redirects without publishing.
    """
    shift = get_object_or_404(Shift.objects.active(), pk=shift_id, created_by=request.user)
    if shift.status != ShiftStatus.PUBLISHED:
        if shift.assignments.filter(employee__unavailability__date=shift.date).exists():
            messages.error(request, "Cannot publish shift: one or more assigned employees are unavailable that day.")
            return redirect(_manager_shifts_url_showing_shift(request, shift))
        shift.status = ShiftStatus.PUBLISHED
        shift.save(update_fields=["status", "updated_at"])
        request.session["manager_last_action"] = {"action": "publish", "shift_ids": [shift.id]}
        messages.success(request, "Shift published.")
    else:
        messages.info(request, "Shift is already published.")
    return redirect(_manager_shifts_url_showing_shift(request, shift))


@manager_required
def shift_details(request: HttpRequest, shift_id: int) -> JsonResponse:
    """
    JSON endpoint returning full shift details for the popup modal.
    
    Called when clicking a shift card to view/edit.
    Includes assigned employees with their names for display.
    """
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


# =============================================================================
# UNDO SYSTEM
# =============================================================================


@manager_required
@require_http_methods(["POST"])
def undo_last_action(request: HttpRequest) -> HttpResponse:
    """
    Undoes the most recent shift action.
    
    Undo behavior by action type:
    - 'create': Soft-delete the created shift(s)
    - 'delete': Restore deleted shift(s) by setting is_deleted=False
    - 'publish': Revert published shift(s) back to draft status
    
    Only one undo is available (no redo, no undo history).
    Session key 'manager_last_action' is consumed on use.
    """
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
        count = Shift.objects.active().filter(created_by_id=request.user.id, id__in=ids).update(is_deleted=True)
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
        count = Shift.objects.active().filter(
            created_by_id=request.user.id,
            id__in=ids,
            status=ShiftStatus.PUBLISHED,
        ).update(status=ShiftStatus.DRAFT)
        if count:
            messages.success(request, f"Reverted {count} shift(s) back to Draft.")
        else:
            messages.info(request, "Nothing to undo.")
        return _redirect_back(request, "manager_shifts")

    messages.info(request, "Nothing to undo.")
    return _redirect_back(request, "manager_shifts")
