import { useCallback, useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useAgents } from '@/hooks/queries';
import { buildTree, layoutForest, flattenLayout, getEdges } from '@/lib/tree-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2, Bot } from 'lucide-react';
import type { Agent } from '@/lib/api';

const NODE_W = 180;
const NODE_H = 80;

function statusVariant(status: string) {
  switch (status) {
    case 'running': return 'success' as const;
    case 'error': return 'destructive' as const;
    case 'paused': return 'warning' as const;
    default: return 'secondary' as const;
  }
}

export function OrgChart() {
  const { companyId } = useCompanyContext();
  const { data: agents, isLoading } = useAgents(companyId);
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  const resetView = useCallback(() => {
    setPan({ x: 40, y: 40 });
    setZoom(1);
  }, []);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading org chart...</div>;
  }

  const agentList = agents ?? [];
  const trees = buildTree<Agent>(
    agentList,
    (a) => a.reportsTo ?? null,
  );
  const layout = layoutForest(trees, { nodeWidth: NODE_W, nodeHeight: NODE_H });
  const allNodes = flattenLayout(layout);
  const edges = getEdges(layout);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold">Org Chart</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={resetView}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 overflow-hidden">
        {agentList.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No agents yet. Create agents to see the org chart.
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {edges.map(({ from, to }) => (
                <path
                  key={`${from.id}-${to.id}`}
                  d={`M ${from.x + NODE_W / 2} ${from.y + NODE_H} 
                      C ${from.x + NODE_W / 2} ${from.y + NODE_H + 30}, 
                        ${to.x + NODE_W / 2} ${to.y - 30}, 
                        ${to.x + NODE_W / 2} ${to.y}`}
                  fill="none"
                  className="stroke-muted-foreground/40"
                  strokeWidth={2}
                />
              ))}

              {/* Nodes */}
              {allNodes.map((node) => {
                const agent = node.data as Agent;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer"
                    onClick={() => void navigate(`/${companyId}/agents/${agent.id}`)}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      className="fill-card stroke-border"
                      strokeWidth={1.5}
                    />
                    {/* Icon */}
                    <foreignObject x={12} y={(NODE_H - 32) / 2} width={32} height={32}>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    </foreignObject>
                    {/* Text */}
                    <foreignObject x={52} y={12} width={NODE_W - 64} height={NODE_H - 24}>
                      <div className="flex flex-col gap-1">
                        <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{agent.role ?? agent.adapterType}</span>
                        <Badge variant={statusVariant(agent.status)} className="w-fit text-[10px] px-1.5 py-0">
                          {agent.status}
                        </Badge>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
