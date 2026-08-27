from apscheduler.schedulers.background import BackgroundScheduler

scheduler = None

def init_sync_scheduler():
    """
    初始化背景排程管理器，定期執行同等維護任務
    """
    global scheduler
    if scheduler is None:
        try:
            scheduler = BackgroundScheduler(daemon=True)
            # 可擴充背景定期同步任務
            scheduler.start()
            print("✅ [Shared-Sync] 背景排程服務已啟動")
        except Exception as e:
            print(f"⚠️ [Shared-Sync] 啟動背景排程失敗: {e}")
