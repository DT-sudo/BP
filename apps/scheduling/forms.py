"""
=============================================================================
SCHEDULING FORMS
=============================================================================

Django ModelForms for the scheduling app.

These forms are minimal because most shift operations are handled via
direct request.POST parsing in views.py (for the modal-based UI).

Forms defined here:
- PositionForm: Create/edit job positions
- ShiftTemplateForm: Create/edit reusable shift templates

Both forms are used by JSON API endpoints that return validation errors.
=============================================================================
"""
from __future__ import annotations

from django import forms

from .models import Position, ShiftTemplate


class PositionForm(forms.ModelForm):
    """
    Form for creating and editing Position records.
    
    Fields:
    - name: The position/role name (e.g., "Barista", "Cashier")
    - is_active: Whether this position appears in dropdowns
    """
    class Meta:
        model = Position
        fields = ["name", "is_active"]


class ShiftTemplateForm(forms.ModelForm):
    """
    Form for creating and editing ShiftTemplate records.
    
    Templates save common shift configurations that managers can
    quickly apply when creating new shifts.
    
    Fields:
    - name: Template name (e.g., "Morning Barista", "Evening Cashier")
    - start_time, end_time: Default times for shifts using this template
    - position: The required position for this shift type
    - capacity: Default number of employees needed
    """
    class Meta:
        model = ShiftTemplate
        fields = ["name", "start_time", "end_time", "position", "capacity"]
