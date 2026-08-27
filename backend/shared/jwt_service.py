import jwt
from functools import wraps
from datetime import datetime, timedelta
from flask import request, jsonify
from config_loader import load_config

config = load_config()
SECRET_KEY = config.get("system", {}).get("secret_key", "daynote-super-secret-key")

def generate_token(username):
    """
    發行使用者 JWT Token
    """
    payload = {
        'username': username,
        'exp': datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def token_required(f):
    """
    Flask Route JWT 驗證裝飾器
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
        if not token:
            return jsonify({'error': 'Token is missing!'}), 401
            
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['username']
        except Exception:
            return jsonify({'error': 'Token is invalid or expired!'}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated
