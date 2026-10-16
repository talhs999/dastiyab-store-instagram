import { loadCatalog } from "@/lib/catalog";
import {
  getOrders,
  getMeta,
  listConversations,
  getCampaign,
} from "@/lib/store";
import { isWhatsAppLinked } from "@/lib/whatsapp";
import WhatsAppCard from "./components/WhatsAppCard";
import CampaignCard from "./components/CampaignCard";
import CatalogSyncCard from "./components/CatalogSyncCard";
import LiveChatInbox from "./components/LiveChatInbox";

export const dynamic = "force-dynamic";

const C = {
  bg: "#0e0e11",
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
};

const card: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.cardEdge}`,
  borderRadius: 14,
  padding: 18,
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

export default async function Dashboard() {
  const catalog = await loadCatalog();
  const orders = await getOrders(20);
  const convos = await listConversations(50);
  const meta = await getMeta();
  const waLinked = await isWhatsAppLinked();
  const campaign = await getCampaign();

  const inStock = catalog.filter((p) => p.inStock);
  const outOfStock = catalog.filter((p) => !p.inStock);
  const needsReview = catalog.filter((p) => p.needsReview);

  const stat = (label: string, value: string | number, accent: string) => (
    <div style={{ ...card, borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 400px at 50% -100px, ${C.redSoft}, transparent), ${C.bg}`,
        color: C.text,
        padding: "32px 20px 60px",
      }}
    >
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 26,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${C.red}, #8e2a20)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            🛒
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>
              Dastiyab Store{" "}
              <span style={{ color: C.gold, fontWeight: 400 }}>· Sales Agent Hub</span>
            </h1>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              Jo Chahiye, Wahi Dastiyab — Instagram & Facebook DM Agent with WhatsApp alerts
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 12, color: C.muted }}>
            <div>🕐 Last DM check: {timeAgo(meta.lastCheck)}</div>
            <div>🔄 Last price check: {timeAgo(meta.lastSync)}</div>
          </div>
        </header>

        {/* Quick Stats Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {stat("Products In Stock", inStock.length, C.green)}
          {stat("Out of Stock", outOfStock.length, C.red)}
          {stat("Orders Captured", orders.length, C.gold)}
          {stat(
            "Active Campaign",
            campaign.active ? "ON" : "OFF",
            campaign.active ? C.green : C.muted
          )}
        </div>

        {/* Top 2 Action Cards: Active Campaign + WhatsApp Hub */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <CampaignCard initialCampaign={campaign} />
          <WhatsAppCard
            initialLinked={waLinked}
            ownerPhone={process.env.OWNER_WHATSAPP || "923162975195"}
          />
        </div>

        {/* NEW: Live Instagram DM Inbox & Chat History */}
        <div style={{ marginBottom: 22 }}>
          <LiveChatInbox initialConversations={convos} />
        </div>

        {/* Middle Card: Catalog Sync & Price Verification */}
        <div style={{ marginBottom: 22 }}>
          <CatalogSyncCard
            initialLastSync={meta.lastSync}
            totalProducts={catalog.length}
          />
        </div>

        {/* Stock Alerts (if any) */}
        {(outOfStock.length > 0 || needsReview.length > 0) && (
          <section style={{ ...card, marginBottom: 22 }}>
            <h2 style={h2}>⚠️ Stock & Product Alerts</h2>
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {outOfStock.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 12px",
                    background: C.redSoft,
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  <span>{p.name}{p.theme ? ` (${p.theme})` : ""}</span>
                  <span style={{ color: C.red, fontWeight: 600, whiteSpace: "nowrap" }}>
                    Out of stock
                  </span>
                </div>
              ))}
              {needsReview.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 12px",
                    background: C.goldSoft,
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  <span>{p.name} — Rs.{p.price}</span>
                  <span style={{ color: C.gold, fontWeight: 600, whiteSpace: "nowrap" }}>
                    Needs review
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Orders Captured */}
        <section style={card}>
          <h2 style={h2}>📦 Confirmed Orders ({orders.length})</h2>
          {orders.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: "12px 0" }}>
              Koi order confirm nahi hua abhi tak. Jaise hi koi customer DM mein order confirm karega, woh yahan record hoga aur WhatsApp par receive hoga.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, maxHeight: 380, overflowY: "auto" }}>
              {orders.map((o, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${C.cardEdge}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ color: C.text }}>{o.customerName}</strong>
                    <span style={{ color: C.gold, fontWeight: 700 }}>Rs.{o.total}</span>
                  </div>
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    📞 {o.phone} · 📍 {o.city}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                    {o.items.map((i) => `${i.productName} (x${i.qty})`).join(", ")}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6, opacity: 0.75 }}>
                    {timeAgo(o.at)} via {o.platform}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
