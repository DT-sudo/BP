"""
=============================================================================
MANAGER RESOURCE VIEWS - Templates & Positions
=============================================================================

Views for managing scheduling resources:

Templates (reusable shift configurations):
- templates_list() - List all templates (JSON)
- template_create() - Create new template
- template_update() - Update existing template
- template_delete() - Delete template

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

from ..forms import PositionForm, ShiftTemplateForm
from ..models import Position, ShiftTemplate


# =============================================================================
# SHIFT TEMPLATES
# =============================================================================


@manager_required
@require_http_methods(["GET"])
def templates_list(request: HttpRequest) -> JsonResponse:
    """
    JSON endpoint returning all shift templates for this manager.
    Used to populate the template dropdown in the shift form.
    """
    templates = (
        ShiftTemplate.objects.filter(created_by=request.user)
        .select_related("position")
        .order_by("name")
    )
    return JsonResponse({
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
    })


@manager_required
@require_http_methods(["POST"])
def template_create(request: HttpRequest) -> JsonResponse:
    """Creates a new shift template. Returns {ok: true, id: <new_id>}."""
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
    """Updates an existing shift template. Returns {ok: true}."""
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
    """Deletes a shift template. Returns {ok: true}."""
    template = get_object_or_404(ShiftTemplate, pk=template_id, created_by=request.user)
    template.delete()
    return JsonResponse({"ok": True})


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
    - Templates using this position
    
    Returns error if any references exist (cannot orphan data).
    """
    position = get_object_or_404(Position, pk=position_id)
    
    if position.employees.exists():
        return JsonResponse(
            {"ok": False, "error": "Cannot delete role: employees are assigned."},
            status=400
        )
    if position.shifts.exists():
        return JsonResponse(
            {"ok": False, "error": "Cannot delete role: shifts are using this role."},
            status=400
        )
    if position.templates.exists():
        return JsonResponse(
            {"ok": False, "error": "Cannot delete role: templates are using this role."},
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
