"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import LeadDetailModal, { Lead } from "./components/LeadDetailModal";

// Dynamically import Leaflet Map with SSR disabled (Leaflet requires browser window)
const SpatialMap = dynamic(() => import("./components/SpatialMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm animate-pulse border border-gray-200">
      Loading interactive map...
    </div>
  ),
});

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

        <div className="text-center py-2">
          <p className="text-5xl font-bold text-blue-700 tabular-nums">{leadsFound}</p>
          <p className="text-sm text-blue-600 mt-1">leads saved so far</p>
        </div>

        <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-1.5 bg-blue-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] w-1/3" />
        </div>

        <div className="text-xs text-blue-600 space-y-0.5">
          <p><span className="font-medium">Industry:</span> {keyword || "—"}</p>
          <p><span className="font-medium">Territory:</span> {location || "—"}</p>
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
          className="w-full py-2.5 rounded-lg text-sm font-semibold border border-green-300 text-green-700 hover:bg-green-100 transition-colors"
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
  const [drawnGeoJson, setDrawnGeoJson] = useState<any | null>(null);
  const [mapClearTrigger, setMapClearTrigger] = useState<number>(0);
  const [spatialWarning, setSpatialWarning] = useState<string | null>(null);
  const [isSubmittingSpatial, setIsSubmittingSpatial] = useState(false);

  const [huntState, setHuntState] = useState<HuntState>("idle");
  const [leadsFound, setLeadsFound] = useState(0);
  const [activeKeyword, setActiveKeyword] = useState("");
  const [activeLocation, setActiveLocation] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [auditingLeadId, setAuditingLeadId] = useState<string | null>(null);
  const [isBulkAuditing, setIsBulkAuditing] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Filtering & Sorting State
  const [filterType, setFilterType] = useState("All");
  const [filterAudit, setFilterAudit] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPhone, setFilterPhone] = useState("All");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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

  useEffect(() => {
    fetchLeads();

    const savedJobId = localStorage.getItem("activeJobId");
    if (savedJobId) {
      setHuntState("running");
      startPolling(savedJobId);
    }

    return stopPolling;
  }, [fetchLeads, startPolling, stopPolling]);

  // Spatial Hunt Trigger Handler
  const handleSpatialHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawnGeoJson) {
      alert("Please draw a polygon boundary on the map first to select your search area.");
      return;
    }

    setIsSubmittingSpatial(true);
    setSpatialWarning(null);

    try {
      // 1. PostGIS Spatial Intersection & Deduplication Check
      const spatialRes = await fetch("/api/spatial/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, geojson: drawnGeoJson }),
      });

      const spatialData = await spatialRes.json();

      // Deduplication check: territory already scraped recently
      if (spatialData.duplicate) {
        setSpatialWarning(spatialData.message);
        setIsSubmittingSpatial(false);
        return;
      }

      if (!spatialData.success) {
        alert(spatialData.message || "No postcodes found inside this boundary.");
        setIsSubmittingSpatial(false);
        return;
      }

      // 2. Trigger Outscraper Bulk Job using the matched suburbs list
      const suburbsToScrape = spatialData.matchedSuburbs.slice(0, 15).join(", "); // Sample batch
      setActiveKeyword(keyword);
      setActiveLocation(`${spatialData.suburbCount} suburbs (${spatialData.postcodeCount} postcodes)`);
      setHuntState("running");
      setLeadsFound(0);

      const triggerRes = await fetch("/api/jobs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          location: suburbsToScrape,
        }),
      });

      const triggerData = await triggerRes.json();
      if (triggerData.success) {
        localStorage.setItem("activeJobId", triggerData.jobId);
        startPolling(triggerData.jobId);
        setKeyword("");
        setDrawnGeoJson(null);
        setMapClearTrigger((prev) => prev + 1);
      } else {
        setHuntState("failed");
      }
    } catch (err: any) {
      console.error("Spatial hunt error:", err);
      setHuntState("failed");
    } finally {
      setIsSubmittingSpatial(false);
    }
  };

  const handleNewHunt = () => {
    setHuntState("idle");
    setLeadsFound(0);
    setActiveKeyword("");
    setActiveLocation("");
    setActiveJobId(null);
    setSpatialWarning(null);
    setDrawnGeoJson(null);
    setMapClearTrigger((prev) => prev + 1);
  };

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
        alert(`Audit result: ${data.auditStatus || "Failed"} - ${JSON.stringify(data.errorLog || data.error)}`);
        await fetchLeads();
      }
    } catch (err: any) {
      alert(`Audit request error: ${err.message}`);
    } finally {
      setAuditingLeadId(null);
    }
  };

  const handleBulkAudit = async (statusFilter = "PENDING") => {
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

    if (filterPhone !== "All") {
      processed = processed.filter((lead) => {
        if (filterPhone === "Mobile") return lead.phoneStatus === "VERIFIED_MOBILE";
        if (filterPhone === "Landline") return lead.phoneStatus === "LANDLINE_ONLY";
        return true;
      });
    }

    if (filterAudit !== "All") {
      processed = processed.filter((lead) => {
        const s = (lead.auditStatus || "").toUpperCase();
        if (filterAudit === "Audited") return s === "SUCCESS" || s === "AUDITED";
        if (filterAudit === "Partial") return s === "PARTIAL_FAIL";
        if (filterAudit === "Pending") return s === "PENDING";
        if (filterAudit === "Skipped") return s === "SKIPPED";
        if (filterAudit === "Failed") return s === "FAILED";
        return true;
      });
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
  }, [leads, filterType, filterAudit, filterStatus, filterPhone, sortConfig]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterAudit, filterStatus, filterPhone]);

  // Paginated Window of Leads
  const totalPages = Math.max(1, Math.ceil(displayedLeads.length / pageSize));
  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return displayedLeads.slice(startIndex, startIndex + pageSize);
  }, [displayedLeads, currentPage, pageSize]);

  const failedCount = useMemo(
    () => leads.filter((l) => (l.auditStatus || "").toUpperCase() === "FAILED").length,
    [leads]
  );
  const pendingCount = useMemo(
    () => leads.filter((l) => (l.auditStatus || "").toUpperCase() === "PENDING" && l.website).length,
    [leads]
  );

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
    <main className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-[1700px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ── LEFT COLUMN: Spatial Search & Map (4 cols = 1/3 desktop, stacked on mobile) ── */}
        <div className="col-span-1 lg:col-span-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-fit space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Spatial Lead Hunter</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Draw a polygon over target territories to discover & audit local trades.
            </p>
          </div>

          {huntState === "idle" && (
            <form onSubmit={handleSpatialHunt} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Job Title / Trade
                </label>
                <input
                  type="text"
                  required
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. Plumber, Electrician, Roofer"
                  className="text-gray-900 w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Interactive Territory Map
                  </label>
                  {drawnGeoJson && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ✓ Polygon Ready
                    </span>
                  )}
                </div>

                {/* Leaflet Map with polygon drawing toolbar */}
                <SpatialMap
                  clearTrigger={mapClearTrigger}
                  onPolygonDrawn={(geom) => {
                    setDrawnGeoJson(geom);
                    setSpatialWarning(null);
                  }}
                  onPolygonCleared={() => {
                    setDrawnGeoJson(null);
                    setSpatialWarning(null);
                  }}
                />
              </div>

              {/* Duplicate Overlap Warning */}
              {spatialWarning && (
                <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span>⚠️</span> Territory Scraped Recently
                  </p>
                  <p className="text-amber-800 leading-relaxed">{spatialWarning}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmittingSpatial}
                className={`w-full py-3 rounded-xl font-semibold text-sm text-white transition-all shadow-sm ${
                  isSubmittingSpatial
                    ? "bg-blue-300 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:scale-[0.99]"
                }`}
              >
                {isSubmittingSpatial ? "Calculating PostGIS Boundary..." : "Run Spatial Hunt"}
              </button>
            </form>
          )}

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

        {/* ── RIGHT COLUMN: Data Table (8 cols = 2/3 desktop) ────────────────── */}
        <div className="col-span-1 lg:col-span-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-4rem)]">

          {/* Table header */}
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 gap-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-gray-800 text-sm">
                Database Records <span className="text-gray-500 font-normal">({displayedLeads.length})</span>
              </h2>
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
                  onClick={() => handleBulkAudit("FAILED")}
                  disabled={isBulkAuditing}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  title="Retry audit on all failed websites"
                >
                  {isBulkAuditing ? "Auditing..." : `Retry Failed (${failedCount})`}
                </button>
              )}

              {pendingCount > 0 && (
                <button
                  onClick={() => handleBulkAudit("PENDING")}
                  disabled={isBulkAuditing}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
                  title="Audit pending websites now"
                >
                  {isBulkAuditing ? "Auditing..." : `Audit Pending (${pendingCount})`}
                </button>
              )}

              <select
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                className="text-xs font-medium border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
              >
                <option value="All">All Phones</option>
                <option value="Mobile">📱 Mobiles Only</option>
                <option value="Landline">📞 Landlines Only</option>
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
              >
                <option value="All">All Types</option>
                <option value="Website">Website</option>
                <option value="Facebook">Facebook</option>
                <option value="Blank">Blank</option>
              </select>

              <select
                value={filterAudit}
                onChange={(e) => setFilterAudit(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
              >
                <option value="All">All Audits</option>
                <option value="Audited">Audited (Success)</option>
                <option value="Partial">Partial Fail</option>
                <option value="Pending">Pending</option>
                <option value="Skipped">Skipped</option>
                <option value="Failed">Failed</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black bg-white"
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
            <table className="w-full text-left border-collapse select-none text-sm">
              <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-xs shadow-xs z-10 text-xs text-gray-700">
                <tr className="border-b border-gray-200">
                  <th className="p-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort("name")}>
                    Business{getSortIcon("name")}
                  </th>
                  <th className="p-3 font-semibold">Phone / Mobile</th>
                  <th className="p-3 font-semibold">Site & Tech</th>
                  <th className="p-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort("auditStatus")}>
                    Audit{getSortIcon("auditStatus")}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort("psiPerformanceScore")}>
                    Speed{getSortIcon("psiPerformanceScore")}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort("psiSeoScore")}>
                    SEO{getSortIcon("psiSeoScore")}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => requestSort("psiLcpMs")}>
                    Load{getSortIcon("psiLcpMs")}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:bg-gray-100 w-36" onClick={() => requestSort("status")}>
                    CRM{getSortIcon("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-gray-400">
                      No leads match your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedLeads.map((lead) => {
                    const isAuditingThis = auditingLeadId === lead.id;
                    const canAudit = lead.website && !lead.website.includes("facebook.com");
                    const normalizedAudit = (lead.auditStatus || "").toUpperCase();

                    const isMobile = lead.phoneStatus === "VERIFIED_MOBILE";
                    const isScraped = lead.phoneSource === "SCRAPE";
                    const displayNumber = lead.mobileNumber || lead.phone;

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        {/* Business & Location */}
                        <td className="p-3">
                          <div className="font-medium text-gray-900">{lead.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-500">{lead.suburb}</span>
                            {lead.ownerName && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                👤 {lead.ownerName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Phone / Mobile Enrichment */}
                        <td className="p-3">
                          {displayNumber ? (
                            <div className="space-y-0.5">
                              <div className="font-mono text-xs text-gray-800">{displayNumber}</div>
                              {isMobile ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  📱 Mobile {isScraped && <span className="text-[9px] font-normal">(Scraped)</span>}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                  📞 Landline
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">No phone</span>
                          )}
                        </td>

                        {/* Link & Tech Stack */}
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {lead.website ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline text-xs truncate max-w-[140px] block"
                                >
                                  {lead.website.includes("facebook") ? "Facebook Page" : "Website ↗"}
                                </a>
                              </div>
                              {lead.techStackCms && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                  {lead.techStackCms}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Blank</span>
                          )}
                        </td>

                        {/* Audit Status */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                normalizedAudit === "SUCCESS" || normalizedAudit === "AUDITED"
                                  ? "bg-green-100 text-green-800"
                                  : normalizedAudit === "PARTIAL_FAIL"
                                  ? "bg-amber-100 text-amber-800"
                                  : normalizedAudit === "PENDING"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : normalizedAudit === "FAILED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                              title={lead.auditErrorLog ? JSON.stringify(lead.auditErrorLog) : undefined}
                            >
                              {isAuditingThis
                                ? "Auditing..."
                                : normalizedAudit === "PARTIAL_FAIL"
                                ? "Partial"
                                : normalizedAudit}
                            </span>
                            {canAudit && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSingleAudit(lead.id);
                                }}
                                disabled={isAuditingThis}
                                className="text-xs text-gray-400 hover:text-blue-600 p-0.5 hover:bg-gray-200 rounded transition-colors"
                                title="Run/Retry audit on this website"
                              >
                                ↺
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Performance Score */}
                        <td className="p-3">
                          {lead.psiPerformanceScore != null ? (
                            <span
                              className={`font-semibold text-xs ${
                                lead.psiPerformanceScore < 50
                                  ? "text-red-600 font-bold"
                                  : "text-gray-800"
                              }`}
                            >
                              {lead.psiPerformanceScore}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* SEO Score */}
                        <td className="p-3 text-xs text-gray-700">
                          {lead.psiSeoScore != null ? lead.psiSeoScore : <span className="text-gray-400">—</span>}
                        </td>

                        {/* Mobile Load Time */}
                        <td className="p-3 text-xs text-gray-700">
                          {lead.psiLcpMs != null ? (
                            `${(lead.psiLcpMs / 1000).toFixed(2)}s`
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* CRM Status */}
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={lead.status}
                            onChange={(e) => updateStatus(lead.id, e.target.value)}
                            className="bg-white border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full p-1.5"
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

          {/* Table Pagination Footer */}
          <div className="p-3 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span>Showing</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 font-medium focus:ring-1 focus:ring-blue-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>
                per page • <strong className="text-gray-900 font-semibold">{displayedLeads.length}</strong> total leads
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded border border-gray-300 bg-white font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Previous
              </button>

              <span className="px-2 py-1 font-semibold text-gray-800">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded border border-gray-300 bg-white font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={Boolean(selectedLead)}
        onClose={() => setSelectedLead(null)}
        onUpdateStatus={updateStatus}
      />
    </main>
  );
}
