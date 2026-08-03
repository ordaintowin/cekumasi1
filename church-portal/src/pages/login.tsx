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
import { Loader2, MessageCircle, MessageSquare } from "lucide-react";

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
  const [forgotName, setForgotName] = useState("");

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
                    <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-purple-500 hover:text-purple-700 underline">
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
                    <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-purple-500 hover:text-purple-700 underline">
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

      <Dialog open={forgotOpen} onOpenChange={(open) => { setForgotOpen(open); if (!open) setForgotName(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forgot Password / PIN?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-600">
            <p>To reset your password or PIN, please enter your full name below and tap a button to send a message.</p>

            <div className="space-y-1.5">
              <Label htmlFor="forgot-name" className="text-xs font-medium text-gray-700">Your Full Name</Label>
              <Input
                id="forgot-name"
                placeholder="e.g. Kofi Mensah"
                value={forgotName}
                onChange={(e) => setForgotName(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="space-y-2 pt-1">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                disabled={!forgotName.trim()}
                onClick={() => {
                  const msg = encodeURIComponent(`Greetings Esteemed, my name is ${forgotName.trim()}, I have forgotten my login details on the church portal. Kindly assist me, thank You.`);
                  window.open(`https://wa.me/233261827900?text=${msg}`, "_blank");
                }}
              >
                <MessageCircle className="w-4 h-4" />
                Send via WhatsApp
              </Button>

              <Button
                variant="outline"
                className="w-full border-purple-300 text-purple-700 hover:bg-purple-50 flex items-center justify-center gap-2"
                disabled={!forgotName.trim()}
                onClick={() => {
                  const msg = encodeURIComponent(`Greetings Esteemed, my name is ${forgotName.trim()}, I have forgotten my login details on the church portal. Kindly assist me, thank You.`);
                  window.open(`sms:+233553722482?body=${msg}`, "_blank");
                }}
              >
                <MessageSquare className="w-4 h-4" />
                Send via SMS (no WhatsApp)
              </Button>
            </div>

            <button
              type="button"
              className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1"
              onClick={() => { setForgotOpen(false); setForgotName(""); }}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
