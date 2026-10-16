"use client";

import { useState } from "react";

const C = {
  card: "#17181d",
  cardEdge: "#26272e",
  text: "#f5f3ee",
  muted: "#a7a29a",
  green: "#2ecc71",
  greenSoft: "rgba(46,204,113,.12)",
  gold: "#f5b301",
  goldSoft: "rgba(245,179,1,.12)",
  red: "#c0392b",
  redSoft: "rgba(192,57,43,.14)",
};

const h2: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 15,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: C.muted,
};

export default function CatalogSyncCard({
  initialLastSync,
  totalProducts,
}: {
  initialLastSync?: string;
  totalProducts: number;
}) {
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(initialLastSync);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [changesList, setChangesList] = useState<string[]>([]);

  const handleSync = async () => {
    setLoading(true);
    setResultMessage(null);
    setChangesList([]);
    try {
      const res = await fetch("/api/catalog/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setLastSync(data.lastSync);
        if (data.changesCount === 0) {
          setResultMessage(
            `✅ All ${data.scrapedCount} products checked from dastiyabstore.com. Sab prices verified hain!`
          );
        } else {
          setResultMessage(
            `🔄 Sync complete: ${data.changesCount} change(s) found out of ${data.scrapedCount} products.`
          );
          setChangesList(data.changeList || []);
        }
      } else {
        setResultMessage(`❌ Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setResultMessage("❌ Network error connecting to store sync API.");
    } finally {
      setLoading(false);
    }
  };

  const timeDisplay = lastSync
    ? new Date(lastSync).toLocaleString("en-PK", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.cardEdge}`,
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={h2}>🌐 Website Catalog & Daily Price Sync</h2>
        <span style={{ fontSize: 12, color: C.muted }}>dastiyabstore.com</span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 14px",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${C.cardEdge}`,
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: C.muted }}>Daily Verification Status:</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 2 }}>
            Last checked: <span style={{ color: C.gold }}>{timeDisplay}</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Autopilot schedule: Har roz 03:00 PKT par automated check hota hai
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={loading}
          style={{
            background: loading ? "#333" : `linear-gradient(135deg, #2ecc71, #27ae60)`,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Checking live prices…" : "🔄 Sync & Check Prices Now"}
        </button>
      </div>

      {resultMessage && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background: resultMessage.startsWith("✅") ? C.greenSoft : C.goldSoft,
            color: C.text,
            marginBottom: changesList.length > 0 ? 10 : 0,
          }}
        >
          {resultMessage}
        </div>
      )}

      {changesList.length > 0 && (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Detected Changes:</div>
          {changesList.map((ch, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 13,
                background: "rgba(255,255,255,0.03)",
                padding: "6px 10px",
                borderRadius: 6,
                color: C.text,
              }}
            >
              {ch}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
