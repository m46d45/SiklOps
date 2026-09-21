import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { CreatedWithGrokBanner } from "@/components/created-with-grok-banner";
import { SiteFooter } from "@/components/simkon/SiteFooter";
import { UsageTracker } from "@/components/simkon/UsageTracker";
import appCss from "../styles.css?url";

const APP_NAME = "SiklOps";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host
  ? `https://og.grok.me/v1/card.png?host=${encodeURIComponent(host)}&title=${encodeURIComponent(APP_NAME)}`
  : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: `${APP_NAME} — Simulasi siklus operasi konstruksi`,
      },
      {
        name: "description",
        content:
          "SiklOps: simulasi siklus operasi konstruksi (DES). Earthmoving, bricklaying, concreting, tower crane, asphalt paving, precast plant.",
      },
      { name: "theme-color", content: "#1e3a32" },
      { name: "application-name", content: APP_NAME },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  component: RootShell,
});

function RootShell() {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <CreatedWithGrokBanner />
        <AuthProvider>
          <UsageTracker />
          <Outlet />
          <SiteFooter />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
