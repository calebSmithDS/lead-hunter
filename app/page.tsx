"use client";
"use client";

import { useState, useEffect, useMemo } from "react";

export default function Dashboard() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);

  // Filtering & Sorting State
  const [filterType, setFilterType] = useState("All");
  const [filterAudit, setFilterAudit] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch leads");
      const data = await res.json();
      setLeads(data);
    } catch (error) {
      console.error("Error loading leads:", error);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setJobStatus(null);

    try {
      const res = await fetch("/api/jobs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location }),
      });

      if (!res.ok) throw new Error(`Server responded with status: ${res.status}`);

      const data = await res.json();
      
      if (data.success) {
        setJobStatus(`Job initiated! Scraper is running in the background. Check back in a few minutes.`);
        setKeyword(""); 
      } else {
        alert("Something went wrong triggering the job.");
      }
    } catch (error) {
      console.error("Frontend Error:", error);
      alert("Failed to start the scraper.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    setLeads(leads.map(lead => lead.id === id ? { ...lead, status: newStatus } : lead));
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
  };

  // --------------------------------------------------
  // FILTERING & SORTING LOGIC
  // --------------------------------------------------
  const displayedLeads = useMemo(() => {
    let processed = [...leads];

    // 1. Filter by Type (Website / Facebook / Blank)
    if (filterType !== "All") {
      processed = processed.filter(lead => {
        const url = lead.website || "";
        if (filterType === "Blank") return url === "";
        if (filterType === "Facebook") return url.includes("facebook.com");
        if (filterType === "Website") return url !== "" && !url.includes("facebook.com");
        return true;
      });
    }

    // 2. Filter by Audit Status
    if (filterAudit !== "All") {
      processed = processed.filter(lead => lead.auditStatus === filterAudit);
    }

    // 3. Filter by CRM Status
    if (filterStatus !== "All") {
      processed = processed.filter(lead => lead.status === filterStatus);
    }

    // 4. Sorting
    if (sortConfig) {
      processed.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        // Push nulls to the bottom
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return processed;
  }, [leads, filterType, filterAudit, filterStatus, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Helper for rendering sort arrows
  const getSortIcon = (key: string) => {
    if (sortConfig?.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: The Search Form */}
        <div className="col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Lead Hunter</h1>
          <p className="text-gray-500 mb-8">Grid search tradesmen who need a digital upgrade.</p>

          <form onSubmit={handleHunt} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Industries (Comma separated)</label>
              <input
                type="text"
                required
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Plumber, Electrician"
                className="text-gray-900 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Locations (Comma separated)</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Norwood SA, Marion SA"
                className="text-gray-900 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
                isLoading ? "bg-blue-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isLoading ? "Starting Job..." : "Start Bulk Hunt"}
            </button>
          </form>

          {jobStatus && (
            <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 text-sm">
              <p className="font-semibold">Hunt Complete!</p>
              <p>{jobStatus}</p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: The Data Table */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-4rem)]">
          
          {/* Table Header & Refresh Button */}
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-4">
            <h2 className="font-semibold text-gray-800">Database Records ({displayedLeads.length})</h2>
            
            {/* Filter Controls */}
            <div className="flex flex-wrap gap-2">
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black"
              >
                <option value="All">All Types</option>
                <option value="Website">Website</option>
                <option value="Facebook">Facebook</option>
                <option value="Blank">Blank</option>
              </select>

              <select 
                value={filterAudit} 
                onChange={(e) => setFilterAudit(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black"
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
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-black"
              >
                <option value="All">All CRM Status</option>
                <option value="Uncontacted">Uncontacted</option>
                <option value="Left Voicemail">Left Voicemail</option>
                <option value="Meeting Booked">Meeting Booked</option>
                <option value="Not Interested">Not Interested</option>
              </select>

              <button 
                onClick={fetchLeads}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Scrollable Table Body */}
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse select-none">
              <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('name')}>
                    Business{getSortIcon('name')}
                  </th>
                  <th className="p-4 font-semibold text-gray-700">Phone</th>
                  <th className="p-4 font-semibold text-gray-700">Link</th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('auditStatus')}>
                    Audit{getSortIcon('auditStatus')}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('performanceScore')}>
                    Speed{getSortIcon('performanceScore')}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('seoScore')}>
                    SEO{getSortIcon('seoScore')}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => requestSort('mobileLoadTime')}>
                    Load{getSortIcon('mobileLoadTime')}
                  </th>
                  <th className="p-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 w-40" onClick={() => requestSort('status')}>
                    Status{getSortIcon('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500">
                      No leads match your filters.
                    </td>
                  </tr>
                ) : (
                  displayedLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{lead.name}</div>
                        <div className="text-sm text-gray-500">{lead.suburb}</div>
                      </td>
                      <td className="p-4 text-gray-700">{lead.phone || "N/A"}</td>
                      <td className="p-4">
                        {lead.website ? (
                          <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            {lead.website.includes('facebook') ? 'Facebook' : 'Website'}
                          </a>
                        ) : (
                          <span className="text-gray-400">Blank</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          lead.auditStatus === 'Audited' ? 'bg-green-100 text-green-800' :
                          lead.auditStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                          lead.auditStatus === 'Failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {lead.auditStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        {lead.performanceScore ? (
                          <span className={lead.performanceScore < 50 ? "text-red-600 font-bold" : "text-gray-900"}>
                            {lead.performanceScore}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="p-4 text-gray-700">{lead.seoScore || "-"}</td>
                      <td className="p-4 text-gray-700">{lead.mobileLoadTime ? `${lead.mobileLoadTime}s` : "-"}</td>
                      <td className="p-4">
                        <select 
                          value={lead.status}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
                        >
                          <option value="Uncontacted">Uncontacted</option>
                          <option value="Left Voicemail">Left Voicemail</option>
                          <option value="Meeting Booked">Meeting Booked</option>
                          <option value="Not Interested">Not Interested</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}