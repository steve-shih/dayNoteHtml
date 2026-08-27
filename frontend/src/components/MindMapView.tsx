"use client";

import React, { useState } from 'react';
import { Card, Button, Input, Tree, Tag, Space, Typography, Spin, Modal, message } from 'antd';
import { ClusterOutlined, RobotOutlined, DownOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

type MindMapNode = {
  name: string;
  children?: MindMapNode[];
};

type MindMapViewProps = {
  activeNoteId?: string;
  mindmapTree: MindMapNode | null;
  loading: boolean;
  onRefresh: () => void;
};

export default function MindMapView({ activeNoteId, mindmapTree, loading, onRefresh }: MindMapViewProps) {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [customMindmap, setCustomMindmap] = useState<MindMapNode | null>(null);

  const transformToTreeData = (node: MindMapNode, keyPrefix = '0'): any => {
    if (!node) return [];
    return [{
      title: (
        <span style={{ fontWeight: keyPrefix === '0' ? 'bold' : 'normal', fontSize: keyPrefix === '0' ? '15px' : '13px' }}>
          {keyPrefix === '0' ? '🧠 ' : '📌 '}{node.name}
        </span>
      ),
      key: keyPrefix,
      children: node.children ? node.children.map((child, idx) => transformToTreeData(child, `${keyPrefix}-${idx}`)[0]) : []
    }];
  };

  const handleGenerateAiMindMap = async () => {
    if (!aiPrompt.trim() && !activeNoteId) {
      message.warning('請輸入心智圖主題或選擇筆記！');
      return;
    }
    setAiLoading(true);
    try {
      const res = await axios.post('/daynote/api/claude/mindmap', {
        prompt: aiPrompt || '自動分析筆記結構生成心智圖',
        note_id: activeNoteId
      });
      if (res.data && res.data.mindmap) {
        setCustomMindmap(res.data.mindmap);
        message.success('Claude 成功為你生成心智圖！');
        setAiModalOpen(false);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || 'AI 心智圖生成失敗');
    } finally {
      setAiLoading(false);
    }
  };

  const currentData = customMindmap || mindmapTree;
  const treeData = currentData ? transformToTreeData(currentData) : [];

  return (
    <Card
      title={
        <Space>
          <Text strong style={{ fontSize: 16 }}>🌳 心智圖視圖 (Mind Map)</Text>
          {customMindmap && <Tag color="gold">AI Generated</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button
            type="primary"
            icon={<RobotOutlined />}
            onClick={() => setAiModalOpen(true)}
            style={{ background: 'linear-gradient(135deg, #722ed1, #1890ff)', border: 'none' }}
          >
            Claude 生成心智圖
          </Button>
          <Button icon={<ClusterOutlined />} onClick={onRefresh} loading={loading}>
            解析筆記大綱
          </Button>
        </Space>
      }
      styles={{ body: { padding: 24, minHeight: 450, backgroundColor: '#ffffff' } }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin tip="正在建立心智圖架構..." /></div>
      ) : treeData.length > 0 ? (
        <Tree
          showLine={{ showLeafIcon: false }}
          switcherIcon={<DownOutlined />}
          defaultExpandAll
          treeData={treeData}
          style={{ fontSize: 14 }}
        />
      ) : (
        <div style={{ textAlign: 'center', color: '#8c8c8c', padding: 60 }}>
          目前的筆記尚無標題大綱，點擊上方按鈕讓 Claude 自動為你構建心智圖！
        </div>
      )}

      <Modal
        title="🤖 Claude AI 智慧心智圖生成"
        open={aiModalOpen}
        onOk={handleGenerateAiMindMap}
        onCancel={() => setAiModalOpen(false)}
        confirmLoading={aiLoading}
        okText="生成心智圖"
        cancelText="取消"
      >
        <p>請輸入你想拆解的主題，或直接留空以自動分析目前開啟的筆記內容：</p>
        <Input.TextArea
          rows={3}
          placeholder="例如: 重構 Python 服務架構的核心思維..."
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
