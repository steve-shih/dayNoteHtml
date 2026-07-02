import os
import json
import uuid
import threading
from datetime import datetime, timedelta
from dotenv import load_dotenv
import google.generativeai as genai
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from google.cloud import storage
import jwt
from functools import wraps
from apscheduler.schedulers.background import BackgroundScheduler
import sync_manager

# 動態切換 MongoDB 連線字串
if os.getenv("NODE_ENV") == "production":
    MONGO_URI = os.getenv("MONGO_URI")
elif os.getenv("USE_ATLAS") == "true":
    MONGO_URI = os.getenv("ATLAS_MONGO_URI")
    print("☁️  [Environment] Connecting to Atlas MongoDB...")
else:
    MONGO_URI = os.getenv("LOCAL_MONGO_URI", "mongodb://127.0.0.1:27017")
    print("💻  [Environment] Connecting to Local MongoDB...")

app = Flask(__name__)
CORS(app)
load_dotenv()

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max limit
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "daynote-super-secret-key")
ALLOWED_EXTENSIONS = {'txt', 'html', 'pdf', 'md', 'png', 'jpg', 'jpeg', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
METADATA_FILE = os.path.join(DATA_DIR, 'metadata.json')

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)

# MongoDB Configuration
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["daynote"]

# GCS Configuration
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
gcs_client = None
gcs_bucket = None
if GCS_BUCKET_NAME:
    try:
        gcs_client = storage.Client()
        gcs_bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        print(f"✅ [GCS] Connected to bucket: {GCS_BUCKET_NAME}")
    except Exception as e:
        print(f"⚠️ [GCS] Failed to initialize GCS Client: {e}")

# Database Migration & Initialization
def init_db():
    # 1. 確保 steve 帳戶存在
    steve_user = db["users"].find_one({"username": "steve"})
    if not steve_user:
        hashed_password = generate_password_hash("daynote123")
        db["users"].insert_one({"username": "steve", "password_hash": hashed_password})
        print("✅ [DB] Created default user 'steve'.")
        
    # 2. 如果是完全空的 db，從 metadata.json 轉移資料並綁定給 steve
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
                print("✅ [DB] Seeded MongoDB from local metadata.json successfully!")
            except Exception as e:
                print(f"⚠️ [DB] Error migrating local JSON to MongoDB: {e}")
        
        if not migrated:
            default_categories = ["投資", "英文", "CS", "其他"]
            db["categories"].insert_many([{"name": c, "username": "steve"} for c in default_categories])
            print("✅ [DB] Seeded default categories into MongoDB for steve.")
            
    # 3. 確保舊資料有綁定 username
    db["categories"].update_many({"username": {"$exists": False}}, {"$set": {"username": "steve"}})
    db["notes"].update_many({"username": {"$exists": False}}, {"$set": {"username": "steve"}})
    print("✅ [DB] Migrated all existing data to 'steve'.")

init_db()

