import os
import json

# 定義 config.json 的檔案絕對路徑
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')

def load_config():
    """
    載入 config.json 參數設定
    若檔案不存在則返回預設字典
    """
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ [ConfigLoader] 讀取 config.json 失敗: {e}")
    
    # 預設設定值
    return {
        "system": {
            "app_name": "dayNoteApp",
            "version": "2.0.0",
            "port": 5000,
            "secret_key": "daynote-super-secret-key"
        },
        "database": {
            "local_uri": "mongodb://127.0.0.1:27017",
            "db_name": "daynote"
        },
        "claude": {
            "api_key": "",
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 2048,
            "temperature": 0.7
        }
    }

def save_config(config_data):
    """
    將更新後的設定值寫回 config.json 檔案
    """
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"⚠️ [ConfigLoader] 儲存 config.json 失敗: {e}")
        return False
