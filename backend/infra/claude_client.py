import json
import requests
from config_loader import load_config

class ClaudeClient:
    """
    Anthropic Claude API SDK / HTTP 存取封裝類別
    """
    def __init__(self):
        self.config = load_config()

    def _get_claude_settings(self):
        cfg = load_config()
        claude_cfg = cfg.get("claude", {})
        api_key = claude_cfg.get("api_key", "").strip()
        model = claude_cfg.get("model", "claude-3-5-sonnet-20241022")
        max_tokens = claude_cfg.get("max_tokens", 2048)
        temperature = claude_cfg.get("temperature", 0.7)
        return api_key, model, max_tokens, temperature

    def call_messages_api(self, prompt, context="", system_prompt="你是 dayNoteApp 的 Obsidian 智慧助理，請用繁體中文以專業且友善的口吻回答。"):
        """
        呼叫 Anthropic Claude API /v1/messages
        """
        api_key, model, max_tokens, temperature = self._get_claude_settings()

        if not api_key:
            return {
                "success": False,
                "error": "未設定 Claude API Key。請至設定面板或 config.json 設定 claude_api_key。"
            }

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }

        user_content = prompt
        if context:
            user_content = f"【參考筆記內容】\n{context}\n\n【使用者提問/指令】\n{prompt}"

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_content}
            ]
        }

        try:
            res = requests.post(url, headers=headers, json=payload, timeout=45)
            if res.status_code == 200:
                data = res.json()
                text_response = ""
                for content_block in data.get("content", []):
                    if content_block.get("type") == "text":
                        text_response += content_block.get("text", "")
                return {"success": True, "response": text_response, "usage": data.get("usage", {})}
            else:
                err_msg = res.json().get("error", {}).get("message", res.text)
                return {"success": False, "error": f"Claude API 錯誤 ({res.status_code}): {err_msg}"}
        except Exception as e:
            return {"success": False, "error": f"連線至 Claude API 失敗: {str(e)}"}

    def summarize_and_tag(self, note_title, note_content):
        """
        使用 Claude 產生筆記摘要與標籤建議
        """
        system_prompt = "請擔任個人知識庫的分析專家，解析給定的筆記，產生「簡短摘要」以及「3-5 個建議標籤 (例如: #程式設計 #Python)」。請一律以 JSON 格式回應：{\"summary\": \"摘要內容...\", \"tags\": [\"#標籤1\", \"#標籤2\"]}"
        prompt = f"筆記標題：{note_title}\n筆記內容：\n{note_content[:3000]}"

        result = self.call_messages_api(prompt=prompt, system_prompt=system_prompt)
        if result["success"]:
            raw_text = result["response"].strip()
            # 試圖解析 JSON
            try:
                # 抽取 JSON 區塊
                if "```json" in raw_text:
                    raw_text = raw_text.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_text:
                    raw_text = raw_text.split("```")[1].split("```")[0].strip()
                parsed = json.loads(raw_text)
                return {"success": True, "summary": parsed.get("summary", ""), "tags": parsed.get("tags", [])}
            except Exception:
                return {"success": True, "summary": raw_text, "tags": []}
        return result

    def generate_mindmap_outline(self, prompt, note_content=""):
        """
        使用 Claude 生成心智圖樹狀大綱結構 (JSON 格式)
        """
        system_prompt = (
            "請將輸入的知識或筆記內容轉換成層級式心智圖 JSON 結構。"
            "JSON 格式要求: {\"name\": \"核心主題\", \"children\": [{\"name\": \"分支1\", \"children\": [...]}]}"
        )
        user_prompt = f"請針對以下主題或內容構建心智圖架構：\n{prompt}\n\n筆記參考內容：\n{note_content[:2000]}"

        result = self.call_messages_api(prompt=user_prompt, system_prompt=system_prompt)
        if result["success"]:
            raw_text = result["response"].strip()
            try:
                if "```json" in raw_text:
                    raw_text = raw_text.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_text:
                    raw_text = raw_text.split("```")[1].split("```")[0].strip()
                parsed = json.loads(raw_text)
                return {"success": True, "mindmap": parsed}
            except Exception:
                return {
                    "success": True,
                    "mindmap": {
                        "name": prompt[:20],
                        "children": [{"name": line.strip("- *#")} for line in raw_text.split("\n") if line.strip()]
                    }
                }
        return result
