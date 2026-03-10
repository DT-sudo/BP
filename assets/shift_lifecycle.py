"""
Жизненный цикл смены (Shift Lifecycle)

ДИАГРАММА СОСТОЯНИЙ для редактора (Mermaid):

stateDiagram-v2
    [*] --> DRAFT: менеджер создаёт смену
    
    DRAFT --> DRAFT: edit_shift() \n(редактирование смены/назначений)
    DRAFT --> PUBLISHED: publish_shift()\nили\npublish_shifts_in_period()
    
    PUBLISHED --> [*]: смена завершена
    
    note right of DRAFT
        - Видна только менеджеру (created_by)
        - Валидация: временной диапазон, вместимость
        - Жёсткие ограничения: должность, пересечения, 
          доступность, лимит
        - Менеджер может редактировать
        - Атомарные операции (transaction.atomic)
    end note
    
    note right of PUBLISHED
        - Видна назначенным сотрудникам
        - В календаре сотрудника (требование F9)
        - Менеджер может редактировать назначения
        - Необратимый переход
    end note

═══════════════════════════════════════════════════════════════════

СТРУКТУРА ПЕРЕХОДОВ ДЛЯ ДИАГРАММЫ:

СОСТОЯНИЯ (States):
  1. DRAFT
     - Описание: Черновик смены
     - Видимость: только creator (менеджер)
     - Возможные действия: edit, delete, publish

  2. PUBLISHED
     - Описание: Опубликованная смена
     - Видимость: менеджер + назначенные сотрудники
     - Возможные действия: edit assignments


ПЕРЕХОДЫ (Transitions):

  [*] → DRAFT
    - Событие: save_shift()
    - Условие: форма валидна + жёсткие ограничения пройдены
    - Описание: Менеджер заполняет форму и создаёт смену

  DRAFT → DRAFT
    - Событие: edit_shift()
    - Условие: смена в статусе DRAFT
    - Описание: Менеджер редактирует время, должность, сотрудников
    - Эффект: атомарное обновление (откат при ошибке)

  DRAFT → PUBLISHED
    - Событие 1: publish_shift(shift_id)
    - Условие: shift.status == DRAFT
    - Возвращает: True (успех) или False (уже опубликована)
    - Описание: Индивидуальная публикация одной смены
    
    - Событие 2: publish_shifts_in_period(start_date, end_date)
    - Условие: множество смен где status == DRAFT
    - Возвращает: количество опубликованных смен
    - Описание: Массовая публикация смен в периоде
    - Оптимизация: один SQL update() вместо N операций

  PUBLISHED → [*]
    - Описание: Смена завершена (архивирована / завершена)
    - Примечание: Необратимо, нет возврата в DRAFT


УСЛОВИЯ И ПРОВЕРКИ:

  При DRAFT → DRAFT (редактирование):
    - Валидация временного диапазона: start_time < end_time
    - Валидация вместимости: capacity >= 1
    - Жёсткие ограничения F6:
      1. position.id совпадает с должностью сотрудников
      2. Нет пересечений по времени
      3. Нет EmployeeUnavailability на дату смены
      4. Количество назначений <= capacity
    - Эффект: transaction.atomic() (откат всей операции при ошибке)

  При DRAFT → PUBLISHED:
    - Предусловие: shift.status == ShiftStatus.DRAFT
    - Постусловие: shift.status == ShiftStatus.PUBLISHED
    - Идемпотентность: повторный вызов publish_shift() не меняет статус


ВИДИМОСТЬ (Зависит от статуса):

  DRAFT:
    - Менеджер: видит (created_by == request.user)
    - Сотрудник: НЕ видит

  PUBLISHED:
    - Менеджер: видит
    - Сотрудник: видит (если назначен на shift)


═══════════════════════════════════════════════════════════════════

Описывает переходы состояния смены согласно кодовой реализации в модулях:
- backend/apps/scheduling/models.py
- backend/apps/scheduling/use_cases.py
- backend/apps/scheduling/services.py
"""

from dataclasses import dataclass
from enum import Enum
from datetime import date, time
from typing import Optional


class ShiftStatus(str, Enum):
    """Состояния смены"""
    DRAFT = "draft"          # Черновик — видна только менеджеру
    PUBLISHED = "published"  # Опубликована — видна сотрудникам


@dataclass
class Shift:
    """Модель смены с жизненным циклом"""
    id: int
    date: date
    start_time: time
    end_time: time
    position_id: int
    capacity: int
    status: ShiftStatus
    created_by_id: int

    def validate(self) -> bool:
        """Валидация на уровне модели (models.py)"""
        # Проверка 1: временной диапазон корректен
        if self.start_time >= self.end_time:
            raise ValueError("End time must be after start time.")
        
        # Проверка 2: вместимость положительна
        if self.capacity < 1:
            raise ValueError("Capacity must be at least 1.")
        
        return True

    def is_accessible_by_employee(self, employee_id: int) -> bool:
        """Сотрудник видит смену только если она опубликована"""
        return self.status == ShiftStatus.PUBLISHED

    def is_editable_by_manager(self, manager_id: int) -> bool:
        """Менеджер видит свои смены в любом статусе"""
        return self.created_by_id == manager_id


