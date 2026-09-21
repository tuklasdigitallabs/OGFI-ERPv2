import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OGFI ERP",
  description: "Phase I Core Administration scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ogfi_theme")||"system";var d=t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":t;document.documentElement.dataset.theme=d;document.documentElement.style.colorScheme=d;}catch(e){document.documentElement.dataset.theme="light";}`
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
