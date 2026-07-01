import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [memberId, setMemberId] = useState("");
  const [pin, setPin] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        login(data.token);
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
                    <Input
                      id="password"
                      type="password"
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
                    <Input
                      id="pin"
                      type="password"
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

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forgot Password / PIN?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>To reset your password or PIN, please contact your <strong>Super Administrator</strong>.</p>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-1.5">
              <p className="text-xs text-purple-700 font-medium">For adult members:</p>
              <p className="text-xs text-purple-600">Your admin can reset your 4-digit PIN from the Members page.</p>
              <p className="text-xs text-purple-700 font-medium mt-1">For teens:</p>
              <p className="text-xs text-purple-600">Your admin can view and reset your PIN from the Teens Church page.</p>
            </div>
            <Button className="w-full bg-purple-700 hover:bg-purple-800 text-white" onClick={() => setForgotOpen(false)}>
              OK, Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
