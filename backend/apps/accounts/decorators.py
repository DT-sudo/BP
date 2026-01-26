from __future__ import annotations

from functools import wraps
from typing import Any, Callable

from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect


def role_required(user_attr: str, redirect_to: str) -> Callable[[Callable[..., HttpResponse]], Callable[..., HttpResponse]]:
    def decorator(view_func: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @wraps(view_func)
        def _wrapped(request: HttpRequest, *args: Any, **kwargs: Any) -> HttpResponse:
            if not request.user.is_authenticated:
                return redirect("login")
            if not getattr(request.user, user_attr, False):
                return redirect(redirect_to)
            return view_func(request, *args, **kwargs)

        return _wrapped

    return decorator


def manager_required(view_func: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
    return role_required("is_manager", "employee_shifts")(view_func)


def employee_required(view_func: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
    return role_required("is_employee", "manager_shifts")(view_func)
