from flask import Blueprint, request, jsonify
from modules.claude.claude_service import ClaudeService
from shared.jwt_service import token_required

claude_bp = Blueprint('claude', __name__, url_prefix='/api/claude')
claude_service = ClaudeService()

@claude_bp.route('/config', methods=['GET'])
@token_required
def get_config(current_user):
    cfg = claude_service.get_claude_config()
    return jsonify(cfg)

@claude_bp.route('/config', methods=['POST'])
@token_required
def update_config(current_user):
    req = request.get_json() or {}
    provider = req.get('provider')
    claude_settings = req.get('claude')
    ollama_settings = req.get('ollama')

    # 舊版參數相容處理
    if not claude_settings and 'api_key' in req:
        claude_settings = {
            "api_key": req.get('api_key'),
            "model": req.get('model', 'claude-3-5-sonnet-20241022')
        }

    updated = claude_service.update_claude_config(provider, claude_settings, ollama_settings)
    return jsonify({"message": "AI settings updated successfully", "config": updated})


@claude_bp.route('/chat', methods=['POST'])
@token_required
def chat(current_user):
    req = request.get_json() or {}
    prompt = req.get('prompt', '')
    note_id = req.get('note_id')

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    result = claude_service.chat(current_user, prompt, note_id)
    if not result.get("success"):
        return jsonify({"error": result.get("error")}), 500
    return jsonify(result)

@claude_bp.route('/summarize', methods=['POST'])
@token_required
def summarize(current_user):
    req = request.get_json() or {}
    note_id = req.get('note_id')

    if not note_id:
        return jsonify({"error": "note_id is required"}), 400

    result = claude_service.summarize_note(current_user, note_id)
    if not result.get("success"):
        return jsonify({"error": result.get("error")}), 500
    return jsonify(result)

@claude_bp.route('/mindmap', methods=['POST'])
@token_required
def generate_mindmap(current_user):
    req = request.get_json() or {}
    prompt = req.get('prompt', '建立心智圖')
    note_id = req.get('note_id')

    result = claude_service.generate_mindmap(current_user, prompt, note_id)
    if not result.get("success"):
        return jsonify({"error": result.get("error")}), 500
    return jsonify(result)

@claude_bp.route('/fix-title', methods=['POST'])
@token_required
def fix_title(current_user):
    req = request.get_json() or {}
    note_id = req.get('note_id')

    if not note_id:
        return jsonify({"error": "note_id is required"}), 400

    result = claude_service.fix_title(current_user, note_id)
    if not result.get("success"):
        return jsonify({"error": result.get("error")}), 500
    return jsonify(result)

@claude_bp.route('/rag', methods=['POST'])
@token_required
def rag_chat(current_user):
    req = request.get_json() or {}
    query = req.get('query', '')

    if not query:
        return jsonify({"error": "query is required"}), 400

    result = claude_service.rag_chat(current_user, query)
    if not result.get("success"):
        return jsonify({"error": result.get("error")}), 500
    return jsonify(result)

@claude_bp.route('/auto-category', methods=['POST'])
@token_required
def auto_category(current_user):
    req = request.get_json() or {}
    note_id = req.get('note_id')

    if not note_id:
        return jsonify({"error": "note_id is required"}), 400

    result = claude_service.auto_category(current_user, note_id)
    if not result.get("success"):
        return jsonify({"error": result.get("error")}), 500
    return jsonify(result)



