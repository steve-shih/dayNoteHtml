from infra.db import db

class CategoryRepository:
    """
    雙軌分類與標籤資料存取庫 (劃分為 type: 'ai' 自動分類 與 type: 'user' 自訂分類)
    """
    def find_by_username(self, username):
        query = {"$or": [{"username": username}, {"username": {"$exists": False}}, {"username": None}]}
        cats = list(db["categories"].find(query, {"_id": 0, "name": 1, "type": 1}))
        
        # 整理補齊 type 欄位
        formatted = []
        seen = set()

        for c in cats:
            name = c.get("name")
            if not name or name in seen:
                continue
            seen.add(name)
            cat_type = c.get("type") or ("ai" if "AI" in name.upper() else "user")
            formatted.append({"name": name, "type": cat_type})

        # 如果從 DB 查不到分類，讀取筆記內實際出現的分類
        if not formatted:
            note_cats = db["notes"].distinct("category", query)
            for nc in note_cats:
                if nc and nc not in seen:
                    seen.add(nc)
                    formatted.append({"name": nc, "type": "ai" if "AI" in nc.upper() else "user"})

        # 預設底線備援
        if not formatted:
            default_user_cats = ["投資", "英文", "CS", "其他"]
            for dc in default_user_cats:
                formatted.append({"name": dc, "type": "user"})

        return formatted

    def find_one(self, name, username):
        return db["categories"].find_one({"name": name, "$or": [{"username": username}, {"username": {"$exists": False}}]})

    def add_category(self, name, username, category_type="user"):
        existing = self.find_one(name, username)
        if not existing:
            db["categories"].insert_one({
                "name": name,
                "username": username,
                "type": category_type
            })
        elif "type" not in existing:
            db["categories"].update_one({"name": name}, {"$set": {"type": category_type}})

    def delete_category(self, name, username):
        db["categories"].delete_one({"name": name, "username": username})
        # 將被刪除分類下的筆記設為 未分類
        db["notes"].update_many({"category": name}, {"$set": {"category": "未分類"}})

    def create_default_categories(self, username, category_list):
        docs = [{"name": c, "username": username, "type": "user"} for c in category_list]
        db["categories"].insert_many(docs)

    def get_distinct_categories_from_notes(self, username):
        query = {"$or": [{"username": username}, {"username": {"$exists": False}}, {"username": None}]}
        return db["notes"].distinct("category", query)
