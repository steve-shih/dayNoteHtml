from modules.categories.category_repository import CategoryRepository

class CategoryService:
    """
    分類與標籤服務邏輯層
    """
    def __init__(self):
        self.category_repo = CategoryRepository()

    def get_categories(self, username):
        cat_docs = self.category_repo.find_by_username(username)
        categories = {c["name"] for c in cat_docs}
        
        # 整合筆記中已有分類
        notes_cats = self.category_repo.get_distinct_categories_from_notes(username)
        categories.update(notes_cats)

        # 系統預設保護分類
        categories.update({"未分類", "AI筆記", "WEB URL NOTE"})
        categories.discard(None)
        categories.discard("")

        return sorted(list(categories))

    def add_category(self, username, category_name):
        if not category_name:
            return False, "Category is required", 400
        
        self.category_repo.add_category(category_name, username)
        categories = self.get_categories(username)
        return True, categories, 200

    def delete_category(self, username, category_name):
        if category_name in ["未分類", "AI筆記", "WEB URL NOTE"]:
            return False, "Cannot delete protected categories", 400
            
        self.category_repo.delete_category(category_name, username)
        return True, "Category deleted successfully", 200
