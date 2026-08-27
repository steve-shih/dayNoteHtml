"use client";

import React, { useState, useEffect } from 'react';
import { Drawer, Tabs, Input, Button, List, Space, Typography, Tag, Card, Form, Spin, message, Divider, Radio } from 'antd';
import { RobotOutlined, SendOutlined, SettingOutlined, BulbOutlined, SearchOutlined, LinkOutlined, HddOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text, Paragraph } = Typography;

type ClaudeAssistantDrawerProps = {
  open: boolean;
  onClose: () => void;
  activeNoteId?: string;
  activeNoteTitle?: string;
  onApplyTags?: (tags: string[]) => void;
  onSelectNote?: (noteId: string) => void;
};

type RagMessage = {
  role: 'user' | 'claude';
  content: string;
  sources?: { id: string; title: string }[];
};

export default function ClaudeAssistantDrawer({
  open,
  onClose,
  activeNoteId,
  activeNoteTitle,
  onSelectNote
}: ClaudeAssistantDrawerProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'claude'; content: string }[]>([
    { role: 'claude', content: '你好！我是你的 Obsidian 知識庫 AI 助手。我可以幫你總結筆記、建議標籤，或是回答任何相關問題！' }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  // RAG 狀態
  const [ragQuery, setRagQuery] = useState('');
  const [ragMessages, setRagMessages] = useState<RagMessage[]>([
    { role: 'claude', content: '🔍 歡迎使用 RAG 全庫知識問答！在下方輸入問題，我會自動檢索你的所有筆記內文並給予解答，同時提供點擊跳轉連結！' }
  ]);
  const [ragLoading, setRagLoading] = useState(false);

  // 統一 AI 設定頁狀態 (Claude / Ollama)
  const [provider, setProvider] = useState<'claude' | 'ollama'>('claude');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [maskedKey, setMaskedKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://49.158.138.26:8001');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaKey, setOllamaKey] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  // 摘要頁狀態
  const [summaryData, setSummaryData] = useState<{ summary?: string; tags?: string[] } | null>(null);
  const [summarizeLoading, setSummarizeLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchClaudeConfig();
    }
  }, [open]);

  const fetchClaudeConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await axios.get('/daynote/api/claude/config');
      if (res.data) {
        setProvider(res.data.provider || 'claude');
        if (res.data.claude) {
          setModel(res.data.claude.model || 'claude-3-5-sonnet-20241022');
          setMaskedKey(res.data.claude.masked_key || '');
        }
        if (res.data.ollama) {
          setOllamaUrl(res.data.ollama.url || 'http://49.158.138.26:8001');
          setOllamaModel(res.data.ollama.model || 'llama3');
          setOllamaKey(res.data.ollama.api_key || '');
        }
      }
    } catch (err) {
      console.error('Failed to fetch AI config', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigLoading(true);
    try {
      await axios.post('/daynote/api/claude/config', {
        provider: provider,
        claude: {
          api_key: apiKey || undefined,
          model: model
        },
        ollama: {
          url: ollamaUrl,
          model: ollamaModel,
          api_key: ollamaKey || undefined
        }
      });
      message.success(`AI 提供者已切換為 [${provider.toUpperCase()}] 並成功更新！`);
      fetchClaudeConfig();
      setApiKey('');
    } catch (err: any) {
      message.error(err.response?.data?.error || '儲存設定失敗');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSendChat = async () => {
    if (!inputPrompt.trim()) return;
    const userMsg = inputPrompt;
    setInputPrompt('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await axios.post('/daynote/api/claude/chat', {
        prompt: userMsg,
        note_id: activeNoteId
      });
      if (res.data && res.data.response) {
        setMessages(prev => [...prev, { role: 'claude', content: res.data.response }]);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || '與 AI 服務通訊失敗';
      setMessages(prev => [...prev, { role: 'claude', content: `⚠️ 錯誤: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRag = async () => {
    if (!ragQuery.trim()) return;
    const q = ragQuery;
    setRagQuery('');
    setRagMessages(prev => [...prev, { role: 'user', content: q }]);
    setRagLoading(true);

    try {
      const res = await axios.post('/daynote/api/claude/rag', { query: q });
      if (res.data && res.data.response) {
        setRagMessages(prev => [
          ...prev,
          {
            role: 'claude',
            content: res.data.response,
            sources: res.data.referenced_sources || []
          }
        ]);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'RAG 檢索問答失敗';
      setRagMessages(prev => [...prev, { role: 'claude', content: `⚠️ 錯誤: ${errMsg}` }]);
    } finally {
      setRagLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!activeNoteId) {
      message.warning('請先在主畫面點選要分析的筆記！');
      return;
    }
    setSummarizeLoading(true);
    try {
      const res = await axios.post('/daynote/api/claude/summarize', {
        note_id: activeNoteId
      });
      if (res.data) {
        setSummaryData({
          summary: res.data.summary,
          tags: res.data.tags
        });
        message.success('AI 摘要與標籤解析完成！');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '摘要生成失敗');
    } finally {
      setSummarizeLoading(false);
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined style={{ color: '#722ed1', fontSize: 20 }} />
          <Text strong>AI 智慧助手 (Claude & Ollama)</Text>
          <Tag color={provider === 'ollama' ? 'orange' : 'purple'}>{provider.toUpperCase()}</Tag>
        </Space>
      }
      placement="right"
      width={460}
      onClose={onClose}
      open={open}
    >
      <Tabs
        defaultActiveKey="rag"
        items={[
          {
            key: 'rag',
            label: '🔍 RAG 全庫檢索',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, marginBottom: 12 }}>
                  <List
                    dataSource={ragMessages}
                    renderItem={item => (
                      <div
                        style={{
                          marginBottom: 12,
                          textAlign: item.role === 'user' ? 'right' : 'left'
                        }}
                      >
                        <Card
                          size="small"
                          style={{
                            display: 'inline-block',
                            maxWidth: '92%',
                            backgroundColor: item.role === 'user' ? '#1890ff' : '#f9f0ff',
                            borderColor: item.role === 'user' ? '#1890ff' : '#d3ade6',
                            color: item.role === 'user' ? '#ffffff' : '#000000',
                            borderRadius: 12
                          }}
                        >
                          <Paragraph style={{ margin: 0, color: 'inherit', whiteSpace: 'pre-wrap' }}>
                            {item.content}
                          </Paragraph>
                          {item.sources && item.sources.length > 0 && (
                            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #e8e8e8' }}>
                              <Text type="secondary" style={{ fontSize: 11 }}>📌 引用筆記來源：</Text>
                              <div style={{ marginTop: 4 }}>
                                {item.sources.map(src => (
                                  <Tag
                                    key={src.id}
                                    color="blue"
                                    icon={<LinkOutlined />}
                                    style={{ cursor: 'pointer', marginBottom: 4 }}
                                    onClick={() => onSelectNote && onSelectNote(src.id)}
                                  >
                                    {src.title}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      </div>
                    )}
                  />
                  {ragLoading && <Spin tip="AI 正在全庫搜尋與推理中..." style={{ display: 'block', margin: '10px 0' }} />}
                </div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="輸入問題，檢索所有筆記內容..."
                    value={ragQuery}
                    onChange={e => setRagQuery(e.target.value)}
                    onPressEnter={handleSendRag}
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleSendRag} loading={ragLoading} />
                </Space.Compact>
              </div>
            )
          },
          {
            key: 'chat',
            label: '💬 當前筆記對話',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
                {activeNoteTitle && (
                  <Tag color="purple" style={{ marginBottom: 8 }}>
                    當前上下文: {activeNoteTitle}
                  </Tag>
                )}
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, marginBottom: 12 }}>
                  <List
                    dataSource={messages}
                    renderItem={item => (
                      <div
                        style={{
                          marginBottom: 12,
                          textAlign: item.role === 'user' ? 'right' : 'left'
                        }}
                      >
                        <Card
                          size="small"
                          style={{
                            display: 'inline-block',
                            maxWidth: '85%',
                            backgroundColor: item.role === 'user' ? '#1890ff' : '#f5f5f5',
                            color: item.role === 'user' ? '#ffffff' : '#000000',
                            borderRadius: 12
                          }}
                        >
                          <Paragraph style={{ margin: 0, color: 'inherit', whiteSpace: 'pre-wrap' }}>
                            {item.content}
                          </Paragraph>
                        </Card>
                      </div>
                    )}
                  />
                  {loading && <Spin tip="AI 正在思考中..." style={{ display: 'block', margin: '10px 0' }} />}
                </div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="詢問當前筆記內容..."
                    value={inputPrompt}
                    onChange={e => setInputPrompt(e.target.value)}
                    onPressEnter={handleSendChat}
                  />
                  <Button type="primary" icon={<SendOutlined />} onClick={handleSendChat} loading={loading} />
                </Space.Compact>
              </div>
            )
          },
          {
            key: 'summarize',
            label: '💡 摘要標籤',
            children: (
              <div style={{ padding: '8px 0' }}>
                <Paragraph>使用 AI 自動分析當前開啟的筆記，產生精準摘要與 Obsidian 建議標籤：</Paragraph>
                <Button
                  type="primary"
                  block
                  icon={<BulbOutlined />}
                  onClick={handleSummarize}
                  loading={summarizeLoading}
                  style={{ marginBottom: 16, background: 'linear-gradient(135deg, #722ed1, #1890ff)', border: 'none' }}
                >
                  一鍵生成摘要與標籤
                </Button>

                {summaryData && (
                  <Card size="small" title="分析結果" style={{ backgroundColor: '#fafafa' }}>
                    <Text strong>📌 筆記摘要：</Text>
                    <Paragraph style={{ marginTop: 4 }}>{summaryData.summary}</Paragraph>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong>🏷️ 建議標籤：</Text>
                    <div style={{ marginTop: 6 }}>
                      {summaryData.tags?.map((tag, idx) => (
                        <Tag key={idx} color="green" style={{ marginBottom: 4 }}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )
          },
          {
            key: 'settings',
            label: '⚙️ AI 引擎設定',
            children: (
              <Form layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item label="選擇主要 AI 引擎 (AI Provider)">
                  <Radio.Group
                    value={provider}
                    onChange={e => setProvider(e.target.value)}
                    buttonStyle="solid"
                    style={{ width: '100%' }}
                  >
                    <Radio.Button value="claude" style={{ width: '50%', textAlign: 'center' }}>
                      ☁️ Anthropic Claude
                    </Radio.Button>
                    <Radio.Button value="ollama" style={{ width: '50%', textAlign: 'center' }}>
                      🦙 Local Ollama
                    </Radio.Button>
                  </Radio.Group>
                </Form.Item>

                <Divider style={{ margin: '12px 0' }} />

                {provider === 'claude' ? (
                  <>
                    <Form.Item label="Claude API Key">
                      <Input.Password
                        placeholder={maskedKey ? `已設定 (${maskedKey})` : '請輸入 Anthropic Claude API Key'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                      />
                    </Form.Item>
                    <Form.Item label="Claude 模型名稱">
                      <Input
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        placeholder="claude-3-5-sonnet-20241022"
                      />
                    </Form.Item>
                  </>
                ) : (
                  <>
                    <Form.Item label="Ollama 服務位址 (Base URL)">
                      <Input
                        value={ollamaUrl}
                        onChange={e => setOllamaUrl(e.target.value)}
                        placeholder="http://49.158.138.26:8001 或 http://localhost:11434"
                      />
                    </Form.Item>
                    <Form.Item label="Ollama 模型名稱 (Model)">
                      <Input
                        value={ollamaModel}
                        onChange={e => setOllamaModel(e.target.value)}
                        placeholder="llama3, mistral, gemma"
                      />
                    </Form.Item>
                    <Form.Item label="API Key / Auth Token (選填)">
                      <Input.Password
                        value={ollamaKey}
                        onChange={e => setOllamaKey(e.target.value)}
                        placeholder="選填驗證 Token"
                      />
                    </Form.Item>
                  </>
                )}

                <Button type="primary" block icon={<SettingOutlined />} onClick={handleSaveConfig} loading={configLoading}>
                  儲存 AI 引擎設定
                </Button>
              </Form>
            )
          }
        ]}
      />
    </Drawer>
  );
}