# --- Auth Middleware ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        # token is passed in header Authorization: Bearer <token>
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
        if not token:
            return jsonify({'error': 'Token is missing!'}), 401
            
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = data['username']
        except Exception as e:
            return jsonify({'error': 'Token is invalid!'}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated

# --- Auth Routes ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': '請提供帳號與密碼'}), 400
        
    if db["users"].find_one({"username": username}):
        return jsonify({'error': '帳號已經存在'}), 400
        
    hashed_password = generate_password_hash(password)
    db["users"].insert_one({"username": username, "password_hash": hashed_password})
    
    # 給新帳戶預設分類
    default_categories = ["投資", "英文", "CS", "其他"]
    db["categories"].insert_many([{"name": c, "username": username} for c in default_categories])
    
    return jsonify({'message': '註冊成功！'})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': '請提供帳號與密碼'}), 400
        
    user = db["users"].find_one({"username": username})
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': '登入失敗，帳號或密碼錯誤'}), 401
        
    token = jwt.encode({
        'username': username,
        'exp': datetime.utcnow() + timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm="HS256")
    
    return jsonify({'token': token, 'username': username})

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_me(current_user):
    return jsonify({'username': current_user})

# --- Note Routes ---
@app.route('/api/categories', methods=['GET'])
@token_required
def get_categories(current_user):
    # 1. 從 categories 集合中取得
    categories_cursor = db["categories"].find({"username": current_user}, {"_id": 0, "name": 1})
    categories = {c["name"] for c in categories_cursor}
    
    # 2. 從 notes 集合中反查，以防舊資料未被註冊在 categories 集合中
    notes_categories = db["notes"].distinct("category", {"username": current_user})
    categories.update(notes_categories)
    
    # 3. 確保系統預設分類存在
    categories.update({"未分類", "AI筆記", "WEB URL NOTE"})
    
    # 過濾掉無效值並排序
    categories.discard(None)
    categories.discard("")
    
    return jsonify(sorted(list(categories)))

@app.route('/api/categories', methods=['POST'])
@token_required
def add_category(current_user):
    req = request.get_json()
    new_category = req.get('category')
    if not new_category:
        return jsonify({"error": "Category is required"}), 400
    
    if db["categories"].find_one({"name": new_category, "username": current_user}) is None:
        db["categories"].insert_one({"name": new_category, "username": current_user})
    
    categories_cursor = db["categories"].find({"username": current_user}, {"_id": 0, "name": 1})
    categories = [c["name"] for c in categories_cursor]
    return jsonify({"message": "Category added successfully", "categories": categories})

@app.route('/api/categories/<category>', methods=['DELETE'])
@token_required
def delete_category(current_user, category):
    if category in ["未分類", "AI筆記", "WEB URL NOTE"]:
        return jsonify({"error": "Cannot delete protected categories"}), 400
        
    db["categories"].delete_one({"name": category, "username": current_user})
    db["notes"].update_many({"category": category, "username": current_user}, {"$set": {"category": "未分類"}})
    return jsonify({"message": "Category deleted successfully"})

@app.route('/api/upload', methods=['POST'])
@token_required
def upload_file(current_user):
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    category = request.form.get('category')
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if not category:
        category = "未分類"
            
    if file and allowed_file(file.filename):
        original_filename = secure_filename(file.filename)
        if not original_filename:
            original_filename = file.filename
            
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(original_filename)[1]
        stored_filename = f"{file_id}{ext}"
        file_path = os.path.join(DATA_DIR, stored_filename)
        
        storage_type = "local"
        
        # 1. 優先嘗試上傳到 GCS
        upload_success = False
        if gcs_bucket:
            try:
                blob = gcs_bucket.blob(stored_filename)
                # Rewind the file pointer before uploading
                file.seek(0)
                blob.upload_from_file(file, content_type=file.content_type)
                storage_type = "gcs"
                upload_success = True
                print(f"✅ [Upload] Saved {stored_filename} to GCS")
            except Exception as e:
                print(f"⚠️ [Upload] GCS upload failed: {e}. Falling back to local storage.")
                
        # 2. 如果 GCS 失敗或未設定，則存在本地 (備援)
        if not upload_success:
            try:
                file.seek(0)
                file.save(file_path)
                storage_type = "local"
                print(f"✅ [Upload] Saved {stored_filename} to Local")
            except Exception as e:
                return jsonify({"error": f"Failed to save physical file: {str(e)}"}), 500
        
        if db["categories"].find_one({"name": category, "username": current_user}) is None:
            db["categories"].insert_one({"name": category, "username": current_user})
            
        note = {
            "id": file_id,
            "username": current_user,
            "original_filename": original_filename,
            "stored_filename": stored_filename,
            "category": category,
            "title": original_filename,
            "upload_time": datetime.now().isoformat(),
            "storage_type": storage_type
        }
        db["notes"].insert_one(note)
        note.pop("_id", None)
        
        return jsonify({"message": "File uploaded successfully", "note": note}), 201
    else:
        return jsonify({"error": "File type not allowed or invalid file"}), 400

@app.route('/api/ai/upload', methods=['POST'])
@token_required
def ai_upload_note(current_user):
    req = request.get_json()
    if not req:
        return jsonify({"error": "Invalid JSON payload"}), 400
        
    title = req.get('title', 'AI Note')
    content = req.get('content')
    extension = req.get('extension', 'md').lstrip('.')
    category = req.get('category', 'AI筆記')
    
    if not content:
        return jsonify({"error": "Content is required"}), 400
        
    if extension not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Extension {extension} not allowed"}), 400
        
    file_id = str(uuid.uuid4())
    stored_filename = f"{file_id}.{extension}"
    file_path = os.path.join(DATA_DIR, stored_filename)
    original_filename = f"{title}.{extension}"
    
    storage_type = "local"
    upload_success = False
    
    # 1. 優先嘗試上傳到 GCS
    if gcs_bucket:
        try:
            blob = gcs_bucket.blob(stored_filename)
            blob.upload_from_string(content, content_type="text/plain")
            storage_type = "gcs"
            upload_success = True
            print(f"✅ [AI Upload] Saved {stored_filename} to GCS")
        except Exception as e:
            print(f"⚠️ [AI Upload] GCS upload failed: {e}. Falling back to local storage.")
            
    # 2. 如果 GCS 失敗或未設定，則存在本地
    if not upload_success:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            storage_type = "local"
            print(f"✅ [AI Upload] Saved {stored_filename} to Local")
        except Exception as e:
            return jsonify({"error": f"Failed to save physical file: {str(e)}"}), 500
            
    if db["categories"].find_one({"name": category, "username": current_user}) is None:
        db["categories"].insert_one({"name": category, "username": current_user})
        
    note = {
        "id": file_id,
        "username": current_user,
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "category": category,
        "title": title,
        "upload_time": datetime.now().isoformat(),
        "storage_type": storage_type
    }
    db["notes"].insert_one(note)
    note.pop("_id", None)
    
    return jsonify({"message": "AI Note uploaded successfully", "note": note}), 201

@app.route('/api/notes/url', methods=['POST'])
@token_required
def add_url_note(current_user):
    req = request.get_json()
    url = req.get('url')
    name = req.get('name')
    category = "WEB URL NOTE"
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
        
    if not name:
        name = url
        
    file_id = str(uuid.uuid4())
    
    if db["categories"].find_one({"name": category, "username": current_user}) is None:
        db["categories"].insert_one({"name": category, "username": current_user})
        
    note = {
        "id": file_id,
        "username": current_user,
        "original_filename": name,
        "stored_filename": "URL",
        "category": category,
        "title": name,
        "upload_time": datetime.now().isoformat(),
        "is_url": True,
        "url": url
    }
    db["notes"].insert_one(note)
    note.pop("_id", None)
        
    return jsonify({"message": "URL added successfully", "note": note}), 201

@app.route('/api/notes', methods=['GET'])
@token_required
def get_notes(current_user):
    category = request.args.get('category')
    query = {"username": current_user}
    if category:
        query["category"] = category
    
    notes_cursor = db["notes"].find(query, {"_id": 0}).sort("upload_time", -1)
    notes = list(notes_cursor)
    return jsonify(notes)

@app.route('/api/notes/<filename>', methods=['GET'])
def get_note_file(filename):
    token = request.args.get('token')
    if not token:
        # Check header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
    if token:
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = data['username']
            # Verify ownership
            note = db["notes"].find_one({"stored_filename": filename, "username": current_user})
            if not note:
                return jsonify({'error': 'Unauthorized'}), 401
        except Exception:
            return jsonify({'error': 'Invalid Token'}), 401
    else:
        # IF no token provided, we either block or allow. Let's strictly block to enforce auth.
        return jsonify({'error': 'Unauthorized'}), 401
    
    storage_type = note.get("storage_type", "local") if note else "local"
    
    if storage_type == "gcs" and gcs_bucket:
        try:
            blob = gcs_bucket.blob(filename)
            url = blob.generate_signed_url(version="v4", expiration=3600, method="GET")
            return redirect(url, code=302)
        except Exception as e:
            print(f"⚠️ [Download] Failed to generate signed URL for {filename}: {e}")
            pass
            
    return send_from_directory(DATA_DIR, filename)

@app.route('/api/notes/<filename>/content', methods=['PUT'])
@token_required
def update_note_content(current_user, filename):
    req = request.get_json()
    new_content = req.get('content')
    
    if new_content is None:
        return jsonify({"error": "Content is required"}), 400
        
    note = db["notes"].find_one({"stored_filename": filename, "username": current_user})
    if not note:
        return jsonify({"error": "Note metadata not found or unauthorized"}), 404
        
    storage_type = note.get("storage_type", "local")
    
    # 1. 嘗試更新 GCS
    if storage_type == "gcs" and gcs_bucket:
        try:
            blob = gcs_bucket.blob(filename)
            blob.upload_from_string(new_content, content_type="text/plain")
            print(f"✅ [Update] Updated {filename} in GCS")
            return jsonify({"message": "File content updated successfully in GCS"})
        except Exception as e:
            print(f"⚠️ [Update] GCS update failed: {e}. Attempting local update.")
            
    # 2. 如果 GCS 失敗或是 local 存儲，更新 local
    file_path = os.path.join(DATA_DIR, filename)
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"✅ [Update] Updated {filename} in Local")
        
        if storage_type == "gcs":
            db["notes"].update_one({"stored_filename": filename}, {"$set": {"storage_type": "local"}})
            
        return jsonify({"message": "File content updated successfully locally"})
    except Exception as e:
        return jsonify({"error": f"Failed to update physical file: {str(e)}"}), 500

@app.route('/api/notes/verify/<filename>', methods=['GET'])
@token_required
def verify_note_file(current_user, filename):
    note = db["notes"].find_one({"stored_filename": filename, "username": current_user})
    if not note:
        return jsonify({"exists": False, "error": "Note metadata not found"}), 404
        
    storage_type = note.get("storage_type", "local")
    
    if storage_type == "gcs" and gcs_bucket:
        try:
            blob = gcs_bucket.blob(filename)
            exists = blob.exists()
            return jsonify({"exists": exists, "storage_type": "gcs"}), 200
        except Exception as e:
            return jsonify({"exists": False, "error": str(e), "storage_type": "gcs"}), 500
    else:
        file_path = os.path.join(DATA_DIR, filename)
        exists = os.path.exists(file_path)
        return jsonify({"exists": exists, "storage_type": "local"}), 200

@app.route('/api/notes/<note_id>', methods=['PUT'])
@token_required
def update_note(current_user, note_id):
    req = request.get_json()
    new_category = req.get('category')
    new_title = req.get('title')
    
    update_fields = {}
    
    if new_category:
        if db["categories"].find_one({"name": new_category, "username": current_user}) is None:
            db["categories"].insert_one({"name": new_category, "username": current_user})
        update_fields["category"] = new_category
        
    if new_title:
        update_fields["title"] = new_title
        
    if not update_fields:
        return jsonify({"error": "No updates provided"}), 400
        
    result = db["notes"].update_one({"id": note_id, "username": current_user}, {"$set": update_fields})
    
    if result.matched_count == 0:
        return jsonify({"error": "Note not found or unauthorized"}), 404
        
    return jsonify({"message": "Note updated successfully"})

@app.route('/api/notes/<note_id>', methods=['DELETE'])
@token_required
def delete_note(current_user, note_id):
    note = db["notes"].find_one({"id": note_id, "username": current_user})
    if not note:
        return jsonify({"error": "Note not found or unauthorized"}), 404
        
    if not note.get('is_url'):
        storage_type = note.get("storage_type", "local")
        
        if storage_type == "gcs" and gcs_bucket:
            try:
                blob = gcs_bucket.blob(note['stored_filename'])
                blob.delete()
                print(f"✅ [Delete] Deleted {note['stored_filename']} from GCS")
            except Exception as e:
                print(f"⚠️ [Delete] Failed to delete from GCS: {e}")
        else:
            file_path = os.path.join(DATA_DIR, note['stored_filename'])
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"✅ [Delete] Deleted {note['stored_filename']} from Local")
                except Exception as e:
                    return jsonify({"error": f"Failed to delete physical file: {str(e)}"}), 500
                
    db["notes"].delete_one({"id": note_id, "username": current_user})
    return jsonify({"message": "Note deleted successfully"})

