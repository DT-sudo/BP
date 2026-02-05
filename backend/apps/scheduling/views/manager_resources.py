"""
=============================================================================
MANAGER RESOURCE VIEWS - Positions
=============================================================================

Views for managing scheduling resources:

Positions (job roles):
- positions_list() - List all positions (JSON)
- position_create() - Create new position
- position_update() - Update existing position
- position_delete() - Delete position (if not in use)

=============================================================================
"""
from __future__ import annotations

from django.db.models.deletion import ProtectedError
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from apps.accounts.decorators import manager_required

from ..forms import PositionForm
from ..models import Position


# =============================================================================
# POSITIONS
# =============================================================================


@manager_required
@require_http_methods(["GET"])
def positions_list(request: HttpRequest) -> JsonResponse:
    """JSON endpoint returning all positions for the positions manager."""
    roles = Position.objects.order_by("name")
    return JsonResponse({
        "positions": [
            {"id": p.id, "name": p.name, "is_active": p.is_active}
            for p in roles
        ]
    })


@manager_required
@require_http_methods(["POST"])
def position_create(request: HttpRequest) -> JsonResponse:
    """Creates a new position. Returns {ok: true, id: <new_id>}."""
    form = PositionForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    position = form.save()
    return JsonResponse({"ok": True, "id": position.id})


@manager_required
@require_http_methods(["POST"])
def position_update(request: HttpRequest, position_id: int) -> JsonResponse:
    """Updates an existing position. Returns {ok: true}."""
    position = get_object_or_404(Position, pk=position_id)
    form = PositionForm(request.POST, instance=position)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)
    form.save()
    return JsonResponse({"ok": True})


@manager_required
@require_http_methods(["POST"])
def position_delete(request: HttpRequest, position_id: int) -> JsonResponse:
    """
    Deletes a position if not in use.
    
    Checks for:
    - Employees assigned to this position
    - Shifts requiring this position
    
    Returns error if any references exist (cannot orphan data).
    """
    position = get_object_or_404(Position, pk=position_id)
    
    if position.employees.exists():
        return JsonResponse(
            {"ok": False, "error": "Cannot delete position: employees are assigned."},
            status=400
        )
    if position.shifts.exists():
        return JsonResponse(
            {"ok": False, "error": "Cannot delete position: shifts are using this position."},
            status=400
        )
    
    try:
        position.delete()
    except ProtectedError:
        return JsonResponse(
            {"ok": False, "error": "Cannot delete role: it is referenced by existing data."},
            status=400,
        )
    
    return JsonResponse({"ok": True})
