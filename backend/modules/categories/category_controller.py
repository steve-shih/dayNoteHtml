from flask import Blueprint, request, jsonify
from modules.categories.category_service import CategoryService
from shared.jwt_service import token_required

category_bp = Blueprint('categories', __name__, url_prefix='/api/categories')
category_service = CategoryService()

@category_bp.route('', methods=['GET'])
@token_required
def get_categories(current_user):
    categories = category_service.get_categories(current_user)
    return jsonify(categories)

@category_bp.route('', methods=['POST'])
@token_required
def add_category(current_user):
    req = request.get_json() or {}
    category_name = req.get('category')
    success, data, code = category_service.add_category(current_user, category_name)
    if not success:
        return jsonify({"error": data}), code
    return jsonify({"message": "Category added successfully", "categories": data})

@category_bp.route('/<category>', methods=['DELETE'])
@token_required
def delete_category(current_user, category):
    success, msg, code = category_service.delete_category(current_user, category)
    if not success:
        return jsonify({"error": msg}), code
    return jsonify({"message": msg})