@app.route('/api/ai/generate', methods=['POST'])
@token_required
def ai_generate(current_user):
    req = request.get_json() or {}
    ai_provider = req.get('ai_provider', 'local')
    api_key = req.get('api_key')
        
    prompt = req.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
        
    system_prompt = "You are an expert HTML note designer. Given the user's topic, generate a beautiful, modern HTML snippet containing notes (using modern CSS, colors, tables, etc.). Output ONLY the raw HTML code, without any markdown formatting blocks (like ```html), without DOCTYPE, just the content that can be injected into a <div>."
    
    try:
        if ai_provider == 'gemini':
            if not api_key:
                return jsonify({"error": "Gemini API Key is missing."}), 400
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(f"{system_prompt}\n\nUser Topic: {prompt}")
            text = response.text
        else:
            local_ai_url = os.getenv("LOCAL_AI_URL", "http://host.docker.internal:8001")
            local_ai_key = os.getenv("LOCAL_AI_KEY", "my_secure_api_key_2026")
            
            import requests
            res = requests.post(
                f"{local_ai_url}/api/chat",
                json={
                    "user_id": current_user,
                    "message": prompt,
                    "model": "qwen2",
                    "system_prompt": system_prompt
                },
                headers={"X-API-KEY": local_ai_key},
                timeout=60
            )
            if res.status_code == 200:
                text = res.json().get("response", "")
            else:
                return jsonify({"error": f"Local AI Error: {res.text}"}), 500

        if text.startswith('```html'):
            text = text[7:]
        elif text.startswith('```'):
            text = text[3:]
        if text.endswith('```'):
            text = text[:-3]
            
        return jsonify({"html": text.strip()})
    except Exception as e:
        return jsonify({"error": f"AI Generation failed: {str(e)}"}), 500

def scheduled_sync_job():
    print("⏰ [Scheduler] 執行每月自動同步任務 (A ∪ B)...")
    try:
        sync_manager.sync_files_to_gcs()
        sync_manager.sync_databases()
        print("✅ [Scheduler] 同步任務完成")
    except Exception as e:
        print(f"⚠️ [Scheduler] 同步任務失敗: {e}")

if __name__ == '__main__':
    scheduler = BackgroundScheduler()
    scheduler.add_job(func=scheduled_sync_job, trigger="cron", day=1, hour=3)
    scheduler.start()
    
    try:
        app.run(host='127.0.0.1', port=5000, debug=True, use_reloader=False)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
