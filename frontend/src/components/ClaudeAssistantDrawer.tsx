"use client";

import React, { useState, useEffect } from 'react';
import { Drawer, Tabs, Input, Button, List, Space, Typography, Tag, Card, Form, Spin, message, Divider } from 'antd';
import { RobotOutlined, SendOutlined, SettingOutlined, BulbOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text, Paragraph } = Typography;

type ClaudeAssistantDrawerProps = {
  open: boolean;
  onClose: () => void;
  activeNoteId?: string;
  activeNoteTitle?: string;
  onApplyTags?: (tags: string[]) => void;
};

export default function ClaudeAssistantDrawer({
  open,
  onClose,
  activeNoteId,
  activeNoteTitle
}: ClaudeAssistantDrawerProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'claude'; content: string }[]>([
    { role: 'claude', content: '你好！我是你的 Obsidian 知識庫 Claude AI 助手。我可以幫你總結筆記、建議標籤，或是回答任何相關問題！' }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  // 設定頁狀態
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [maskedKey, setMaskedKey] = useState('');
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
        setModel(res.data.model || 'claude-3-5-sonnet-20241022');
        setMaskedKey(res.data.masked_key || '');
      }
    } catch (err) {
      console.error('Failed to fetch Claude config', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigLoading(true);
    try {
      await axios.post('/daynote/api/claude/config', {
        api_key: apiKey || undefined,
        model: model
      });
      message.success('Claude 設定已儲存至 config.json！');
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
      const errMsg = err.response?.data?.error || '與 Claude 通訊失敗';
      setMessages(prev => [...prev, { role: 'claude', content: `⚠️ 錯誤: ${errMsg}` }]);
    } finally {
      setLoading(false);
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
        message.success('Claude 摘要與標籤解析完成！');
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
          <Text strong>Anthropic Claude AI 助手</Text>
        </Space>
      }
      placement="right"
      width={420}
      onClose={onClose}
      open={open}
    >
      <Tabs
        defaultActiveKey="chat"
        items={[
          {
            key: 'chat',
            label: '💬 AI 對話',
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
                  {loading && <Spin tip="Claude 正在思考中..." style={{ display: 'block', margin: '10px 0' }} />}
                </div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="詢問 Claude 筆記內容或相關主題..."
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
                <Paragraph>使用 Claude 自動分析當前開啟的筆記，產生精準摘要與 Obsidian 建議標籤：</Paragraph>
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
            label: '⚙️ API 設定',
            children: (
              <Form layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item label="Claude API Key">
                  <Input.Password
                    placeholder={maskedKey ? `已設定 (${maskedKey})` : '請輸入 Anthropic Claude API Key'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    API Key 儲存於後端 config.json 檔案。
                  </Text>
                </Form.Item>
                <Form.Item label="選擇 Claude 模型">
                  <Input
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="claude-3-5-sonnet-20241022"
                  />
                </Form.Item>
                <Button type="primary" block icon={<SettingOutlined />} onClick={handleSaveConfig} loading={configLoading}>
                  儲存 Claude 設定
                </Button>
              </Form>
            )
          }
        ]}
      />
    </Drawer>
  );
}
