from sqlalchemy.orm import Session
from ..models import User


class UserService:
    def __init__(self, session: Session):
        self.session = session

    def create_user(self, username: str) -> User:
        user = User(username=username)
        self.session.add(user)
        self.session.commit()
        return user

    def get_all_users(self):
        return self.session.query(User).all()
