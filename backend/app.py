import os
import json
import uuid
import threading
from datetime import datetime
import google.generativeai as genai
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max limit
ALLOWED_EXTENSIONS = {'txt', 'html', 'pdf', 'md', 'png', 'jpg', 'jpeg', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
METADATA_FILE = os.path.join(DATA_DIR, 'metadata.json')
file_lock = threading.Lock()

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)

def load_metadata():
    if not os.path.exists(METADATA_FILE):
        return {"categories": ["投資", "英文", "CS", "其他"], "notes": []}
    with open(METADATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_metadata(data):
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/categories', methods=['GET'])
def get_categories():
    data = load_metadata()
    return jsonify(data.get("categories", []))

@app.route('/api/categories', methods=['POST'])
def add_category():
    req = request.get_json()
    new_category = req.get('category')
    if not new_category:
        return jsonify({"error": "Category is required"}), 400
    
    with file_lock:
        data = load_metadata()
        if new_category not in data['categories']:
            data['categories'].append(new_category)
            save_metadata(data)
    return jsonify({"message": "Category added successfully", "categories": data['categories']})

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
        # Handle non-ascii filenames if secure_filename makes it empty
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
        
        with file_lock:
            data = load_metadata()
            
            if category not in data['categories']:
                data['categories'].append(category)
                
            note = {
                "id": file_id,
                "original_filename": original_filename,
                "stored_filename": stored_filename,
                "category": category,
                "upload_time": datetime.now().isoformat()
            }
            data['notes'].append(note)
            save_metadata(data)
        
        return jsonify({"message": "File uploaded successfully", "note": note}), 201
    else:
        return jsonify({"error": "File type not allowed or invalid file"}), 400

@app.route('/api/notes', methods=['GET'])
def get_notes():
    data = load_metadata()
    category = request.args.get('category')
    notes = data.get("notes", [])
    if category:
        notes = [n for n in notes if n.get("category") == category]
    
    # Sort notes by upload time descending
    notes.sort(key=lambda x: x.get('upload_time', ''), reverse=True)
    return jsonify(notes)

@app.route('/api/notes/<filename>', methods=['GET'])
def get_note_file(filename):
    return send_from_directory(DATA_DIR, filename)

@app.route('/api/notes/<note_id>', methods=['PUT'])
def update_note(note_id):
    req = request.get_json()
    new_category = req.get('category')
    if not new_category:
        return jsonify({"error": "Category is required"}), 400
        
    with file_lock:
        data = load_metadata()
        note_found = False
        for note in data['notes']:
            if note['id'] == note_id:
                note['category'] = new_category
                note_found = True
                break
                
        if not note_found:
            return jsonify({"error": "Note not found"}), 404
            
        if new_category not in data['categories']:
            data['categories'].append(new_category)
            
        save_metadata(data)
    return jsonify({"message": "Note updated successfully"})

@app.route('/api/notes/<note_id>', methods=['DELETE'])
def delete_note(note_id):
    with file_lock:
        data = load_metadata()
        note_to_delete = None
        for note in data['notes']:
            if note['id'] == note_id:
                note_to_delete = note
                break
                
        if not note_to_delete:
            return jsonify({"error": "Note not found"}), 404
            
        # Remove physical file
        file_path = os.path.join(DATA_DIR, note_to_delete['stored_filename'])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                return jsonify({"error": f"Failed to delete physical file: {str(e)}"}), 500
                
        # Remove from database
        data['notes'].remove(note_to_delete)
        save_metadata(data)
        
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
    # When run directly, use simple flask server
    app.run(host='127.0.0.1', port=5000, debug=True)
