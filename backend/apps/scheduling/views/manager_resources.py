from __future__ import annotations

from django.contrib import messages
from django.db.models.deletion import ProtectedError
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST

from apps.accounts.decorators import manager_required

from ..forms import PositionForm
from ..models import Position
from .helpers import _redirect_with_message

def _position_form_error(form: PositionForm, default: str) -> str:
    return next(iter(form.errors.get("name", [default])), default)

@manager_required
@require_POST
def position_create(request: HttpRequest) -> HttpResponse:
    form = PositionForm(request.POST)
    if not form.is_valid():
        return _redirect_with_message(
            request,
            level=messages.ERROR,
            text=_position_form_error(form, "Could not create position."),
            to="manager_employees",
        )
    position = form.save()
    return _redirect_with_message(
        request,
        level=messages.SUCCESS,
        text=f"Position created: {position.name}.",
        to="manager_employees",
    )

@manager_required
@require_POST
def position_update(request: HttpRequest, position_id: int) -> HttpResponse:
    position = get_object_or_404(Position, pk=position_id)
    form = PositionForm(request.POST, instance=position)
    if not form.is_valid():
        return _redirect_with_message(
            request,
            level=messages.ERROR,
            text=_position_form_error(form, "Could not update position."),
            to="manager_employees",
        )
    form.save()
    return _redirect_with_message(
        request,
        level=messages.SUCCESS,
        text="Position updated.",
        to="manager_employees",
    )

@manager_required
@require_POST
def position_delete(request: HttpRequest, position_id: int) -> HttpResponse:
    position = get_object_or_404(Position, pk=position_id)

    try:
        label = position.name
        position.delete()
    except ProtectedError:
        return _redirect_with_message(
            request,
            level=messages.ERROR,
            text="Cannot delete position: it is referenced by existing data.",
            to="manager_employees",
        )
    
    return _redirect_with_message(
        request,
        level=messages.SUCCESS,
        text=f"Position deleted: {label}.",
        to="manager_employees",
    )
