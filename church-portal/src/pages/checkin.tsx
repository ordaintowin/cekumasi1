import { useState, useEffect } from "react";
import { Link } from "wouter";
import { CheckCircle, Clock, XCircle, Loader2, QrCode, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const getToken = () => (typeof localStorage !== "undefined" ? localStorage.getItem("token") : null);

type Status = "loading" | "success" | "already" | "closed" | "noauth" | "noservice" | "notmember" | "error";

export default function Checkin() {
  const { user, isLoading: authLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const svc = params.get("svc");
  const serviceId = svc ? parseInt(svc) : null;

  const [status, setStatus] = useState<Status>("loading");
  const [serviceName, setServiceName] = useState("");

  useEffect(() => {
    if (!serviceId || isNaN(serviceId)) { setStatus("noservice"); return; }
    if (authLoading) return; // wait for auth to settle

    if (!user) { setStatus("noauth"); return; }

    const memberId = (user as any).memberId;
    const teenId = (user as any).teenId;
    if (!memberId && !teenId) { setStatus("notmember"); return; }

    const token = getToken();
    setStatus("loading");

    fetch("/api/services/self-checkin", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ serviceId }),
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) {
          if (r.status === 401) setStatus("noauth");
          else if (data.error?.toLowerCase().includes("not active") || data.error?.toLowerCase().includes("closed")) setStatus("closed");
          else setStatus("error");
        } else {
          if (data.serviceName) setServiceName(data.serviceName);
          setStatus(data.alreadyCheckedIn ? "already" : "success");
        }
      })
      .catch(() => setStatus("error"));
  }, [user, authLoading, serviceId]);

  const nextUrl = encodeURIComponent(`/checkin?svc=${serviceId ?? ""}`);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#2d1454] via-[#4c1d95] to-[#3b1a6b] relative overflow-hidden px-4">
      <div
        className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-white font-extrabold text-2xl">Christ Embassy Kumasi 1</h1>
          <p className="text-purple-300 text-sm mt-1">Attendance Check-In</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center space-y-4">

          {/* Loading */}
          {(status === "loading" || authLoading) && (
            <>
              <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto" />
              <p className="font-semibold text-gray-700">Registering your attendance…</p>
              <p className="text-sm text-gray-400">Please wait a moment</p>
            </>
          )}

          {/* Success */}
          {status === "success" && (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Checked In! ✅</p>
              {serviceName && <p className="font-semibold text-purple-700">{serviceName}</p>}
              <p className="text-sm text-gray-500">Your attendance has been recorded. God bless you!</p>
              <Link href="/home">
                <Button className="w-full bg-purple-700 hover:bg-purple-800 text-white mt-2">Go to Home</Button>
              </Link>
            </>
          )}

          {/* Already checked in */}
          {status === "already" && (
            <>
              <CheckCircle className="w-16 h-16 text-blue-400 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Already Checked In</p>
              {serviceName && <p className="font-semibold text-purple-700">{serviceName}</p>}
              <p className="text-sm text-gray-500">You're already registered for this service.</p>
              <Link href="/home">
                <Button className="w-full bg-purple-700 hover:bg-purple-800 text-white mt-2">Go to Home</Button>
              </Link>
            </>
          )}

          {/* Service closed */}
          {status === "closed" && (
            <>
              <Clock className="w-16 h-16 text-orange-400 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Service Closed</p>
              <p className="text-sm text-gray-500">Registration for this service is no longer active.</p>
              <Link href="/home">
                <Button variant="outline" className="w-full mt-2">Go to Home</Button>
              </Link>
            </>
          )}

          {/* Not logged in */}
          {status === "noauth" && (
            <>
              <LogIn className="w-16 h-16 text-purple-500 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Log In to Check In</p>
              <p className="text-sm text-gray-500">Sign in with your membership ID and PIN to register your attendance.</p>
              <Link href={`/login?next=${nextUrl}`}>
                <Button className="w-full bg-purple-700 hover:bg-purple-800 text-white mt-2">
                  <LogIn className="w-4 h-4 mr-2" /> Log In
                </Button>
              </Link>
            </>
          )}

          {/* Admin account — no memberId */}
          {status === "notmember" && (
            <>
              <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Admin Account</p>
              <p className="text-sm text-gray-500">Admin accounts cannot self check-in. Use the Attendance page to register members.</p>
              <Link href="/attendance">
                <Button variant="outline" className="w-full mt-2">Go to Attendance</Button>
              </Link>
            </>
          )}

          {/* No service in URL */}
          {status === "noservice" && (
            <>
              <XCircle className="w-16 h-16 text-red-400 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Invalid QR Code</p>
              <p className="text-sm text-gray-500">This QR code doesn't contain a valid service. Please scan the correct service QR.</p>
              <Link href="/home">
                <Button variant="outline" className="w-full mt-2">Go to Home</Button>
              </Link>
            </>
          )}

          {/* Generic error */}
          {status === "error" && (
            <>
              <XCircle className="w-16 h-16 text-red-400 mx-auto" />
              <p className="text-xl font-extrabold text-gray-900">Something went wrong</p>
              <p className="text-sm text-gray-500">Could not register your attendance. Please try again or contact the team.</p>
              <button
                onClick={() => setStatus("loading")}
                className="text-sm text-purple-600 underline mt-1"
              >
                Try again
              </button>
            </>
          )}
        </div>

        <p className="text-center text-purple-400 text-xs mt-6">Christ Embassy Kumasi 1 — Internal Portal</p>
      </div>
    </div>
  );
}
