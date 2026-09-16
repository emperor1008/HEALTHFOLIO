"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
  onOpenEvidence?: (point: ChartPoint) => void;
}

function CustomTooltip({ active, payload, onOpenEvidence }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-md">
      <p className="text-sm font-medium text-text-primary">
        {point.value} {point.unit || ""}
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">
        {formatDateLabel(point.date)}
      </p>
      {point.documentName && (
        <p className="mt-1 text-xs text-text-secondary">
          Source: {point.documentName}, page {point.pageNumber}
        </p>
      )}
      {point.evidenceText && (
        <p className="mt-1 max-w-[220px] truncate text-xs italic text-text-secondary">
          &ldquo;{point.evidenceText}&rdquo;
        </p>
      )}
      {point.referenceLow !== null && point.referenceHigh !== null && (
        <p className="mt-1 text-xs text-text-secondary">
          Report range: {point.referenceLow}–{point.referenceHigh}
        </p>
      )}
      {onOpenEvidence && (
        <button
          onClick={() => onOpenEvidence(point)}
          className="mt-2 min-h-touch text-xs font-medium text-primary hover:underline"
        >
          Open document context
        </button>
      )}
    </div>
  );
}

export default function TrendChart({ points, unit, testName }: TrendChartProps) {
  const reduceMotion = useReducedMotion();
  const [evidencePoint, setEvidencePoint] = useState<ChartPoint | null>(null);

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

  // Reference range lines — only when printed on the source reports
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
          margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
        >
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 12, fill: "#576B66" }}
            tickLine={false}
            axisLine={{ stroke: "#D8DFDA" }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12, fill: "#576B66" }}
            tickLine={false}
            axisLine={{ stroke: "#D8DFDA" }}
            width={44}
            label={{
              value: unit || "",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: "#576B66" },
            }}
          />
          <Tooltip
            content={<CustomTooltip onOpenEvidence={setEvidencePoint} />}
            cursor={{ stroke: "#D8DFDA", strokeDasharray: "4 4" }}
          />
          {refLow !== null && refLow !== undefined && (
            <ReferenceLine
              y={refLow}
              stroke="#18794E"
              strokeDasharray="5 5"
              strokeOpacity={0.45}
              label={{
                value: `Report low ${refLow}`,
                position: "insideBottomRight",
                style: { fontSize: 10, fill: "#18794E" },
              }}
            />
          )}
          {refHigh !== null && refHigh !== undefined && (
            <ReferenceLine
              y={refHigh}
              stroke="#A15C00"
              strokeDasharray="5 5"
              strokeOpacity={0.45}
              label={{
                value: `Report high ${refHigh}`,
                position: "insideTopRight",
                style: { fontSize: 10, fill: "#A15C00" },
              }}
            />
          )}
          <Line
            type="linear"
            dataKey="value"
            stroke="#0F5C5E"
            strokeWidth={2}
            animationDuration={reduceMotion ? 0 : 700}
            animationEasing="ease-out"
            dot={{
              r: 4.5,
              fill: "#0F5C5E",
              stroke: "#fff",
              strokeWidth: 2,
            }}
            activeDot={{
              r: 6.5,
              fill: "#0F5C5E",
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Evidence list — each point links to its original document context */}
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Evidence for each point
        </p>
        <ul className="mt-2 space-y-1.5">
          {chartData.map((point) => (
            <li
              key={point.measurementId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border/60 bg-surface px-3 py-2 text-sm"
            >
              <span className="text-text-primary">
                <span className="font-medium">
                  {point.value}
                  {point.unit ? ` ${point.unit}` : ""}
                </span>
                <span className="ml-2 text-text-secondary">
                  {formatDateLabel(point.date)}
                </span>
                {point.reportFlag && (
                  <span className="ml-2 text-xs text-warning">
                    Flagged: {point.reportFlag}
                  </span>
                )}
              </span>
              <span className="text-xs text-text-secondary">
                {point.documentName || "Unknown document"}, p.{point.pageNumber}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Evidence drawer */}
      {evidencePoint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Source evidence"
          onClick={() => setEvidencePoint(null)}
        >
          <div
            className="animate-rise w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-text-primary">
              Source evidence
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-text-secondary">Value</dt>
                <dd className="text-text-primary">
                  {evidencePoint.value} {evidencePoint.unit || ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-secondary">Date</dt>
                <dd className="text-text-primary">
                  {formatDateLabel(evidencePoint.date)}
                </dd>
              </div>
              {evidencePoint.referenceLow !== null &&
                evidencePoint.referenceHigh !== null && (
                  <div>
                    <dt className="text-xs uppercase text-text-secondary">
                      Report range
                    </dt>
                    <dd className="text-text-primary">
                      {evidencePoint.referenceLow}–{evidencePoint.referenceHigh}
                    </dd>
                  </div>
                )}
              <div>
                <dt className="text-xs uppercase text-text-secondary">
                  Source document
                </dt>
                <dd className="text-text-primary">
                  {evidencePoint.documentName || "Unknown document"}, page{" "}
                  {evidencePoint.pageNumber}
                </dd>
              </div>
              {evidencePoint.evidenceText && (
                <div>
                  <dt className="text-xs uppercase text-text-secondary">
                    Text on the report
                  </dt>
                  <dd className="mt-1 rounded-card bg-canvas p-3 italic text-text-secondary">
                    &ldquo;{evidencePoint.evidenceText}&rdquo;
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Link
                href={`/records/reports/${evidencePoint.documentId}`}
                className="min-h-touch px-1 py-2 text-sm font-medium text-primary hover:underline"
              >
                Open the original document
              </Link>
              <button
                onClick={() => setEvidencePoint(null)}
                className="min-h-touch rounded-card border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-canvas"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
