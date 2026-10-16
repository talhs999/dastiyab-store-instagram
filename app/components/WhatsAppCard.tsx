"use client";

import { useEffect, useState, useCallback } from "react";

const C = {
  card: "#17181d",
  cardEdge: "#26272e",
  text: "#f5f3ee",
  muted: "#a7a29a",
  red: "#c0392b",
  redSoft: "rgba(192,57,43,.14)",
  green: "#2ecc71",
  greenSoft: "rgba(46,204,113,.12)",
  gold: "#f5b301",
  goldSoft: "rgba(245,179,1,.12)",
  blue: "#3498db",
  blueSoft: "rgba(52,152,219,.12)",
};

const h2: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 15,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: C.muted,
};

export default function WhatsAppCard({
  initialLinked,
  ownerPhone,
}: {
  initialLinked: boolean;
  ownerPhone?: string;
}) {
  const [linked, setLinked] = useState(initialLinked);
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(ownerPhone || null);
  const [loading, setLoading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/status", { cache: "no-store" });
      const data = (await res.json()) as {
        linked?: boolean;
        qrDataUrl?: string;
        phone?: string;
      };
      if (data.linked) {
        setLinked(true);
        setQr(null);
        if (data.phone) setPhone(data.phone);
      } else {
        setLinked(false);
        if (data.qrDataUrl) {
          setQr(data.qrDataUrl);
        }
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!alive) return;
      await fetchStatus();
    };

    run();
    const interval = setInterval(run, linked ? 10000 : 4000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [linked, fetchStatus]);

  const handleManualQr = async () => {
    setManualLoading(true);
    try {
      const data = await fetchStatus();
      if (data && data.qrDataUrl) {
        setQr(data.qrDataUrl);
      }
    } finally {
      setManualLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect WhatsApp session?")) return;
    setLoading(true);
    try {
      await fetch("/api/wa/disconnect", { method: "POST" });
      setLinked(false);
      setQr(null);
      setTimeout(fetchStatus, 1000);
    } catch {
      alert("Failed to disconnect");
    } finally {
      setLoading(false);
    }
  };

  const dot = (color: string) => (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
      }}
    />
  );

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
        <h2 style={h2}>📲 WhatsApp Connection</h2>
        {linked ? (
          <button
            onClick={handleDisconnect}
            disabled={loading}
            style={{
              background: "transparent",
              border: `1px solid ${C.cardEdge}`,
              color: C.muted,
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {loading ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <button
            onClick={handleManualQr}
            disabled={manualLoading}
            style={{
              background: "transparent",
              border: `1px solid ${C.cardEdge}`,
              color: C.gold,
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {manualLoading ? "Loading…" : "🔄 Refresh QR"}
          </button>
        )}
      </div>

      {linked ? (
        <div>
          <div
            style={{
              padding: "14px 16px",
              background: C.greenSoft,
              border: `1px solid rgba(46,204,113,.25)`,
              borderRadius: 10,
              fontSize: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                {dot(C.green)}
                <strong style={{ color: C.green, fontSize: 15 }}>Linked &amp; Active</strong>
              </div>
              {phone && (
                <span style={{ fontSize: 13, color: C.text, fontFamily: "monospace", opacity: 0.85 }}>
                  +{phone}
                </span>
              )}
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              Baileys session connected. Customer orders confirm hotay hi WhatsApp alert aayega.
            </div>
          </div>

          {/* WhatsApp Bot Commands box */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${C.cardEdge}`,
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
              }}
              onClick={() => setShowCommands(!showCommands)}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: C.gold }}>
                💬 Talk to AI via WhatsApp ({showCommands ? "Hide" : "Show Help"})
              </span>
              <span style={{ fontSize: 12, color: C.muted }}>{showCommands ? "▲" : "▼"}</span>
            </div>

            {showCommands && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                <p style={{ margin: "4px 0", color: C.muted }}>
                  Aap apne linked phone se direct message bhej kar AI ko hidayat de sakte hain:
                </p>
                <div style={{ background: "#0e0e11", padding: 10, borderRadius: 8, marginTop: 6 }}>
                  <div>
                    <code style={{ color: C.gold }}>"bhai aaj ads chalaye hain to m10 pe delivery free hai"</code>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <code style={{ color: C.gold }}>"aaj se delivery charges 150 hain"</code>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <code style={{ color: C.gold }}>"offer band kardo"</code> /{" "}
                    <code style={{ color: C.gold }}>"status"</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div
            style={{
              display: "inline-block",
              padding: "6px 14px",
              background: C.redSoft,
              borderRadius: 20,
              fontSize: 13,
              marginBottom: 16,
              border: "1px solid rgba(192,57,43,.2)",
            }}
          >
            {dot(C.red)}
            <strong style={{ color: C.red }}>Not linked — Scan QR below</strong>
          </div>

          {qr ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="WhatsApp pairing QR"
                width={210}
                height={210}
                style={{
                  borderRadius: 12,
                  background: "#fff",
                  padding: 8,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}
              />
              <div
                style={{
                  color: C.text,
                  fontSize: 13,
                  marginTop: 12,
                  lineHeight: 1.6,
                }}
              >
                Mobile WhatsApp kholein → <strong>⋮ (Menu) → Linked devices → Link a device</strong> → Scan karein.
              </div>
            </div>
          ) : (
            <div style={{ padding: "20px 0", color: C.muted, fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
              <div>Generating WhatsApp QR code…</div>
              <button
                onClick={handleManualQr}
                disabled={manualLoading}
                style={{
                  marginTop: 12,
                  background: C.blueSoft,
                  border: `1px solid ${C.blue}`,
                  color: C.blue,
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {manualLoading ? "Loading QR…" : "📲 Click to Load QR"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
