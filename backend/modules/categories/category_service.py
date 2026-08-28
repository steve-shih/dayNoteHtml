from modules.categories.category_repository import CategoryRepository

class CategoryService:
    """
    雙軌分類與標籤服務邏輯層 (支援 type: 'ai' 自動分類 與 type: 'user' 自訂分類)
    """
    def __init__(self):
        self.category_repo = CategoryRepository()

    def get_categories(self, username):
        cat_docs = self.category_repo.find_by_username(username)
        cat_map = {c["name"]: c.get("type", "user") for c in cat_docs if c.get("name")}

        # 整合筆記中已有分類
        notes_cats = self.category_repo.get_distinct_categories_from_notes(username)
        for nc in notes_cats:
            if nc and nc not in cat_map:
                cat_map[nc] = "ai" if "AI" in nc.upper() else "user"

        # 系統預設保護分類
        if "未分類" not in cat_map: cat_map["未分類"] = "user"
        if "AI筆記" not in cat_map: cat_map["AI筆記"] = "ai"
        if "WEB URL NOTE" not in cat_map: cat_map["WEB URL NOTE"] = "user"

        # 回傳排序後的類別物件清單
        result = []
        for name in sorted(cat_map.keys()):
            result.append({"name": name, "type": cat_map[name]})
        return result

    def add_category(self, username, category_name, category_type="user"):
        if not category_name:
            return False, "Category is required", 400
        
        self.category_repo.add_category(category_name, username, category_type)
        categories = self.get_categories(username)
        return True, categories, 200

    def delete_category(self, username, category_name):
        if category_name in ["未分類", "AI筆記", "WEB URL NOTE"]:
            return False, "Cannot delete protected categories", 400
            
        self.category_repo.delete_category(category_name, username)
        return True, "Category deleted successfully", 200
