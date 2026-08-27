from infra.db import db

class CategoryRepository:
    """
    分類與標籤資料存取庫 (具備多帳號與舊資料相容機制)
    """
    def find_by_username(self, username):
        query = {"$or": [{"username": username}, {"username": {"$exists": False}}, {"username": None}]}
        cats = list(db["categories"].find(query, {"_id": 0, "name": 1}))
        
        # 如果從 DB 查不到分類，讀取筆記內實際出現的分類
        if not cats:
            note_cats = db["notes"].distinct("category", query)
            if note_cats:
                cats = [{"name": c} for c in note_cats if c]

        # 預設底線備援
        if not cats:
            cats = [{"name": c} for c in ["投資", "英文", "CS", "其他"]]

        return cats

    def find_one(self, name, username):
        return db["categories"].find_one({"name": name, "$or": [{"username": username}, {"username": {"$exists": False}}]})

    def add_category(self, name, username):
        if not self.find_one(name, username):
            db["categories"].insert_one({"name": name, "username": username})

    def delete_category(self, name, username):
        db["categories"].delete_one({"name": name, "username": username})
        # 將被刪除分類下的筆記設為 未分類
        db["notes"].update_many({"category": name}, {"$set": {"category": "未分類"}})

    def create_default_categories(self, username, category_list):
        docs = [{"name": c, "username": username} for c in category_list]
        db["categories"].insert_many(docs)

    def get_distinct_categories_from_notes(self, username):
        query = {"$or": [{"username": username}, {"username": {"$exists": False}}, {"username": None}]}
        return db["notes"].distinct("category", query)
