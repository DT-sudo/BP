from django.contrib import admin

from .models import Position, Shift

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
