import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0002_shift_is_deleted"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeUnavailability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="unavailability",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["date"],
            },
        ),
        migrations.AddConstraint(
            model_name="employeeunavailability",
            constraint=models.UniqueConstraint(
                fields=("employee", "date"),
                name="unique_employee_unavailability_day",
            ),
        ),
    ]

