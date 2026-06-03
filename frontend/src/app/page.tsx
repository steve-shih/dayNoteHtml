"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Layout, Menu, Button, Modal, Upload, Select, Input, List, Typography, Space, message, Empty, Tag, Card, Popconfirm, Spin, Divider, Grid, Drawer } from 'antd';
import { UploadOutlined, FileTextOutlined, PlusOutlined, DownloadOutlined, FolderOpenOutlined, FullscreenOutlined, FullscreenExitOutlined, CloseOutlined, DeleteOutlined, RobotOutlined, SendOutlined, SaveOutlined, MenuOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import type { UploadProps, MenuProps } from 'antd';
import type { RcFile } from 'antd/es/upload';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

type Note = {
  id: string;
  original_filename: string;
  stored_filename: string;
  category: string;
  upload_time: string;
};

export default function Home() {
  const [categories, setCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Responsive State
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const [drawerVisible, setDrawerVisible] = useState(false);
  
  // AI Chat State
  const [apiKey, setApiKey] = useState("");
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [fileList, setFileList] = useState<RcFile[]>([]);
  const [uploadCategory, setUploadCategory] = useState<string | undefined>(undefined);
  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchNotes();
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    fetchNotes(activeCategory === "all" ? null : activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    if (activeNote) {
      fetchNoteContent(activeNote);
    } else {
      setNoteContent("");
    }
  }, [activeNote]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`/api/categories`);
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
      const url = category ? `/api/notes?category=${category}` : `/api/notes`;
      const res = await axios.get(url);
      setNotes(res.data);
    } catch (error) {
      message.error("Failed to load notes.");
    }
  };

  const fetchNoteContent = async (note: Note) => {
    try {
      const res = await axios.get(`/api/notes/${note.stored_filename}`, {
        responseType: "text"
      });
      setNoteContent(res.data);
    } catch (error) {
      setNoteContent("無法載入檔案內容 / Failed to load file content.");
    }
  };

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning("Please select at least one file to upload.");
      return;
    }

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
      const results = await Promise.allSettled(fileList.map(async (f) => {
        const formData = new FormData();
        formData.append("file", f);
        formData.append("category", targetCategory);
        return axios.post(`/api/upload`, formData, {
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

      setIsUploadOpen(false);
      setFileList([]);
      setNewCategoryName("");
      setUploadCategory(undefined);
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    } catch (error) {
      message.error("An unexpected error occurred during upload.");
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
      await axios.put(`/api/notes/${activeNote.id}`, { category: targetCategory });
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
      await axios.delete(`/api/notes/${noteId}`);
      message.success("Note deleted successfully!");
      setActiveNote(null);
      setIsFullscreen(false);
      fetchNotes(activeCategory === "all" ? null : activeCategory);
    } catch (error) {
      message.error("Failed to delete note.");
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
      const res = await axios.post('/api/ai/generate', {
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
      await axios.post(`/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      message.success("AI 筆記已成功儲存！");
      fetchCategories();
      fetchNotes(activeCategory === "all" ? null : activeCategory);
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
      label: cat,
    }))
  ];

  const showViewer = !!activeNote || activeCategory === "ai_assistant";
  const showList = !isMobile || !showViewer;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider width={260} theme="dark" style={{ borderRight: '1px solid #303030', display: isFullscreen ? 'none' : 'block' }}>
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
          </div>
          <Menu 
            theme="dark" 
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
        styles={{ body: { padding: 0, background: '#141414' }, header: { background: '#1f1f1f', borderBottom: '1px solid #303030' } }}
      >
        <div style={{ padding: '16px' }}>
          <Button type="primary" icon={<UploadOutlined />} block onClick={() => { setIsUploadOpen(true); setDrawerVisible(false); }} size="large">Upload File</Button>
        </div>
        <Menu 
          theme="dark" 
          mode="inline" 
          selectedKeys={[activeCategory]}
          onClick={(e) => { setActiveCategory(e.key); setDrawerVisible(false); }}
          items={menuItems}
          style={{ background: '#141414', borderRight: 'none' }}
        />
      </Drawer>

      <Layout>
        {isMobile && !isFullscreen && (
          <Header style={{ background: '#1f1f1f', padding: '0 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #303030' }}>
            <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerVisible(true)} style={{ color: '#fff', marginRight: 16 }} />
            <Title level={4} style={{ margin: 0, color: '#1677ff' }}>DayNote</Title>
          </Header>
        )}
        <Content style={{ padding: isMobile ? '16px' : '24px', display: 'flex', gap: '24px', height: isMobile ? 'calc(100vh - 64px)' : '100vh', overflow: 'hidden' }}>
          {activeCategory === "ai_assistant" ? (
            <div style={{ flex: 1, display: showViewer ? 'flex' : 'none', flexDirection: 'column', background: '#141414', borderRadius: isMobile ? 0 : 8, border: isMobile ? 'none' : '1px solid #303030', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #303030', background: '#1f1f1f' }}>
                <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isMobile && <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActiveCategory("all")} style={{ color: '#fff', marginRight: 8 }} />}
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
                          <div style={{ background: '#1677ff', padding: '12px 16px', borderRadius: '16px 16px 0 16px', maxWidth: '70%' }}>
                            <Text style={{ color: '#fff' }}>{msg.content}</Text>
                          </div>
                        ) : (
                          <div style={{ background: '#1f1f1f', border: '1px solid #303030', padding: '16px', borderRadius: '16px 16px 16px 0', width: '100%' }}>
                            <div style={{ background: '#fff', color: '#000', padding: 16, borderRadius: 8, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: msg.content }} />
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
              <div style={{ padding: '16px 24px', borderTop: '1px solid #303030', background: '#1f1f1f' }}>
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
                      avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                      title={<Text ellipsis style={{ width: isMobile ? '60vw' : 200 }}>{item.original_filename}</Text>}
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
          <div style={{ flex: 1, display: (showViewer && activeCategory !== "ai_assistant") ? 'flex' : 'none', flexDirection: 'column', background: '#1f1f1f', borderRadius: isMobile ? 0 : 8, border: isMobile ? 'none' : '1px solid #303030', overflow: 'hidden' }}>
            {activeNote ? (
              <>
                <div style={{ padding: '16px', borderBottom: '1px solid #303030', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isMobile && <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActiveNote(null)} style={{ color: '#fff' }} />}
                    <div>
                      <Title level={5} style={{ margin: 0, wordBreak: 'break-all' }}>{activeNote.original_filename}</Title>
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
                      icon={<DownloadOutlined />}
                      href={`/api/notes/${activeNote.stored_filename}`}
                      download={activeNote.original_filename}
                      target="_blank"
                      title="Download"
                    />
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
                  {activeNote.original_filename.endsWith('.html') ? (
                    <iframe 
                      srcDoc={noteContent}
                      style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', background: '#fff', borderRadius: 8 }}
                      sandbox="allow-same-origin allow-scripts"
                      title={activeNote.original_filename}
                    />
                  ) : (
                    <div style={{ background: '#141414', padding: 24, borderRadius: 8, minHeight: '100%', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
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
          <div>
            <div style={{ marginBottom: 8 }}>Select Files</div>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>Click to Upload (Multiple)</Button>
            </Upload>
          </div>

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

          {uploadCategory === "NEW_CATEGORY" && (
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
  );
}
