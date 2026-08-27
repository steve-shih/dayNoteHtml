import os
from flask import Blueprint, request, jsonify, send_from_directory
from modules.notes.note_service import NoteService
from infra.storage import save_uploaded_file, is_allowed_file, DATA_DIR
from shared.jwt_service import token_required

from datetime import datetime

note_bp = Blueprint('notes', __name__, url_prefix='/api')
note_service = NoteService()


@note_bp.route('/notes', methods=['GET'])
@token_required
def get_notes(current_user):
    category = request.args.get('category')
    notes = note_service.get_notes(current_user, category)
    return jsonify(notes)

@note_bp.route('/notes/<note_id>', methods=['GET'])
@token_required
def get_note_by_id(current_user, note_id):
    note, msg, code = note_service.get_note_by_id(note_id, current_user)
    if not note:
        return jsonify({"error": msg}), code
    return jsonify(note)

@note_bp.route('/notes/<note_id>/backlinks', methods=['GET'])
@token_required
def get_note_backlinks(current_user, note_id):
    backlinks = note_service.get_backlinks(note_id, current_user)
    return jsonify(backlinks)

@note_bp.route('/notes/<note_id>/save', methods=['POST'])
@token_required
def save_note_content(current_user, note_id):
    req = request.get_json() or {}
    content = req.get('content', '')
    success, msg, code = note_service.save_note_content(note_id, current_user, content)
    if not success:
        return jsonify({"error": msg}), code
    return jsonify({"message": msg})

@note_bp.route('/upload', methods=['POST'])
@token_required
def upload_file(current_user):
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    category = request.form.get('category', '未分類')

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not is_allowed_file(file.filename):
        return jsonify({"error": "File type not allowed"}), 400

    file_id, original_filename, stored_filename, storage_type = save_uploaded_file(file)

    note_doc = {
        "id": file_id,
        "username": current_user,
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "category": category,
        "title": original_filename,
        "upload_time": datetime.now().isoformat(),

        "storage_type": storage_type
    }
    note_service.note_repo.save_note(note_doc)
    note_doc.pop("_id", None)
    return jsonify({"message": "File uploaded successfully", "note": note_doc}), 201

@note_bp.route('/ai/upload', methods=['POST'])
@token_required
def create_ai_note(current_user):
    req = request.get_json() or {}
    title = req.get('title', 'AI Note')
    content = req.get('content', '')
    extension = req.get('extension', 'md')
    note = note_service.create_ai_note(current_user, title, content, extension)
    return jsonify({"message": "AI Note created successfully", "note": note}), 201

@note_bp.route('/notes/url', methods=['POST'])
@token_required
def create_url_note(current_user):
    req = request.get_json() or {}
    title = req.get('title', 'Web URL')
    url = req.get('url', '')
    category = req.get('category', 'WEB URL NOTE')
    if not url:
        return jsonify({"error": "URL is required"}), 400
    note = note_service.create_url_note(current_user, title, url, category)
    return jsonify({"message": "URL Note saved", "note": note}), 201

@note_bp.route('/notes/<note_id>', methods=['DELETE'])
@token_required
def delete_note(current_user, note_id):
    success, msg, code = note_service.delete_note(note_id, current_user)
    if not success:
        return jsonify({"error": msg}), code
    return jsonify({"message": msg})

@note_bp.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    return send_from_directory(DATA_DIR, filename, as_attachment=True)
