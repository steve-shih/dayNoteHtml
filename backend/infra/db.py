import os
import json
from pymongo import MongoClient
from werkzeug.security import generate_password_hash
from config_loader import load_config

# 載入系統設定
config = load_config()

# 判斷連線環境
if os.getenv("NODE_ENV") == "production":
    MONGO_URI = os.getenv("MONGO_URI")
elif os.getenv("USE_ATLAS") == "true":
    MONGO_URI = os.getenv("ATLAS_MONGO_URI")
    print("☁️ [Infra-DB] 正在連線至 MongoDB Atlas 雲端資料庫...")
else:
    MONGO_URI = os.getenv("LOCAL_MONGO_URI", config.get("database", {}).get("local_uri", "mongodb://127.0.0.1:27017"))
    print("💻 [Infra-DB] 正在連線至本地 MongoDB...")

# 初始化 MongoClient 與 Database 實例
mongo_client = MongoClient(MONGO_URI)
db = mongo_client[config.get("database", {}).get("db_name", "daynote")]

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
METADATA_FILE = os.path.join(DATA_DIR, 'metadata.json')

def init_db():
    """
    初始化資料庫集合與預設資料轉移
    1. 確保預設使用者 steve 存在
    2. 如果 MongoDB 為空，從 metadata.json 轉移舊資料
    3. 補齊舊資料的 username 欄位
    """
    try:
        # 1. 確保 steve 帳號存在
        steve_user = db["users"].find_one({"username": "steve"})
        if not steve_user:
            hashed_password = generate_password_hash("daynote123")
            db["users"].insert_one({"username": "steve", "password_hash": hashed_password})
            print("✅ [Infra-DB] 已建立預設使用者 'steve'")

        # 2. 空資料庫補植舊 JSON 資料
        if db["categories"].count_documents({}) == 0 and db["notes"].count_documents({}) == 0:
            migrated = False
            if os.path.exists(METADATA_FILE):
                try:
                    with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                        old_data = json.load(f)
                    
                    categories = old_data.get("categories", [])
                    notes = old_data.get("notes", [])
                    
                    if categories:
                        db["categories"].insert_many([{"name": c, "username": "steve"} for c in categories])
                    if notes:
                        for note in notes:
                            note["username"] = "steve"
                        db["notes"].insert_many(notes)
                    migrated = True
                    print("✅ [Infra-DB] 已成功從 local metadata.json 移轉資料至 MongoDB")
                except Exception as e:
                    print(f"⚠️ [Infra-DB] 移轉舊資料失敗: {e}")
            
            if not migrated:
                default_categories = ["投資", "英文", "CS", "其他"]
                db["categories"].insert_many([{"name": c, "username": "steve"} for c in default_categories])
                print("✅ [Infra-DB] 已寫入預設分類目錄")

        # 3. 確保所有舊紀錄都擁有 username 屬性
        db["categories"].update_many({"username": {"$exists": False}}, {"$set": {"username": "steve"}})
        db["notes"].update_many({"username": {"$exists": False}}, {"$set": {"username": "steve"}})
    except Exception as e:
        print(f"⚠️ [Infra-DB] 初始化資料庫過程發生錯誤: {e}")
