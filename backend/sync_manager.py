import os
import sys
from dotenv import load_dotenv
from pymongo import MongoClient
from google.cloud import storage

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

# ==========================================
# 1. 初始化設定
# ==========================================
LOCAL_MONGO_URI = os.getenv("LOCAL_MONGO_URI", "mongodb://127.0.0.1:27017")
ATLAS_MONGO_URI = os.getenv("ATLAS_MONGO_URI")
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")

if not ATLAS_MONGO_URI or not GCS_BUCKET_NAME:
    print("❌ 錯誤：找不到 ATLAS_MONGO_URI 或 GCS_BUCKET_NAME 環境變數。")
    sys.exit(1)

local_client = MongoClient(LOCAL_MONGO_URI)
local_db = local_client["daynote"]

atlas_client = MongoClient(ATLAS_MONGO_URI)
atlas_db = atlas_client["daynote"]

try:
    gcs_client = storage.Client()
    gcs_bucket = gcs_client.bucket(GCS_BUCKET_NAME)
    print(f"✅ 成功連線至 GCS Bucket: {GCS_BUCKET_NAME}")
except Exception as e:
    print(f"❌ 錯誤：無法連線至 GCS: {e}")
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')

# ==========================================
# 2. 檔案同步 (本地 data/ -> GCS)
# ==========================================
def sync_files_to_gcs():
    print("\n--- 📂 開始同步實體檔案 (Local -> GCS) ---")
    if not os.path.exists(DATA_DIR):
        print("沒有本地資料夾，跳過。")
        return

    local_files = [f for f in os.listdir(DATA_DIR) if os.path.isfile(os.path.join(DATA_DIR, f)) and f != 'metadata.json']
    
    # 取得雲端已經存在的檔案列表
    blobs = list(gcs_bucket.list_blobs())
    cloud_files = set([blob.name for blob in blobs])
    
    upload_count = 0
    for filename in local_files:
        if filename not in cloud_files:
            file_path = os.path.join(DATA_DIR, filename)
            try:
                blob = gcs_bucket.blob(filename)
                blob.upload_from_filename(file_path)
                print(f"  ⬆️ 成功上傳: {filename}")
                upload_count += 1
            except Exception as e:
                print(f"  ⚠️ 上傳失敗 {filename}: {e}")
        else:
            print(f"  ⏭️ 已存在雲端，跳過: {filename}")
            
    print(f"✔️ 檔案同步完成，共上傳了 {upload_count} 個新檔案。")

# ==========================================
# 3. 資料庫聯集 (Local DB ∪ Atlas DB)
# ==========================================
def sync_databases():
    print("\n--- 🗄️ 開始同步資料庫紀錄 (Local ∪ Atlas) ---")
    
    local_notes = list(local_db["notes"].find({}))
    atlas_notes = list(atlas_db["notes"].find({}))
    
    atlas_ids = set([n.get("id") for n in atlas_notes if "id" in n])
    
    insert_count = 0
    update_count = 0
    
    for note in local_notes:
        note_id = note.get("id")
        
        # 強制將所有有實體檔案的紀錄標記為 gcs (因為前面已經上傳了)
        if not note.get("is_url"):
            note["storage_type"] = "gcs"
            
        # 移除 _id 避免 MongoDB 衝突
        if "_id" in note:
            del note["_id"]
            
        if note_id not in atlas_ids:
            # 雲端沒有，新增過去
            atlas_db["notes"].insert_one(note.copy())
            print(f"  ➕ 新增紀錄至雲端: {note.get('title')}")
            insert_count += 1
        else:
            # 雲端已有，更新 storage_type 狀態
            atlas_db["notes"].update_one(
                {"id": note_id},
                {"$set": {"storage_type": note.get("storage_type", "gcs")}}
            )
            update_count += 1
            
    # 同步分類 (Categories)
    local_categories = list(local_db["categories"].find({}))
    atlas_categories = set([c["name"] for c in atlas_db["categories"].find({})])
    
    cat_insert = 0
    for c in local_categories:
        if c["name"] not in atlas_categories:
            atlas_db["categories"].insert_one({"name": c["name"]})
            cat_insert += 1

    print(f"✔️ 資料庫同步完成！新增了 {insert_count} 筆筆記，更新了 {update_count} 筆狀態，新增了 {cat_insert} 個分類。")

if __name__ == "__main__":
    sync_files_to_gcs()
    sync_databases()
    print("\n🎉 全部同步作業 A ∪ B 完美完成！")