# ============================================================================
# ФАЗА 1: СОЗДАНИЕ СМЕНЫ (DRAFT)
# ============================================================================

@dataclass
class SaveShiftUseCase:
    """
    use_cases.save_shift()
    
    Жизненный цикл:
    1. Менеджер заполняет форму: дата, время, должность, вместимость, сотрудники
    2. Выполняется валидация (forms.py + models.py)
    3. Смена сохраняется в статусе DRAFT (начальное состояние)
    4. Назначения сотрудников синхронизируются (services.assign_employees_to_shift)
    5. Вся операция атомарна: при ошибке откат всей транзакции
    """

    def validate_form_data(self, data: dict) -> bool:
        """Уровень 1: pользовательский интерфейс + forms.py"""
        # Проверка обязательных полей
        required = ["date", "start_time", "end_time", "position_id", "capacity"]
        for field in required:
            if field not in data or not data[field]:
                raise ValueError(f"Field {field} is required.")
        return True

    def validate_business_logic(self, shift: Shift, employees: list) -> bool:
        """Уровень 2: бизнес-правила в services.py"""
        # Проверка жёстких ограничений из F6
        for employee_id in employees:
            # 1. Соответствие должности
            # 2. Отсутствие пересечений по времени
            # 3. Доступность (нет отметок недоступности)
            # 4. Соблюдение лимита вместимости
            pass
        return True

    def validate_db_constraints(self, shift: Shift) -> bool:
        """Уровень 3: ограничения базы данных"""
        # Внешний ключ position_id -> Position (существует)
        # Внешний ключ created_by_id -> User (менеджер)
        # Уникальное ограничение для Assignment: (shift, employee)
        return True

    def create_shift(self, data: dict, manager_id: int) -> Shift:
        """Создание смены в статусе DRAFT"""
        # Новая смена всегда начинает жизненный цикл в статусе DRAFT
        shift = Shift(
            id=None,  # Будет присвоено БД
            date=data["date"],
            start_time=data["start_time"],
            end_time=data["end_time"],
            position_id=data["position_id"],
            capacity=data["capacity"],
            status=ShiftStatus.DRAFT,  # <-- Начальное состояние!
            created_by_id=manager_id,
        )
        
        # Валидация на всех трёх уровнях
        self.validate_form_data(data)
        shift.validate()
        self.validate_business_logic(shift, data.get("employee_ids", []))
        self.validate_db_constraints(shift)
        
        return shift

    def assign_employees_atomically(self, shift: Shift, employee_ids: list) -> None:
        """
        Назначение сотрудников как атомарная операция (без промежуточных состояний)
        
        Важно для N2 (детерминированность):
        - Если назначения частично сохранены, операция откатывается полностью
        - Результат: либо все сотрудники назначены, либо ни один
        """
        # Внутри transaction.atomic() в реальном коде
        # При любой ошибке вся операция откатывается
        pass

    def save_shift_result(self, shift: Shift) -> bool:
        """Результат: смена в БД со статусом DRAFT"""
        # Смена видна только менеджеру-создателю
        # Сотрудники не видят смену
        # Менеджер может редактировать до публикации
        return True


# ============================================================================
# ФАЗА 2: ПУБЛИКАЦИЯ СМЕНЫ (DRAFT → PUBLISHED)
# ============================================================================

@dataclass
class PublishShiftUseCase:
    """
    use_cases.publish_shift() и use_cases.publish_shifts_in_period()
    
    Переход состояния:
    1. DRAFT → PUBLISHED (необратимо)
    2. После публикации смена становится видна назначенным сотрудникам
    """

    def publish_single_shift(self, shift: Shift) -> bool:
        """
        publish_shift(): публикация одной смены
        
        Логика:
        - Если уже PUBLISHED: возвращает False (идемпотентная операция)
        - Если DRAFT: меняет status на PUBLISHED, сохраняет, возвращает True
        """
        if shift.status == ShiftStatus.PUBLISHED:
            return False  # Уже опубликована
        
        # Переход состояния
        shift.status = ShiftStatus.PUBLISHED
        # shift.updated_at = now()  # Реальный код
        return True

    def publish_shifts_in_period(
        self,
        manager_id: int,
        start_date: date,
        end_date: date,
    ) -> int:
        """
        publish_shifts_in_period(): массовая публикация
        
        Логика:
        - Находит все DRAFT смены менеджера в периоде [start_date, end_date]
        - Переводит все в PUBLISHED за один update() запрос
        - Возвращает количество обновлённых смен
        
        Оптимизация:
        - Использует QuerySet.update() вместо цикла
        - Срок одного SQL-запроса вместо N запросов
        """
        # SELECT * FROM scheduling_shift
        # WHERE created_by_id = manager_id
        #   AND status = 'draft'
        #   AND date >= start_date
        #   AND date <= end_date
        # UPDATE TO status = 'published'
        count_updated = 0  # Количество изменённых смен
        return count_updated

    def publish_result(self, shift: Shift) -> None:
        """
        Результат публикации
        
        - Смена становится видна сотрудникам в их календарях (F9)
        - Менеджер продолжает видеть смену
        - Сотрудник видит: дату, время, должность, свой статус (назначен/не назначен)
        - Редактирование назначений менеджером остаётся возможным
        """
        assert shift.status == ShiftStatus.PUBLISHED


