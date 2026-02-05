# Определяет формы для проверки (валидации) пользовательского ввода.
# Проверяет, что данные корректны перед сохранением в БД.
# Отображает полей в HTML форме

from __future__ import annotations

import re

from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.core.exceptions import ValidationError

from apps.scheduling.models import Position

from .models import User, UserRole

PHONE_RE = re.compile(r"[0-9+()\-\s]{6,25}")


def _split_full_name(full_name: str) -> tuple[str, str]:
    parts = []
    for p in (full_name or "").split():
        if p:
            parts.append(p)
    first_name = parts[0] if parts else ""
    last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
    return first_name, last_name

    # Это форма для работы с моделью User
    # Превращает User объект в HTML форму для браузера
class EmployeeBaseForm(forms.ModelForm):
    full_name = forms.CharField(label="Full name", max_length=150)

    class Meta:
        model = User
        fields = ["email", "phone", "position"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["email"].required = True
        self.fields["phone"].required = True
        self.fields["position"].queryset = Position.objects.order_by("name")
        self.fields["position"].required = True

    def clean_phone(self):
        phone = (self.cleaned_data.get("phone") or "").strip()
        if not phone:
            raise ValidationError("Phone is required.")
        if not PHONE_RE.fullmatch(phone):
            raise ValidationError("Enter a valid phone number.")
        return phone

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise ValidationError("Email is required.")
        qs = User.objects.filter(email=email)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError("An employee with this email already exists.")
        return email

    def _apply_full_name(self, user: User) -> None:
        first_name, last_name = _split_full_name(self.cleaned_data.get("full_name"))
        user.first_name = first_name
        user.last_name = last_name

    def _apply_common(self, user: User) -> None:
        user.username = self.cleaned_data["email"]

    def save(self, commit=True) -> User:
        user: User = super().save(commit=False)
        self._apply_full_name(user)
        self._apply_common(user)
        if commit:
            user.save()
        return user


class CreateEmployeeForm(EmployeeBaseForm):
    def save(self, commit=True) -> User:
        user: User = super().save(commit=False)
        user.role = UserRole.EMPLOYEE
        user.is_staff = False
        user.is_superuser = False

        if commit:
            user.save()
        return user


class UpdateEmployeeForm(EmployeeBaseForm):
    pass
