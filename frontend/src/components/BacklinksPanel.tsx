"use client";

import React, { useEffect, useState } from 'react';
import { Card, List, Tag, Typography, Space, Spin, Button } from 'antd';
import { LinkOutlined, ArrowRightOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

type BacklinkItem = {
  id: string;
  title: string;
  category?: string;
  snippet: string;
};

type BacklinksPanelProps = {
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
};

export default function BacklinksPanel({ activeNoteId, onSelectNote }: BacklinksPanelProps) {
  const [loading, setLoading] = useState(false);
  const [backlinks, setBacklinks] = useState<{ linked: BacklinkItem[]; unlinked: BacklinkItem[] }>({
    linked: [],
    unlinked: []
  });

  useEffect(() => {
    if (!activeNoteId) return;
    fetchBacklinks();
  }, [activeNoteId]);

  const fetchBacklinks = async () => {
    if (!activeNoteId) return;
    setLoading(true);
    try {
      const res = await axios.get(`/daynote/api/notes/${activeNoteId}/backlinks`);
      setBacklinks(res.data || { linked: [], unlinked: [] });
    } catch (err) {
      console.error('Failed to fetch backlinks', err);
    } finally {
      setLoading(false);
    }
  };

  if (!activeNoteId) {
    return (
      <Card size="small" style={{ borderRadius: 8 }}>
        <Text type="secondary">選擇筆記以檢視雙向連結反向引用 (Backlinks)</Text>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <LinkOutlined style={{ color: '#1890ff' }} />
          <Text strong>雙向連結反向引用 (Backlinks)</Text>
        </Space>
      }
      style={{ borderRadius: 8, marginTop: 12 }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
      ) : (
        <div>
          {/* 明確引用 Linked References */}
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" strong style={{ fontSize: 12 }}>
              🔗 明確 WikiLink 引用 ({backlinks.linked.length})
            </Text>
            {backlinks.linked.length > 0 ? (
              <List
                size="small"
                dataSource={backlinks.linked}
                renderItem={item => (
                  <List.Item
                    actions={[
                      <Button
                        key="jump"
                        type="link"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        onClick={() => onSelectNote(item.id)}
                      >
                        跳轉
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text strong style={{ cursor: 'pointer', color: '#1890ff' }} onClick={() => onSelectNote(item.id)}>{item.title}</Text>}
                      description={<Text type="secondary" style={{ fontSize: 11 }}>{item.snippet}</Text>}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ fontSize: 12, color: '#bfbfbf', padding: '4px 0' }}>無明確雙向連結</div>
            )}
          </div>

          {/* 未連結提及 Unlinked References */}
          <div>
            <Text type="secondary" strong style={{ fontSize: 12 }}>
              🔍 文字提及未連結 ({backlinks.unlinked.length})
            </Text>
            {backlinks.unlinked.length > 0 ? (
              <List
                size="small"
                dataSource={backlinks.unlinked}
                renderItem={item => (
                  <List.Item
                    actions={[
                      <Button
                        key="jump"
                        type="link"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        onClick={() => onSelectNote(item.id)}
                      >
                        跳轉
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text style={{ cursor: 'pointer' }} onClick={() => onSelectNote(item.id)}>{item.title}</Text>}
                      description={<Text type="secondary" style={{ fontSize: 11 }}>{item.snippet}</Text>}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ fontSize: 12, color: '#bfbfbf', padding: '4px 0' }}>無文字提及</div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
