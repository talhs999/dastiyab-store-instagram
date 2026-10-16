"use client";

import { useState } from "react";
import type { StoreCampaign } from "@/lib/store";

const C = {
  card: "#17181d",
  cardEdge: "#26272e",
  text: "#f5f3ee",
  muted: "#a7a29a",
  gold: "#f5b301",
  goldSoft: "rgba(245,179,1,.12)",
  green: "#2ecc71",
  greenSoft: "rgba(46,204,113,.12)",
  red: "#c0392b",
  redSoft: "rgba(192,57,43,.14)",
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

export default function CampaignCard({
  initialCampaign,
}: {
  initialCampaign: StoreCampaign;
}) {
  const [active, setActive] = useState(initialCampaign.active);
  const [editablePitch, setEditablePitch] = useState(initialCampaign.announcement);
  const [customInstructions, setCustomInstructions] = useState(
    initialCampaign.customInstructions || ""
  );
  const [updatedAt, setUpdatedAt] = useState(initialCampaign.updatedAt);
  const [updatedVia, setUpdatedVia] = useState(initialCampaign.updatedVia);
  const [instructionText, setInstructionText] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [savingPitch, setSavingPitch] = useState(false);
  const [pitchSavedSuccess, setPitchSavedSuccess] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  // 1. Direct Manual Edit of Live Pitch
  const handleSaveDirectPitch = async () => {
    if (!editablePitch.trim()) {
      alert("Pitch text khali nahi ho sakta.");
      return;
    }
    setSavingPitch(true);
    setPitchSavedSuccess(false);
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: true,
          announcement: editablePitch,
          customInstructions: editablePitch,
        }),
      });
      const data = await res.json();
      if (data.ok && data.campaign) {
        setActive(true);
        setUpdatedAt(data.campaign.updatedAt);
        setUpdatedVia("dashboard");
        setPitchSavedSuccess(true);
        setTimeout(() => setPitchSavedSuccess(false), 3500);
      }
    } catch {
      alert("Failed to save pitch.");
    } finally {
      setSavingPitch(false);
    }
  };

  // 2. Natural Language Instruction for AI
  const handleSendInstruction = async (textToSend?: string) => {
    const text = textToSend || instructionText;
    if (!text.trim()) {
      alert("Baraye mehrbani AI ke liye koi instruction ya message likhein.");
      return;
    }
    setSavingAi(true);
    setAiReply(null);
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (data.ok && data.campaign) {
        setActive(data.campaign.active);
        setEditablePitch(data.campaign.announcement);
        setCustomInstructions(data.campaign.customInstructions);
        setUpdatedAt(data.campaign.updatedAt);
        setUpdatedVia(data.campaign.updatedVia);
        setAiReply(data.reply || "Jee bhai, samajh gaya! Nayi instruction update ho gayi hai.");
        setInstructionText("");
      }
    } catch {
      alert("Failed to send instruction to AI.");
    } finally {
      setSavingAi(false);
    }
  };

  const handleToggle = async () => {
    const newActive = !active;
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });
      const data = await res.json();
      if (data.ok && data.campaign) {
        setActive(data.campaign.active);
        setUpdatedAt(data.campaign.updatedAt);
      }
    } catch {
      alert("Failed to toggle status");
    }
  };

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
        <h2 style={h2}>🧠 AI Instructions & Ad Campaigns</h2>
        <div style={{ fontSize: 12, color: C.muted }}>
          Updated via{" "}
          <strong style={{ color: updatedVia === "whatsapp" ? C.green : C.gold }}>
            {updatedVia.toUpperCase()}
          </strong>
        </div>
      </div>

      {/* Active Status Toggle Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: active ? C.greenSoft : C.redSoft,
          border: `1px solid ${active ? "rgba(46,204,113,.25)" : "rgba(192,57,43,.25)"}`,
          padding: "10px 14px",
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <strong style={{ color: active ? C.green : C.red, fontSize: 14 }}>
            {active ? "🟢 AI Campaign is ACTIVE" : "🔴 AI Campaign is OFF"}
          </strong>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {active
              ? "AI yeh offer customers ko DMs mein actively pitch kar raha hai"
              : "Standard catalog rates aur regular delivery active hai"}
          </div>
        </div>
        <button
          onClick={handleToggle}
          type="button"
          style={{
            background: active ? C.green : "#333",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {active ? "Turn OFF" : "Turn ON"}
        </button>
      </div>

      {/* 1. Directly Editable Pitch Box */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>
            ✏️ Current Live Pitch to Customers in DMs (Direct Edit Karein):
          </label>
          {pitchSavedSuccess && (
            <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
              ✅ Saved Successfully!
            </span>
          )}
        </div>
        <textarea
          value={editablePitch}
          onChange={(e) => setEditablePitch(e.target.value)}
          rows={3}
          placeholder="Yahan jo bhi likhenge, AI wohi sentence customers ko DMs mein pitch karega..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0e0e11",
            border: `1px solid ${pitchSavedSuccess ? C.green : C.cardEdge}`,
            borderRadius: 8,
            color: C.text,
            padding: 10,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleSaveDirectPitch}
            disabled={savingPitch}
            style={{
              background: `linear-gradient(135deg, #2ecc71, #27ae60)`,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {savingPitch ? "Saving…" : "💾 Save Changes"}
          </button>
          <span style={{ fontSize: 12, color: C.muted }}>
            Aap upar text mein kisi bhi word ko seedha edit karke Save kar sakte hain!
          </span>
        </div>
      </div>

      {/* 2. Natural Language Instruction Input for AI */}
      <div style={{ borderTop: `1px solid ${C.cardEdge}`, paddingTop: 14, marginBottom: 14 }}>
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            marginBottom: 6,
          }}
        >
          🤖 Ya AI ko Aam Zuban mein Nayi Instruction dein:
        </label>
        <textarea
          value={instructionText}
          onChange={(e) => setInstructionText(e.target.value)}
          rows={2}
          placeholder="e.g. Bhai aaj humne ads chalaye hain to M10 aur P9 headphones pe delivery free rakhni hai baqi sab pe normal..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#0e0e11",
            border: `1px solid ${C.cardEdge}`,
            borderRadius: 8,
            color: C.text,
            padding: 10,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />

        {/* Quick Presets */}
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              handleSendInstruction(
                "Bhai aaj ads chalaye hain to M10 aur P9 headphones pe delivery free kardo baqi items par standard delivery."
              )
            }
            style={{
              background: C.blueSoft,
              border: `1px solid rgba(52,152,219,.3)`,
              color: C.blue,
              borderRadius: 6,
              padding: "4px 9px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            🎯 M10 & P9 Free Delivery
          </button>

          <button
            type="button"
            onClick={() =>
              handleSendInstruction(
                "Bhai aaj se Karachi ke tamam orders par delivery bilkul FREE hai!"
              )
            }
            style={{
              background: C.greenSoft,
              border: `1px solid rgba(46,204,113,.3)`,
              color: C.green,
              borderRadius: 6,
              padding: "4px 9px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            🆓 Karachi Free Delivery
          </button>

          <button
            type="button"
            onClick={() =>
              handleSendInstruction(
                "Bhai offer khatam ho gayi hai ab standard catalog rates aur normal delivery rakho."
              )
            }
            style={{
              background: C.redSoft,
              border: `1px solid rgba(192,57,43,.3)`,
              color: C.red,
              borderRadius: 6,
              padding: "4px 9px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            🛑 Offer Band Kardo
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => handleSendInstruction()}
            disabled={savingAi || !instructionText.trim()}
            style={{
              background: `linear-gradient(135deg, #c0392b, #8e2a20)`,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: savingAi || !instructionText.trim() ? "not-allowed" : "pointer",
              opacity: savingAi || !instructionText.trim() ? 0.6 : 1,
            }}
          >
            {savingAi ? "AI samajh raha hai…" : "🚀 Teach AI / Update Instructions"}
          </button>
        </div>
      </div>

      {/* AI Understanding Acknowledgement */}
      {aiReply && (
        <div
          style={{
            marginTop: 10,
            background: "rgba(46,204,113,.1)",
            border: `1px solid rgba(46,204,113,.3)`,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            color: C.text,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: C.green }}>🤖 AI Response:</strong>
          <div style={{ marginTop: 2 }}>{aiReply}</div>
        </div>
      )}
    </section>
  );
}
