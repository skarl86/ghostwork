import { useState, useMemo } from 'react';
import { useCompanyContext } from '@/providers/CompanyProvider';
import { useCosts } from '@/hooks/queries';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DollarSign, Bot } from 'lucide-react';

type TimeRange = '7d' | '30d' | '90d' | 'all';

function getDateRange(range: TimeRange): { from: string; to: string } | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  const from = new Date(now);
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: now.toISOString() };
}

export function Costs() {
  const { companyId } = useCompanyContext();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);
  const { data: costs, isLoading } = useCosts(companyId, dateRange);

  const allCosts = costs ?? [];
  const totalCost = allCosts.reduce((sum, c) => sum + c.totalCostUsd, 0);
  const totalRuns = allCosts.reduce((sum, c) => sum + c.runCount, 0);

  const ranges: { label: string; value: TimeRange }[] = [
    { label: '7 days', value: '7d' },
    { label: '30 days', value: '30d' },
    { label: '90 days', value: '90d' },
    { label: 'All time', value: 'all' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h1 className="text-xl font-semibold">Costs</h1>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <Button
              key={r.value}
              variant={timeRange === r.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(r.value)}
              className="min-h-[44px] sm:min-h-0"
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Summary Cards */}
        <div className="mb-6 grid gap-4 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total Cost
            </div>
            <p className="mt-1 text-2xl font-bold">
              {totalCost === 0 && allCosts.every((c) => c.adapterType === 'process')
                ? 'Free (local)'
                : `$${totalCost.toFixed(2)}`}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4" />
              Total Runs
            </div>
            <p className="mt-1 text-2xl font-bold">{totalRuns}</p>
          </div>
          <div className="rounded-lg border p-4 col-span-2 sm:col-span-1">
            <div className="text-sm text-muted-foreground">Avg Cost / Run</div>
            <p className="mt-1 text-2xl font-bold">
              ${totalRuns > 0 ? (totalCost / totalRuns).toFixed(4) : '0.00'}
            </p>
          </div>
        </div>

        {/* Cost Table */}
        {isLoading ? (
          <div className="text-muted-foreground">Loading costs...</div>
        ) : allCosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <DollarSign className="h-12 w-12 opacity-40" />
            <p>No cost data for this period.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Cost (USD)</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Avg / Run</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allCosts
                  .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
                  .map((entry) => (
                    <TableRow key={entry.agentId}>
                      <TableCell className="font-medium">{entry.agentName}</TableCell>
                      <TableCell className="text-right">{entry.runCount}</TableCell>
                      <TableCell className="text-right">
                        {entry.totalCostUsd === 0 && entry.adapterType === 'process'
                          ? 'Free (local)'
                          : `$${entry.totalCostUsd.toFixed(4)}`}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        ${entry.runCount > 0 ? (entry.totalCostUsd / entry.runCount).toFixed(4) : '0.00'}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {totalCost > 0 ? ((entry.totalCostUsd / totalCost) * 100).toFixed(1) : '0'}%
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
