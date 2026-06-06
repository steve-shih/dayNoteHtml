# 📝 DayNote App - 日誌管理應用

這是一個現代化的全端日誌應用程式，採用前後端分離架構，提供流暢的使用者介面與穩定的資料儲存機制。

## 🛠️ 技術架構
- **Frontend (前端)**: Next.js (React), TailwindCSS, TypeScript
- **Backend (後端)**: FastAPI (Python), Uvicorn

---

## 💻 如何啟動專案

這個專案分為「前端」與「後端」兩部分，必須**分別在兩個獨立的終端機視窗**中啟動。

### 1️⃣ 啟動後端 (Backend)
請確保你的電腦中已安裝 Python (建議版本 3.8 以上)。

1. 開啟第一個終端機，進入 `backend` 資料夾：
   ```bash
   cd backend
   ```
2. (建議) 建立並啟動虛擬環境 (Virtual Environment)：
   ```bash
   python -m venv venv
   # Windows 啟動虛擬環境:
   .\venv\Scripts\activate
   # Mac/Linux 啟動虛擬環境:
   source venv/bin/activate
   ```
3. 安裝依賴套件：
   ```bash
   pip install -r requirements.txt
   ```
4. 啟動 FastAPI 伺服器：
   ```bash
   python app.py
   ```
   *(後端預設會在 `http://localhost:5000` 運行)*

---

### 2️⃣ 啟動前端 (Frontend)
請確保你的電腦中已安裝 Node.js。

1. 開啟第二個終端機，進入 `frontend` 資料夾：
   ```bash
   cd frontend
   ```
2. 安裝依賴套件 (只需第一次執行)：
   ```bash
   npm install
   ```
3. 啟動 Next.js 開發伺服器：
   ```bash
   npm run dev
   ```
   *(前端預設會在 `http://localhost:3000` 運行)*

### 3️⃣ 開啟網頁
當前後端都成功啟動後，請打開瀏覽器並前往：
👉 **[http://localhost:3000](http://localhost:3000)** 即可開始使用！
