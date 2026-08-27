from flask import Blueprint, jsonify
from modules.graph.graph_service import GraphService
from shared.jwt_service import token_required

graph_bp = Blueprint('graph', __name__, url_prefix='/api/graph')
graph_service = GraphService()

@graph_bp.route('/nodes', methods=['GET'])
@token_required
def get_graph_nodes(current_user):
    data = graph_service.get_graph_data(current_user)
    return jsonify(data)

@graph_bp.route('/mindmap/<note_id>', methods=['GET'])
@token_required
def get_mindmap(current_user, note_id):
    tree = graph_service.get_mindmap_tree(note_id, current_user)
    return jsonify(tree)
