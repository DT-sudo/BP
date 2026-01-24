from __future__ import annotations

from django import forms

from .models import Position, ShiftTemplate


class PositionForm(forms.ModelForm):
    class Meta:
        model = Position
        fields = ["name", "is_active"]

    def clean_name(self) -> str:
        name = (self.cleaned_data.get("name") or "").strip()
        if len(name) > 25:
            raise forms.ValidationError("Role name must be 25 characters or fewer.")
        return name


class ShiftTemplateForm(forms.ModelForm):
    class Meta:
        model = ShiftTemplate
        fields = ["name", "start_time", "end_time", "position", "capacity"]
