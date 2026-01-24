from __future__ import annotations

from typing import Any


def user_ui_context(request) -> dict[str, Any]:
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return {}

    display_name = user.get_full_name() or user.username
    initials = "".join([p[0] for p in display_name.split()[:2] if p]) or display_name[:1]
    role = "manager" if getattr(user, "is_manager", False) else "employee"
    position = getattr(getattr(user, "position", None), "name", None)
    header_role = "Manager" if role == "manager" else (position or "Employee")

    return {
        "user_display_name": display_name,
        "user_initials": initials.upper(),
        "user_role": role,
        "user_header_role": header_role,
    }
