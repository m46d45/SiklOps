import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  if (!authEnabled) {
    return <Navigate to="/" />;
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Masuk ke SiklOps</CardTitle>
          <CardDescription>
            Opsional — simulasi tetap bisa dijalankan tanpa akun.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Lanjut dengan {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sign-in nonaktif.</p>
          )}
          <Button asChild variant="ghost" className="w-full">
            <Link to="/">Kembali ke simulasi</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
