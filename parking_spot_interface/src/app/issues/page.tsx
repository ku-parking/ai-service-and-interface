"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getIssueReportsAction,
  getParkingSpotsAction,
  updateIssueReportStatusAction,
} from "~/lib/actions";

type IssueReportItem = {
  id: number;
  parkingSpotId: number;
  parkingSpotName: string;
  reason: string | null;
  notes: string | null;
  status: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

type ParkingSpotItem = {
  id: number;
  name: string;
};

export default function IssuesPage() {
  const [reports, setReports] = useState<IssueReportItem[]>([]);
  const [spots, setSpots] = useState<ParkingSpotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [spotFilter, setSpotFilter] = useState("all");
  const [closingIssueId, setClosingIssueId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    void Promise.all([getIssueReportsAction(), getParkingSpotsAction()])
      .then(([issueRes, spotRes]) => {
        setReports(issueRes.issueReports as IssueReportItem[]);
        setSpots(
          spotRes.parkingSpots.map((spot) => ({
            id: spot.id,
            name: spot.name,
          })),
        );
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(reports.map((report) => report.status))).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (statusFilter !== "all" && report.status !== statusFilter) return false;
      if (spotFilter !== "all" && String(report.parkingSpotId) !== spotFilter) return false;
      return true;
    });
  }, [reports, statusFilter, spotFilter]);

  const handleCloseIssue = async (reportId: number) => {
    setClosingIssueId(reportId);
    try {
      const result = await updateIssueReportStatusAction(reportId, "closed");
      if ("error" in result) {
        return;
      }
      setReports((prev) =>
        prev.map((report) =>
          report.id === reportId ? { ...report, status: "closed", updatedAt: new Date() } : report,
        ),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setClosingIssueId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-8 text-gray-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Issue Reports</h1>
          <Link
            href="/"
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-700"
          >
            Back to Monitor
          </Link>
        </div>

        <div className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm text-gray-300">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-gray-300">
            Parking Spot
            <select
              value={spotFilter}
              onChange={(e) => setSpotFilter(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              {spots.map((spot) => (
                <option key={spot.id} value={String(spot.id)}>
                  {spot.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <p className="text-sm text-gray-400">
              Showing <span className="font-semibold text-gray-200">{filteredReports.length}</span> report(s)
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900">
          {loading ? (
            <p className="p-4 text-sm text-gray-400">Loading issue reports...</p>
          ) : filteredReports.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No issue reports found for the selected filters.</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {filteredReports.map((report) => (
                <li key={report.id} className="p-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-100">{report.parkingSpotName}</p>
                      <p className="text-xs text-gray-400">Report #{report.id}</p>
                    </div>
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                      {report.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{report.reason ?? "No reason provided"}</p>
                  {report.notes && <p className="mt-1 text-sm text-gray-400">{report.notes}</p>}
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>Source: {report.source}</span>
                    <span>{new Date(report.createdAt).toLocaleString()}</span>
                  </div>
                  {report.status.toLowerCase() === "open" && (
                    <button
                      className="mt-3 rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-100 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleCloseIssue(report.id)}
                      disabled={closingIssueId === report.id}
                    >
                      {closingIssueId === report.id ? "Closing..." : "Close report"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
