# views.py
import json
from random import choice
from django.http import JsonResponse
from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session
from .models import Base, User

# DBの設定
DATABASE_URL = "mysql+pymysql://lab_user:lab_pass123@db/lab_py_web"
engine = create_engine(DATABASE_URL)


def get_db():
    db = Session(engine)
    try:
        return db
    finally:
        db.close()


def user_list(request):
    with Session(engine) as session:
        result = session.query(User).all()
        return JsonResponse(
            {"users": [{"id": u.id, "username": u.username} for u in result]}
        )


def create_user(request):
    if request.method == "POST":
        data = json.loads(request.body)
        with Session(engine) as session:
            user = User(username=data["username"])
            session.add(user)
            session.commit()
            return JsonResponse({"id": user.id, "username": user.username})
    return JsonResponse({"message": "Use POST"}, status=405)


# テスト用(TODO:誰でも叩けるので危険)
def create_random_user(request):
    if request.method == "GET":
        first_names = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace"]
        last_names = ["Smith", "Jones", "Williams", "Brown", "Taylor", "Wilson"]

        username = f"{choice(first_names)}_{choice(last_names)}".lower()

        with Session(engine) as session:
            user = User(username=username)
            session.add(user)
            session.commit()
            return JsonResponse({"id": user.id, "username": user.username})
    return JsonResponse({"message": "Use POST"}, status=405)


def setup_db(request):
    Base.metadata.create_all(engine)
    return JsonResponse({"message": "DB setup completed"})
