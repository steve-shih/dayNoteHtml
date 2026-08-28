"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Input, Tag, Spin, Space, Typography } from 'antd';
import { ReloadOutlined, ZoomInOutlined, ZoomOutOutlined, FireOutlined, CompassOutlined } from '@ant-design/icons';

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
  isDragging?: boolean;
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
  const draggedNodeRef = useRef<Node | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const totalDragDist = useRef(0);

  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const animFrameId = useRef<number | null>(null);

  // 初始化物理模型與佈局
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

    // 物理模擬多步跌代 (Force Simulation)
    for (let iter = 0; iter < 180; iter++) {
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
  }, [graphData]);

  // 高畫質動態渲染迴圈 (High-DPI Canvas Rendering Loop)
  useEffect(() => {
    const render = () => {
      drawCanvas();
      animFrameId.current = requestAnimationFrame(render);
    };
    animFrameId.current = requestAnimationFrame(render);
    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [zoom, offset, searchTerm, hoveredNode]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 背景深色網格
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + offset.x, height / 2 + offset.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // 繪製連線
    links.forEach(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      if (!sourceNode || !targetNode) return;

      const isConnectedToHovered = hoveredNode && (sourceNode.id === hoveredNode.id || targetNode.id === hoveredNode.id);

      ctx.beginPath();
      ctx.moveTo(sourceNode.x!, sourceNode.y!);
      const midX = (sourceNode.x! + targetNode.x!) / 2;
      const midY = (sourceNode.y! + targetNode.y!) / 2 - 15;
      ctx.quadraticCurveTo(midX, midY, targetNode.x!, targetNode.y!);

      ctx.strokeStyle = isConnectedToHovered ? '#1890ff' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = isConnectedToHovered ? 2.5 : 1;
      ctx.stroke();
    });

    // 繪製節點
    nodes.forEach(node => {
      const isHovered = hoveredNode?.id === node.id;
      const isMatched = searchTerm && node.label.toLowerCase().includes(searchTerm.toLowerCase());

      let radius = node.type === 'category' ? 14 : node.type === 'tag' ? 8 : 10;
      let color = node.type === 'category' ? '#9254de' : node.type === 'tag' ? '#73d13d' : '#1890ff';
      let shadowColor = color;

      if (isMatched) {
        color = '#ff4d4f';
        radius += 4;
      }
      if (isHovered) {
        radius += 4;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = isHovered || isMatched ? 18 : 6;
      ctx.fill();

      // 繪製文字標籤
      ctx.font = isHovered || isMatched ? 'bold 13px sans-serif' : '11px sans-serif';
      const labelText = node.label;
      const textWidth = ctx.measureText(labelText).width;
      const labelX = node.x!;
      const labelY = node.y! + radius + 14;

      ctx.fillStyle = isHovered ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.65)';
      ctx.roundRect(labelX - textWidth / 2 - 6, labelY - 10, textWidth + 12, 16, 4);
      ctx.fill();

      ctx.fillStyle = isHovered ? '#ffffff' : '#d9d9d9';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, labelX, labelY);

      ctx.restore();
    });

    ctx.restore();
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - offset.x - rect.width / 2) / zoom + rect.width / 2;
    const mouseY = (e.clientY - rect.top - offset.y - rect.height / 2) / zoom + rect.height / 2;
    return { x: mouseX, y: mouseY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    totalDragDist.current = 0;

    // 判斷是否按在某個節點上 (Node Dragging)
    const clickedNode = nodesRef.current.find(node => {
      const dx = node.x! - x;
      const dy = node.y! - y;
      return Math.sqrt(dx * dx + dy * dy) <= 22;
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      clickedNode.isDragging = true;
    } else {
      isDraggingCanvas.current = true;
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (draggedNodeRef.current) {
      totalDragDist.current += 1;
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      return;
    }

    if (isDraggingCanvas.current) {
      totalDragDist.current += Math.abs(e.movementX) + Math.abs(e.movementY);
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
      return;
    }

    // 懸停動態碰撞偵測
    const hovered = nodesRef.current.find(node => {
      const dx = node.x! - x;
      const dy = node.y! - y;
      return Math.sqrt(dx * dx + dy * dy) <= 20;
    });

    setHoveredNode(hovered || null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.isDragging = false;
      // 如果拖曳距離極小，判定為點擊節點跳轉
      if (totalDragDist.current < 5 && draggedNodeRef.current.type === 'note') {
        onSelectNote(draggedNodeRef.current.id);
      }
      draggedNodeRef.current = null;
    }

    isDraggingCanvas.current = false;
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
          <Button icon={<CompassOutlined />} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>重置畫布</Button>
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onMouseLeave={() => {
            isDraggingCanvas.current = false;
            if (draggedNodeRef.current) draggedNodeRef.current.isDragging = false;
            draggedNodeRef.current = null;
            setHoveredNode(null);
          }}
          style={{
            width: '100%',
            height: '100%',
            cursor: hoveredNode ? 'pointer' : isDraggingCanvas.current || draggedNodeRef.current ? 'grabbing' : 'grab',
            display: 'block'
          }}
        />

        {/* 底部圖例與操作說明 */}
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
          <span style={{ color: '#aaa' }}>💡 提示: 滑鼠滾輪縮放、按住按鈕或節點可自由拖拽移動</span>
        </div>
      </div>
    </Card>
  );
}
