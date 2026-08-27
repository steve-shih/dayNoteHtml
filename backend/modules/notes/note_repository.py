from infra.db import db

class NoteRepository:
    """
    筆記資料庫存取層 (支援強效容錯查詢與舊資料無縫整合)
    """
    def find_all_by_user(self, username, category=None):
        user_filter = {"$or": [{"username": username}, {"username": {"$exists": False}}, {"username": None}]}
        
        if category and category != "all":
            query = {"$and": [user_filter, {"category": category}]}
        else:
            query = user_filter
        
        cursor = db["notes"].find(query)
        notes = []
        for n in cursor:
            n.pop("_id", None)
            notes.append(n)
        return notes

    def find_by_id(self, note_id, username=None):
        # 優先依照 id 查
        note = db["notes"].find_one({"id": note_id})
        # 備援依照 stored_filename 或 title 查
        if not note and isinstance(note_id, str):
            note = db["notes"].find_one({"stored_filename": note_id})
        if not note and isinstance(note_id, str):
            note = db["notes"].find_one({"title": note_id})
        if note:
            note.pop("_id", None)
        return note

    def find_by_title(self, title, username=None):
        note = db["notes"].find_one({"title": title})
        if not note:
            note = db["notes"].find_one({"original_filename": title})
        if note:
            note.pop("_id", None)
        return note

    def save_note(self, note_doc):
        return db["notes"].insert_one(note_doc)

    def update_note(self, note_id, username, update_fields):
        return db["notes"].update_one({"id": note_id}, {"$set": update_fields})

    def delete_note(self, note_id, username):
        return db["notes"].delete_one({"id": note_id})
