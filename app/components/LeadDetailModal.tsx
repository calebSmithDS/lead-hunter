"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  phone?: string | null;
  suburb: string;
  reviewCount: number;
  website?: string | null;
  status: string;

  // Enrichment Fields
  mobileNumber?: string | null;
  phoneStatus?: "PENDING" | "VERIFIED_MOBILE" | "LANDLINE_ONLY" | "UNAVAILABLE" | string;
  phoneSource?: string | null;
  ownerName?: string | null;

  // PageSpeed & Tech Stack
  psiPerformanceScore?: number | null;
  psiAccessibility?: number | null;
  psiBestPractices?: number | null;
  psiSeoScore?: number | null;
  psiLcpMs?: number | null;
  mobileScreenshot?: string | null;
  techStackCms?: string | null;
  auditStatus?: string;
}

interface LeadDetailModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string, newStatus: string) => Promise<void>;
}

// ─── Pitch Template Formatter ─────────────────────────────────────────────────

function generatePitch(lead: Lead): string {
  const greeting = lead.ownerName ? `Hi ${lead.ownerName},` : `Hi team at ${lead.name},`;

  // Scenario A: Has a custom website with audit scores
  if (lead.website && !lead.website.includes("facebook.com")) {
    const perf = lead.psiPerformanceScore ?? "low";
    const loadTime = lead.psiLcpMs ? `${(lead.psiLcpMs / 1000).toFixed(1)}s` : "several seconds";
    const cms = lead.techStackCms ? ` (built with ${lead.techStackCms})` : "";

    return `${greeting}

I came across ${lead.name} while researching trades in ${lead.suburb}.

I ran a quick test and noticed your website${cms} is currently taking ${loadTime} to load on mobile phones, scoring ${perf}/100 on Google's mobile speed index.

Google prioritizes fast mobile sites in local search results, so a slower load time often means missed client inquiries.

We build high-speed, modern websites for local trades that load in under 1 second. Would you be open to a quick 2-minute video breakdown showing how we can speed up your site and help capture more leads?

Best regards,
[Your Name]`;
  }

  // Scenario B: Goldmine (No custom website / Facebook page only)
  return `${greeting}

I was looking for top-rated trades in ${lead.suburb} and noticed ${lead.name} has ${lead.reviewCount} positive Google reviews, but no official website listed.

Most homeowners looking for reliable services check for a mobile-friendly site with your services before making a call.

We specialize in streamlined, high-converting websites for tradesmen designed to turn Google Maps searches directly into phone calls.

Would you be open to taking a look at a custom preview design we put together for ${lead.name}?

Best regards,
[Your Name]`;
}

// ─── Score Pill Helper ────────────────────────────────────────────────────────

function ScoreBadge({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
        <p className="text-[11px] text-gray-500 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-400 mt-0.5">—</p>
      </div>
    );
  }

  const isGood = score >= 90;
  const isOk = score >= 50 && score < 90;

  const colorClass = isGood
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : isOk
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";

  return (
    <div className={`border rounded-xl p-2.5 text-center ${colorClass}`}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="text-xl font-bold mt-0.5 tabular-nums">{score}</p>
    </div>
  );
}

// ─── Main Modal Component ─────────────────────────────────────────────────────

