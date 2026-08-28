import re
import uuid
from datetime import datetime
from modules.notes.note_repository import NoteRepository
from modules.categories.category_repository import CategoryRepository
from infra.storage import save_uploaded_file, read_file_content, read_local_file_content, write_local_file_content

class NoteService:
    """
    筆記業務邏輯層 (包含 #tag 解析、[[WikiLink]] 雙向連結解析與 Backlinks 計算)
    """
    def __init__(self):
        self.note_repo = NoteRepository()
        self.category_repo = CategoryRepository()

    def parse_tags_and_wikilinks(self, content):
        """
        從筆記內容中解析出的 #標籤 與 [[WikiLink]] 連結
        """
        if not content:
            return [], []

        # 匹配 #tag 格式 (排除 URL 錨點)
        tags = list(set(re.findall(r'(?<!\S)#([\w\u4e00-\u9fa5]+)', content)))

        # 匹配 [[WikiLink]] 格式
        wikilinks = list(set(re.findall(r'\[\[(.*?)\]\]', content)))

        return tags, wikilinks

    def get_notes(self, username, category=None):
        notes = self.note_repo.find_all_by_user(username, category)
        for note in notes:
            content = ""
            if note.get('is_url'):
                content = note.get('url', '')
            elif note.get('content'):
                content = note.get('content')
            elif note.get('stored_filename'):
                content = read_file_content(note.get('stored_filename'), note.get('storage_type', 'local'))

            if not content:
                content = note.get('body') or note.get('summary') or f"# {note.get('title', '未命名筆記')}\n\n歡迎使用 DayNote！點擊右上角「編輯內容」開始撰寫筆記。"

            note['content'] = content
        return notes

    def get_note_by_id(self, note_id, username):
        note = self.note_repo.find_by_id(note_id, username)
        if not note:
            return None, "Note not found", 404

        content = ""
        if note.get('is_url'):
            content = note.get('url', '')
        elif note.get('content'):
            content = note.get('content')
        elif note.get('stored_filename'):
            content = read_file_content(note.get('stored_filename'), note.get('storage_type', 'local'))

        if not content:
            content = note.get('body') or note.get('summary') or f"# {note.get('title', '未命名筆記')}\n\n歡迎使用 DayNote！點擊右上角「編輯內容」開始撰寫筆記。"


        tags, wikilinks = self.parse_tags_and_wikilinks(content)
        note['content'] = content
        note['tags'] = note.get('tags') or tags
        note['wikilinks'] = note.get('wikilinks') or wikilinks

        return note, "Success", 200



    def get_backlinks(self, note_id, username):
        """
        取得指向目前筆記的的反向引用 (Backlinks)
        包含 Linked References (明確使用 [[標題]] 引用) 與 Unlinked References (提及標題)
        """
        current_note = self.note_repo.find_by_id(note_id, username)
        if not current_note:
            return {"linked": [], "unlinked": []}

        title = current_note.get("title") or current_note.get("original_filename", "")
        # 去除副檔名進行純文字比對
        clean_title = title.rsplit('.', 1)[0] if '.' in title else title

        all_notes = self.note_repo.find_all_by_user(username)
        linked = []
        unlinked = []

        for note in all_notes:
            if note["id"] == note_id:
                continue
            
            content = ""
            if note.get('stored_filename'):
                content = read_local_file_content(note.get('stored_filename'))
            elif note.get('is_url'):
                content = note.get('url', '')

            if not content:
                continue

            tags, wikilinks = self.parse_tags_and_wikilinks(content)

            # 明確 WikiLink 引用
            if clean_title in wikilinks or title in wikilinks:
                linked.append({
                    "id": note["id"],
                    "title": note.get("title", note.get("original_filename")),
                    "category": note.get("category"),
                    "snippet": self._extract_snippet(content, clean_title)
                })
            # 未連結純文字提及
            elif clean_title.lower() in content.lower():
                unlinked.append({
                    "id": note["id"],
                    "title": note.get("title", note.get("original_filename")),
                    "category": note.get("category"),
                    "snippet": self._extract_snippet(content, clean_title)
                })

        return {"linked": linked, "unlinked": unlinked}

    def _extract_snippet(self, content, target_term, length=100):
        """
        擷取包含目標關鍵字的上下文預覽
        """
        idx = content.lower().find(target_term.lower())
        if idx == -1:
            return content[:length] + "..."
        start = max(0, idx - 30)
        end = min(len(content), idx + len(target_term) + 70)
        snippet = content[start:end].replace('\n', ' ')
        return f"...{snippet}..."

    def save_note_content(self, note_id, username, new_content):
        note = self.note_repo.find_by_id(note_id, username)
        if not note:
            return False, "Note not found", 404

        stored_filename = note.get('stored_filename')
        if stored_filename:
            write_local_file_content(stored_filename, new_content)

        tags, wikilinks = self.parse_tags_and_wikilinks(new_content)
        self.note_repo.update_note(note_id, username, {
            "content": new_content,
            "tags": tags,
            "wikilinks": wikilinks,
            "updated_at": datetime.now().isoformat()
        })

        return True, "Content updated successfully", 200

    def create_ai_note(self, username, title, content, extension="md"):
        ext = extension.lstrip('.')
        filename = f"{title}.{ext}" if not title.endswith(f".{ext}") else title
        file_id = str(uuid.uuid4())
        stored_filename = f"{file_id}.{ext}"

        write_local_file_content(stored_filename, content)

        tags, wikilinks = self.parse_tags_and_wikilinks(content)
        category = "AI筆記"

        self.category_repo.add_category(category, username)

        note_doc = {
            "id": file_id,
            "username": username,
            "original_filename": filename,
            "stored_filename": stored_filename,
            "category": category,
            "title": title,
            "content": content,
            "upload_time": datetime.now().isoformat(),
            "storage_type": "local",
            "tags": tags,
            "wikilinks": wikilinks
        }
        self.note_repo.save_note(note_doc)
        note_doc.pop("_id", None)
        return note_doc


    def create_url_note(self, username, title, url, category="WEB URL NOTE"):
        file_id = str(uuid.uuid4())
        self.category_repo.add_category(category, username)

        note_doc = {
            "id": file_id,
            "username": username,
            "original_filename": f"[URL] {title}",
            "stored_filename": "",
            "category": category,
            "title": title,
            "upload_time": datetime.now().isoformat(),
            "storage_type": "url",
            "is_url": True,
            "url": url,
            "tags": [],
            "wikilinks": []
        }
        self.note_repo.save_note(note_doc)
        note_doc.pop("_id", None)
        return note_doc

    def delete_note(self, note_id, username):
        note = self.note_repo.find_by_id(note_id, username)
        if not note:
            return False, "Note not found", 404
        self.note_repo.delete_note(note_id, username)
        return True, "Note deleted successfully", 200
