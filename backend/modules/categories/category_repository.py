from infra.db import db

class CategoryRepository:
    """
    分類與標籤資料存取庫
    """
    def find_by_username(self, username):
        return list(db["categories"].find({"username": username}, {"_id": 0, "name": 1}))

    def find_one(self, name, username):
        return db["categories"].find_one({"name": name, "username": username})

    def add_category(self, name, username):
        if not self.find_one(name, username):
            db["categories"].insert_one({"name": name, "username": username})

    def delete_category(self, name, username):
        db["categories"].delete_one({"name": name, "username": username})
        # 將被刪除分類下的筆記設為 未分類
        db["notes"].update_many({"category": name, "username": username}, {"$set": {"category": "未分類"}})

    def create_default_categories(self, username, category_list):
        docs = [{"name": c, "username": username} for c in category_list]
        db["categories"].insert_many(docs)

    def get_distinct_categories_from_notes(self, username):
        return db["notes"].distinct("category", {"username": username})
