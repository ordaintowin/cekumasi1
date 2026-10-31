import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const mode = params.get("mode") === "pin" ? "pin" : "password";
  const credentialLabel = mode === "pin" ? "PIN" : "password";
  const [credential, setCredential] = useState("");
  const [confirmCredential, setConfirmCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("This reset link is missing or invalid. Request a new one from the login page.");
      return;
    }
    if (credential !== confirmCredential) {
      setError(`${credentialLabel}s do not match.`);
      return;
    }
    if (mode === "pin" && !/^\d{4}$/.test(credential)) {
      setError("Your new PIN must contain exactly 4 digits.");
      return;
    }
    if (mode === "password" && credential.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          mode,
          ...(mode === "pin" ? { newPin: credential } : { newPassword: credential }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error || "We couldn't reset your sign-in details. Request a new link or contact the admin.");
        return;
      }
      setComplete(true);
      setCredential("");
      setConfirmCredential("");
    } catch {
      setError("We couldn't reset your sign-in details. Please try again or contact the admin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#2d1454] via-[#4c1d95] to-[#3b1a6b] px-4 py-8">
      <Card className="w-full max-w-md border-0 bg-white/95 shadow-2xl backdrop-blur">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-purple-900">
            {complete ? "Reset complete" : `Set a new ${credentialLabel}`}
          </CardTitle>
          <CardDescription>
            {complete
              ? "Your sign-in details have been updated."
              : mode === "pin"
                ? "Choose a new 4-digit PIN for your account."
                : "Choose a new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {complete ? (
            <div className="space-y-4">
              <p className="text-center text-sm text-green-700">You can now return to the portal and sign in.</p>
              <Button className="w-full bg-purple-700 text-white hover:bg-purple-800" onClick={() => setLocation("/login")}>
                Go to login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-credential">New {credentialLabel}</Label>
                <PasswordInput
                  id="new-credential"
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                  inputMode={mode === "pin" ? "numeric" : undefined}
                  maxLength={mode === "pin" ? 4 : 128}
                  autoComplete={mode === "pin" ? "new-password" : "new-password"}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-credential">Confirm new {credentialLabel}</Label>
                <PasswordInput
                  id="confirm-credential"
                  value={confirmCredential}
                  onChange={(event) => setConfirmCredential(event.target.value)}
                  inputMode={mode === "pin" ? "numeric" : undefined}
                  maxLength={mode === "pin" ? 4 : 128}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <Button type="submit" className="w-full bg-purple-700 text-white hover:bg-purple-800" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy ? "Updating..." : `Update ${credentialLabel}`}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setLocation("/login")}>
                Back to login
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
