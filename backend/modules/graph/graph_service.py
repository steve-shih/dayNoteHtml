import re
from modules.graph.graph_repository import GraphRepository
from infra.storage import read_local_file_content

class GraphService:
    """
    知識圖譜 (Graph View) 與心智圖 (Mind Map) 算子服務邏輯
    """
    def __init__(self):
        self.graph_repo = GraphRepository()

    def get_graph_data(self, username):
        """
        計算筆記、分類、標籤與 WikiLink 間的關係圖譜 (Graph Nodes & Edges)
        """
        notes = self.graph_repo.get_user_notes(username)
        nodes = []
        links = []
        existing_nodes = set()

        # 1. 建立筆記節點
        title_to_id = {}
        for n in notes:
            nid = n["id"]
            title = n.get("title") or n.get("original_filename", "Untitled")
            clean_title = title.rsplit('.', 1)[0] if '.' in title else title
            title_to_id[clean_title.lower()] = nid
            title_to_id[title.lower()] = nid

            nodes.append({
                "id": nid,
                "label": clean_title,
                "type": "note",
                "category": n.get("category", "未分類")
            })
            existing_nodes.add(nid)

            # 分類連線
            cat_id = f"cat_{n.get('category', '未分類')}"
            if cat_id not in existing_nodes:
                nodes.append({
                    "id": cat_id,
                    "label": n.get("category", "未分類"),
                    "type": "category",
                    "category": n.get("category", "未分類")
                })
                existing_nodes.add(cat_id)
            links.append({
                "source": nid,
                "target": cat_id,
                "type": "category"
            })

        # 2. 解析檔案內文中的 #tag 與 [[WikiLink]] 建立動態連線
        for n in notes:
            nid = n["id"]
            content = ""
            if n.get("stored_filename"):
                content = read_local_file_content(n["stored_filename"])
            elif n.get("is_url"):
                content = n.get("url", "")

            if not content:
                continue

            # #tag 連線
            tags = list(set(re.findall(r'(?<!\S)#([\w\u4e00-\u9fa5]+)', content)))
            for tag in tags:
                tag_id = f"tag_{tag}"
                if tag_id not in existing_nodes:
                    nodes.append({
                        "id": tag_id,
                        "label": f"#{tag}",
                        "type": "tag",
                        "category": "tag"
                    })
                    existing_nodes.add(tag_id)
                links.append({
                    "source": nid,
                    "target": tag_id,
                    "type": "tag"
                })

            # [[WikiLink]] 連線
            wikilinks = list(set(re.findall(r'\[\[(.*?)\]\]', content)))
            for link_target in wikilinks:
                target_key = link_target.lower()
                if target_key in title_to_id:
                    target_nid = title_to_id[target_key]
                    if target_nid != nid:
                        links.append({
                            "source": nid,
                            "target": target_nid,
                            "type": "wikilink"
                        })

        return {"nodes": nodes, "links": links}

    def get_mindmap_tree(self, note_id, username):
        """
        將單一筆記內容解析為樹狀心智圖結構
        """
        notes = self.graph_repo.get_user_notes(username)
        target_note = next((n for n in notes if n["id"] == note_id), None)
        if not target_note:
            return {"name": "筆記未找到", "children": []}

        title = target_note.get("title", target_note.get("original_filename", "筆記"))
        clean_title = title.rsplit('.', 1)[0] if '.' in title else title

        content = ""
        if target_note.get("stored_filename"):
            content = read_local_file_content(target_note["stored_filename"])

        if not content:
            return {"name": clean_title, "children": []}

        lines = content.split('\n')
        root = {"name": clean_title, "children": []}
        stack = [(0, root)]

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            level = 0
            label = ""

            if line_str.startswith('#'):
                hashes = len(line_str) - len(line_str.lstrip('#'))
                level = hashes
                label = line_str.lstrip('#').strip()
            elif line_str.startswith(('-', '*', '+')):
                level = 4
                label = line_str.lstrip('-*+ ').strip()

            if label:
                node = {"name": label, "children": []}
                while stack and stack[-1][0] >= level:
                    stack.pop()
                parent = stack[-1][1] if stack else root
                if "children" not in parent:
                    parent["children"] = []
                parent["children"].append(node)
                stack.append((level, node))

        return root
