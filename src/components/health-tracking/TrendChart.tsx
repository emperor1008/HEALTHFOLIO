"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ChartPoint {
  measurementId: string;
  date: string;
  value: number;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  reportFlag: string | null;
  documentId: string;
  pageNumber: number;
  evidenceText: string;
  documentName?: string;
}

interface TrendChartProps {
  points: ChartPoint[];
  unit: string | null;
  testName: string;
}

function formatDateLabel(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartPoint;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-lg">
      <p className="text-sm font-medium text-text-primary">
        {point.value} {point.unit || ""}
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        {formatDateLabel(point.date)}
      </p>
      {point.documentName && (
        <p className="mt-1 text-xs text-text-secondary">
          Source: {point.documentName}, page {point.pageNumber}
        </p>
      )}
      {point.referenceLow !== null && point.referenceHigh !== null && (
        <p className="mt-1 text-xs text-text-secondary">
          Range: {point.referenceLow}–{point.referenceHigh}
        </p>
      )}
      {point.reportFlag && (
        <p className="mt-1 text-xs text-warning">
          Flag: {point.reportFlag}
        </p>
      )}
    </div>
  );
}

export default function TrendChart({ points, unit, testName }: TrendChartProps) {
  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        dateLabel: formatDateLabel(p.date),
        timestamp: new Date(p.date).getTime(),
      })),
    [points]
  );

  if (chartData.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-card border border-border bg-canvas">
        <p className="text-sm text-text-secondary">
          Need at least 2 data points to display a trend
        </p>
      </div>
    );
  }

  // Compute Y-axis domain with padding
  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1 || 1;
  const yMin = Math.floor((minVal - padding) * 100) / 100;
  const yMax = Math.ceil((maxVal + padding) * 100) / 100;

  // Find reference lines
  const refLow = chartData.find((d) => d.referenceLow !== null)?.referenceLow;
  const refHigh = chartData.find((d) => d.referenceHigh !== null)?.referenceHigh;

  return (
    <div
      className="rounded-card border border-border bg-canvas p-4"
      role="img"
      aria-label={`Trend chart for ${testName.replace(/_/g, " ")} showing ${chartData.length} data points`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            label={{
              value: unit || "",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: "#6b7280" },
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {refLow !== null && refLow !== undefined && (
            <ReferenceLine
              y={refLow}
              stroke="#22c55e"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              label={{
                value: `Low: ${refLow}`,
                position: "right",
                style: { fontSize: 10, fill: "#22c55e" },
              }}
            />
          )}
          {refHigh !== null && refHigh !== undefined && (
            <ReferenceLine
              y={refHigh}
              stroke="#22c55e"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              label={{
                value: `High: ${refHigh}`,
                position: "right",
                style: { fontSize: 10, fill: "#22c55e" },
              }}
            />
          )}
          <Line
            type="linear"
            dataKey="value"
            stroke="#0d9488"
            strokeWidth={2}
            dot={{
              r: 5,
              fill: "#0d9488",
              stroke: "#fff",
              strokeWidth: 2,
            }}
            activeDot={{
              r: 7,
              fill: "#0d9488",
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Data table for accessibility */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <caption className="sr-only">
            Data points for {testName.replace(/_/g, " ")}
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase text-text-secondary">
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Value</th>
              <th className="pb-2 pr-4">Range</th>
              <th className="pb-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((point) => (
              <tr key={point.measurementId} className="border-b border-border/50">
                <td className="py-2 pr-4 text-text-secondary">
                  {formatDateLabel(point.date)}
                </td>
                <td className="py-2 pr-4 font-medium text-text-primary">
                  {point.value} {point.unit || ""}
                </td>
                <td className="py-2 pr-4 text-text-secondary">
                  {point.referenceLow !== null && point.referenceHigh !== null
                    ? `${point.referenceLow}–${point.referenceHigh}`
                    : "—"}
                </td>
                <td className="py-2 text-text-secondary">
                  {point.documentName || "Unknown"}, p.{point.pageNumber}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
