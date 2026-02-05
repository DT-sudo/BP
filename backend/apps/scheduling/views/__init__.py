"""
=============================================================================
SCHEDULING VIEWS - MODULAR STRUCTURE
=============================================================================

This package contains all HTTP view functions for the scheduling app,
organized into logical modules:

├── __init__.py          - This file (exports all public views)
├── helpers.py           - Private helper functions (date parsing, URL handling)
├── manager_shifts.py    - Manager shift calendar and CRUD operations
├── manager_resources.py - Positions management
├── employee.py          - Employee shifts and unavailability views

Import Pattern:
    from apps.scheduling.views import manager_shifts, create_shift, ...
    
Or import the entire package:
    from apps.scheduling import views
    views.manager_shifts(request)

=============================================================================
"""

# Manager shift views
from .manager_shifts import (
    manager_shifts,
    create_shift,
    update_shift,
    delete_shift,
    publish_shift,
    shift_details,
    undo_last_action,
)

# Manager resource views (positions)
from .manager_resources import (
    positions_list,
    position_create,
    position_update,
    position_delete,
)

# Employee views
from .employee import (
    employee_shifts_view,
    employee_unavailability_view,
    employee_unavailability_toggle,
)

__all__ = [
    # Manager shifts
    "manager_shifts",
    "create_shift",
    "update_shift",
    "delete_shift",
    "publish_shift",
    "shift_details",
    "undo_last_action",
    # Manager resources
    "positions_list",
    "position_create",
    "position_update",
    "position_delete",
    # Employee
    "employee_shifts_view",
    "employee_unavailability_view",
    "employee_unavailability_toggle",
]
