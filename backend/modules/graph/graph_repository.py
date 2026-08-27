from infra.db import db

class GraphRepository:
    """
    圖表與心智圖資料查詢層
    """
    def get_user_notes(self, username):
        cursor = db["notes"].find({"username": username})
        notes = []
        for n in cursor:
            n.pop("_id", None)
            notes.append(n)
        return notes
