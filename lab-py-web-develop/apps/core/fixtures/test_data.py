from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from ..models import Base, User


def create_test_data():
    DATABASE_URL = "mysql+pymysql://lab_user:lab_pass123@db/lab_py_web"
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    # テーブル作成
    Base.metadata.create_all(engine)

    # テストユーザー作成
    users = [User(username="test1"), User(username="test2"), User(username="test3")]
    session.add_all(users)
    session.commit()