# ============================================================================
# ФАЗА 3: ЖИЗНЕННЫЙ ЦИКЛ В ПРОИЗВОДСТВЕ
# ============================================================================

class ShiftLifecycleSummary:
    """
    Полный жизненный цикл с примерами
    """

    @staticmethod
    def example_workflow():
        """
        Пример: полный рабочий поток менеджера
        """
        
        # Шаг 1: Менеджер создаёт смену на понедельник 9:00-14:00
        # Статус: DRAFT
        # Видимость: только менеджер
        shift_id_1 = 42
        shift_1_status = ShiftStatus.DRAFT
        
        # Менеджер может редактировать смену (изменить время, должность, сотрудников)
        # Каждое редактирование: валидация → атомарное сохранение
        
        # Шаг 2: Менеджер создаёт ещё смены на эту неделю
        # Все в статусе DRAFT
        shift_id_2 = 43
        shift_id_3 = 44
        shift_2_status = ShiftStatus.DRAFT
        shift_3_status = ShiftStatus.DRAFT
        
        # Шаг 3: Менеджер завершает планирование
        # Нажимает кнопку "Publish All" для периода [пн, вс]
        # Все DRAFT смены этого менеджера в периоде → PUBLISHED
        published_count = 3
        
        # Теперь:
        shift_1_status = ShiftStatus.PUBLISHED  # Стала видна сотрудникам
        shift_2_status = ShiftStatus.PUBLISHED
        shift_3_status = ShiftStatus.PUBLISHED
        
        # Сотрудники видят свои назначенные смены в личном календаре
        # Менеджер продолжает видеть все смены и может редактировать назначения


# ============================================================================
# ВАЛИДАЦИЯ И ОГРАНИЧЕНИЯ НА ВСЕХ УРОВНЯХ
# ============================================================================

class ValidationLayers:
    """
    Трёхуровневая валидация (требование N3)
    """

    @staticmethod
    def level_1_ui():
        """
        Уровень 1: Пользовательский интерфейс (JavaScript)
        
        - Базовые проверки перед submit
        - time validation: start < end
        - capacity validation: capacity > 0
        - Блокировка отправки при ошибках
        """
        pass

    @staticmethod
    def level_2_forms_and_services():
        """
        Уровень 2: Django forms.py + services.py
        
        forms.py:
        - Нормализация данных
        - Проверка уникальности
        - Преобразование типов
        
        services.py (assign_employees_to_shift):
        - Жёсткие ограничения F6:
          1. Соответствие должности
          2. Отсутствие пересечений по времени
          3. Доступность (нет EmployeeUnavailability)
          4. Соблюдение capacity
        """
        pass

    @staticmethod
    def level_3_database():
        """
        Уровень 3: Ограничения БД
        
        - Внешние ключи (FOREIGN KEY)
        - Уникальные ограничения (UNIQUE)
        - CHECK constraints (start_time < end_time, capacity > 0)
        - Уникальное ограничение: unique_employee_per_shift
        """
        pass


# ============================================================================
# KEY INVARIANTS / ИНВАРИАНТЫ
# ============================================================================

class ShiftInvariants:
    """
    Инварианты, которые верны в любом состоянии смены
    """

    @staticmethod
    def invariant_1_owner_isolation():
        """
        Менеджер видит и редактирует только свои смены
        
        Гарантируется:
        - Фильтром в queries: created_by_id = request.user.id
        - 404 при попытке доступа к чужой смене (не раскрываем существование)
        """
        pass

    @staticmethod
    def invariant_2_status_is_binary():
        """
        Смена может быть только DRAFT или PUBLISHED
        
        Гарантируется:
        - Enum ShiftStatus с двумя значениями
        - Начальное значение: DRAFT
        - Нет обратного перехода PUBLISHED → DRAFT
        """
        pass

    @staticmethod
    def invariant_3_atomic_assignments():
        """
        Назначения либо все сохранены, либо нет (детерминированность N2)
        
        Гарантируется:
        - transaction.atomic() в save_shift()
        - Rollback при любой ошибке
        - Результат: точное совпадение между выбором менеджера и БД
        """
        pass

    @staticmethod
    def invariant_4_visibility_by_status():
        """
        Видимость сотрудникам зависит от статуса
        
        - DRAFT:     видна только менеджеру (создателю)
        - PUBLISHED: видна всем назначенным сотрудникам
        """
        pass
