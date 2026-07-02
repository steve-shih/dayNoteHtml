"use client";

import { useState, useEffect } from "react";
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
        localStorage.removeItem('daynote_token');
        localStorage.removeItem('daynote_username');
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);
import { ConfigProvider, theme as antdTheme, Layout, Menu, Button, Modal, Upload, Select, Input, List, Typography, Space, message, Empty, Tag, Card, Popconfirm, Spin, Divider, Grid, Drawer, Tabs } from 'antd';
import { UploadOutlined, FileTextOutlined, PlusOutlined, DownloadOutlined, FolderOpenOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined, DeleteOutlined, RobotOutlined, SendOutlined, SaveOutlined, MenuOutlined, ArrowLeftOutlined, ExportOutlined, LinkOutlined } from '@ant-design/icons';
import type { UploadProps, MenuProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  
  // Responsive State
  const [isMobile, setIsMobile] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  
  // AI Chat State
  const [apiKey, setApiKey] = useState("");
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Upload Modal State
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
  
  // New States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isEditingTxt, setIsEditingTxt] = useState(false);
  const [txtEditContent, setTxtEditContent] = useState("");

  const [appTheme, setAppTheme] = useState<'light' | 'gray' | 'dark'>('dark');
  const colors = THEMES[appTheme];
  const antdAlgorithm = appTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;


  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const savedTheme = localStorage.getItem('daynote_theme') as any;
    if (savedTheme) setAppTheme(savedTheme);

    const savedToken = localStorage.getItem('daynote_token');
    if (savedToken) {
      setIsAuthenticated(true);
    }

    fetchCategories();
    fetchNotes();
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) setApiKey(savedKey);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchNotes(activeCategory === "all" ? null : activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    if (activeNote) {
      fetchNoteContent(activeNote);
      setIsEditingTxt(false);
    } else {
      setNoteContent("");
    }
  }, [activeNote]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`/daynote/api/categories`);
      setCategories(res.data);
      if (res.data.length > 0 && uploadCategory === undefined) {
        setUploadCategory(undefined); // Removed auto-selection to allow empty
      }
    } catch (error) {
      message.error("Failed to load categories.");
    }
  };

  const fetchNotes = async (category: string | null = null) => {
    try {
      const url = category ? `/daynote/api/notes?category=${category}` : `/daynote/api/notes`;
      const res = await axios.get(url);
      setNotes(res.data);
    } catch (error) {
      message.error("Failed to load notes.");
    }
  };

  const fetchNoteContent = async (note: Note) => {
    try {
      const res = await axios.get(`/daynote/api/notes/${note.stored_filename}`, {
        responseType: "text"
      });
      let text = res.data;
      if (typeof text === 'string' && text.startsWith("DAYNOTE_B64:")) {
        try {
          text = decodeURIComponent(escape(atob(text.substring(12))));
        } catch (e) {
          console.error("Base64 decode failed", e);
        }
      }
      setNoteContent(text);
    } catch (error) {
      setNoteContent("無法載入檔案內容 / Failed to load file content.");
    }
  };

  const handleUpload = async () => {
    let targetCategory = uploadCategory || "未分類";
    if (uploadCategory === "NEW_CATEGORY") {
      if (!newCategoryName) {
        message.warning("Please enter a new category name.");
        return;
      }
      targetCategory = newCategoryName;
    }

    setUploading(true);
    try {
      if (uploadTab === 'url') {
        if (!urlInput.trim()) {
          message.warning("請輸入網址！");
          setUploading(false);
          return;
        }
        await axios.post(`/daynote/api/notes/url`, {
          url: urlInput,
          name: urlNameInput
        });
        message.success("網址已成功加入，並自動歸類為 WEB URL NOTE！");
      } else if (uploadTab === 'html') {
        if (!htmlInputContent.trim()) {
          message.warning("請輸入 HTML 內容！");
          setUploading(false);
          return;
        }
        const fileName = htmlNameInput.trim() ? `${htmlNameInput}.html` : `note_${new Date().getTime()}.html`;
        const blob = new Blob([htmlInputContent], { type: 'text/html' });
        const file = new File([blob], fileName, { type: 'text/html' });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", targetCategory);
        
        const res = await axios.post(`/daynote/api/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        message.success("HTML 筆記已成功儲存！");
        const note = res.data.note;
        if (note) {
          setTimeout(async () => {
            try {
              const verifyRes = await axios.get(`/daynote/api/notes/verify/${note.stored_filename}`);
              if (verifyRes.data.exists && verifyRes.data.storage_type === "gcs") {
                message.success(`[GCP驗證] ${note.original_filename} 上傳成功！`);
              }
            } catch (e) {}
          }, 10000);
        }
      } else {
        if (fileList.length === 0) {
          message.warning("Please select at least one file to upload.");
          setUploading(false);
          return;
        }
        const results = await Promise.allSettled(fileList.map(async (f) => {
          let fileToUpload: File | RcFile = f;
          
          if (f.name.toLowerCase().endsWith('.txt')) {
            try {
              const text = await f.text();
              const b64 = btoa(unescape(encodeURIComponent(text)));
              const blob = new Blob(["DAYNOTE_B64:" + b64], { type: 'text/plain' });
              fileToUpload = new File([blob], f.name, { type: 'text/plain' });
            } catch (e) {
              console.error("Failed to read/encode txt file", e);
            }
          }
          
          const formData = new FormData();
          formData.append("file", fileToUpload as Blob);
          formData.append("category", targetCategory);
          return axios.post(`/daynote/api/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" }
          });
        }));

        const successes = results.filter(r => r.status === 'fulfilled');
        const failures = results.filter(r => r.status === 'rejected');

        if (failures.length === 0) {
          message.success(`All ${successes.length} files uploaded successfully!`);
        } else if (successes.length > 0) {
          message.warning(`${successes.length} uploaded successfully, ${failures.length} failed. Check file types.`);
        } else {
          message.error(`Upload failed for all ${failures.length} files. Unsupported type or size.`);
        }

        successes.forEach((r: any) => {
          const note = r.value.data.note;
          if (note) {
            setTimeout(async () => {
              try {
                const verifyRes = await axios.get(`/daynote/api/notes/verify/${note.stored_filename}`);
                if (verifyRes.data.exists && verifyRes.data.storage_type === "gcs") {
                  message.success(`[GCP驗證] ${note.original_filename} 上傳成功！`);
                }
              } catch (e) {
                // Ignore verification errors in UI
              }
            }, 10000);
          }
        });
      }

      setIsUploadOpen(false);
      setFileList([]);
      setUrlInput('');
      setUrlNameInput('');
      setHtmlInputContent('');
      setHtmlNameInput('');
      setNewCategoryName("");
      setUploadCategory(undefined);
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    } catch (error) {
      message.error("發生錯誤，無法完成操作。");
    } finally {
      setUploading(false);
    }
  };

  const handleChangeCategory = async (newCategory: string) => {
    if (!activeNote) return;
    
    let targetCategory = newCategory;
    if (newCategory === "NEW_CATEGORY") {
      const customName = prompt("Enter new category name:");
      if (!customName) return;
      targetCategory = customName;
    }
    
    try {
      await axios.put(`/daynote/api/notes/${activeNote.id}`, { category: targetCategory });
      message.success("Category updated!");
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);
      setActiveNote({ ...activeNote, category: targetCategory });
    } catch (error) {
      message.error("Failed to update category.");
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await axios.delete(`/daynote/api/notes/${noteId}`);
      message.success("Note deleted successfully!");
      setActiveNote(null);
      setIsFullscreen(false);
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    } catch (error) {
      message.error("Failed to delete note.");
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    try {
      await axios.delete(`/daynote/api/categories/${encodeURIComponent(cat)}`);
      message.success("分類已刪除，筆記已移至未分類");
      if (activeCategory === cat) setActiveCategory("all");
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : (activeCategory === cat ? null : activeCategory));
    } catch (error) {
      message.error("刪除分類失敗或該分類為系統預設不可刪除");
    }
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem("gemini_api_key", key);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    if (!apiKey) {
      message.error("請先輸入您的 Gemini API Key！");
      return;
    }
    
    const newMsg = { role: 'user' as const, content: chatInput };
    setChatMessages(prev => [...prev, newMsg]);
    setChatInput("");
    setIsGenerating(true);
    
    try {
      const res = await axios.post('/daynote/api/ai/generate', {
        prompt: chatInput,
        api_key: apiKey
      });
      setChatMessages(prev => [...prev, { role: 'ai', content: res.data.html }]);
    } catch (error: any) {
      message.error(error.response?.data?.error || "AI 生成失敗");
      setChatMessages(prev => [...prev, { role: 'ai', content: `<p style="color:red;">Error: 產生筆記時發生錯誤。</p>` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAINote = async (htmlContent: string) => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const file = new File([blob], `AI_Note_${new Date().getTime()}.html`, { type: 'text/html' });
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", "AI筆記");
    
    try {
      const res = await axios.post(`/daynote/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      message.success("AI 筆記已成功儲存！");
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);

      const note = res.data.note;
      if (note) {
        setTimeout(async () => {
          try {
            const verifyRes = await axios.get(`/daynote/api/notes/verify/${note.stored_filename}`);
            if (verifyRes.data.exists && verifyRes.data.storage_type === "gcs") {
              message.success(`[GCP驗證] AI 筆記 上傳成功！`);
            }
          } catch (e) {
            // Ignore verification errors in UI
          }
        }, 10000);
      }
    } catch (error) {
      message.error("儲存失敗。");
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
    { key: "ai_assistant", icon: <RobotOutlined style={{ color: '#1677ff' }} />, label: "✨ AI 筆記助手" },
    { type: "divider" },
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

  const showViewer = !!activeNote || activeCategory === "ai_assistant";
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
            onPressEnter={async () => {
              const endpoint = isRegisterMode ? '/daynote/api/auth/register' : '/daynote/api/auth/login';
              try {
                const res = await axios.post(endpoint, { username: usernameInput, password: passwordInput });
                if (isRegisterMode) {
                  message.success('註冊成功！請登入');
                  setIsRegisterMode(false);
                } else {
                  localStorage.setItem('daynote_token', res.data.token);
                  localStorage.setItem('daynote_username', res.data.username);
                  setIsAuthenticated(true);
                }
              } catch (e: any) {
                message.error(e.response?.data?.error || '操作失敗');
              }
            }}
          />
          <Button type="primary" size="large" block style={{ marginTop: 16 }} onClick={async () => {
              const endpoint = isRegisterMode ? '/daynote/api/auth/register' : '/daynote/api/auth/login';
              try {
                const res = await axios.post(endpoint, { username: usernameInput, password: passwordInput });
                if (isRegisterMode) {
                  message.success('註冊成功！請登入');
                  setIsRegisterMode(false);
                } else {
                  localStorage.setItem('daynote_token', res.data.token);
                  localStorage.setItem('daynote_username', res.data.username);
                  setIsAuthenticated(true);
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
            <Text type="secondary" style={{ fontSize: 12 }}>Ant Design Edition</Text>
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
        <Content style={{ padding: isMobile ? '16px' : '24px', display: 'flex', gap: '24px', height: isMobile ? 'calc(100vh - 64px)' : '100vh', overflow: 'hidden' }}>
          {activeCategory === "ai_assistant" ? (
            <div style={{ flex: 1, display: showViewer ? 'flex' : 'none', flexDirection: 'column', background: colors.bgApp, borderRadius: isMobile ? 0 : 8, border: isMobile ? 'none' : `1px solid ${colors.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.border}`, background: colors.bgPanel }}>
                <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isMobile && <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActiveCategory("all")} style={{ color: colors.textMain, marginRight: 8 }} />}
                  <RobotOutlined style={{ color: '#1677ff' }} /> AI 筆記助手
                </Title>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Input.Password 
                    placeholder="在此貼上您的 Google Gemini API Key" 
                    value={apiKey} 
                    onChange={e => handleSaveApiKey(e.target.value)}
                    style={{ width: isMobile ? '100%' : 350, maxWidth: '100%' }}
                  />
                  <Text type="secondary" style={{ fontSize: 12, alignSelf: 'center' }}>
                    金鑰僅保存在您的瀏覽器中，不會上傳。
                  </Text>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} className="custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Empty description="馬上提出需求，讓 AI 為您生成精美的筆記！" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
                ) : (
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {msg.role === 'user' ? (
                          <div style={{ background: appTheme === 'dark' ? '#1677ff' : '#0958d9', padding: '12px 16px', borderRadius: '16px 16px 0 16px', maxWidth: '70%' }}>
                            <Text style={{ color: colors.textMain }}>{msg.content}</Text>
                          </div>
                        ) : (
                          <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, padding: '16px', borderRadius: '16px 16px 16px 0', width: '100%' }}>
                            <div style={{ background: '#fff', color: colors.textInverse, padding: 16, borderRadius: 8, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: msg.content }} />
                            <Divider style={{ margin: '16px 0 12px 0' }} />
                            <Button type="primary" icon={<SaveOutlined />} onClick={() => handleSaveAINote(msg.content)}>
                              一鍵儲存至筆記庫
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {isGenerating && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <Spin tip="AI 正在思考中..." />
                      </div>
                    )}
                  </Space>
                )}
              </div>
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${colors.border}`, background: colors.bgPanel }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input 
                    size="large"
                    placeholder="例如: 幫我用表格整理 HTTP 常見狀態碼..." 
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onPressEnter={handleSendMessage}
                    disabled={isGenerating}
                  />
                  <Button size="large" type="primary" icon={<SendOutlined />} onClick={handleSendMessage} loading={isGenerating}>
                    送出
                  </Button>
                </Space.Compact>
              </div>
            </div>
          ) : (
            <>
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
          <div style={{ flex: 1, display: (showViewer && activeCategory !== "ai_assistant") ? 'flex' : 'none', flexDirection: 'column', background: colors.bgPanel, borderRadius: isMobile ? 0 : 8, border: isMobile ? 'none' : `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {activeNote ? (
              <>
                <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isMobile && <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActiveNote(null)} style={{ color: colors.textMain }} />}
                    <div>
                      <Title 
                        level={5} 
                        style={{ margin: 0, wordBreak: 'break-all' }}
                        editable={{
                          onChange: async (newTitle) => {
                            if (!newTitle.trim()) return;
                            try {
                              await axios.put(`/daynote/api/notes/${activeNote.id}`, { title: newTitle });
                              setActiveNote({ ...activeNote, title: newTitle });
                              fetchNotes(activeCategory === "all" ? null : activeCategory);
                              message.success("Title updated!");
                            } catch (e) {
                              message.error("Failed to update title");
                            }
                          }
                        }}
                      >
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
                                const b64 = btoa(unescape(encodeURIComponent(txtEditContent)));
                                const payload = "DAYNOTE_B64:" + b64;
                                await axios.put(`/daynote/api/notes/${activeNote.stored_filename}/content`, { content: payload });
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
                    </div>
                  ) : (
                    <div style={{ background: colors.bgApp, padding: 24, borderRadius: 8, minHeight: '100%', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {noteContent}
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
        </>
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
    </Layout>
    </ConfigProvider>
  );
}
