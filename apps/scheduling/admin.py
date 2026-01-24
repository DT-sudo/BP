from django.contrib import admin

from .models import Position, Shift, ShiftTemplate


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


@admin.register(ShiftTemplate)
class ShiftTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "position", "start_time", "end_time", "capacity", "created_by")
    list_filter = ("position",)
    search_fields = ("name", "position__name", "created_by__username")

