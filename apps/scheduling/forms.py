from __future__ import annotations

from django import forms

from .models import Position, ShiftTemplate


class PositionForm(forms.ModelForm):
    class Meta:
        model = Position
        fields = ["name", "is_active"]


class ShiftTemplateForm(forms.ModelForm):
    class Meta:
        model = ShiftTemplate
        fields = ["name", "start_time", "end_time", "position", "capacity"]
