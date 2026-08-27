from flask import Blueprint, request, jsonify
from modules.auth.auth_service import AuthService
from shared.jwt_service import token_required

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
auth_service = AuthService()

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    success, msg, code = auth_service.register(username, password)
    if not success:
        return jsonify({'error': msg}), code
    return jsonify({'message': msg}), code

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    result, msg, code = auth_service.login(username, password)
    if not result:
        return jsonify({'error': msg}), code
    return jsonify(result), code

@auth_bp.route('/me', methods=['GET'])
@token_required
def me(current_user):
    return jsonify({'username': current_user})
