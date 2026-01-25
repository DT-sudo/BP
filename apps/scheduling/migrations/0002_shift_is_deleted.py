from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="shift",
            name="is_deleted",
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]

