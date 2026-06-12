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
MONGO_URI = os.getenv("MONGO_URI", "mongodb://host.docker.internal:27017")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["daynote"]

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
        
        try:
            file.save(file_path)
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
            "upload_time": datetime.now().isoformat()
        }
        db["notes"].insert_one(note)
        note.pop("_id", None)
        
        return jsonify({"message": "File uploaded successfully", "note": note}), 201
    else:
        return jsonify({"error": "File type not allowed or invalid file"}), 400

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
    return send_from_directory(DATA_DIR, filename)

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
        file_path = os.path.join(DATA_DIR, note['stored_filename'])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
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

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
