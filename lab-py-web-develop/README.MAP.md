.
├── apps/                     # アプリケーションコード格納
│   ├── __init__.py
│   └── core/                # コアアプリケーション
│       ├── __init__.py
│       ├── apps.py         # アプリケーション設定
│       ├── models.py       # データモデル
│       └── views.py        # ビューロジック
│
├── config/                   # プロジェクト設定
│   ├── __init__.py
│   ├── settings/           # 環境別設定
│   │   ├── base.py        # 基本設定
│   │   ├── local.py       # 開発環境設定
│   │   └── production.py  # 本番環境設定
│   ├── urls.py            # URLルーティング
│   └── wsgi.py            # WSGI設定
│
├── templates/               # HTMLテンプレート
├── .env                     # 環境変数
├── Dockerfile              # コンテナ定義
├── docker-compose.yml      # コンテナ構成
├── manage.py               # Django管理コマンド
└── requirements.txt        # Pythonパッケージ依存関係