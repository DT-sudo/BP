from django.urls import path

from . import views

# path(route, view, name=...) 

urlpatterns = [
    path("manager/shifts/", views.manager_shifts, name="manager_shifts"),
    path("manager/shifts/undo/", views.undo_last_action, name="undo_last_action"),
    path("manager/shifts/create/", views.create_shift, name="create_shift"),
    path("manager/shifts/<int:shift_id>/json/", views.shift_details, name="shift_details"),
    path("manager/shifts/<int:shift_id>/update/", views.update_shift, name="update_shift"),
    path("manager/shifts/<int:shift_id>/delete/", views.delete_shift, name="delete_shift"),
    path("manager/shifts/<int:shift_id>/publish/", views.publish_shift, name="publish_shift"),
    path("manager/templates/json/", views.templates_list, name="templates_list"),
    path("manager/templates/create/", views.template_create, name="template_create"),
    path("manager/templates/<int:template_id>/update/", views.template_update, name="template_update"),
    path("manager/templates/<int:template_id>/delete/", views.template_delete, name="template_delete"),
    path("manager/positions/json/", views.positions_list, name="positions_list"),
    path("manager/positions/create/", views.position_create, name="position_create"),
    path("manager/positions/<int:position_id>/update/", views.position_update, name="position_update"),
    path("manager/positions/<int:position_id>/delete/", views.position_delete, name="position_delete"),
    path("employee/shifts/", views.employee_shifts_view, name="employee_shifts"),
]
