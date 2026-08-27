import json
from infra.claude_client import ClaudeClient
from infra.storage import read_local_file_content
from modules.claude.claude_repository import ClaudeRepository
from modules.notes.note_service import NoteService


class ClaudeService:
    """
    Claude AI 助手與 RAG 知識庫問答業務邏輯層
    """
    def __init__(self):
        self.client = ClaudeClient()
        self.repo = ClaudeRepository()
        self.note_service = NoteService()
        self.note_repo = self.note_service.note_repo


    def get_claude_config(self):
        cfg = self.repo.get_config()
        ai_cfg = cfg.get("ai", {})
        if not ai_cfg:
            ai_cfg = {
                "provider": "claude",
                "claude": cfg.get("claude", {}),
                "ollama": {"url": "http://49.158.138.26:8001", "model": "llama3"}
            }

        key = ai_cfg.get("claude", {}).get("api_key", "")
        masked = f"{key[:6]}...{key[-4:]}" if key and len(key) > 8 else ""
        ai_cfg_copy = json.loads(json.dumps(ai_cfg))
        if "claude" in ai_cfg_copy:
            ai_cfg_copy["claude"]["masked_key"] = masked

        return ai_cfg_copy

    def update_claude_config(self, provider=None, claude_settings=None, ollama_settings=None):
        return self.repo.update_ai_config(provider, claude_settings, ollama_settings)


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

    def rag_chat(self, username, query):
        """
        全庫知識檢索 (RAG) 智慧問答：
        1. 搜尋全庫筆記內容與標題
        2. 取出相關度最高的 5 篇筆記作為 Context 傳給 Claude
        3. 回覆答案並附上可點擊跳轉的引用來源
        """
        all_notes = self.note_repo.find_all_by_user(username)
        matching_notes = []
        query_terms = [t.strip().lower() for t in query.split() if len(t.strip()) > 0]

        for note in all_notes:
            title = note.get('title') or note.get('original_filename', '')
            stored = note.get('stored_filename', '')
            content = ""
            if note.get('is_url'):
                content = note.get('url', '')
            elif stored:
                content = read_local_file_content(stored)
            if not content:
                content = note.get('content') or note.get('summary') or note.get('title') or ""

            score = 0
            title_lower = title.lower()
            content_lower = content.lower()

            for term in query_terms:
                if term in title_lower:
                    score += 5
                if term in content_lower:
                    score += content_lower.count(term)

            if score > 0 or not query_terms:
                matching_notes.append({
                    "id": note["id"],
                    "title": title,
                    "score": score,
                    "content": content[:1500]
                })

        matching_notes.sort(key=lambda x: x["score"], reverse=True)
        top_notes = matching_notes[:5]

        rag_context_blocks = []
        referenced_sources = []
        for n in top_notes:
            rag_context_blocks.append(f"【筆記標題: {n['title']}】\n{n['content']}")
            referenced_sources.append({"id": n["id"], "title": n["title"]})

        context_str = "\n\n".join(rag_context_blocks)

        system_prompt = (
            "你是個人知識庫的 RAG 檢索專家助手。"
            "請依據所提供的筆記內容回答使用者的問題。"
            "在回答中，只要引用到特定筆記，請使用 [[筆記標題]] 格式標註，方便使用者點擊跳轉。"
            "若資料庫中無相關資訊，請誠實說明並給出可能的建議。"
        )
        user_prompt = f"使用者提問：{query}\n\n檢索到的相關知識庫筆記：\n{context_str}"

        result = self.client.call_messages_api(prompt=user_prompt, system_prompt=system_prompt)
        if result.get("success"):
            result["referenced_sources"] = referenced_sources
        return result


