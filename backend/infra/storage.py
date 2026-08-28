import sys
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import os
import uuid
import base64
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
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file_obj):
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

def decode_content(raw_text):
    if not raw_text:
        return ""
    if isinstance(raw_text, str) and raw_text.startswith("DAYNOTE_B64:"):
        try:
            b64_str = raw_text.replace("DAYNOTE_B64:", "").strip()
            return base64.b64decode(b64_str).decode('utf-8', errors='ignore')
        except Exception:
            pass
    return raw_text

def read_file_content(stored_filename, storage_type="local"):
    """
    統一讀取筆記實體檔案文字內容 (支援 GCS Bucket 'petpa' 下載 + Base64 解碼 + 本地備援)
    """
    if not stored_filename:
        return ""

    # 1. 優先從 GCS Bucket 下載
    if gcs_bucket:
        try:
            blob = gcs_bucket.blob(stored_filename)
            if blob.exists():
                raw_text = blob.download_as_text(encoding='utf-8', errors='ignore')
                decoded = decode_content(raw_text)
                if decoded:
                    return decoded
        except Exception as e:
            print(f"⚠️ [Infra-Storage] GCS 讀取失敗 ({stored_filename}): {e}")

    # 2. 備援本地檔案讀取
    return read_local_file_content(stored_filename)

def read_local_file_content(stored_filename):
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
                        raw = f.read()
                        return decode_content(raw)
                except Exception:
                    continue
    return ""

def write_local_file_content(stored_filename, content):
    """
    雙寫寫入內容至本地實體檔案與 GCS Bucket
    """
    if not stored_filename:
        return False

    file_path = os.path.join(DATA_DIR, stored_filename)
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"⚠️ 本地寫入失敗: {e}")

    if gcs_bucket:
        try:
            blob = gcs_bucket.blob(stored_filename)
            blob.upload_from_string(content, content_type='text/plain; charset=utf-8')
            print(f"✅ [Infra-Storage] 成功同步儲存至 GCS: {stored_filename}")
        except Exception as e:
            print(f"⚠️ GCS 同步寫入失敗: {e}")

    return True
