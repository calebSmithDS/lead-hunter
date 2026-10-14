"use client";

import { useState, useEffect } from "react";

export default function Dashboard() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);

  // Fetches leads from your Postgres database
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

  // Load leads on initial page load
  useEffect(() => {
    fetchLeads();
  }, []);

  // The new Asynchronous Trigger
  const handleHunt = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setJobStatus(null);

    try {
      // Pointing to the new trigger route
      const res = await fetch("/api/jobs/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, location }),
      });

      if (!res.ok) throw new Error(`Server responded with status: ${res.status}`);

      const data = await res.json();
      
      if (data.success) {
        setJobStatus(`Job initiated! Scraper is running in the background. Check back in a few minutes.`);
        setKeyword(""); // Clear form for the next hunt
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

  // Updates lead status in the DB
  const updateStatus = async (id: string, newStatus: string) => {
    setLeads(leads.map(lead => lead.id === id ? { ...lead, status: newStatus } : lead));
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      {/* 
        This is the new layout wrapper. 
        It forces 1 column on mobile, and 3 columns on large screens. 
      */}
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: The Search Form (Takes up 1/3 of the screen) */}
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

          {/* Async Success Message */}
          {jobStatus && (
            <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 text-sm">
              <p className="font-semibold">Hunt Complete!</p>
              <p>{jobStatus}</p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: The Data Table (Takes up 2/3 of the screen) */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-4rem)]">
          
          {/* Table Header & Refresh Button */}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <h2 className="font-semibold text-gray-800">Database Records ({leads.length})</h2>
            <button 
              onClick={fetchLeads}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Refresh Table
            </button>
          </div>

          {/* Scrollable Table Body */}
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                <tr className="border-b border-gray-200">
                  <th className="p-4 font-semibold text-gray-700">Business</th>
                  <th className="p-4 font-semibold text-gray-700">Phone</th>
                  <th className="p-4 font-semibold text-gray-700">Reviews</th>
                  <th className="p-4 font-semibold text-gray-700">Link</th>
                  <th className="p-4 font-semibold text-gray-700 w-40">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No leads found. Start a hunt or hit refresh.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{lead.name}</div>
                        <div className="text-sm text-gray-500">{lead.suburb}</div>
                      </td>
                      <td className="p-4 text-gray-700">{lead.phone || "N/A"}</td>
                      <td className="p-4 text-gray-700">{lead.reviewCount}</td>
                      <td className="p-4">
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Facebook</a>
                        ) : (
                          <span className="text-gray-400">Blank</span>
                        )}
                      </td>
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