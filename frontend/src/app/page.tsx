"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";

axios.defaults.headers.common['ngrok-skip-browser-warning'] = '69420';

axios.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('daynote_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        const hasToken = localStorage.getItem('daynote_token');
        if (hasToken) {
          localStorage.removeItem('daynote_token');
          localStorage.removeItem('daynote_username');
          window.location.reload();
        }
      }
    }
    return Promise.reject(error);
  }
);

import { ConfigProvider, theme as antdTheme, Layout, Menu, Button, Modal, Upload, Select, Input, List, Typography, Space, message, Empty, Tag, Card, Popconfirm, Spin, Divider, Drawer, Radio, Checkbox, Tabs } from 'antd';
import { UploadOutlined, FileTextOutlined, PlusOutlined, DownloadOutlined, FolderOpenOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined, DeleteOutlined, RobotOutlined, SendOutlined, SaveOutlined, MenuOutlined, ArrowLeftOutlined, ExportOutlined, LinkOutlined } from '@ant-design/icons';
import type { UploadProps, MenuProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import GraphView from '../components/GraphView';
import MindMapView from '../components/MindMapView';
import BacklinksPanel from '../components/BacklinksPanel';
import ClaudeAssistantDrawer from '../components/ClaudeAssistantDrawer';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

type Note = {
  id: string;
  original_filename: string;
  stored_filename: string;
  category: string;
  upload_time: string;
  is_url?: boolean;
  url?: string;
  title?: string;
};

const THEMES = {
  light: {
    bgApp: '#f0f2f5',
    bgPanel: '#ffffff',
    border: '#d9d9d9',
    textMain: '#000000',
    textInverse: '#ffffff',
    bgAiBubble: '#f5f5f5',
    tableBorder: '#f0f0f0',
    codeBg: '#f5f5f5',
    siderTheme: 'light' as const,
  },
  gray: {
    bgApp: '#e8e8e8',
    bgPanel: '#d9d9d9',
    border: '#bfbfbf',
    textMain: '#262626',
    textInverse: '#ffffff',
    bgAiBubble: '#e8e8e8',
    tableBorder: '#bfbfbf',
    codeBg: '#f5f5f5',
    siderTheme: 'light' as const,
  },
  dark: {
    bgApp: '#141414',
    bgPanel: '#1f1f1f',
    border: '#303030',
    textMain: '#ffffff',
    textInverse: '#000000',
    bgAiBubble: '#1f1f1f',
    tableBorder: '#424242',
    codeBg: '#1f1f1f',
    siderTheme: 'dark' as const,
  }
};

export default function Home() {
  const [categories, setCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 響應式與 Drawer 狀態
  const [isMobile, setIsMobile] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  
  // AI 對話與歷史 Session
  const [apiKey, setApiKey] = useState("");
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'local'>('local');
  const [aiSessions, setAiSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [aiMode, setAiMode] = useState<'general' | 'web' | 'rag'>('general');
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  
  // 上傳 Modal
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState('file');
  const [fileList, setFileList] = useState<RcFile[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlNameInput, setUrlNameInput] = useState('');
  const [htmlInputContent, setHtmlInputContent] = useState('');
  const [htmlNameInput, setHtmlNameInput] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string | undefined>(undefined);
  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  
  // Auth & 編輯狀態
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isEditingTxt, setIsEditingTxt] = useState(false);
  const [txtEditContent, setTxtEditContent] = useState("");

  const [appTheme, setAppTheme] = useState<'light' | 'gray' | 'dark'>('dark');
  const colors = THEMES[appTheme];
  const antdAlgorithm = appTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;

  // Obsidian & Claude AI 狀態
  const [activeView, setActiveView] = useState<'editor' | 'graph' | 'mindmap'>('editor');
  const [claudeDrawerOpen, setClaudeDrawerOpen] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [mindmapTree, setMindmapTree] = useState<any>(null);
  const [mindmapLoading, setMindmapLoading] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const savedTheme = localStorage.getItem('daynote_theme') as any;
    if (savedTheme) setAppTheme(savedTheme);

    const savedUsername = localStorage.getItem('daynote_saved_username');
    const savedPassword = localStorage.getItem('daynote_saved_password');
    if (savedUsername && savedPassword) {
      setUsernameInput(savedUsername);
      setPasswordInput(savedPassword);
      setRememberMe(true);
    }

    const savedToken = localStorage.getItem('daynote_token');
    if (savedToken) {
      setIsAuthenticated(true);
      fetchCategories();
      fetchNotes();
      loadAiSessions();
    }
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    }
  }, [activeCategory, isAuthenticated]);

  useEffect(() => {
    if (activeNote) {
      if (activeNote.is_url) {
        setNoteContent(activeNote.url || "");
      } else {
        fetchNoteContent(activeNote.stored_filename);
      }
      setIsEditingTxt(false);
    } else {
      setNoteContent("");
    }
  }, [activeNote]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`/daynote/api/categories`);
      setCategories(res.data);
    } catch (error) {
      console.error("Fetch categories failed", error);
    }
  };

  const fetchNotes = async (category: string | null = null) => {
    try {
      const url = category ? `/daynote/api/notes?category=${encodeURIComponent(category)}` : `/daynote/api/notes`;
      const res = await axios.get(url);
      setNotes(res.data);
      if (res.data.length > 0 && !activeNote && !isMobile) {
        setActiveNote(res.data[0]);
      }
    } catch (error) {
      console.error("Fetch notes failed", error);
    }
  };

  const fetchNoteContent = async (filename: string) => {
    try {
      const res = await axios.get(`/daynote/api/notes/${filename}?token=${localStorage.getItem('daynote_token')}`);
      setNoteContent(res.data);
    } catch (error) {
      setNoteContent("載入筆記失敗。");
    }
  };

  const fetchGraphData = async () => {
    setGraphLoading(true);
    try {
      const res = await axios.get('/daynote/api/graph/nodes');
      setGraphData(res.data || { nodes: [], links: [] });
    } catch (err) {
      console.error('Fetch graph data failed', err);
    } finally {
      setGraphLoading(false);
    }
  };

  const fetchMindmapTree = async (noteId?: string) => {
    const targetId = noteId || activeNote?.id;
    if (!targetId) return;
    setMindmapLoading(true);
    try {
      const res = await axios.get(`/daynote/api/graph/mindmap/${targetId}`);
      setMindmapTree(res.data);
    } catch (err) {
      console.error('Fetch mindmap tree failed', err);
    } finally {
      setMindmapLoading(false);
    }
  };

  const handleSelectNoteById = async (noteId: string) => {
    const target = notes.find(n => n.id === noteId);
    if (target) {
      setActiveNote(target);
      setActiveView('editor');
    } else {
      try {
        const res = await axios.get(`/daynote/api/notes/${noteId}`);
        if (res.data) {
          setActiveNote(res.data);
          setActiveView('editor');
        }
      } catch (e) {
        message.error('無法載入此筆記');
      }
    }
  };

  const loadAiSessions = async () => {
    try {
      const res = await axios.get(`/daynote/api/ai/sessions`);
      setAiSessions(res.data || []);
    } catch (e) {}
  };

  const createNewAiSession = async () => {
    try {
      const res = await axios.post(`/daynote/api/ai/session/new`);
      setCurrentSessionId(res.data.session_id);
      setChatMessages([]);
      loadAiSessions();
      message.success('已開啟全新 AI 對話 Session！');
    } catch (e) {
      message.error('建立新對話失敗');
    }
  };

  const loadAiSessionHistory = async (sessionId: string) => {
    try {
      const res = await axios.get(`/daynote/api/ai/session/${sessionId}`);
      setCurrentSessionId(sessionId);
      setChatMessages(res.data.messages || []);
      setIsSessionsDrawerOpen(false);
    } catch (e) {
      message.error('載入歷史紀錄失敗');
    }
  };

  const deleteAiSession = async (sessionId: string) => {
    try {
      await axios.delete(`/daynote/api/ai/session/${sessionId}`);
      if (currentSessionId === sessionId) {
        setCurrentSessionId('');
        setChatMessages([]);
      }
      loadAiSessions();
      message.success('對話已刪除');
    } catch (e) {
      message.error('刪除失敗');
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await axios.delete(`/daynote/api/notes/${noteId}`);
      message.success("刪除成功！");
      setActiveNote(null);
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    } catch (error) {
      message.error("刪除失敗。");
    }
  };

  const handleChangeCategory = async (newCategory: string) => {
    if (!activeNote) return;
    if (newCategory === "NEW_CATEGORY") {
      const name = prompt("請輸入新分類名稱：");
      if (name) {
        await axios.post(`/daynote/api/categories`, { category: name });
        await fetchCategories();
        newCategory = name;
      } else {
        return;
      }
    }

    try {
      await axios.put(`/daynote/api/notes/${activeNote.id}`, { category: newCategory });
      setActiveNote({ ...activeNote, category: newCategory });
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);
      message.success("分類已更新！");
    } catch (e) {
      message.error("更新分類失敗");
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    try {
      await axios.delete(`/daynote/api/categories/${encodeURIComponent(catName)}`);
      message.success(`已刪除分類: ${catName}`);
      if (activeCategory === catName) setActiveCategory("all");
      fetchCategories();
      fetchNotes();
    } catch (e) {
      message.error("刪除分類失敗");
    }
  };

  const handleUpload = async () => {
    let targetCat = uploadCategory;
    if (uploadCategory === "NEW_CATEGORY") {
      if (!newCategoryName.trim()) {
        message.warning("請輸入新分類名稱！");
        return;
      }
      try {
        await axios.post(`/daynote/api/categories`, { category: newCategoryName.trim() });
        await fetchCategories();
        targetCat = newCategoryName.trim();
      } catch (e) {
        message.error("新增分類失敗");
        return;
      }
    }

    if (uploadTab === 'url') {
      if (!urlInput.trim()) {
        message.warning("請輸入 URL！");
        return;
      }
      setUploading(true);
      try {
        await axios.post(`/daynote/api/notes/url`, {
          url: urlInput.trim(),
          title: urlNameInput.trim() || undefined,
          category: targetCat || "WEB URL NOTE"
        });
        message.success("網址筆記已成功儲存！");
        setIsUploadOpen(false);
        setUrlInput('');
        setUrlNameInput('');
        fetchCategories();
        fetchNotes(activeCategory === "all" ? null : activeCategory);
      } catch (e) {
        message.error("儲存網址筆記失敗。");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (uploadTab === 'html') {
      if (!htmlInputContent.trim()) {
        message.warning("請輸入 HTML 內容！");
        return;
      }
      setUploading(true);
      try {
        const title = htmlNameInput.trim() || "Untitled_HTML";
        const b64 = btoa(unescape(encodeURIComponent(htmlInputContent)));
        const blob = new Blob([unescape(encodeURIComponent(htmlInputContent))], { type: 'text/html' });
        const file = new File([blob], title.endsWith('.html') ? title : `${title}.html`, { type: 'text/html' });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", targetCat || "未分類");

        await axios.post(`/daynote/api/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        message.success("HTML 筆記已成功建立！");
        setIsUploadOpen(false);
        setHtmlInputContent('');
        setHtmlNameInput('');
        fetchCategories();
        fetchNotes(activeCategory === "all" ? null : activeCategory);
      } catch (e) {
        message.error("建立 HTML 筆記失敗。");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (fileList.length === 0) {
      message.warning("請選擇要上傳的檔案！");
      return;
    }
    setUploading(true);

    try {
      for (const file of fileList) {
        const formData = new FormData();
        formData.append("file", file);
        if (targetCat) formData.append("category", targetCat);

        await axios.post(`/daynote/api/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      }
      message.success("檔案上傳成功！");
      setIsUploadOpen(false);
      setFileList([]);
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    } catch (error) {
      message.error("上傳失敗。");
    } finally {
      setUploading(false);
    }
  };

  const uploadProps: UploadProps = {
    multiple: true,
    beforeUpload: (file) => {
      setFileList(prev => [...prev, file as RcFile]);
      return false;
    },
    onRemove: (file) => {
      setFileList(prev => prev.filter(f => f.uid !== file.uid));
    },
    fileList: fileList as any,
  };

  const menuItems: MenuProps['items'] = [
    { key: "all", icon: <FolderOpenOutlined />, label: "全部筆記" },
    ...categories.map(cat => ({
      key: cat,
      icon: <FolderOpenOutlined />,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
          {!["未分類", "AI筆記", "WEB URL NOTE"].includes(cat) && (
            <Popconfirm
              title="刪除分類"
              description="確定刪除此分類？底下的筆記將移至「未分類」。"
              onConfirm={(e) => { e?.stopPropagation(); handleDeleteCategory(cat); }}
              onCancel={(e) => e?.stopPropagation()}
              okText="刪除"
              cancelText="取消"
            >
              <DeleteOutlined style={{ color: '#ff4d4f' }} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          )}
        </div>
      )
    }))
  ];

  const showViewer = !!activeNote;
  const showList = !isMobile || !showViewer;

  if (!isAuthenticated) {
    return (
      <ConfigProvider theme={{ algorithm: antdAlgorithm, token: { colorBgBase: colors.bgPanel, colorBgContainer: colors.bgPanel, colorText: colors.textMain } }}>
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgApp }}>
          <Card title={<Title level={3} style={{ margin: 0, color: '#1677ff', textAlign: 'center' }}>{isRegisterMode ? '註冊 DayNote' : '登入 DayNote'}</Title>} style={{ width: 350, background: colors.bgPanel, borderColor: colors.border }}>
            <Input 
              size="large" 
              placeholder="帳號" 
              value={usernameInput} 
              onChange={e => setUsernameInput(e.target.value)} 
              style={{ marginBottom: 16 }}
            />
            <Input.Password 
              size="large" 
              placeholder="密碼" 
              value={passwordInput} 
              onChange={e => setPasswordInput(e.target.value)} 
            />
            <div style={{ marginTop: 12, marginBottom: 4 }}>
              <Checkbox checked={rememberMe} onChange={(e: any) => setRememberMe(e.target.checked)}>記住帳號密碼</Checkbox>
            </div>
            <Button type="primary" size="large" block style={{ marginTop: 12 }} onClick={async () => {
                const endpoint = isRegisterMode ? '/daynote/api/auth/register' : '/daynote/api/auth/login';
                try {
                  const res = await axios.post(endpoint, { username: usernameInput, password: passwordInput });
                  if (isRegisterMode) {
                    message.success('註冊成功！請登入');
                    setIsRegisterMode(false);
                  } else {
                    if (rememberMe) {
                      localStorage.setItem('daynote_saved_username', usernameInput);
                      localStorage.setItem('daynote_saved_password', passwordInput);
                    } else {
                      localStorage.removeItem('daynote_saved_username');
                      localStorage.removeItem('daynote_saved_password');
                    }
                    localStorage.setItem('daynote_token', res.data.token);
                    localStorage.setItem('daynote_username', res.data.username);
                    setIsAuthenticated(true);
                    fetchCategories();
                    fetchNotes();
                  }
                } catch (e: any) {
                  message.error(e.response?.data?.error || '操作失敗');
                }
            }}>
              {isRegisterMode ? '註冊' : '登入'}
            </Button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button type="link" onClick={() => setIsRegisterMode(!isRegisterMode)}>
                {isRegisterMode ? '已有帳號？點此登入' : '還沒有帳號？點此註冊'}
              </Button>
            </div>
          </Card>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={{ algorithm: antdAlgorithm, token: { colorBgBase: colors.bgPanel, colorBgContainer: colors.bgPanel, colorText: colors.textMain } }}>
      <Layout style={{ minHeight: '100vh', background: colors.bgApp }}>
        {!isMobile && (
          <Sider width={260} theme={colors.siderTheme} style={{ borderRight: `1px solid ${colors.border}`, display: isFullscreen ? 'none' : 'block' }}>
            <div style={{ padding: '24px 20px' }}>
              <Title level={3} style={{ margin: 0, color: '#1677ff' }}>DayNote</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>Obsidian & Claude AI Edition</Text>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <Button 
                type="primary" 
                icon={<UploadOutlined />} 
                block 
                onClick={() => setIsUploadOpen(true)}
                size="large"
              >
                Upload File
              </Button>
              <Button 
                icon={<ExportOutlined />} 
                block 
                style={{ marginTop: 8 }}
                onClick={() => window.open(window.location.href, '_blank')}
              >
                在新分頁開啟系統
              </Button>
            </div>
            
            <div style={{ padding: '0 16px 16px' }}>
              <Button danger block style={{ marginBottom: 8 }} onClick={() => { localStorage.removeItem('daynote_token'); localStorage.removeItem('daynote_username'); window.location.reload(); }}>登出</Button>
              <Select value={appTheme} style={{ width: '100%' }} onChange={(val) => { setAppTheme(val); localStorage.setItem('daynote_theme', val); }}>
                <Option value="light">淺色模式</Option>
                <Option value="gray">灰色模式</Option>
                <Option value="dark">深色模式</Option>
              </Select>
            </div>

            <Menu 
              theme={colors.siderTheme} 
              mode="inline" 
              selectedKeys={[activeCategory]}
              onClick={(e) => setActiveCategory(e.key)}
              items={menuItems}
            />
          </Sider>
        )}

        <Drawer
          title="DayNote"
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          styles={{ body: { padding: 0, background: colors.bgApp }, header: { background: colors.bgPanel, borderBottom: `1px solid ${colors.border}` } }}
        >
          <div style={{ padding: '16px' }}>
            <Button type="primary" icon={<UploadOutlined />} block onClick={() => { setIsUploadOpen(true); setDrawerVisible(false); }} size="large">Upload File</Button>
            <Button icon={<ExportOutlined />} block style={{ marginTop: 8 }} onClick={() => window.open(window.location.href, '_blank')}>在新分頁開啟系統</Button>
          </div>
          
          <div style={{ padding: '16px' }}>
            <Button danger block style={{ marginBottom: 8 }} onClick={() => { localStorage.removeItem('daynote_token'); localStorage.removeItem('daynote_username'); window.location.reload(); }}>登出</Button>
            <Select value={appTheme} style={{ width: '100%' }} onChange={(val) => { setAppTheme(val); localStorage.setItem('daynote_theme', val); }}>
              <Option value="light">淺色模式</Option>
              <Option value="gray">灰色模式</Option>
              <Option value="dark">深色模式</Option>
            </Select>
          </div>

          <Menu 
            theme={colors.siderTheme} 
            mode="inline" 
            selectedKeys={[activeCategory]}
            onClick={(e) => { setActiveCategory(e.key); setDrawerVisible(false); }}
            items={menuItems}
            style={{ background: colors.bgApp, borderRight: 'none' }}
          />
        </Drawer>

        <Layout>
          {isMobile && !isFullscreen && (
            <Header style={{ background: colors.bgPanel, padding: '0 16px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${colors.border}` }}>
              <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerVisible(true)} style={{ color: colors.textMain, marginRight: 16 }} />
              <Title level={4} style={{ margin: 0, color: '#1677ff' }}>DayNote</Title>
            </Header>
          )}

          <Content style={{ padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 64px)' : '100vh', overflow: 'hidden' }}>
            {/* Obsidian View Mode Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: colors.bgPanel, padding: '12px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <Radio.Group
                value={activeView}
                onChange={e => {
                  const val = e.target.value;
                  setActiveView(val);
                  if (val === 'graph') fetchGraphData();
                  if (val === 'mindmap') fetchMindmapTree();
                }}
                buttonStyle="solid"
              >
                <Radio.Button value="editor">📝 筆記編輯器</Radio.Button>
                <Radio.Button value="graph">🕸️ 知識網狀圖 (Graph View)</Radio.Button>
                <Radio.Button value="mindmap">🌳 心智圖 (Mind Map)</Radio.Button>
              </Radio.Group>

              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={() => setClaudeDrawerOpen(true)}
                style={{ background: 'linear-gradient(135deg, #722ed1, #1890ff)', border: 'none' }}
              >
                🤖 Claude AI 助手
              </Button>
            </div>

            {activeView === 'graph' ? (
              <GraphView
                graphData={graphData}
                loading={graphLoading}
                onRefresh={fetchGraphData}
                onSelectNote={handleSelectNoteById}
              />
            ) : activeView === 'mindmap' ? (
              <MindMapView
                activeNoteId={activeNote?.id}
                mindmapTree={mindmapTree}
                loading={mindmapLoading}
                onRefresh={() => fetchMindmapTree()}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', gap: 24, overflow: 'hidden' }}>
                {/* Notes List Column */}
                <div style={{ width: isMobile ? '100%' : '320px', display: showList && !isFullscreen ? 'flex' : 'none', flexDirection: 'column' }}>
                  <div style={{ marginBottom: 16 }}>
                    <Title level={4} style={{ margin: 0 }}>
                      {activeCategory === "all" ? "All Notes" : activeCategory}
                    </Title>
                    <Text type="secondary">{notes.length} items</Text>
                  </div>
                  
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }} className="custom-scrollbar">
                    <List
                      dataSource={notes}
                      locale={{ emptyText: <Empty description="No notes found" /> }}
                      renderItem={(item) => (
                        <Card 
                          hoverable 
                          size="small"
                          onClick={() => setActiveNote(item)}
                          style={{ 
                            marginBottom: 12, 
                            borderColor: activeNote?.id === item.id ? '#1677ff' : undefined,
                            backgroundColor: activeNote?.id === item.id ? 'rgba(22, 119, 255, 0.08)' : undefined
                          }}
                        >
                          <List.Item.Meta
                            avatar={item.is_url ? <LinkOutlined style={{ fontSize: 24, color: '#1677ff' }} /> : <FileTextOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                            title={<Text ellipsis style={{ width: isMobile ? '60vw' : 200 }}>{item.title || item.original_filename}</Text>}
                            description={
                              <Space direction="vertical" size={0}>
                                <Tag bordered={false} color="blue">{item.category}</Tag>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {new Date(item.upload_time).toLocaleDateString()}
                                </Text>
                              </Space>
                            }
                          />
                        </Card>
                      )}
                    />
                  </div>
                </div>

                {/* Note Viewer Column */}
                <div style={{ flex: 1, display: showViewer ? 'flex' : 'none', flexDirection: 'column', background: colors.bgPanel, borderRadius: isMobile ? 0 : 8, border: isMobile ? 'none' : `1px solid ${colors.border}`, overflow: 'hidden' }}>
                  {activeNote ? (
                    <>
                      <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isMobile && <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActiveNote(null)} style={{ color: colors.textMain }} />}
                          <div>
                            <Title level={5} style={{ margin: 0, wordBreak: 'break-all' }}>
                              {activeNote.title || activeNote.original_filename}
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Uploaded on {new Date(activeNote.upload_time).toLocaleString()}
                            </Text>
                          </div>
                        </div>
                        <Space wrap>
                          <Select 
                            value={activeNote.category}
                            style={{ width: 140 }}
                            onChange={handleChangeCategory}
                          >
                            {categories.map(cat => (
                              <Option key={cat} value={cat}>{cat}</Option>
                            ))}
                            <Option value="NEW_CATEGORY"><PlusOutlined /> Add New Category</Option>
                          </Select>
                          
                          {!isMobile && (
                            <Button 
                              type="text" 
                              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                              onClick={() => setIsFullscreen(!isFullscreen)}
                              title="Toggle Fullscreen"
                            />
                          )}
                          <Button 
                            type="text" 
                            icon={<ExportOutlined />}
                            href={activeNote.is_url ? activeNote.url : `/daynote/api/notes/${activeNote.stored_filename}?token=${localStorage.getItem('daynote_token')}`}
                            target="_blank"
                            title="Open in new tab"
                          />
                          {!activeNote.is_url && (
                            <Button 
                              type="text" 
                              icon={<DownloadOutlined />}
                              href={`/daynote/api/notes/${activeNote.stored_filename}?token=${localStorage.getItem('daynote_token')}`}
                              download={activeNote.original_filename}
                              target="_blank"
                              title="Download"
                            />
                          )}
                          <Popconfirm
                            title="Delete Note"
                            description="Are you sure you want to delete this note?"
                            onConfirm={() => handleDelete(activeNote.id)}
                            okText="Yes"
                            cancelText="No"
                            placement="bottomRight"
                          >
                            <Button 
                              type="text" 
                              danger
                              icon={<DeleteOutlined />}
                              title="Delete"
                            />
                          </Popconfirm>
                          {!isMobile && (
                            <Button 
                              type="text" 
                              icon={<CloseOutlined />}
                              onClick={() => { setActiveNote(null); setIsFullscreen(false); }}
                              title="Close"
                            />
                          )}
                        </Space>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }} className="custom-scrollbar">
                        {activeNote.is_url ? (
                          <iframe 
                            src={activeNote.url}
                            style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', background: '#fff', borderRadius: 8 }}
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                            title={activeNote.original_filename}
                          />
                        ) : activeNote.original_filename.endsWith('.html') ? (
                          <iframe 
                            srcDoc={noteContent}
                            style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', background: '#fff', borderRadius: 8 }}
                            sandbox="allow-same-origin allow-scripts"
                            title={activeNote.original_filename}
                          />
                        ) : activeNote.original_filename.endsWith('.txt') || activeNote.original_filename.endsWith('.md') || activeNote.original_filename.endsWith('.json') || activeNote.original_filename.endsWith('.csv') ? (
                          <div style={{ background: colors.bgApp, padding: 24, borderRadius: 8, minHeight: '100%' }}>
                            {isEditingTxt ? (
                              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Input.TextArea 
                                  value={txtEditContent} 
                                  onChange={e => setTxtEditContent(e.target.value)}
                                  style={{ flex: 1, minHeight: '60vh', fontFamily: 'monospace', background: colors.bgPanel, color: colors.textMain, border: `1px solid ${colors.border}` }}
                                />
                                <Space style={{ marginTop: 16, justifyContent: 'flex-end', width: '100%' }}>
                                  <Button onClick={() => setIsEditingTxt(false)}>取消</Button>
                                  <Button type="primary" onClick={async () => {
                                    try {
                                      await axios.post(`/daynote/api/notes/${activeNote.id}/save`, { content: txtEditContent });
                                      setNoteContent(txtEditContent);
                                      setIsEditingTxt(false);
                                      message.success("儲存成功！");
                                    } catch (e) {
                                      message.error("儲存失敗");
                                    }
                                  }}>儲存變更</Button>
                                </Space>
                              </div>
                            ) : (
                              <div style={{ position: 'relative', minHeight: '60vh' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                                  <Button 
                                    icon={<FileTextOutlined />} 
                                    type="primary" 
                                    onClick={() => { setTxtEditContent(noteContent); setIsEditingTxt(true); }}
                                  >編輯內容</Button>
                                </div>
                                {activeNote.original_filename.endsWith('.md') ? (
                                  <div style={{ color: colors.textMain }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                      table: ({node, ...props}) => <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '1em' }} {...props} />,
                                      th: ({node, ...props}) => <th style={{ border: `1px solid ${colors.tableBorder}`, padding: '8px', background: colors.bgPanel }} {...props} />,
                                      td: ({node, ...props}) => <td style={{ border: `1px solid ${colors.tableBorder}`, padding: '8px' }} {...props} />,
                                      a: ({node, ...props}) => <a style={{ color: '#1677ff' }} target="_blank" rel="noopener noreferrer" {...props} />,
                                      blockquote: ({node, ...props}) => <blockquote style={{ borderLeft: '4px solid #1677ff', margin: 0, paddingLeft: '1em', color: '#8c8c8c' }} {...props} />,
                                      code: ({node, inline, ...props}: any) => inline ? <code style={{ background: colors.bgPanel, padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace' }} {...props} /> : <pre style={{ background: colors.bgPanel, padding: '1em', borderRadius: '8px', overflowX: 'auto', fontFamily: 'monospace' }}><code {...props} /></pre>,
                                      img: ({node, ...props}) => <img style={{ maxWidth: '100%', borderRadius: '8px' }} {...props} />
                                    }}>
                                      {noteContent}
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{noteContent}</div>
                                )}
                              </div>
                            )}

                            <BacklinksPanel activeNoteId={activeNote.id} onSelectNote={handleSelectNoteById} />
                          </div>
                        ) : (
                          <div style={{ background: colors.bgApp, padding: 24, borderRadius: 8, minHeight: '100%', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                            {noteContent}
                            <BacklinksPanel activeNoteId={activeNote.id} onSelectNote={handleSelectNoteById} />
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Empty description="Select a note to view" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </Content>
        </Layout>

        {/* Upload Modal */}
        <Modal
          title="Upload New Note"
          open={isUploadOpen}
          onOk={handleUpload}
          onCancel={() => { setIsUploadOpen(false); setFileList([]); setUploadCategory(undefined); }}
          confirmLoading={uploading}
          okText="Upload"
          cancelText="Cancel"
        >
          <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 16 }}>
            <Tabs activeKey={uploadTab} onChange={setUploadTab} items={[
              {
                key: 'file',
                label: '上傳檔案',
                children: (
                  <div>
                    <div style={{ marginBottom: 8 }}>Select Files</div>
                    <Upload {...uploadProps}>
                      <Button icon={<UploadOutlined />}>Click to Upload (Multiple)</Button>
                    </Upload>
                  </div>
                )
              },
              {
                key: 'url',
                label: '加入網址',
                children: (
                  <div>
                    <div style={{ marginBottom: 8 }}>Website URL</div>
                    <Input placeholder="https://..." value={urlInput} onChange={e => setUrlInput(e.target.value)} />
                    <div style={{ marginTop: 16, marginBottom: 8 }}>Title (Optional)</div>
                    <Input placeholder="Leave empty to use URL as title" value={urlNameInput} onChange={e => setUrlNameInput(e.target.value)} />
                  </div>
                )
              },
              {
                key: 'html',
                label: 'HTML 編輯',
                children: (
                  <div>
                    <div style={{ marginBottom: 8 }}>Title (Optional)</div>
                    <Input placeholder="Enter title (without .html)" value={htmlNameInput} onChange={e => setHtmlNameInput(e.target.value)} />
                    <div style={{ marginTop: 16, marginBottom: 8 }}>HTML Content</div>
                    <Input.TextArea placeholder="<h1>Hello...</h1>" rows={10} value={htmlInputContent} onChange={e => setHtmlInputContent(e.target.value)} />
                  </div>
                )
              }
            ]} />

            {(uploadTab === 'file' || uploadTab === 'html') && (
              <div>
                <div style={{ marginBottom: 8 }}>Category (Optional)</div>
                <Select 
                  value={uploadCategory} 
                  onChange={setUploadCategory}
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="Select category or leave empty for 未分類"
                >
                  {categories.map(cat => (
                    <Option key={cat} value={cat}>{cat}</Option>
                  ))}
                  <Option value="NEW_CATEGORY"><PlusOutlined /> Add New Category</Option>
                </Select>
              </div>
            )}

            {(uploadTab === 'file' || uploadTab === 'html') && uploadCategory === "NEW_CATEGORY" && (
              <div>
                <div style={{ marginBottom: 8 }}>New Category Name</div>
                <Input 
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name..."
                />
              </div>
            )}
          </Space>
        </Modal>

        <ClaudeAssistantDrawer
          open={claudeDrawerOpen}
          onClose={() => setClaudeDrawerOpen(false)}
          activeNoteId={activeNote?.id}
          activeNoteTitle={activeNote?.title || activeNote?.original_filename}
        />
      </Layout>
    </ConfigProvider>
  );
}
