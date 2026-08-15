[1mdiff --git a/app/layout.tsx b/app/layout.tsx[m
[1mindex 1f63094..0384acd 100644[m
[1m--- a/app/layout.tsx[m
[1m+++ b/app/layout.tsx[m
[36m@@ -1,5 +1,6 @@[m
 import "./globals.css";[m
 import type { Metadata } from "next";[m
[32m+[m[32mimport { SpeedInsights } from "@vercel/speed-insights/next";[m
 [m
 export const metadata: Metadata = {[m
   title: "KPI Collection",[m
[36m@@ -16,7 +17,10 @@[m [mexport default function RootLayout({ children }: { children: React.ReactNode })[m
           rel="stylesheet"[m
         />[m
       </head>[m
[31m-      <body>{children}</body>[m
[32m+[m[32m      <body>[m
[32m+[m[32m        {children}[m
[32m+[m[32m        <SpeedInsights />[m
[32m+[m[32m      </body>[m
     </html>[m
   );[m
 }[m
