from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("ShiftSync", {"fields": ("role", "employee_id", "phone", "position")}),
    )
    readonly_fields = ("employee_id",)
    list_display = ("username", "email", "role", "employee_id", "phone", "position", "is_staff")
    list_filter = ("role", "position", "is_staff", "is_active")
