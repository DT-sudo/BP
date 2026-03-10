from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from apps.accounts.models import User, UserRole

from .forms import ShiftForm
from .models import Shift, ShiftStatus
from .services import assign_employees_to_shift


def _first_form_error(form: ShiftForm) -> str:
    for field, errors in form.errors.items():
        field_name = field.replace("_", " ").title()
        return f"{field_name}: {errors[0]}"
    return "Please check the form fields."


@dataclass(frozen=True)
class SaveShiftResult:
    shift: Shift | None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.shift is not None and self.error is None


def save_shift(*, shift: Shift, post_data) -> SaveShiftResult:
    employees = User.objects.filter(role=UserRole.EMPLOYEE, is_active=True)
    data = post_data.copy()
    data["position"] = data.get("position_id", "")

    form = ShiftForm(data, instance=shift, employees=employees)
    if not form.is_valid():
        return SaveShiftResult(shift=None, error=_first_form_error(form))

    try:
        with transaction.atomic():
            saved_shift = form.save()
            employee_ids = form.cleaned_data.get("employee_ids") or []
            assign_employees_to_shift(saved_shift, employee_ids)
        return SaveShiftResult(shift=saved_shift)
    except Exception as exc:
        return SaveShiftResult(shift=None, error=f"Could not save shift: {exc}")


def publish_shift(*, shift: Shift) -> bool:
    if shift.status == ShiftStatus.PUBLISHED:
        return False
    shift.status = ShiftStatus.PUBLISHED
    shift.save(update_fields=["status", "updated_at"])
    return True


def publish_shifts_in_period(*, manager_id: int, start, end) -> int:
    return Shift.objects.filter(
        created_by_id=manager_id,
        status=ShiftStatus.DRAFT,
        date__gte=start,
        date__lte=end,
    ).update(status=ShiftStatus.PUBLISHED)
