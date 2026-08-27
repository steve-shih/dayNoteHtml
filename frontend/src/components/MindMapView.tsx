"use client";

import React, { useState } from 'react';
import { Card, Button, Input, Tree, Tag, Space, Typography, Spin, Modal, message, Tooltip } from 'antd';
import { ClusterOutlined, RobotOutlined, DownOutlined, ZoomInOutlined, ZoomOutOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

type MindMapNode = {
  name: string;
  note_id?: string;
  children?: MindMapNode[];
};

type MindMapViewProps = {
  activeNoteId?: string;
  mindmapTree: MindMapNode | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectNote?: (noteTitleOrId: string) => void;
};

export default function MindMapView({ activeNoteId, mindmapTree, loading, onRefresh, onSelectNote }: MindMapViewProps) {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [customMindmap, setCustomMindmap] = useState<MindMapNode | null>(null);
  const [zoom, setZoom] = useState(1);

  const handleNodeClick = (nodeName: string, noteId?: string) => {
    if (onSelectNote) {
      onSelectNote(noteId || nodeName);
      message.info(`已切換檢視節點筆記：「${nodeName}」`);
    }
  };

  const transformToTreeData = (node: MindMapNode, keyPrefix = '0'): any => {
    if (!node) return [];
    return [{
      title: (
        <span
          onClick={() => handleNodeClick(node.name, node.note_id)}
          style={{
            fontWeight: keyPrefix === '0' ? 'bold' : 'normal',
            fontSize: keyPrefix === '0' ? '15px' : '13px',
            cursor: 'pointer',
            color: keyPrefix === '0' ? '#1890ff' : '#262626',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'all 0.2s'
          }}
          className="mindmap-node-hover"
        >
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

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom(z => Math.max(0.4, Math.min(2.5, z + delta)));
  };

  const currentData = customMindmap || mindmapTree;
  const treeData = currentData ? transformToTreeData(currentData) : [];

  return (
    <Card
      title={
        <Space>
          <Text strong style={{ fontSize: 16 }}>🌳 心智圖視圖 (Mind Map)</Text>
          {customMindmap && <Tag color="gold">AI Generated</Tag>}
          <Tag color="blue">縮放: {Math.round(zoom * 100)}%</Tag>
        </Space>
      }
      extra={
        <Space wrap>
          <Button icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} />
          <Button icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))} />
          <Button icon={<ReloadOutlined />} onClick={() => setZoom(1.0)} title="重置縮放" />
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
      styles={{ body: { padding: 24, minHeight: 550, backgroundColor: '#fafafa', overflow: 'hidden' } }}
    >
      <div
        onWheel={handleWheel}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'transform 0.15s ease-out',
          minHeight: '480px',
          cursor: 'grab'
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin tip="正在建立心智圖架構..." /></div>
        ) : treeData.length > 0 ? (
          <Tree
            showLine={{ showLeafIcon: false }}
            switcherIcon={<DownOutlined />}
            defaultExpandAll
            treeData={treeData}
            style={{ fontSize: 14, backgroundColor: 'transparent' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#8c8c8c', padding: 60 }}>
            目前的筆記尚無標題大綱，點擊上方按鈕讓 Claude 自動為你構建心智圖！
          </div>
        )}
      </div>

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
