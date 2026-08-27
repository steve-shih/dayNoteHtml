import os
from flask import Flask, jsonify
from flask_cors import CORS
from config_loader import load_config
from infra.db import init_db
from shared.sync_service import init_sync_scheduler

# 導入各 DDD 領域模組 Controller Blueprint
from modules.auth.auth_controller import auth_bp
from modules.categories.category_controller import category_bp
from modules.notes.note_controller import note_bp
from modules.graph.graph_controller import graph_bp
from modules.claude.claude_controller import claude_bp

# 載入系統設定
config = load_config()

app = Flask(__name__)
CORS(app)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB 上傳限制
app.config['SECRET_KEY'] = config.get("system", {}).get("secret_key", "daynote-super-secret-key")

# 初始化資料庫與背景同步服務
init_db()
init_sync_scheduler()

# 註冊各領域 Blueprint
app.register_blueprint(auth_bp)
app.register_blueprint(category_bp)
app.register_blueprint(note_bp)
app.register_blueprint(graph_bp)
app.register_blueprint(claude_bp)

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    健康檢查 API
    """
    return jsonify({
        "status": "ok",
        "app": config.get("system", {}).get("app_name", "dayNoteApp"),
        "version": config.get("system", {}).get("version", "2.0.0")
    })

if __name__ == '__main__':
    port = config.get("system", {}).get("port", 5000)
    print(f"🚀 [dayNoteApp Backend] 伺服器啟動於 http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
