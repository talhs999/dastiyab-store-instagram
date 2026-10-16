"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "@/lib/store";

const C = {
  card: "#17181d",
  cardEdge: "#26272e",
  text: "#f5f3ee",
  muted: "#a7a29a",
  red: "#c0392b",
  redSoft: "rgba(192,57,43,.14)",
  gold: "#f5b301",
  goldSoft: "rgba(245,179,1,.12)",
  green: "#2ecc71",
  greenSoft: "rgba(46,204,113,.12)",
  blue: "#3498db",
  blueSoft: "rgba(52,152,219,.12)",
  bubbleCustomer: "#22242e",
  bubbleAssistant: "#8e2a20",
};

const h2: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 15,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: C.muted,
};

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function LiveChatInbox({
  initialConversations,
}: {
  initialConversations: Conversation[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>(
    initialConversations || []
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialConversations?.[0]?.threadId || null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [checkingDms, setCheckingDms] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Manual Owner Reply state
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // New Simulation Message state
  const [showSimModal, setShowSimModal] = useState(false);
  const [simHandle, setSimHandle] = useState("new_customer");
  const [simText, setSimText] = useState("");
  const [simulating, setSimulating] = useState(false);

  // Auto-poll conversations every 4 seconds
  useEffect(() => {
    let alive = true;
    const fetchConversations = async () => {
      try {
        const res = await fetch("/api/conversations");
        const data = await res.json();
        if (alive && data.ok && Array.isArray(data.conversations)) {
          setConversations(data.conversations);
          if (!selectedThreadId && data.conversations.length > 0) {
            setSelectedThreadId(data.conversations[0].threadId);
          }
        }
      } catch {
        /* ignore network hiccups */
      }
    };

    const interval = setInterval(fetchConversations, 4000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [selectedThreadId]);

  // Trigger manual check for new DMs
  const handleCheckDms = async () => {
    setCheckingDms(true);
    setSyncFeedback(null);
    try {
      const res = await fetch("/api/cron/check-dms");
      const data = await res.json();
      if (data.ok) {
        setSyncFeedback("✅ DMs sync complete! Inbox updated.");
        const convRes = await fetch("/api/conversations");
        const convData = await convRes.json();
        if (convData.ok && convData.conversations) {
          setConversations(convData.conversations);
          if (convData.conversations.length > 0 && !selectedThreadId) {
            setSelectedThreadId(convData.conversations[0].threadId);
          }
        }
      } else {
        setSyncFeedback(`⚠️ Status: ${data.error || "Checked"}`);
      }
    } catch {
      setSyncFeedback("❌ Network error checking DMs.");
    } finally {
      setCheckingDms(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  // Send manual reply as store owner
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThreadId) return;
    setSendingReply(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          threadId: selectedThreadId,
          text: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok && data.conversation) {
        setReplyText("");
        setConversations((prev) =>
          prev.map((c) =>
            c.threadId === data.conversation.threadId ? data.conversation : c
          )
        );
      }
    } catch (e) {
      alert("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  // Simulate customer message
  const handleSimulateMessage = async (customText?: string) => {
    const textToSend = customText || simText;
    if (!textToSend.trim()) return;
    setSimulating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          handle: simHandle.trim() || "customer_test",
          text: textToSend.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok && data.conversation) {
        setSimText("");
        setShowSimModal(false);
        setSelectedThreadId(data.conversation.threadId);
        // Refresh conversations
        const convRes = await fetch("/api/conversations");
        const convData = await convRes.json();
        if (convData.ok && convData.conversations) {
          setConversations(convData.conversations);
        }
      } else {
        alert("Simulation failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Network error simulating message");
    } finally {
      setSimulating(false);
    }
  };

  const filteredConversations = conversations.filter((c) =>
    c.handle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConvo = conversations.find(
    (c) => c.threadId === selectedThreadId
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ ...h2, margin: 0 }}>
            💬 LIVE INSTAGRAM DMS &amp; CHAT HISTORY ({conversations.length})
          </h2>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Real-time customer messages and AI sales replies
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {syncFeedback && (
            <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
              {syncFeedback}
            </span>
          )}

          <button
            onClick={() => setShowSimModal(!showSimModal)}
            style={{
              background: C.goldSoft,
              color: C.gold,
              border: `1px solid ${C.gold}`,
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🧪 {showSimModal ? "Close Test Box" : "Test Customer Chat"}
          </button>

          <button
            onClick={handleCheckDms}
            disabled={checkingDms}
            style={{
              background: checkingDms
                ? "#333"
                : `linear-gradient(135deg, #3498db, #2980b9)`,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: checkingDms ? "wait" : "pointer",
            }}
          >
            {checkingDms ? "Checking Instagram…" : "🔄 Check New DMs Now"}
          </button>
        </div>
      </div>

      {/* Quick Test / Simulation Banner */}
      {showSimModal && (
        <div
          style={{
            background: "rgba(245, 179, 1, 0.05)",
            border: `1px solid rgba(245, 179, 1, 0.3)`,
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: C.gold, marginBottom: 8 }}>
            🧪 Test Customer DM Simulator (AI live reply check karein)
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              type="text"
              placeholder="@customer_username"
              value={simHandle}
              onChange={(e) => setSimHandle(e.target.value)}
              style={{
                width: 180,
                background: "#0e0e12",
                border: `1px solid ${C.cardEdge}`,
                borderRadius: 6,
                color: C.text,
                padding: "6px 10px",
                fontSize: 12,
              }}
            />
            <input
              type="text"
              placeholder="Type customer message (e.g. M10 earbuds price in Karachi?)"
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
              style={{
                flex: 1,
                minWidth: 260,
                background: "#0e0e12",
                border: `1px solid ${C.cardEdge}`,
                borderRadius: 6,
                color: C.text,
                padding: "6px 10px",
                fontSize: 12,
              }}
            />
            <button
              onClick={() => handleSimulateMessage()}
              disabled={simulating}
              style={{
                background: C.gold,
                color: "#000",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: simulating ? "wait" : "pointer",
              }}
            >
              {simulating ? "AI Replying…" : "Send as Customer 🚀"}
            </button>
          </div>

          {/* Quick presets */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.muted }}>Quick Samples:</span>
            {[
              "Bhai M10 earbuds available hain? Karachi delivery charges kya hain?",
              "Wholesale rate kya milega 10 pieces ka?",
              "Romantic flower lipstick set confirm karein. Nazimabad Karachi COD",
              "Portable mini fan ki battery kitni der chalti hai?",
            ].map((sample, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSimText(sample);
                  handleSimulateMessage(sample);
                }}
                disabled={simulating}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${C.cardEdge}`,
                  color: C.muted,
                  borderRadius: 4,
                  padding: "3px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {sample.slice(0, 32)}…
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Two-Pane Chat Container */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 320px) 1fr",
          border: `1px solid ${C.cardEdge}`,
          borderRadius: 10,
          overflow: "hidden",
          minHeight: 480,
          background: "#111216",
        }}
      >
        {/* Left Pane: Threads List */}
        <div
          style={{
            borderRight: `1px solid ${C.cardEdge}`,
            display: "flex",
            flexDirection: "column",
            background: "#14151a",
          }}
        >
          {/* Search Box */}
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.cardEdge}` }}>
            <input
              type="text"
              placeholder="Search customer username…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0a0a0d",
                border: `1px solid ${C.cardEdge}`,
                borderRadius: 6,
                color: C.text,
                padding: "6px 10px",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>

          {/* Conversation List Scrollable */}
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 440 }}>
            {filteredConversations.length === 0 ? (
              <div style={{ padding: "20px 14px", color: C.muted, fontSize: 12, textAlign: "center" }}>
                {searchQuery
                  ? "No matching customer found."
                  : "Koi Instagram conversation abhi nahi aayi. Upar 'Check New DMs' dabayein."}
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.threadId === selectedThreadId;
                const lastMsg = c.messages[c.messages.length - 1];

                return (
                  <div
                    key={c.threadId}
                    onClick={() => setSelectedThreadId(c.threadId)}
                    style={{
                      padding: "12px 14px",
                      borderBottom: `1px solid rgba(255,255,255,0.03)`,
                      cursor: "pointer",
                      background: isSelected ? "rgba(192,57,43,0.18)" : "transparent",
                      borderLeft: isSelected ? `3px solid ${C.red}` : "3px solid transparent",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ color: C.text, fontSize: 13 }}>
                        @{c.handle}
                      </strong>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        {timeAgo(c.updatedAt)}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 240,
                      }}
                    >
                      {lastMsg ? (
                        <span>
                          {lastMsg.role === "assistant" ? "🤖 AI: " : ""}
                          {lastMsg.text}
                        </span>
                      ) : (
                        "No messages"
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          color: C.blue,
                          background: C.blueSoft,
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {c.platform}
                      </span>
                      {c.orderNotified && (
                        <span
                          style={{
                            fontSize: 10,
                            color: C.green,
                            background: C.greenSoft,
                            padding: "1px 5px",
                            borderRadius: 3,
                            fontWeight: 600,
                          }}
                        >
                          📦 Order Confirmed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat Window */}
        <div style={{ display: "flex", flexDirection: "column", background: "#0e0e11" }}>
          {selectedConvo ? (
            <>
              {/* Chat Header */}
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${C.cardEdge}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#14151a",
                }}
              >
                <div>
                  <strong style={{ fontSize: 14, color: C.text }}>
                    @{selectedConvo.handle}
                  </strong>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      textTransform: "uppercase",
                      color: C.blue,
                    }}
                  >
                    via {selectedConvo.platform}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: C.muted }}>
                  {selectedConvo.messages.length} messages
                  {selectedConvo.orderNotified && (
                    <span style={{ color: C.green, marginLeft: 8, fontWeight: 600 }}>
                      ✅ Order Confirmed &amp; WhatsApp Sent
                    </span>
                  )}
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div
                style={{
                  flex: 1,
                  padding: "16px",
                  overflowY: "auto",
                  maxHeight: 380,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {selectedConvo.messages.map((m, idx) => {
                  const isUser = m.role === "user";

                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isUser ? "flex-start" : "flex-end",
                        maxWidth: "80%",
                        alignSelf: isUser ? "flex-start" : "flex-end",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: C.muted,
                          marginBottom: 3,
                          paddingLeft: 2,
                          paddingRight: 2,
                        }}
                      >
                        {isUser ? `@${selectedConvo.handle}` : "Dastiyab Sales Assistant (AI)"}
                      </div>

                      <div
                        style={{
                          background: isUser ? C.bubbleCustomer : C.bubbleAssistant,
                          color: "#fff",
                          padding: "10px 14px",
                          borderRadius: isUser ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                          fontSize: 13,
                          lineHeight: 1.5,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {m.text}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <span style={{ fontSize: 10, color: C.muted, opacity: 0.7 }}>
                          {timeAgo(m.at)}
                        </span>

                        {!isUser && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(m.text);
                              alert("✅ AI Reply copied to clipboard! Apne open Instagram tab mein Ctrl+V karke send kardein.");
                            }}
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              border: `1px solid ${C.cardEdge}`,
                              color: C.gold,
                              borderRadius: 4,
                              padding: "2px 8px",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            📋 Copy for Instagram
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chat Footer: Send Manual Owner Reply */}
              <div
                style={{
                  padding: "10px 14px",
                  borderTop: `1px solid ${C.cardEdge}`,
                  background: "#14151a",
                  display: "flex",
                  gap: 8,
                }}
              >
                <input
                  type="text"
                  placeholder="Customer ko manual reply type karein..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendReply();
                  }}
                  style={{
                    flex: 1,
                    background: "#0a0a0d",
                    border: `1px solid ${C.cardEdge}`,
                    borderRadius: 6,
                    color: C.text,
                    padding: "8px 12px",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyText.trim()}
                  style={{
                    background: C.red,
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: sendingReply || !replyText.trim() ? "default" : "pointer",
                    opacity: sendingReply || !replyText.trim() ? 0.6 : 1,
                  }}
                >
                  {sendingReply ? "Sending…" : "Send Reply 📤"}
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.muted,
                fontSize: 13,
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 32 }}>💬</div>
              <div>👈 Left side se kisi bhi conversation par click karein.</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Customer ke tamam messages aur AI ke live replies yahan show honge.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
