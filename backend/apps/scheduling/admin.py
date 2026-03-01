from django.contrib import admin

from .models import Assignment, EmployeeUnavailability, Position, Shift

@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    
    list_display = ("date", "start_time", "end_time", "position", "status", "capacity", "created_by")
    list_filter = ("status", "position", "date")
    search_fields = ("position__name", "created_by__username")

@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("shift", "employee")
    search_fields = ("employee__username", "employee__email")

@admin.register(EmployeeUnavailability)
class EmployeeUnavailabilityAdmin(admin.ModelAdmin):
    list_display = ("employee", "date")
    list_filter = ("date",)
    search_fields = ("employee__username",)
