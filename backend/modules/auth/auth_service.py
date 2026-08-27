from werkzeug.security import generate_password_hash, check_password_hash
from modules.auth.auth_repository import AuthRepository
from modules.categories.category_repository import CategoryRepository
from shared.jwt_service import generate_token

class AuthService:
    """
    使用者驗證業務邏輯層
    """
    def __init__(self):
        self.auth_repo = AuthRepository()
        self.category_repo = CategoryRepository()

    def register(self, username, password):
        if not username or not password:
            return False, "請提供帳號與密碼", 400

        if self.auth_repo.find_by_username(username):
            return False, "帳號已經存在", 400

        hashed_password = generate_password_hash(password)
        self.auth_repo.create_user(username, hashed_password)

        # 設定新帳戶預設分類
        default_categories = ["投資", "英文", "CS", "其他"]
        self.category_repo.create_default_categories(username, default_categories)

        return True, "註冊成功！", 200

    def login(self, username, password):
        if not username or not password:
            return None, "請提供帳號與密碼", 400

        user = self.auth_repo.find_by_username(username)
        if not user or not check_password_hash(user['password_hash'], password):
            return None, "登入失敗，帳號或密碼錯誤", 401

        token = generate_token(username)
        return {"token": token, "username": username}, "登入成功", 200
