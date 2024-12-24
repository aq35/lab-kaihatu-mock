docker compose build
docker compose up

# マイグレーション実行
docker compose exec web python manage.py migrate

# スーパーユーザー作成
docker compose exec web python manage.py createsuperuser

chmod +x scripts/entrypoint.sh

# テストデータ作成
# django shellで実行
python manage.py shell
>>> from apps.core.fixtures.test_data import create_test_data
>>> create_test_data()