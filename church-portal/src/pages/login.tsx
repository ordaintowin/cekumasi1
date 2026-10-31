import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, MessageSquare, Phone } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // Support ?next= redirect (e.g. from /checkin?svc=xxx)
  const nextPath = new URLSearchParams(window.location.search).get("next") ?? "";

  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [memberId, setMemberId] = useState("");
  const [pin, setPin] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMode, setForgotMode] = useState<"password" | "pin">("password");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMembershipId, setForgotMembershipId] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent" | "support" | "error">("idle");
  const [forgotError, setForgotError] = useState("");

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        login(data.token);
        // Honour ?next= redirect (e.g. from /checkin?svc=xxx) for member/teen accounts
        if (nextPath && nextPath.startsWith("/")) {
          setLocation(nextPath);
          return;
        }
        const roleLevel = data.user?.roleLevel ?? 5;
        const roleSubtype = data.user?.roleSubtype ?? null;
        if (roleLevel === 1) setLocation("/");
        else if (roleLevel === 2) setLocation("/finance");
        else if (roleLevel === 3 && roleSubtype === "pfcc") setLocation("/fellowship");
        else if (roleLevel === 3 && roleSubtype === "first_timers") setLocation("/first-timers");
        else if (roleLevel === 3 && roleSubtype === "pcd") setLocation("/families");
        else if (roleLevel === 3 && roleSubtype === "media") setLocation("/online-portal");
        else if (roleLevel === 3 && roleSubtype === "children") setLocation("/children");
        else if (roleLevel === 3 && roleSubtype === "registration") setLocation("/attendance");
        else setLocation("/home");
      },
      onError: (err: any) => {
        toast({
          title: "Login failed",
          description: err?.message || "Invalid credentials. Please check your ID and PIN.",
          variant: "destructive",
        });
      },
    },
  });

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { username: adminUsername, password: adminPassword } });
  };

  const handleMemberLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { username: memberId, password: pin, loginType: "member_pin" } });
  };

  const openForgotDialog = (mode: "password" | "pin") => {
    setForgotMode(mode);
    setForgotEmail("");
    setForgotMembershipId(mode === "pin" ? memberId : "");
    setForgotStatus("idle");
    setForgotError("");
    setForgotOpen(true);
  };

  const closeForgotDialog = () => {
    setForgotOpen(false);
    setForgotEmail("");
    setForgotMembershipId("");
    setForgotStatus("idle");
    setForgotError("");
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotStatus("sending");
    setForgotError("");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail,
          mode: forgotMode,
          membershipId: forgotMode === "pin" ? forgotMembershipId : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setForgotError(body?.error || "We couldn't send the reset email. Please contact the admin.");
        setForgotStatus("error");
        return;
      }
      setForgotStatus(body?.supportRequired ? "support" : "sent");
    } catch {
      setForgotError("We couldn't send the reset email. Please contact the admin.");
      setForgotStatus("error");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#2d1454] via-[#4c1d95] to-[#3b1a6b] relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 flex items-center justify-center mb-4">
            <img src="/logo.png" alt="Christ Embassy Kumasi 1" className="w-20 h-20 object-contain drop-shadow-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Christ Embassy Kumasi 1</h1>
          <p className="text-purple-200 text-sm mt-1">Church Management Portal</p>
        </div>

        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur">
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-lg text-purple-900">Welcome back</CardTitle>
            <CardDescription>Sign in to access the portal</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="admin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-5 bg-purple-50">
                <TabsTrigger value="admin" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white text-sm">
                  Admin Login
                </TabsTrigger>
                <TabsTrigger value="member" className="data-[state=active]:bg-purple-700 data-[state=active]:text-white text-sm">
                  Member Login
                </TabsTrigger>
              </TabsList>

              <TabsContent value="admin">
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-gray-700">Username</Label>
                    <Input
                      id="username"
                      placeholder="Enter your username"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="border-gray-200 focus:border-purple-400"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-gray-700">Password</Label>
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="border-gray-200 focus:border-purple-400"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Sign In
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => openForgotDialog("password")} className="text-xs text-purple-500 hover:text-purple-700 underline">
                      Forgot password?
                    </button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="member">
                <form onSubmit={handleMemberLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="memberId" className="text-gray-700">Membership ID</Label>
                    <Input
                      id="memberId"
                      placeholder="e.g. CEKSI-XXXXX"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className="border-gray-200 focus:border-purple-400"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pin" className="text-gray-700">4-Digit PIN</Label>
                    <PasswordInput
                      id="pin"
                      inputMode="numeric"
                      placeholder="••••"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="border-gray-200 focus:border-purple-400 text-center tracking-widest text-lg"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Access Portal
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => openForgotDialog("pin")} className="text-xs text-purple-500 hover:text-purple-700 underline">
                      Forgot PIN?
                    </button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-purple-300/60 text-xs mt-6">
          Christ Embassy Kumasi 1 &mdash; Internal Portal
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={(open) => { if (!open) closeForgotDialog(); else setForgotOpen(true); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{forgotMode === "pin" ? "Reset your member PIN" : "Reset your password"}</DialogTitle>
          </DialogHeader>
          {forgotStatus === "sent" || forgotStatus === "support" ? (
            <div className="space-y-4 text-sm text-gray-600">
              <p className={`rounded-lg p-3 ${forgotStatus === "support" ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"}`}>
                {forgotStatus === "support"
                  ? "This email address is not verified, so we did not send a reset link. Contact the admin to confirm your email address and recover your account."
                  : "If this email matches an account, a one-time reset link is on its way. Check your inbox and your spam or junk folder. The link expires in 30 minutes."}
              </p>
              <div className="space-y-2 border-t pt-3">
                <p className="font-medium text-gray-800">Didn&apos;t receive the email? Contact the admin:</p>
                <a
                  href={`https://wa.me/233261827900?text=${encodeURIComponent("Hello, I need help resetting my church portal login.")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp +233 26 182 7900
                </a>
                <a
                  href="tel:+233553722482"
                  className="flex items-center justify-center gap-2 rounded-md border border-purple-300 px-3 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-50"
                >
                  <Phone className="w-4 h-4" /> Call +233 55 372 2482
                </a>
                <a
                  href={`sms:+233553722482?body=${encodeURIComponent("Hello, I need help resetting my church portal login.")}`}
                  className="flex items-center justify-center gap-2 rounded-md border border-purple-200 px-3 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-50"
                >
                  <MessageSquare className="w-4 h-4" /> SMS +233 55 372 2482
                </a>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={closeForgotDialog}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleForgotRequest} className="space-y-4 text-sm text-gray-600">
              <p>Enter the email address saved on your account. We&apos;ll send a secure, one-time reset link.</p>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-medium text-gray-700">Registered email address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
              {forgotMode === "pin" && (
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-membership-id" className="text-xs font-medium text-gray-700">Membership ID (optional)</Label>
                  <Input
                    id="forgot-membership-id"
                    placeholder="e.g. CEKSI-XXXXX"
                    value={forgotMembershipId}
                    onChange={(e) => setForgotMembershipId(e.target.value)}
                    className="text-sm"
                    maxLength={50}
                  />
                  <p className="text-xs text-gray-500">For a teen PIN reset, use the teen&apos;s membership ID and the parent&apos;s registered email.</p>
                </div>
              )}
              {forgotError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{forgotError}</p>}
              <Button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white" disabled={forgotStatus === "sending"}>
                {forgotStatus === "sending" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {forgotStatus === "sending" ? "Sending..." : "Email me a reset link"}
              </Button>
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-gray-600">Didn&apos;t receive an email or can&apos;t use email? Contact the admin:</p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://wa.me/233261827900?text=${encodeURIComponent("Hello, I need help resetting my church portal login.")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1 rounded-md bg-green-600 px-2 py-2 text-xs font-medium text-white hover:bg-green-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                  <a
                    href="tel:+233553722482"
                    className="flex items-center justify-center gap-1 rounded-md border border-purple-300 px-2 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call admin
                  </a>
                </div>
                <p className="mt-1 text-center text-xs text-gray-500">WhatsApp +233 26 182 7900 · Phone/SMS +233 55 372 2482</p>
              </div>
              <button type="button" className="w-full pt-1 text-xs text-gray-400 hover:text-gray-600" onClick={closeForgotDialog}>
                Cancel
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
