from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0003_employee_unavailability"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="shift",
            name="is_deleted",
        ),
    ]
