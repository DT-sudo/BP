from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("login/", views.login_view, name="login"),
    path("login/demo/<str:role>/", views.demo_login, name="demo_login"),
    path("logout/", views.logout_view, name="logout"),
    path("profile/", views.profile, name="profile"),
    path("manager/employees/", views.manager_employees, name="manager_employees"),
    path("manager/employees/<int:user_id>/json/", views.employee_details, name="employee_details"),
    path("manager/employees/<int:user_id>/update/", views.employee_update, name="employee_update"),
    path("manager/employees/<int:user_id>/reset-password/", views.reset_employee_password, name="reset_employee_password"),
    path("manager/employees/<int:user_id>/delete/", views.employee_delete, name="employee_delete"),
]
