"""
=============================================================================
SCHEDULING ADMIN CONFIGURATION
=============================================================================

Django admin registration for scheduling models.

Provides admin interface for:
- Position: Job roles (Barista, Cashier, etc.)
- Shift: Individual scheduled shifts

Note: Assignment and EmployeeUnavailability are not registered
as they are managed through the main app UI, not admin.
=============================================================================
"""
from django.contrib import admin

from .models import Position, Shift


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    """Admin for Position model with basic list/filter/search."""
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    """
    Admin for Shift model.
    
    Useful for debugging and bulk data management.
    Shows key fields and allows filtering by status, position, date.
    """
    list_display = ("date", "start_time", "end_time", "position", "status", "capacity", "created_by")
    list_filter = ("status", "position", "date")
    search_fields = ("position__name", "created_by__username")

