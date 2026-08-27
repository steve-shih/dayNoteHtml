from infra.db import db

class AuthRepository:
    """
    使用者驗證資料存取庫
    """
    def find_by_username(self, username):
        return db["users"].find_one({"username": username})

    def create_user(self, username, password_hash):
        return db["users"].insert_one({
            "username": username,
            "password_hash": password_hash
        })
