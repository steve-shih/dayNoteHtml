import sys
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import os
import uuid
from werkzeug.utils import secure_filename
from google.cloud import storage

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'txt', 'html', 'pdf', 'md', 'png', 'jpg', 'jpeg', 'csv'}

GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
gcs_client = None
gcs_bucket = None

if GCS_BUCKET_NAME:
    try:
        gcs_client = storage.Client()
        gcs_bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        print(f"✅ [Infra-Storage] 已成功連接 GCS Bucket: {GCS_BUCKET_NAME}")
    except Exception as e:
        print(f"⚠️ [Infra-Storage] GCS 初始化失敗: {e}")

def is_allowed_file(filename):
    """
    檢查副檔名是否屬於允許上傳類型
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file_obj):
    """
    儲存上傳的檔案，優先上傳至 GCS，失敗或未設定時備援至本地檔案目錄
    傳回 (file_id, original_filename, stored_filename, storage_type)
    """
    original_filename = secure_filename(file_obj.filename)
    if not original_filename:
        original_filename = file_obj.filename

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(original_filename)[1]
    stored_filename = f"{file_id}{ext}"
    file_path = os.path.join(DATA_DIR, stored_filename)

    storage_type = "local"
    upload_success = False

    # 1. 嘗試 GCS 儲存
    if gcs_bucket:
        try:
            blob = gcs_bucket.blob(stored_filename)
            file_obj.seek(0)
            blob.upload_from_file(file_obj, content_type=file_obj.content_type)
            storage_type = "gcs"
            upload_success = True
            print(f"✅ [Infra-Storage] 成功將 {stored_filename} 儲存至 GCS")
        except Exception as e:
            print(f"⚠️ [Infra-Storage] GCS 上傳失敗 ({e})，降級回本地儲存")

    # 2. 本地儲存
    if not upload_success:
        file_obj.seek(0)
        file_obj.save(file_path)
        storage_type = "local"
        print(f"✅ [Infra-Storage] 成功將 {stored_filename} 儲存至本地目錄")

    return file_id, original_filename, stored_filename, storage_type

def read_local_file_content(stored_filename):
    """
    讀取本地筆記實體檔案文字內容 (具備多路徑搜尋與備援解碼容錯)
    """
    if not stored_filename:
        return ""

    possible_paths = [
        os.path.join(DATA_DIR, stored_filename),
        os.path.join(os.getcwd(), 'data', stored_filename),
        os.path.join('/app/data', stored_filename),
        os.path.join('/app/backend/data', stored_filename)
    ]

    for file_path in possible_paths:
        if os.path.exists(file_path) and os.path.isfile(file_path):
            for enc in ['utf-8', 'utf-8-sig', 'latin-1', 'gbk']:
                try:
                    with open(file_path, 'r', encoding=enc, errors='ignore') as f:
                        return f.read()
                except Exception:
                    continue
    return ""


def write_local_file_content(stored_filename, content):
    """
    將內容寫入本地實體檔案
    """
    file_path = os.path.join(DATA_DIR, stored_filename)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    return True
