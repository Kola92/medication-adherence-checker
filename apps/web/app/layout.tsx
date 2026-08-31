import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SkipLink } from "@/components/SkipLink";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedTrack: Medication Adherence & Interaction Checker",
  description: "Track your medications, get reminders, and check drug interactions.",
};

// Runs before paint, before React hydrates. Reads the same localStorage
// key and fallback logic as theme-context.tsx's first effect, so the
// class applied here matches what ThemeProvider settles on - otherwise
// there's a visible flash of the wrong theme on load, and a React
// hydration mismatch warning since the server-rendered HTML has no class
// but the client would immediately add one.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('medication-adherence-theme');
    var resolved = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SkipLink />
        <ThemeProvider>
          <AuthProvider>
            <main id="main-content">{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
