"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Input, Tag, Spin, Space, Typography } from 'antd';
import { ReloadOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';

const { Text } = Typography;

type Node = {
  id: string;
  label: string;
  type: 'note' | 'category' | 'tag';
  category?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

type Link = {
  source: string;
  target: string;
  type?: string;
};

type GraphViewProps = {
  graphData: { nodes: Node[]; links: Link[] };
  loading: boolean;
  onRefresh: () => void;
  onSelectNote: (noteId: string) => void;
};

export default function GraphView({ graphData, loading, onRefresh, onSelectNote }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);

  useEffect(() => {
    if (!graphData || !graphData.nodes) return;

    const width = 800;
    const height = 600;

    const nodes = graphData.nodes.map((n, i) => {
      const angle = (i / graphData.nodes.length) * 2 * Math.PI;
      const radius = 180 + Math.random() * 80;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      };
    });

    nodesRef.current = nodes;
    linksRef.current = graphData.links;

    for (let iter = 0; iter < 120; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          let dx = n2.x! - n1.x!;
          let dy = n2.y! - n1.y!;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 250) {
            const force = (250 - dist) / dist * 0.5;
            n1.x! -= dx * force * 0.1;
            n1.y! -= dy * force * 0.1;
            n2.x! += dx * force * 0.1;
            n2.y! += dy * force * 0.1;
          }
        }
      }
      linksRef.current.forEach(link => {
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        if (sourceNode && targetNode) {
          let dx = targetNode.x! - sourceNode.x!;
          let dy = targetNode.y! - sourceNode.y!;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 100) * 0.05;
          sourceNode.x! += (dx / dist) * force;
          sourceNode.y! += (dy / dist) * force;
          targetNode.x! -= (dx / dist) * force;
          targetNode.y! -= (dy / dist) * force;
        }
      });
    }

    renderCanvas();
  }, [graphData]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x + canvas.width / 2, offset.y + canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.strokeStyle = link.type === 'wikilink' ? '#1890ff' : link.type === 'tag' ? '#52c41a' : '#d9d9d9';
        ctx.lineWidth = link.type === 'wikilink' ? 1.8 : 1.0;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    });

    nodes.forEach(node => {
      const isMatched = searchTerm && node.label.toLowerCase().includes(searchTerm.toLowerCase());

      ctx.beginPath();
      const radius = node.type === 'category' ? 12 : node.type === 'tag' ? 8 : 10;
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);

      let color = '#1890ff';
      if (node.type === 'category') color = '#722ed1';
      if (node.type === 'tag') color = '#52c41a';
      if (isMatched) color = '#ff4d4f';

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isMatched || hoveredNode?.id === node.id ? 12 : 2;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = node.type === 'category' ? 'bold 12px sans-serif' : '11px sans-serif';
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x!, node.y! + radius + 14);
    });

    ctx.restore();
  };

  useEffect(() => {
    renderCanvas();
  }, [zoom, offset, searchTerm, hoveredNode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - offset.x - canvas.width / 2) / zoom + canvas.width / 2;
    const clickY = (e.clientY - rect.top - offset.y - canvas.height / 2) / zoom + canvas.height / 2;

    const clickedNode = nodesRef.current.find(node => {
      const dx = node.x! - clickX;
      const dy = node.y! - clickY;
      return Math.sqrt(dx * dx + dy * dy) <= 15;
    });

    if (clickedNode && clickedNode.type === 'note') {
      onSelectNote(clickedNode.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingCanvas.current) {
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    }
  };

  return (
    <Card
      title={
        <Space>
          <Text strong style={{ fontSize: 16 }}>🕸️ Obsidian 知識關聯圖 (Graph View)</Text>
          <Tag color="purple">Nodes: {graphData.nodes?.length || 0}</Tag>
          <Tag color="blue">Links: {graphData.links?.length || 0}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Input.Search
            placeholder="搜尋圖表節點..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <Button icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} />
          <Button icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))} />
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>重新整列</Button>
        </Space>
      }
      styles={{ body: { padding: 12, textAlign: 'center', backgroundColor: '#fafafa', borderRadius: 8 } }}
    >
      {loading ? (
        <div style={{ padding: 100 }}><Spin size="large" tip="正在繪製知識圖譜..." /></div>
      ) : (
        <canvas
          ref={canvasRef}
          width={800}
          height={550}
          onClick={handleCanvasClick}
          onMouseDown={e => {
            isDraggingCanvas.current = true;
            dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
          }}
          onMouseUp={() => isDraggingCanvas.current = false}
          onMouseLeave={() => isDraggingCanvas.current = false}
          onMouseMove={handleMouseMove}
          style={{
            width: '100%',
            height: '550px',
            cursor: isDraggingCanvas.current ? 'grabbing' : 'grab',
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #f0f0f0'
          }}
        />
      )}
    </Card>
  );
}
