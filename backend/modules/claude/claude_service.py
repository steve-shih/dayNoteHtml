from infra.claude_client import ClaudeClient
from modules.claude.claude_repository import ClaudeRepository
from modules.notes.note_service import NoteService

class ClaudeService:
    """
    Claude AI 助手業務邏輯服務層
    """
    def __init__(self):
        self.client = ClaudeClient()
        self.repo = ClaudeRepository()
        self.note_service = NoteService()

    def get_claude_config(self):
        cfg = self.repo.get_config()
        claude_cfg = cfg.get("claude", {}).copy()
        # 遮罩敏感 API Key 前幾碼以外的部分供前端展示
        key = claude_cfg.get("api_key", "")
        if key and len(key) > 8:
            claude_cfg["masked_key"] = f"{key[:6]}...{key[-4:]}"
        else:
            claude_cfg["masked_key"] = ""
        return claude_cfg

    def update_claude_config(self, api_key=None, model=None, max_tokens=None, temperature=None):
        return self.repo.update_claude_config(api_key, model, max_tokens, temperature)

    def chat(self, username, prompt, note_id=None):
        context = ""
        if note_id:
            note, msg, code = self.note_service.get_note_by_id(note_id, username)
            if note:
                title = note.get("title") or note.get("original_filename", "")
                content = note.get("content", "")
                context = f"標題：{title}\n內容：{content}"

        result = self.client.call_messages_api(prompt=prompt, context=context)
        return result

    def summarize_note(self, username, note_id):
        note, msg, code = self.note_service.get_note_by_id(note_id, username)
        if not note:
            return {"success": False, "error": "Note not found"}

        title = note.get("title") or note.get("original_filename", "")
        content = note.get("content", "")

        result = self.client.summarize_and_tag(title, content)
        return result

    def generate_mindmap(self, username, prompt, note_id=None):
        note_content = ""
        if note_id:
            note, msg, code = self.note_service.get_note_by_id(note_id, username)
            if note:
                note_content = note.get("content", "")

        result = self.client.generate_mindmap_outline(prompt, note_content)
        return result

    def fix_title(self, username, note_id):
        note, msg, code = self.note_service.get_note_by_id(note_id, username)
        if not note:
            return {"success": False, "error": "Note not found"}

        title = note.get("title") or note.get("original_filename", "")
        content = note.get("content", "")

        result = self.client.suggest_correct_title(title, content)
        if result.get("success"):
            new_title = result.get("title")
            if new_title:
                self.note_service.note_repo.update_note(note_id, username, {"title": new_title})
                return {"success": True, "new_title": new_title}
        return result

