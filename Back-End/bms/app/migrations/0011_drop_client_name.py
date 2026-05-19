from django.db import migrations


def drop_client_name(apps, schema_editor):
    """Drop the legacy `name` column from the clients table if it exists."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'clients'
              AND COLUMN_NAME = 'name'
        """)
        exists = cursor.fetchone()[0]
        if exists:
            cursor.execute("ALTER TABLE clients DROP COLUMN `name`")


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0010_brand_to_user'),
    ]

    operations = [
        migrations.RunPython(drop_client_name, migrations.RunPython.noop),
    ]
