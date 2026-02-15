import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";

const pixel = Press_Start_2P({
    weight: "400",
    subsets: ["latin"],
    display: "swap"
});

export const metadata: Metadata = {
    title: "La ruota del divenire",
    description: "Groq + Ruota del Divenire, retro 8-bit UI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="it" className={pixel.className}>
        <body>
        <div className="bg-grid" aria-hidden="true" />
        <div className="bg-vignette" aria-hidden="true" />
        <main className="app-shell">{children}</main>
        </body>
        </html>
    );
}
