import os
import json
import requests
from config_loader import load_config

class ClaudeClient:
    """
    統一 AI 客戶端 (支援 Anthropic Claude API 與 本地/遠端 Ollama 動態切換)
    """
    def __init__(self):
        self.config = load_config()

    def _get_ai_settings(self):
        cfg = load_config()
        ai_cfg = cfg.get("ai", {})
        provider = ai_cfg.get("provider", "claude").lower()

        # Claude 設定
        claude_cfg = ai_cfg.get("claude", {}) or cfg.get("claude", {})
        claude_key = claude_cfg.get("api_key", "").strip()
        claude_model = claude_cfg.get("model", "claude-3-5-sonnet-20241022")
        claude_max_tokens = claude_cfg.get("max_tokens", 2048)
        claude_temp = claude_cfg.get("temperature", 0.7)

        # Ollama 設定
        ollama_cfg = ai_cfg.get("ollama", {})
        ollama_url = ollama_cfg.get("url", "") or os.getenv("LOCAL_AI_URL") or "http://localhost:11434"
        ollama_model = ollama_cfg.get("model", "llama3:latest")
        ollama_key = ollama_cfg.get("api_key", "") or os.getenv("LOCAL_AI_KEY") or ""


        return {
            "provider": provider,
            "claude": {
                "api_key": claude_key,
                "model": claude_model,
                "max_tokens": claude_max_tokens,
                "temperature": claude_temp
            },
            "ollama": {
                "url": ollama_url.rstrip('/'),
                "model": ollama_model,
                "api_key": ollama_key
            }
        }

    def call_messages_api(self, prompt, context="", system_prompt="你是 dayNoteApp 的 Obsidian 智慧助理，請用繁體中文以專業且友善的口吻回答。"):
        """
        統一呼叫 AI 端點 (依據 provider 切換 Claude 或 Ollama)
        """
        settings = self._get_ai_settings()
        provider = settings["provider"]

        user_content = prompt
        if context:
            user_content = f"【參考筆記內容】\n{context}\n\n【使用者提問/指令】\n{prompt}"

        if provider == "ollama":
            return self._call_ollama_api(settings["ollama"], user_content, system_prompt)
        else:
            return self._call_claude_api(settings["claude"], user_content, system_prompt)

    def _call_claude_api(self, claude_cfg, user_content, system_prompt):
        api_key = claude_cfg["api_key"]
        if not api_key:
            return {
                "success": False,
                "error": "未設定 Claude API Key。請至設定面板切換至 Ollama 或設定 Claude API Key。"
            }

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }

        payload = {
            "model": claude_cfg["model"],
            "max_tokens": claude_cfg["max_tokens"],
            "temperature": claude_cfg["temperature"],
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_content}
            ]
        }

        try:
            res = requests.post(url, headers=headers, json=payload, timeout=60)
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

    def _call_ollama_api(self, ollama_cfg, user_content, system_prompt):
        base_url = ollama_cfg["url"]
        model = ollama_cfg["model"]
        api_key = ollama_cfg["api_key"]

        headers = {"content-type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["x-api-key"] = api_key

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_content})

        # 優先嘗試 /api/chat 端點，備援 /v1/chat/completions 與 /api/generate
        try:
            url = f"{base_url}/api/chat"
            payload = {
                "model": model,
                "messages": messages,
                "stream": False
            }
            res = requests.post(url, headers=headers, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                content = data.get("message", {}).get("content", "")
                return {"success": True, "response": content}
        except Exception:
            pass

        try:
            url = f"{base_url}/v1/chat/completions"
            payload = {
                "model": model,
                "messages": messages
            }
            res = requests.post(url, headers=headers, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    return {"success": True, "response": content}
        except Exception:
            pass

        try:
            url = f"{base_url}/api/generate"
            payload = {
                "model": model,
                "prompt": f"{system_prompt}\n\n{user_content}",
                "stream": False
            }
            res = requests.post(url, headers=headers, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                return {"success": True, "response": data.get("response", "")}
        except Exception:
            pass

        hint = ""
        if "localhost" in base_url or "127.0.0.1" in base_url:
            hint = " (💡 提示: 本網站目前部署於 GCP 雲端 K8s，雲端容器無法直接存取您個人電腦的 localhost:11434。若要使用您本機的 Ollama，請使用 Ngrok Tunnel 網址或對外公網 IP，或在設定頁面切換至 ☁️ Anthropic Claude API)"

        return {"success": False, "error": f"無法連線至 Ollama 服務端點 ({base_url})。{hint}"}



    def summarize_and_tag(self, note_title, note_content):
        """
        使用 AI 產生筆記摘要與標籤建議
        """
        system_prompt = "請擔任個人知識庫的分析專家，解析給定的筆記，產生「簡短摘要」以及「3-5 個建議標籤 (例如: #程式設計 #Python)」。請一律以 JSON 格式回應：{\"summary\": \"摘要內容...\", \"tags\": [\"#標籤1\", \"#標籤2\"]}"
        prompt = f"筆記標題：{note_title}\n筆記內容：\n{note_content[:3000]}"

        result = self.call_messages_api(prompt=prompt, system_prompt=system_prompt)
        if result["success"]:
            raw_text = result["response"].strip()
            try:
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
        使用 AI 生成心智圖樹狀大綱結構 (JSON 格式)
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

    def suggest_correct_title(self, note_title, note_content):
        """
        使用 AI 分析筆記內容，修正並建議更精準、簡潔專業的標題
        """
        system_prompt = (
            "你是個人知識庫的命名專家。請分析以下筆記的現名稱與內容，"
            "給出一個最適合、簡潔且明確的繁體中文筆記標題（直接輸出純標題文字，切勿包含引號、Markdown 標點符號或任何額外說明，長度 15 字以內）。"
        )
        prompt = f"現名稱：{note_title}\n筆記內容：\n{note_content[:2000]}"
        result = self.call_messages_api(prompt=prompt, system_prompt=system_prompt)
        if result["success"]:
            clean_title = result["response"].strip().strip('"\'「」《》 \n\r')
            return {"success": True, "title": clean_title}
        return result

    def suggest_category(self, note_title, note_content=""):
        """
        使用 AI 分析筆記標題與內容，自動歸類產生適合的分類名稱
        """
        system_prompt = (
            "你是個人知識庫分類專家。請分析給定的筆記標題與內容，"
            "直接輸出一個最適合的簡短分類名稱（例如：投資, 英文, CS, 閱讀筆記, 工作, 生活）。"
            "切勿輸出任何額外說明、引號或標點符號，長度 6 字以內。"
        )
        prompt = f"筆記標題：{note_title}\n筆記內容：\n{note_content[:2000]}"
        result = self.call_messages_api(prompt=prompt, system_prompt=system_prompt)
        if result.get("success"):
            cat = result.get("response", "").strip().strip('"\'「」《》 \n\r')
            if cat:
                return {"success": True, "category": cat}
        return {"success": True, "category": "未分類"}

# 類別別名以相容舊呼叫
AIClient = ClaudeClient

