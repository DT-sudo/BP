from __future__ import annotations

from functools import wraps

from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect


def manager_required(view_func):
    @wraps(view_func)
    def _wrapped(request: HttpRequest, *args, **kwargs) -> HttpResponse:
        if not request.user.is_authenticated:
            return redirect("login")
        if not getattr(request.user, "is_manager", False):
            return redirect("employee_shifts")
        return view_func(request, *args, **kwargs)

    return _wrapped


def employee_required(view_func):
    @wraps(view_func)
    def _wrapped(request: HttpRequest, *args, **kwargs) -> HttpResponse:
        if not request.user.is_authenticated:
            return redirect("login")
        if not getattr(request.user, "is_employee", False):
            return redirect("manager_shifts")
        return view_func(request, *args, **kwargs)

    return _wrapped

