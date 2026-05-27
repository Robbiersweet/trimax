import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trimax Operations Platform",
    short_name: "Trimax",
    description:
      "Operations, estimating, invoicing, workflow management, and scheduling for R&L Creations and JUST KLEEN.",
    start_url: "/?business=rnl-creations",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f97316",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/trimax-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/trimax-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
