"""
=============================================================================
SCHEDULING URL CONFIGURATION
=============================================================================

URL routing for the scheduling app.

Organization by prefix:
- /manager/shifts/     → Main shift calendar and CRUD operations
- /manager/templates/  → Shift template management (JSON API)
- /manager/positions/  → Position/role management (JSON API)
- /employee/shifts/    → Employee's assigned shifts view
- /employee/unavailability/ → Employee availability management

Naming conventions:
- manager_* for manager-only views
- employee_* for employee-only views  
- *_list, *_create, *_update, *_delete for CRUD operations
=============================================================================
"""
from django.urls import path

from . import views


urlpatterns = [
    # -------------------------------------------------------------------------
    # MANAGER: Shift Calendar & CRUD
    # -------------------------------------------------------------------------
    path("manager/shifts/", views.manager_shifts, name="manager_shifts"),
    path("manager/shifts/undo/", views.undo_last_action, name="undo_last_action"),
    path("manager/shifts/create/", views.create_shift, name="create_shift"),
    path("manager/shifts/<int:shift_id>/json/", views.shift_details, name="shift_details"),
    path("manager/shifts/<int:shift_id>/update/", views.update_shift, name="update_shift"),
    path("manager/shifts/<int:shift_id>/delete/", views.delete_shift, name="delete_shift"),
    path("manager/shifts/<int:shift_id>/publish/", views.publish_shift, name="publish_shift"),
    
    # -------------------------------------------------------------------------
    # MANAGER: Shift Templates (JSON API)
    # -------------------------------------------------------------------------
    path("manager/templates/json/", views.templates_list, name="templates_list"),
    path("manager/templates/create/", views.template_create, name="template_create"),
    path("manager/templates/<int:template_id>/update/", views.template_update, name="template_update"),
    path("manager/templates/<int:template_id>/delete/", views.template_delete, name="template_delete"),
    
    # -------------------------------------------------------------------------
    # MANAGER: Positions/Roles (JSON API)
    # -------------------------------------------------------------------------
    path("manager/positions/json/", views.positions_list, name="positions_list"),
    path("manager/positions/create/", views.position_create, name="position_create"),
    path("manager/positions/<int:position_id>/update/", views.position_update, name="position_update"),
    path("manager/positions/<int:position_id>/delete/", views.position_delete, name="position_delete"),
    
    # -------------------------------------------------------------------------
    # EMPLOYEE: My Shifts & Unavailability
    # -------------------------------------------------------------------------
    path("employee/shifts/", views.employee_shifts_view, name="employee_shifts"),
    path("employee/unavailability/", views.employee_unavailability_view, name="employee_unavailability"),
    path("employee/unavailability/toggle/", views.employee_unavailability_toggle, name="employee_unavailability_toggle"),
]
