"""
=============================================================================
SCHEDULING FORMS
=============================================================================

Django ModelForms for the scheduling app.

These forms are minimal because most shift operations are handled via
direct request.POST parsing in views.py (for the modal-based UI).

Forms defined here:
- PositionForm: Create/edit job positions

Used by JSON API endpoints that return validation errors.
=============================================================================
"""
from __future__ import annotations

from django import forms

from .models import Position


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

