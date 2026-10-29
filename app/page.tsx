"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type HuntState = "idle" | "running" | "done" | "failed";

// ─── Subcomponents ────────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
    </span>
  );
}

function ProgressPanel({
  huntState,
  leadsFound,
  keyword,
  location,
  onNewHunt,
  onSyncJob,
  isSyncing,
}: {
  huntState: HuntState;
  leadsFound: number;
  keyword: string;
  location: string;
  onNewHunt: () => void;
  onSyncJob: () => void;
  isSyncing: boolean;
}) {
  if (huntState === "running") {
    return (
      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PulsingDot />
            <span className="font-semibold text-blue-800 text-sm">Hunt In Progress</span>
          </div>
          <button
            onClick={onSyncJob}
            disabled={isSyncing}
            className="text-xs bg-white border border-blue-300 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 disabled:opacity-50 font-medium"
            title="If webhook missed, force-check Outscraper directly"
          >
            {isSyncing ? "Checking..." : "↻ Force Sync"}
          </button>
        </div>

        {/* Big counter */}
        <div className="text-center py-2">
          <p className="text-5xl font-bold text-blue-700 tabular-nums">{leadsFound}</p>
          <p className="text-sm text-blue-600 mt-1">leads saved so far</p>
        </div>

        {/* Indeterminate animated bar */}
        <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-1.5 bg-blue-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] w-1/3" />
        </div>

        {/* Context */}
        <div className="text-xs text-blue-600 space-y-0.5">
          <p><span className="font-medium">Industries:</span> {keyword || "—"}</p>
          <p><span className="font-medium">Locations:</span> {location || "—"}</p>
        </div>

        <p className="text-xs text-blue-500 border-t border-blue-200 pt-3">
          Safe to close this tab — the job keeps running and will resume when you return.
        </p>
      </div>
    );
  }

  if (huntState === "done") {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <span className="font-semibold text-green-800 text-sm">Hunt Complete</span>
        </div>
        <div className="text-center py-1">
          <p className="text-4xl font-bold text-green-700 tabular-nums">{leadsFound}</p>
          <p className="text-sm text-green-600 mt-1">leads saved to your database</p>
        </div>
        <button
          onClick={onNewHunt}
          className="w-full py-2 rounded-lg text-sm font-semibold border border-green-300 text-green-700 hover:bg-green-100 transition-colors"
        >
          Start Another Hunt
        </button>
      </div>
    );
  }

  if (huntState === "failed") {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-red-500 text-lg">✕</span>
          <span className="font-semibold text-red-800 text-sm">Hunt Failed</span>
        </div>
        <p className="text-sm text-red-600">
          Something went wrong. Check your function logs or click Force Sync.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onSyncJob}
            disabled={isSyncing}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-white border border-red-300 text-red-700 hover:bg-red-50"
          >
            {isSyncing ? "Checking..." : "Check Outscraper"}
          </button>
          <button
            onClick={onNewHunt}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [huntState, setHuntState] = useState<HuntState>("idle");
  const [leadsFound, setLeadsFound] = useState(0);
  const [activeKeyword, setActiveKeyword] = useState("");
  const [activeLocation, setActiveLocation] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [auditingLeadId, setAuditingLeadId] = useState<string | null>(null);
  const [isBulkAuditing, setIsBulkAuditing] = useState(false);

  // Filtering & Sorting State
  const [filterType, setFilterType] = useState("All");
  const [filterAudit, setFilterAudit] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch leads");
      setLeads(await res.json());
    } catch (error) {
      console.error("Error loading leads:", error);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      setActiveJobId(jobId);
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/status?jobId=${jobId}`);
          if (!res.ok) return;

          const data = await res.json();
          setLeadsFound(data.leadsCount ?? 0);
          if (data.keyword) setActiveKeyword(data.keyword);
          if (data.location) setActiveLocation(data.location);

          if (data.status === "Done" || data.status === "Failed") {
            stopPolling();
            localStorage.removeItem("activeJobId");
            setHuntState(data.status === "Done" ? "done" : "failed");
            await fetchLeads();
          }
        } catch {
          // Transient network error
        }
      }, 5000);
    },
    [fetchLeads, stopPolling]
  );

  // On mount: load leads and resume any in-progress job
  useEffect(() => {
    fetchLeads();

    const savedJobId = localStorage.getItem("activeJobId");
    if (savedJobId) {
      setHuntState("running");
      startPolling(savedJobId);
    }

    return stopPolling;
  }, [fetchLeads, startPolling, stopPolling]);

  const handleHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    setHuntState("running");
    setLeadsFound(0);
    setActiveKeyword(keyword);
    setActiveLocation(location);
    setKeyword("");

    try {
      const res = await fetch("/api/jobs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      if (data.success) {
        localStorage.setItem("activeJobId", data.jobId);
        startPolling(data.jobId);
      } else {
        setHuntState("failed");
      }
    } catch (error) {
      console.error("Hunt trigger error:", error);
      setHuntState("failed");
    }
  };

  const handleNewHunt = () => {
    setHuntState("idle");
    setLeadsFound(0);
    setActiveKeyword("");
    setActiveLocation("");
    setActiveJobId(null);
  };

  // Force sync from Outscraper if webhook dropped
  const handleForceSync = async () => {
    const idToSync = activeJobId || localStorage.getItem("activeJobId");
    if (!idToSync) return;

    setIsSyncing(true);
    try {
      const res = await fetch("/api/jobs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: idToSync }),
      });
      const data = await res.json();
      if (data.status === "Success") {
        setHuntState("done");
        stopPolling();
        localStorage.removeItem("activeJobId");
        await fetchLeads();
      } else {
        alert(`Outscraper status: ${data.status || "Still in progress"}`);
      }
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual single lead audit
  const handleSingleAudit = async (leadId: string) => {
    setAuditingLeadId(leadId);
    try {
      const res = await fetch("/api/leads/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchLeads();
      } else {
        alert(`Audit failed: ${data.error || "Unknown error"}`);
        await fetchLeads();
      }
    } catch (err: any) {
      alert(`Audit request error: ${err.message}`);
    } finally {
      setAuditingLeadId(null);
    }
  };

  // Manual bulk audit for all failed or pending leads
  const handleBulkAudit = async (statusFilter = "Pending") => {
    setIsBulkAuditing(true);
    try {
      const res = await fetch("/api/leads/audit/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusFilter }),
      });
      const data = await res.json();
      alert(data.message || `Processed ${data.processed} leads.`);
      await fetchLeads();
    } catch (err: any) {
      alert(`Bulk audit failed: ${err.message}`);
    } finally {
      setIsBulkAuditing(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
  };

  // ── Filtering & Sorting ──────────────────────────────────────────────────

  const displayedLeads = useMemo(() => {
    let processed = [...leads];

    if (filterType !== "All") {
      processed = processed.filter((lead) => {
        const url = lead.website || "";
        if (filterType === "Blank") return url === "";
        if (filterType === "Facebook") return url.includes("facebook.com");
        if (filterType === "Website") return url !== "" && !url.includes("facebook.com");
        return true;
      });
    }

    if (filterAudit !== "All") {
      processed = processed.filter((lead) => lead.auditStatus === filterAudit);
    }

    if (filterStatus !== "All") {
      processed = processed.filter((lead) => lead.status === filterStatus);
    }

    if (sortConfig) {
      processed.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return processed;
  }, [leads, filterType, filterAudit, filterStatus, sortConfig]);

  const failedCount = useMemo(() => leads.filter((l) => l.auditStatus === "Failed").length, [leads]);
  const pendingCount = useMemo(() => leads.filter((l) => l.auditStatus === "Pending" && l.website).length, [leads]);

  const requestSort = (key: string) => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const getSortIcon = (key: string) =>
    sortConfig?.key === key ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : "";

  const isRunning = huntState === "running";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── LEFT: Form + Progress Panel ─────────────────────────────────── */}
        <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Lead Hunter</h1>
          <p className="text-gray-500 mb-6">Grid search tradesmen who need a digital upgrade.</p>

          {/* Form — hidden while a job is running */}
          {huntState === "idle" && (
            <form onSubmit={handleHunt} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Industries <span className="text-gray-400 font-normal">(comma separated)</span>
                </label>
                <input
                  type="text"
                  required
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. Plumber, Electrician"
                  className="text-gray-900 w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Locations <span className="text-gray-400 font-normal">(comma separated)</span>
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Norwood SA, Marion SA"
                  className="text-gray-900 w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Start Bulk Hunt
              </button>
            </form>
          )}

          {/* Progress / Result panel */}
          <ProgressPanel
            huntState={huntState}
            leadsFound={leadsFound}
            keyword={activeKeyword}
            location={activeLocation}
            onNewHunt={handleNewHunt}
            onSyncJob={handleForceSync}
            isSyncing={isSyncing}
          />
        </div>

        {/* ── RIGHT: Data Table ─────────────────────────────────────────── */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-4rem)]">

          {/* Table header */}
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-gray-800">
                Database Records <span className="text-gray-500 font-normal">({displayedLeads.length})</span>
              </h2>
              {/* Live indicator — visible while a hunt is running */}
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600 font-medium bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <PulsingDot />
                  Live
                </span>
              )}
            </div>

            {/* Controls & Bulk Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {failedCount > 0 && (
                <button
                  onClick={() => handleBulkAudit("Failed")}
                  disabled={isBulkAuditing}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  title="Retry Google PageSpeed audit on all failed websites"
                >
                  {isBulkAuditing ? "Auditing..." : `Retry Failed (${failedCount})`}
                </button>
              )}

              {pendingCount > 0 && (
                <button
                  onClick={() => handleBulkAudit("Pending")}
                  disabled={isBulkAuditing}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
                  title="Audit pending websites now"
                >
                  {isBulkAuditing ? "Auditing..." : `Audit Pending (${pendingCount})`}
                </button>
              )}

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
              >
                <option value="All">All Types</option>
                <option value="Website">Website</option>
                <option value="Facebook">Facebook</option>
                <option value="Blank">Blank</option>
              </select>

              <select
                value={filterAudit}
                onChange={(e) => setFilterAudit(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
              >
                <option value="All">All Audit Status</option>
                <option value="Audited">Audited</option>
                <option value="Pending">Pending</option>
                <option value="Skipped">Skipped</option>
                <option value="Failed">Failed</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
              >
                <option value="All">All CRM Status</option>
                <option value="Uncontacted">Uncontacted</option>
                <option value="Left Voicemail">Left Voicemail</option>
                <option value="Meeting Booked">Meeting Booked</option>
                <option value="Not Interested">Not Interested</option>
              </select>
            </div>
          </div>

          {/* Scrollable table */}
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse select-none">
              <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort("name")}>
                    Business{getSortIcon("name")}
                  </th>
                  <th className="p-4 font-semibold text-gray-700">Phone</th>
                  <th className="p-4 font-semibold text-gray-700">Link</th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort("auditStatus")}>
                    Audit{getSortIcon("auditStatus")}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort("performanceScore")}>
                    Speed{getSortIcon("performanceScore")}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort("seoScore")}>
                    SEO{getSortIcon("seoScore")}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort("mobileLoadTime")}>
                    Load{getSortIcon("mobileLoadTime")}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 w-40" onClick={() => requestSort("status")}>
                    Status{getSortIcon("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center">
                      <p className="text-gray-400 text-sm">No leads match your filters.</p>
                    </td>
                  </tr>
                ) : (
                  displayedLeads.map((lead) => {
                    const isAuditingThis = auditingLeadId === lead.id;
                    const canAudit = lead.website && !lead.website.includes("facebook.com");

                    return (
                      <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-gray-900">{lead.name}</div>
                          <div className="text-sm text-gray-500">{lead.suburb}</div>
                        </td>
                        <td className="p-4 text-gray-700 text-sm">{lead.phone || "N/A"}</td>
                        <td className="p-4">
                          {lead.website ? (
                            <a
                              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {lead.website.includes("facebook") ? "Facebook" : "Website"}
                            </a>
                          ) : (
                            <span className="text-gray-400 text-sm">Blank</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              lead.auditStatus === "Audited"  ? "bg-green-100 text-green-800"  :
                              lead.auditStatus === "Pending"  ? "bg-yellow-100 text-yellow-800" :
                              lead.auditStatus === "Failed"   ? "bg-red-100 text-red-800"      :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {isAuditingThis ? "Auditing..." : lead.auditStatus}
                            </span>
                            {canAudit && (
                              <button
                                onClick={() => handleSingleAudit(lead.id)}
                                disabled={isAuditingThis}
                                className="text-xs text-gray-400 hover:text-blue-600 p-1 hover:bg-gray-200 rounded transition-colors"
                                title="Run/Retry PageSpeed audit on this website"
                              >
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {lead.performanceScore != null ? (
                            <span className={`font-semibold text-sm ${lead.performanceScore < 50 ? "text-red-600" : "text-gray-800"}`}>
                              {lead.performanceScore}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="p-4 text-sm text-gray-700">{lead.seoScore ?? <span className="text-gray-400">—</span>}</td>
                        <td className="p-4 text-sm text-gray-700">
                          {lead.mobileLoadTime ? `${lead.mobileLoadTime}s` : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="p-4">
                          <select
                            value={lead.status}
                            onChange={(e) => updateStatus(lead.id, e.target.value)}
                            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full p-2"
                          >
                            <option value="Uncontacted">Uncontacted</option>
                            <option value="Left Voicemail">Left Voicemail</option>
                            <option value="Meeting Booked">Meeting Booked</option>
                            <option value="Not Interested">Not Interested</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
