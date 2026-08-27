"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Input, Tag, Spin, Space, Typography, Tooltip } from 'antd';
import { ReloadOutlined, ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined, FireOutlined } from '@ant-design/icons';

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const animFrameId = useRef<number | null>(null);

  // 初始化物理模型與高畫質佈局
  useEffect(() => {
    if (!graphData || !graphData.nodes) return;

    const width = 1000;
    const height = 700;

    const nodes: Node[] = graphData.nodes.map((n, i) => {
      const angle = (i / Math.max(graphData.nodes.length, 1)) * 2 * Math.PI;
      const radius = 220 + Math.random() * 120;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2
      };
    });

    nodesRef.current = nodes;
    linksRef.current = graphData.links;

    // 進行物理模擬多步跌代 (Force Simulation)
    for (let iter = 0; iter < 180; iter++) {
      // 1. 斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          let dx = n2.x! - n1.x!;
          let dy = n2.y! - n1.y!;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 280) {
            const force = (280 - dist) / dist * 0.4;
            n1.x! -= dx * force * 0.12;
            n1.y! -= dy * force * 0.12;
            n2.x! += dx * force * 0.12;
            n2.y! += dy * force * 0.12;
          }
        }
      }
      // 2. 引力
      linksRef.current.forEach(link => {
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        if (sourceNode && targetNode) {
          let dx = targetNode.x! - sourceNode.x!;
          let dy = targetNode.y! - sourceNode.y!;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 120) * 0.04;
          sourceNode.x! += (dx / dist) * force;
          sourceNode.y! += (dy / dist) * force;
          targetNode.x! -= (dx / dist) * force;
          targetNode.y! -= (dy / dist) * force;
        }
      });
    }

    startAnimation();

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [graphData]);

  const startAnimation = () => {
    const render = () => {
      drawHighResCanvas();
      animFrameId.current = requestAnimationFrame(render);
    };
    if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    animFrameId.current = requestAnimationFrame(render);
  };

  // 高解析度 (High-DPI / Retina Scale) 畫布繪製
  const drawHighResCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // 背景深色網格 Obsidian 質感
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.translate(offset.x + rect.width / 2, offset.y + rect.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-rect.width / 2, -rect.height / 2);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // 計算當前 Hover 相關的節點集合
    const connectedNodeIds = new Set<string>();
    if (hoveredNode) {
      connectedNodeIds.add(hoveredNode.id);
      links.forEach(l => {
        if (l.source === hoveredNode.id) connectedNodeIds.add(l.target);
        if (l.target === hoveredNode.id) connectedNodeIds.add(l.source);
      });
    }

    // 1. 繪製連線 Lines
    links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        const isHighlight = hoveredNode && (link.source === hoveredNode.id || link.target === hoveredNode.id);
        const isDim = hoveredNode && !isHighlight;

        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);

        if (isHighlight) {
          ctx.strokeStyle = '#40a9ff';
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.9;
        } else if (isDim) {
          ctx.strokeStyle = '#303030';
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.15;
        } else {
          ctx.strokeStyle = link.type === 'wikilink' ? '#1890ff' : link.type === 'tag' ? '#52c41a' : '#434343';
          ctx.lineWidth = link.type === 'wikilink' ? 1.5 : 1.0;
          ctx.globalAlpha = 0.45;
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    });

    // 2. 繪製節點 Nodes
    nodes.forEach(node => {
      const isMatched = searchTerm && node.label.toLowerCase().includes(searchTerm.toLowerCase());
      const isHovered = hoveredNode?.id === node.id;
      const isConnected = hoveredNode && connectedNodeIds.has(node.id);
      const isDim = hoveredNode && !isConnected;

      ctx.save();
      if (isDim) ctx.globalAlpha = 0.2;

      let radius = node.type === 'category' ? 14 : node.type === 'tag' ? 9 : 11;
      if (isHovered) radius += 4;

      let mainColor = '#1890ff'; // Note (Blue)
      let glowColor = 'rgba(24, 144, 255, 0.5)';
      if (node.type === 'category') {
        mainColor = '#9254de'; // Category (Purple)
        glowColor = 'rgba(146, 84, 222, 0.5)';
      } else if (node.type === 'tag') {
        mainColor = '#73d13d'; // Tag (Green)
        glowColor = 'rgba(115, 209, 61, 0.5)';
      }

      if (isMatched) {
        mainColor = '#ff4d4f';
        glowColor = 'rgba(255, 77, 79, 0.7)';
      }

      // 繪製發光外環 (Outer Glow)
      const grad = ctx.createRadialGradient(node.x!, node.y!, radius * 0.3, node.x!, node.y!, radius * 2.2);
      grad.addColorStop(0, mainColor);
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius * 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();

      // 核心實體圓
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = mainColor;
      ctx.shadowColor = mainColor;
      ctx.shadowBlur = isHovered || isMatched ? 15 : 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 繪製標籤 (Label with backdrop)
      const labelText = node.label;
      ctx.font = node.type === 'category' ? 'bold 12px Inter, sans-serif' : '11px Inter, sans-serif';

      const textWidth = ctx.measureText(labelText).width;
      const labelX = node.x!;
      const labelY = node.y! + radius + 14;

      // 標籤背底膠囊
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.roundRect(labelX - textWidth / 2 - 6, labelY - 10, textWidth + 12, 16, 4);
      ctx.fill();

      ctx.fillStyle = isHovered ? '#ffffff' : '#d9d9d9';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, labelX, labelY);

      ctx.restore();
    });

    ctx.restore();
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - offset.x - rect.width / 2) / zoom + rect.width / 2;
    const clickY = (e.clientY - rect.top - offset.y - rect.height / 2) / zoom + rect.height / 2;

    const clickedNode = nodesRef.current.find(node => {
      const dx = node.x! - clickX;
      const dy = node.y! - clickY;
      return Math.sqrt(dx * dx + dy * dy) <= 18;
    });

    if (clickedNode && clickedNode.type === 'note') {
      onSelectNote(clickedNode.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - offset.x - rect.width / 2) / zoom + rect.width / 2;
    const mouseY = (e.clientY - rect.top - offset.y - rect.height / 2) / zoom + rect.height / 2;

    if (isDraggingCanvas.current) {
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
      return;
    }

    // 懸停動態碰撞偵測
    const hovered = nodesRef.current.find(node => {
      const dx = node.x! - mouseX;
      const dy = node.y! - mouseY;
      return Math.sqrt(dx * dx + dy * dy) <= 18;
    });

    setHoveredNode(hovered || null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom(z => Math.max(0.3, Math.min(3.5, z + zoomDelta)));
  };

  return (
    <Card
      style={{ backgroundColor: '#141414', borderColor: '#303030', borderRadius: 12, overflow: 'hidden' }}
      title={
        <Space>
          <FireOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <Text strong style={{ fontSize: 16, color: '#ffffff' }}>Obsidian 高畫質知識網狀圖 (Graph View)</Text>
          <Tag color="purple">節點: {graphData.nodes?.length || 0}</Tag>
          <Tag color="blue">關聯: {graphData.links?.length || 0}</Tag>
        </Space>
      }
      extra={
        <Space wrap>
          <Input.Search
            placeholder="搜尋知識節點..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <Button icon={<ZoomInOutlined />} onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} />
          <Button icon={<ZoomOutOutlined />} onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))} />
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>重新佈局</Button>
        </Space>
      }
      styles={{ body: { padding: 0, position: 'relative' } }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '620px', position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 20, 28, 0.85)', zIndex: 10 }}>
            <Spin size="large" tip="正在重組高解析度知識圖譜..." />
          </div>
        )}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onMouseDown={e => {
            isDraggingCanvas.current = true;
            dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
          }}

          onMouseUp={() => isDraggingCanvas.current = false}
          onMouseLeave={() => {
            isDraggingCanvas.current = false;
            setHoveredNode(null);
          }}
          onMouseMove={handleMouseMove}
          style={{
            width: '100%',
            height: '100%',
            cursor: hoveredNode ? 'pointer' : isDraggingCanvas.current ? 'grabbing' : 'grab',
            display: 'block'
          }}
        />

        {/* 底部圖例說明 */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #303030',
            color: '#fff',
            fontSize: 12,
            display: 'flex',
            gap: 16
          }}
        >
          <span><span style={{ color: '#9254de' }}>●</span> 分類節點</span>
          <span><span style={{ color: '#1890ff' }}>●</span> 筆記節點</span>
          <span><span style={{ color: '#73d13d' }}>●</span> #標籤</span>
          <span><span style={{ color: '#1890ff' }}>—</span> WikiLink</span>
        </div>
      </div>
    </Card>
  );
}
