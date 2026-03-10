from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("manager/employees/", views.manager_employees, name="manager_employees"),
    path("manager/employees/create/", views.manager_employees_create, name="manager_employees_create"),
    path("manager/employees/<int:user_id>/update/", views.employee_update, name="employee_update"),
    path("manager/employees/<int:user_id>/reset-password/", views.reset_employee_password, name="reset_employee_password"),
    path("manager/employees/<int:user_id>/delete/", views.employee_delete, name="employee_delete"),
]

if settings.DEBUG:
    from . import debug_views

    urlpatterns += [
        path("login/demo/<str:role>/", debug_views.demo_login, name="demo_login"),
    ]
