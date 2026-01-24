from __future__ import annotations

import re

from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.core.exceptions import ValidationError

from apps.scheduling.models import Position

from .models import User, UserRole


class LoginForm(AuthenticationForm):
    username = forms.CharField(label="Email / Username")


class CreateEmployeeForm(forms.ModelForm):
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

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise ValidationError("Email is required.")
        if User.objects.filter(email=email).exists():
            raise ValidationError("An employee with this email already exists.")
        return email

    def clean_phone(self):
        phone = (self.cleaned_data.get("phone") or "").strip()
        if not phone:
            raise ValidationError("Phone is required.")
        if not re.fullmatch(r"[0-9+()\-\s]{6,25}", phone):
            raise ValidationError("Enter a valid phone number.")
        return phone

    def save(self, commit=True) -> User:
        user: User = super().save(commit=False)
        full_name = self.cleaned_data["full_name"].strip()
        parts = [p for p in full_name.split(" ") if p]
        user.first_name = parts[0] if parts else ""
        user.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

        user.username = self.cleaned_data["email"]
        user.role = UserRole.EMPLOYEE
        user.is_staff = False
        user.is_superuser = False

        if commit:
            user.save()
        return user


class UpdateEmployeeForm(forms.ModelForm):
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

    def clean_phone(self):
        phone = (self.cleaned_data.get("phone") or "").strip()
        if not phone:
            raise ValidationError("Phone is required.")
        if not re.fullmatch(r"[0-9+()\-\s]{6,25}", phone):
            raise ValidationError("Enter a valid phone number.")
        return phone

    def save(self, commit=True) -> User:
        user: User = super().save(commit=False)
        full_name = (self.cleaned_data.get("full_name") or "").strip()
        parts = [p for p in full_name.split(" ") if p]
        user.first_name = parts[0] if parts else ""
        user.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
        user.username = self.cleaned_data["email"]
        if commit:
            user.save()
        return user
