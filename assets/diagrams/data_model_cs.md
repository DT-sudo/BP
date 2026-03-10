# Модель данных — сущности и связи

```python
# =============================================================================
# accounts/models.py
# =============================================================================

import secrets
import string

from django.contrib.auth.models import AbstractUser
from django.db import models


def generate_employee_id() -> str:
    return f"EMP-{secrets.randbelow(900000) + 100000}"


class UserRole(models.TextChoices):
    MANAGER  = "manager",  "Manager"
    EMPLOYEE = "employee", "Employee"


class User(AbstractUser):
    """
    PK: id  (auto, унаследован от AbstractUser)

    Унаследованные поля (не хранятся в коде, но существуют в БД):
        username, first_name, last_name, email, password, is_active, ...

    Собственные поля:
        role        — роль пользователя (manager / employee)
        employee_id — уникальный идентификатор вида "EMP-XXXXXX", генерируется автоматически
        position    — FK → Position.id  [SET_NULL]

    ─────────────────────────────────────────────────────────────────
    FK → Position.id  [SET_NULL]
        При удалении должности: user.position_id = NULL.
        Сотрудник остаётся в системе без должности.
        Связь необязательна (null=True) — менеджер не имеет должности.

    Обратные ссылки (кто ссылается на User):
        ◄── Shift.created_by_id              [PROTECT]
        ◄── Assignment.employee_id           [CASCADE]
        ◄── EmployeeUnavailability.employee_id  [CASCADE]
    """

    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.EMPLOYEE,
    )
    employee_id = models.CharField(
        max_length=20,
        unique=True,
        default=generate_employee_id,
        editable=False,
    )

    # FK → Position.id  [SET_NULL]
    # Стратегия SET_NULL: если должность удалена,
    # поле position_id обнуляется; сотрудник не удаляется.
    position = models.ForeignKey(
        "scheduling.Position",
        on_delete=models.SET_NULL,   # ← SET_NULL
        null=True,
        blank=True,
        related_name="employees",
    )

    # Вспомогательные свойства (не влияют на структуру БД):
    @property
    def is_manager(self) -> bool:
        return self.role == UserRole.MANAGER

    @property
    def is_employee(self) -> bool:
        return self.role == UserRole.EMPLOYEE

    @staticmethod
    def generate_temporary_password(length: int = 14) -> str:
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))


# =============================================================================
# scheduling/models.py
# =============================================================================

from django.conf import settings
from django.db import models


class Position(models.Model):
    """
    PK: id  (auto)

    Справочная таблица должностей. Сама ни на что не ссылается.

    ─────────────────────────────────────────────────────────────────
    Обратные ссылки (кто ссылается на Position):
        ◄── User.position_id   [SET_NULL]
            Сотрудники могут иметь эту должность.
            Удаление Position → position_id у всех таких User = NULL.

        ◄── Shift.position_id  [PROTECT]
            Смены требуют должность.
            Удаление Position невозможно, пока существует хотя бы одна Shift.

    is_active:
        Флаг мягкого удаления (soft-delete).
        При is_active=False должность скрывается из UI,
        но остаётся в БД — исторические Shift сохраняют ссылку.
        Прямое удаление невозможно из-за PROTECT на Shift.position.
    """

    name      = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)


class ShiftStatus(models.TextChoices):
    DRAFT     = "draft",     "Draft"
    PUBLISHED = "published", "Published"


class Shift(models.Model):
    """
    PK: id  (auto)

    ─────────────────────────────────────────────────────────────────
    FK → Position.id  [PROTECT]
        Нельзя удалить должность, пока существует хотя бы одна смена с ней.
        Защищает историческую целостность расписания.
        Попытка удаления вызывает ProtectedError.

    FK → User.id  [PROTECT]  (created_by)
        Нельзя удалить менеджера, пока за ним числятся созданные смены.
        Попытка удаления вызывает ProtectedError.

    Обратные ссылки (кто ссылается на Shift):
        ◄── Assignment.shift_id  [CASCADE]
            Удаление смены → все назначения удаляются автоматически.

    updated_at:
        Обновляется автоматически при каждом save().
        Используется в use_cases.publish_shift() через update_fields=["status", "updated_at"].
    """

    date       = models.DateField()
    start_time = models.TimeField()
    end_time   = models.TimeField()
    capacity   = models.PositiveIntegerField(default=1)
    status     = models.CharField(
        max_length=20,
        choices=ShiftStatus.choices,
        default=ShiftStatus.DRAFT,
    )

    # FK → Position.id  [PROTECT]
    # Попытка удалить Position при наличии Shift → ProtectedError.
    position = models.ForeignKey(
        Position,
        on_delete=models.PROTECT,    # ← PROTECT
        related_name="shifts",
    )

    # FK → User.id  [PROTECT]
    # Менеджер не может быть удалён, пока за ним числятся смены.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,    # ← PROTECT
        related_name="created_shifts",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start_time"]


class Assignment(models.Model):
    """
    PK: id  (auto)

    Промежуточная таблица M:N между User и Shift.
    Реализует назначение сотрудника на смену.
    Сама ни на что не ссылается как родитель.

    ─────────────────────────────────────────────────────────────────
    FK → Shift.id  [CASCADE]
        Удаление смены → все её назначения удаляются автоматически.

    FK → User.id  [CASCADE]
        Удаление сотрудника → все его назначения удаляются автоматически.

    UniqueConstraint(shift, employee):
        Один сотрудник не может быть назначен на одну смену дважды.
        Обеспечивается на уровне БД.
    """

    # FK → Shift.id  [CASCADE]
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,    # ← CASCADE
        related_name="assignments",
    )

    # FK → User.id  [CASCADE]
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,    # ← CASCADE
        related_name="assignments",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["shift", "employee"],
                name="unique_employee_per_shift",
            )
        ]


class EmployeeUnavailability(models.Model):
    """
    PK: id  (auto)

    Даты, в которые сотрудник недоступен.
    Используется в services.assign_employees_to_shift() для фильтрации
    — сотрудник не может быть назначен на смену в свой недоступный день.
    Сама ни на что не ссылается как родитель.

    ─────────────────────────────────────────────────────────────────
    FK → User.id  [CASCADE]
        Удаление сотрудника → все его записи недоступности удаляются автоматически.

    UniqueConstraint(employee, date):
        Один сотрудник — одна запись на один день.
        Обеспечивается на уровне БД.
    """

    # FK → User.id  [CASCADE]
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,    # ← CASCADE
        related_name="unavailability",
    )

    date = models.DateField(db_index=True)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "date"],
                name="unique_employee_unavailability_day",
            )
        ]
```

---

## Граф связей

```
                        ┌─────────────────────────────────────────────┐
                        │              Стратегии on_delete             │
                        │  PROTECT  — удаление запрещено (ProtectedError)  │
                        │  SET_NULL — FK обнуляется, запись остаётся   │
                        │  CASCADE  — дочерние записи удаляются        │
                        └─────────────────────────────────────────────┘

Position ──(SET_NULL)──► User                  (user.position_id = NULL при удалении Position)
Position ──(PROTECT)───► Shift                 (нельзя удалить Position, пока есть Shift)
User     ──(PROTECT)───► Shift    (created_by) (нельзя удалить User-менеджера, пока есть Shift)
Shift    ──(CASCADE)───► Assignment            (удаление Shift → удаление всех её Assignment)
User     ──(CASCADE)───► Assignment (employee) (удаление User → удаление всех его Assignment)
User     ──(CASCADE)───► EmployeeUnavailability (удаление User → удаление его записей)
```