export default function LeadDetailModal({
  lead,
  isOpen,
  onClose,
  onUpdateStatus,
}: LeadDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(lead?.status || "Uncontacted");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Sync internal status state whenever lead changes
  useEffect(() => {
    if (lead) {
      setCurrentStatus(lead.status);
    }
  }, [lead]);

  // Hook 1: Listen for Escape key & lock body scroll while modal is active
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden"; // Prevent background scrolling

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !lead) return null;

  // Handle Clipboard Copy
  const handleCopyPitch = async () => {
    const pitch = generatePitch(lead);
    try {
      await navigator.clipboard.writeText(pitch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  // Handle CRM Status change
  const handleStatusChange = async (newStatus: string) => {
    setCurrentStatus(newStatus);
    setIsUpdatingStatus(true);
    try {
      await onUpdateStatus(lead.id, newStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const isMobile = lead.phoneStatus === "VERIFIED_MOBILE";
  const displayNumber = lead.mobileNumber || lead.phone;
  const hasWebsite = Boolean(lead.website && !lead.website.includes("facebook.com"));

  return (
    // 1. Dark Backdrop: Clicking here closes modal
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      {/* 2. Dialog Container: stopPropagation prevents backdrop close when clicking inside */}
      <div
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col my-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{lead.name}</h2>
              {lead.ownerName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  👤 {lead.ownerName}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {lead.suburb} • {lead.reviewCount} Google Reviews
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-lg leading-none"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 flex-1">
          {/* ── LEFT COLUMN: Visual Viewport Preview (5 cols) ── */}
          <div className="md:col-span-5 flex flex-col justify-start">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Mobile Experience Preview
            </h3>

            {lead.mobileScreenshot ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shadow-inner flex flex-col items-center max-h-[460px]">
                <img
                  src={lead.mobileScreenshot}
                  alt={`${lead.name} mobile view`}
                  className="w-full h-auto object-contain"
                />
              </div>
            ) : (
              <div className="h-72 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
                <span className="text-3xl mb-2">🌐</span>
                <p className="font-semibold text-gray-700 text-sm">
                  {hasWebsite ? "No Screenshot Captured" : "No Custom Website"}
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
                  {hasWebsite
                    ? "Screenshot was not returned during the audit."
                    : "This business has no real website—ideal candidate for a fresh build!"}
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Metrics, Tech Stack, & Pitch Action (7 cols) ── */}
          <div className="md:col-span-7 flex flex-col space-y-6">
            {/* 1. Contact & Link Details */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Contact & Links
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block">Phone</span>
                  {displayNumber ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono font-medium text-gray-900">{displayNumber}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          isMobile
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {isMobile ? "Mobile" : "Landline"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">None available</span>
                  )}
                </div>

                <div>
                  <span className="text-gray-400 block">Website</span>
                  {lead.website ? (
                    <a
                      href={
                        lead.website.startsWith("http")
                          ? lead.website
                          : `https://${lead.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline font-medium mt-0.5 truncate block"
                    >
                      {lead.website.includes("facebook") ? "Facebook Page ↗" : "Visit Website ↗"}
                    </a>
                  ) : (
                    <span className="text-gray-400">No website</span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. PageSpeed & Tech Stack Data */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Audit Metrics
                </h4>
                {lead.techStackCms && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    🛠️ {lead.techStackCms}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                <ScoreBadge label="Speed" score={lead.psiPerformanceScore} />
                <ScoreBadge label="Accessibility" score={lead.psiAccessibility} />
                <ScoreBadge label="Best Practice" score={lead.psiBestPractices} />
                <ScoreBadge label="SEO" score={lead.psiSeoScore} />
              </div>

              {lead.psiLcpMs != null && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Largest Contentful Paint (Load Time):</span>{" "}
                  <span className="font-semibold text-gray-800">
                    {(lead.psiLcpMs / 1000).toFixed(2)}s
                  </span>
                </p>
              )}
            </div>

            {/* 3. CRM Status Update */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block">
                Outreach Pipeline Status
              </label>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isUpdatingStatus}
                className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Uncontacted">Uncontacted</option>
                <option value="Left Voicemail">Left Voicemail</option>
                <option value="Meeting Booked">Meeting Booked</option>
                <option value="Not Interested">Not Interested</option>
              </select>
            </div>

            {/* 4. Pitch Generator & Clipboard Button */}
            <div className="pt-2">
              <button
                onClick={handleCopyPitch}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.99]"
                }`}
              >
                <span>{copied ? "✓" : "📋"}</span>
                <span>{copied ? "Pitch Copied to Clipboard!" : "Copy Personalized Pitch"}</span>
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-1.5">
                Automatically formats a personalized cold outreach message tailored to this lead.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

