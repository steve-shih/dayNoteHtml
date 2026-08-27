from infra.db import db

class NoteRepository:
    """
    筆記資料庫存取層
    """
    def find_all_by_user(self, username, category=None):
        query = {"username": username}
        if category and category != "all":
            query["category"] = category
        
        cursor = db["notes"].find(query)
        notes = []
        for n in cursor:
            n.pop("_id", None)
            notes.append(n)
        return notes

    def find_by_id(self, note_id, username):
        note = db["notes"].find_one({"id": note_id, "username": username})
        if note:
            note.pop("_id", None)
        return note

    def find_by_title(self, title, username):
        note = db["notes"].find_one({"title": title, "username": username})
        if not note:
            note = db["notes"].find_one({"original_filename": title, "username": username})
        if note:
            note.pop("_id", None)
        return note

    def save_note(self, note_doc):
        return db["notes"].insert_one(note_doc)

    def update_note(self, note_id, username, update_fields):
        return db["notes"].update_one({"id": note_id, "username": username}, {"$set": update_fields})

    def delete_note(self, note_id, username):
        return db["notes"].delete_one({"id": note_id, "username": username})
