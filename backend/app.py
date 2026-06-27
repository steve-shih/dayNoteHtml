import os
import json
import uuid
import threading
from datetime import datetime
from dotenv import load_dotenv
import google.generativeai as genai
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from pymongo import MongoClient
from google.cloud import storage
import os
from flask import redirect
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

# Automatic JSON to MongoDB Seeding/Migration on Startup
def init_db():
    if db["categories"].count_documents({}) == 0:
        migrated = False
        if os.path.exists(METADATA_FILE):
            try:
                with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                    old_data = json.load(f)
                
                categories = old_data.get("categories", [])
                notes = old_data.get("notes", [])
                
                if categories:
                    db["categories"].insert_many([{"name": c} for c in categories])
                if notes:
                    db["notes"].insert_many(notes)
                migrated = True
                print("Seeded MongoDB from local metadata.json successfully!")
            except Exception as e:
                print(f"Error migrating local JSON to MongoDB: {e}")
        
        if not migrated:
            default_categories = ["投資", "英文", "CS", "其他"]
            db["categories"].insert_many([{"name": c} for c in default_categories])
            print("Seeded default categories into MongoDB.")

init_db()

@app.route('/api/categories', methods=['GET'])
def get_categories():
    categories_cursor = db["categories"].find({}, {"_id": 0, "name": 1})
    categories = [c["name"] for c in categories_cursor]
    return jsonify(categories)

@app.route('/api/categories', methods=['POST'])
def add_category():
    req = request.get_json()
    new_category = req.get('category')
    if not new_category:
        return jsonify({"error": "Category is required"}), 400
    
    if db["categories"].find_one({"name": new_category}) is None:
        db["categories"].insert_one({"name": new_category})
    
    categories_cursor = db["categories"].find({}, {"_id": 0, "name": 1})
    categories = [c["name"] for c in categories_cursor]
    return jsonify({"message": "Category added successfully", "categories": categories})

@app.route('/api/categories/<category>', methods=['DELETE'])
def delete_category(category):
    if category in ["未分類", "AI筆記", "WEB URL NOTE"]:
        return jsonify({"error": "Cannot delete protected categories"}), 400
        
    db["categories"].delete_one({"name": category})
    db["notes"].update_many({"category": category}, {"$set": {"category": "未分類"}})
    return jsonify({"message": "Category deleted successfully"})

@app.route('/api/upload', methods=['POST'])
def upload_file():
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
        
        if db["categories"].find_one({"name": category}) is None:
            db["categories"].insert_one({"name": category})
            
        note = {
            "id": file_id,
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
def ai_upload_note():
    req = request.get_json()
    if not req:
        return jsonify({"error": "Invalid JSON payload"}), 400
        
    password = req.get('password')
    if password != 'daynote123':
        return jsonify({"error": "Unauthorized"}), 401
        
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
            
    if db["categories"].find_one({"name": category}) is None:
        db["categories"].insert_one({"name": category})
        
    note = {
        "id": file_id,
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
def add_url_note():
    req = request.get_json()
    url = req.get('url')
    name = req.get('name')
    category = "WEB URL NOTE"
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
        
    if not name:
        name = url
        
    file_id = str(uuid.uuid4())
    
    if db["categories"].find_one({"name": category}) is None:
        db["categories"].insert_one({"name": category})
        
    note = {
        "id": file_id,
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
def get_notes():
    category = request.args.get('category')
    query = {}
    if category:
        query["category"] = category
    
    notes_cursor = db["notes"].find(query, {"_id": 0}).sort("upload_time", -1)
    notes = list(notes_cursor)
    return jsonify(notes)

@app.route('/api/notes/<filename>', methods=['GET'])
def get_note_file(filename):
    note = db["notes"].find_one({"stored_filename": filename})
    storage_type = note.get("storage_type", "local") if note else "local"
    
    if storage_type == "gcs" and gcs_bucket:
        try:
            blob = gcs_bucket.blob(filename)
            # Generate a signed URL valid for 1 hour
            url = blob.generate_signed_url(version="v4", expiration=3600, method="GET")
            return redirect(url, code=302)
        except Exception as e:
            print(f"⚠️ [Download] Failed to generate signed URL for {filename}: {e}")
            # Fallback in case generation fails, though file might not be locally available
            pass
            
    return send_from_directory(DATA_DIR, filename)

@app.route('/api/notes/<filename>/content', methods=['PUT'])
def update_note_content(filename):
    req = request.get_json()
    new_content = req.get('content')
    
    if new_content is None:
        return jsonify({"error": "Content is required"}), 400
        
    note = db["notes"].find_one({"stored_filename": filename})
    if not note:
        return jsonify({"error": "Note metadata not found"}), 404
        
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
        
        # 如果原本在 GCS，但 GCS 更新失敗導致降級到 Local，更新資料庫的 storage_type
        if storage_type == "gcs":
            db["notes"].update_one({"stored_filename": filename}, {"$set": {"storage_type": "local"}})
            
        return jsonify({"message": "File content updated successfully locally"})
    except Exception as e:
        return jsonify({"error": f"Failed to update physical file: {str(e)}"}), 500

@app.route('/api/notes/verify/<filename>', methods=['GET'])
def verify_note_file(filename):
    note = db["notes"].find_one({"stored_filename": filename})
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
def update_note(note_id):
    req = request.get_json()
    new_category = req.get('category')
    new_title = req.get('title')
    
    update_fields = {}
    
    if new_category:
        if db["categories"].find_one({"name": new_category}) is None:
            db["categories"].insert_one({"name": new_category})
        update_fields["category"] = new_category
        
    if new_title:
        update_fields["title"] = new_title
        
    if not update_fields:
        return jsonify({"error": "No updates provided"}), 400
        
    result = db["notes"].update_one({"id": note_id}, {"$set": update_fields})
    
    if result.matched_count == 0:
        return jsonify({"error": "Note not found"}), 404
        
    return jsonify({"message": "Note updated successfully"})

@app.route('/api/notes/<note_id>', methods=['DELETE'])
def delete_note(note_id):
    note = db["notes"].find_one({"id": note_id})
    if not note:
        return jsonify({"error": "Note not found"}), 404
        
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
                
    db["notes"].delete_one({"id": note_id})
    return jsonify({"message": "Note deleted successfully"})

@app.route('/api/ai/generate', methods=['POST'])
def ai_generate():
    req = request.get_json() or {}
    api_key = req.get('api_key')
    if not api_key:
        return jsonify({"error": "API Key is missing."}), 400
        
    prompt = req.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
        
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        system_prompt = "You are an expert HTML note designer. Given the user's topic, generate a beautiful, modern HTML snippet containing notes (using modern CSS, colors, tables, etc.). Output ONLY the raw HTML code, without any markdown formatting blocks (like ```html), without DOCTYPE, just the content that can be injected into a <div>."
        
        response = model.generate_content(f"{system_prompt}\n\nUser Topic: {prompt}")
        
        text = response.text
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
    # 啟動背景排程器 (每個月的第一天凌晨 3 點執行)
    scheduler = BackgroundScheduler()
    scheduler.add_job(func=scheduled_sync_job, trigger="cron", day=1, hour=3)
    scheduler.start()
    
    try:
        app.run(host='127.0.0.1', port=5000, debug=True, use_reloader=False)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
