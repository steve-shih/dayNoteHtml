# 📝 dayNoteApp - Obsidian 化與 Claude AI 整合規格書 (SPEC)

## 1. 專案概述 (Overview)
`dayNoteApp` 旨在提供個人化的日誌與知識管理系統。本規格書定義專案重構與升級目標，將系統轉換為具備 **Obsidian** 核心特色（知識網狀關聯圖 Graph View、心智圖 Mind Map、多維標籤與 `[[WikiLink]]` 雙向連結）及 **Anthropic Claude AI** 智慧助手的完整架構。

---

## 2. 系統架構設計 (System Architecture & DDD)

後端採用 **DDD (Domain-Driven Design, 領域驅動設計)** 分層架構，確保職責劃分明確且易於測試與擴充：

```
backend/
├── config.json                 # 統一系統與 Claude API 參數設定檔
├── config_loader.py            # 設定檔動態載入器
├── infra/                      # 獨立基礎設施層
│   ├── db.py                   # MongoDB 基礎連線與集合管理
│   ├── storage.py              # 檔案儲存 (GCS / 本地) 基礎設施
│   └── claude_client.py        # Anthropic Claude SDK / HTTP 存取客戶端
├── modules/                    # 各功能模組 (包含 Controller, Service, Repository)
│   ├── auth/                   # 帳號驗證模組
│   ├── notes/                  # 筆記與 WikiLink/Backlink 解析模組
│   ├── categories/             # 分類與標籤檢索模組
│   ├── graph/                  # 網狀圖 (Graph) 與心智圖 (MindMap) 計算模組
│   └── claude/                 # Claude AI 助手模組
├── shared/                     # 共用服務層
│   ├── jwt_service.py          # JWT 認證共用服務
│   └── sync_service.py         # 定時同步與維護服務
├── app.py                      # Flask 入口與 Blueprint 註冊
└── swagger.yaml                # OpenAPI / Swagger 規格文件
```

---

## 3. 功能規格說明 (Functional Specifications)

### 3.1 知識網狀圖與心智圖 (Graph View & Mind Map)
- **網狀關聯圖 (Graph View)**：
  - 前端以高畫質 HTML5 Canvas 呈現所有筆記、分類、標籤與 `[[WikiLink]]` 雙向連結關係。
  - 支援節點點擊拖拽移動 (Node Dragging)、畫布按住平移 (Canvas Panning)、滑鼠滾輪縮放與點擊跳轉至對應筆記。
- **心智圖視圖 (Mind Map View)**：
  - 解析筆記內 Markdown 標題階層 (`#`, `##`, `###`) 與列表，轉化為視覺化心智圖。
  - 支援畫布按住平移 (Canvas Drag Panning)、滑鼠滾輪縮放與使用 AI 自動生成心智圖結構。

### 3.2 雙軌多維歸類、雙向連結與 AI 自動分類 (Dual Categorization System)
- **雙軌分類結構 (Dual Category System)**：
  - 分類明確劃分為兩大類型：
    1. **🤖 AI 自動分類 (`type: "ai"`)**：由 AI 分析內文自動產生的主題分類。
    2. **👤 自訂分類 (`type: "user"`)**：由使用者手動建立與定義的個人分類。
- **標籤 `#tag` 與 WikiLink `[[筆記名稱]]`**：
  - 後端儲存或更新筆記時，自動抽取內容中的 `#tag` 標籤與 `[[WikiLink]]` 連結。
- **AI 一鍵自動分類 (`/api/claude/auto-category`)**：
  - 支援點擊「🤖 AI 分類」按鈕或上傳選擇「AI自動分類」，自動分析筆記內文推導最適合的分類名稱並註記為 `type: "ai"` 寫入 MongoDB。


- **雙向連結面板 (Backlinks Panel)**：
  - 提供目前開啟筆記的反向引用（哪些其他筆記引用了目前筆記）。

### 3.3 Anthropic Claude AI 整合 (Claude AI Service)
- 支援透過 Anthropic Claude API 提供以下 AI 智慧功能：
  1. **Claude 對話 (Chat)**：可針對目前筆記內容進行問答或深度探討。
  2. **智慧摘要與自動標籤 (Summarize & Tagging)**：一鍵解析筆記並給出精準摘要與建議標籤。
  3. **AI 心智圖生成 (AI Mind Map)**：依據筆記主題或提示詞生成心智圖 JSON 結構。
- 所有參數（API Key、模型名稱如 `claude-3-5-sonnet-20241022`、Temperature、Max Tokens）集中於 `config.json` 管理。

---

## 4. API 規格定義 (API Endpoints)

| 方法 | 路徑 | 說明 |
| :--- | :--- | :--- |
| `GET` | `/api/graph/nodes` | 取得關聯圖全域節點 (Nodes) 與連線 (Links) |
| `GET` | `/api/graph/mindmap/<note_id>` | 取得特定筆記的心智圖結構 |
| `GET` | `/api/notes/<note_id>/backlinks` | 取得指向特定筆記的反向連結清單 |
| `GET` | `/api/tags` | 取得使用者所有標籤與使用次數統計 |
| `POST` | `/api/claude/chat` | 傳送 Prompt 與筆記上下文給 Claude |
| `POST` | `/api/claude/summarize` | 使用 Claude 進行筆記摘要與標籤建議 |
| `POST` | `/api/claude/mindmap` | 使用 Claude 生成心智圖架構 |
| `POST` | `/api/claude/fix-title` | 使用 Claude 一鍵分析筆記內文並修正最佳筆記標題 |
| `POST` | `/api/claude/rag` | 進行全庫知識檢索 (RAG) 智慧問答並提供引用連結 |
| `GET/POST` | `/api/claude/config` | 讀取或更新 `config.json` 中 Claude 參數 |



---

## 5. 參數設定檔規格 (`config.json`)

```json
{
  "system": {
    "app_name": "dayNoteApp",
    "version": "2.0.0",
    "port": 5000
  },
  "claude": {
    "api_key": "",
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 2048,
    "temperature": 0.7
  },
  "database": {
    "local_uri": "mongodb://127.0.0.1:27017",
    "db_name": "daynote"
  }
}
```

---

## 6. 規範與承諾 (Compliance Standard)
- 所有代碼註解必須使用**繁體中文**。
- 說明文字採用**白話直白方式**述說。
- 採用 **DDD** 設計原則，模組間職責獨立。
- 每次 Commit 前更新 `swagger.yaml`。
