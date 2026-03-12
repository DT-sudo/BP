from __future__ import annotations

from django import forms

from .models import Position, Shift, ShiftStatus


class PositionForm(forms.ModelForm):

    class Meta:
        model = Position
        fields = ["name", "is_active"]


class ShiftForm(forms.ModelForm):

    publish = forms.BooleanField(required=False)
    employee_ids = forms.TypedMultipleChoiceField(
        coerce=int,
        required=False,
    )

    class Meta:
        model = Shift
        fields = ["date", "start_time", "end_time", "position", "capacity"]
        widgets = {
            "date": forms.DateInput(attrs={"type": "date"}),
            "start_time": forms.TimeInput(attrs={"type": "time"}),
            "end_time": forms.TimeInput(attrs={"type": "time"}),
        }

    def __init__(self, *args, employees=None, **kwargs):
        super().__init__(*args, **kwargs)
        if employees:
            self.fields["employee_ids"].choices = [
                (e.id, e.get_full_name() or e.username) for e in employees
            ]

    def save(self, commit=True):
        instance = super().save(commit=False)
        publish_requested = self.cleaned_data.get("publish")
        if publish_requested or instance.status == ShiftStatus.PUBLISHED:
            instance.status = ShiftStatus.PUBLISHED
        else:
            instance.status = ShiftStatus.DRAFT
        if commit:
            instance.save()
        return instance
