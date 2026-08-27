from config_loader import load_config, save_config

class ClaudeRepository:
    """
    AI (Claude / Ollama) 統一設定與參數存取庫
    """
    def get_config(self):
        return load_config()

    def update_ai_config(self, provider=None, claude_settings=None, ollama_settings=None):
        cfg = load_config()
        if "ai" not in cfg:
            cfg["ai"] = {
                "provider": "claude",
                "claude": {"api_key": "", "model": "claude-3-5-sonnet-20241022"},
                "ollama": {"url": "http://49.158.138.26:8001", "model": "llama3"}
            }

        if provider is not None:
            cfg["ai"]["provider"] = provider.lower()

        if claude_settings and isinstance(claude_settings, dict):
            if "claude" not in cfg["ai"]:
                cfg["ai"]["claude"] = {}
            for k, v in claude_settings.items():
                if v is not None:
                    cfg["ai"]["claude"][k] = v
            # 同步至舊結構相容
            cfg["claude"] = cfg["ai"]["claude"]

        if ollama_settings and isinstance(ollama_settings, dict):
            if "ollama" not in cfg["ai"]:
                cfg["ai"]["ollama"] = {}
            for k, v in ollama_settings.items():
                if v is not None:
                    cfg["ai"]["ollama"][k] = v

        save_config(cfg)
        return cfg["ai"]
