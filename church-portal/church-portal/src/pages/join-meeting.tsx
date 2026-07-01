import { useState, useEffect, useRef } from "react";
import { Meeting } from "@/components/Meeting";

interface JoinMeetingProps {
  meetingId: number;
}

export default function JoinMeeting({ meetingId }: JoinMeetingProps) {
  const [phase, setPhase] = useState<"loading" | "form" | "joined" | "done" | "error">("loading");
  const [meetingInfo, setMeetingInfo] = useState<{ id: number; title: string; isActive: boolean; meetingType: string } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [joinedData, setJoinedData] = useState<{ displayName: string; role: string; unmutingAllowed: boolean } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [joining, setJoining] = useState(false);
  const peerIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!meetingId || isNaN(meetingId)) {
      setErrorMsg("Invalid meeting link.");
      setPhase("error");
      return;
    }
    fetch(`/api/conference/${meetingId}/public-info`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErrorMsg(data.error); setPhase("error"); return; }
        if (!data.isActive) {
          setErrorMsg("This meeting is not currently active. Ask the admin to start it and try again.");
          setPhase("error");
          return;
        }
        if (data.meetingType === "restricted") {
          setErrorMsg("This is a private meeting. Contact the meeting admin for access.");
          setPhase("error");
          return;
        }
        setMeetingInfo(data);
        setPhase("form");
      })
      .catch(() => { setErrorMsg("Could not reach the server. Check your internet connection."); setPhase("error"); });
  }, [meetingId]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestName.trim();
    if (!name) return;
    setJoining(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/conference/${meetingId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId: peerIdRef.current, displayName: `Guest ${name}` }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Could not join the meeting."); setJoining(false); return; }
      setJoinedData({ displayName: data.displayName, role: data.role, unmutingAllowed: data.unmutingAllowed ?? true });
      setPhase("joined");
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setJoining(false);
    }
  };

  if (phase === "joined" && joinedData && meetingInfo) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
        <Meeting
          meetingId={meetingInfo.id}
          meetingTitle={meetingInfo.title}
          peerId={peerIdRef.current}
          displayName={joinedData.displayName}
          role={joinedData.role as "guest"}
          minimized={false}
          globalFullScreen={true}
          onLeave={() => setPhase("done")}
        />
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>👋</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1f2937", marginBottom: 8 }}>You've left the meeting</h2>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>
            Thanks for joining! The meeting window has been closed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle}>
      <style>{`
        @keyframes jm-spin { to { transform: rotate(360deg); } }
        .jm-input:focus { border-color: #7c3aed !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.12); }
        .jm-btn:hover:not(:disabled) { background: linear-gradient(135deg,#6d28d9,#5b21b6) !important; transform: translateY(-1px); }
        .jm-btn:active:not(:disabled) { transform: translateY(0); }
      `}</style>

      <div style={cardStyle}>
        {/* Branding */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 68, height: 68, borderRadius: "50%",
            background: "linear-gradient(135deg,#7c3aed,#4c1d95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px", fontSize: 30, boxShadow: "0 8px 24px rgba(124,58,237,0.35)",
          }}>
            🎥
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", letterSpacing: 1.2, textTransform: "uppercase", margin: 0 }}>
            Christ Embassy Kumasi 1
          </p>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, marginBottom: 0 }}>Live Meeting Portal</p>
        </div>

        {phase === "loading" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{
              width: 38, height: 38, border: "3px solid #ede9fe",
              borderTopColor: "#7c3aed", borderRadius: "50%",
              animation: "jm-spin 0.8s linear infinite", margin: "0 auto 14px",
            }} />
            <p style={{ color: "#6b7280", fontSize: 14 }}>Loading meeting info…</p>
          </div>
        )}

        {phase === "error" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14,
              padding: "16px 20px", marginBottom: 20, color: "#dc2626", fontSize: 14, lineHeight: 1.6,
            }}>
              {errorMsg}
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af" }}>
              Contact the meeting organiser for a new invite link.
            </p>
          </div>
        )}

        {phase === "form" && meetingInfo && (
          <form onSubmit={handleJoin}>
            {/* Meeting badge */}
            <div style={{
              background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
              border: "1px solid #ddd6fe", borderRadius: 16,
              padding: "18px 22px", marginBottom: 28, textAlign: "center",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 0 }}>
                You're invited to
              </p>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: "#1f2937", margin: 0, lineHeight: 1.3 }}>
                {meetingInfo.title}
              </h2>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "#dcfce7", color: "#166534", borderRadius: 999,
                padding: "3px 10px", fontSize: 11, fontWeight: 600, marginTop: 10,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "jm-spin 2s linear infinite" }} />
                Live Now
              </span>
            </div>

            {/* Name input */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                Your Name *
              </label>
              <input
                className="jm-input"
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Enter your first name"
                required
                maxLength={40}
                autoFocus
                style={{
                  width: "100%", padding: "13px 16px",
                  border: "2px solid #e5e7eb", borderRadius: 14,
                  fontSize: 15, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s",
                  background: "#fafafa",
                }}
              />
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 7, marginBottom: 0 }}>
                You'll appear as{" "}
                <strong style={{ color: "#7c3aed" }}>
                  Guest {guestName.trim() || "…"}
                </strong>
              </p>
            </div>

            {errorMsg && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
                padding: "11px 16px", marginBottom: 18, color: "#dc2626", fontSize: 13,
              }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="jm-btn"
              disabled={joining || !guestName.trim()}
              style={{
                width: "100%", padding: "15px",
                background: joining || !guestName.trim()
                  ? "#c4b5fd"
                  : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                color: "white", border: "none", borderRadius: 14,
                fontSize: 16, fontWeight: 700,
                cursor: joining || !guestName.trim() ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                boxSizing: "border-box", transition: "transform 0.1s, background 0.15s",
                boxShadow: joining || !guestName.trim() ? "none" : "0 4px 16px rgba(124,58,237,0.35)",
              }}>
              {joining ? (
                <>
                  <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "jm-spin 0.8s linear infinite" }} />
                  Joining…
                </>
              ) : (
                <>📹 Join Meeting</>
              )}
            </button>

            <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", marginTop: 16, lineHeight: 1.6, marginBottom: 0 }}>
              You'll join as a <strong>guest viewer</strong> — you can watch, listen, chat and react.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

const bgStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(135deg,#4c1d95 0%,#7c3aed 55%,#6d28d9 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  borderRadius: 24,
  padding: "40px 36px",
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.1)",
};
