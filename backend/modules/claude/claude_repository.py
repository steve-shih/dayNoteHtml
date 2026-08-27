from config_loader import load_config, save_config

class ClaudeRepository:
    """
    Claude API 設定與參數存取庫
    """
    def get_config(self):
        return load_config()

    def update_claude_config(self, api_key=None, model=None, max_tokens=None, temperature=None):
        cfg = load_config()
        if "claude" not in cfg:
            cfg["claude"] = {}
        
        if api_key is not None:
            cfg["claude"]["api_key"] = api_key
        if model is not None:
            cfg["claude"]["model"] = model
        if max_tokens is not None:
            cfg["claude"]["max_tokens"] = max_tokens
        if temperature is not None:
            cfg["claude"]["temperature"] = temperature

        save_config(cfg)
        return cfg["claude"]
