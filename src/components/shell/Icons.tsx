/** Inline 20px stroke icons. Kept local so the app has no icon dependency. */
import type { CSSProperties } from "react";

type P = { className?: string; style?: CSSProperties };
const base = {
  width: 20, height: 20, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export const IconHome = (p: P) => (<svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>);
export const IconTag = (p: P) => (<svg {...base} {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.4" /></svg>);
export const IconDollar = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M14.5 9.5A2.5 2.5 0 0 0 12 8h-.5a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4H12a2.5 2.5 0 0 1-2.5-1.5" /></svg>);
export const IconUsers = (p: P) => (<svg {...base} {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M17 14.5a6 6 0 0 1 4 5.5" /></svg>);
export const IconTeam = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="7" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>);
export const IconChart = (p: P) => (<svg {...base} {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>);
export const IconBriefcase = (p: P) => (<svg {...base} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>);
export const IconGear = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>);
export const IconClock = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const IconChevron = (p: P) => (<svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>);
export const IconFilter = (p: P) => (<svg {...base} {...p}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>);
export const IconX = (p: P) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconSearch = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconDownload = (p: P) => (<svg {...base} {...p}><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>);
export const IconInfo = (p: P) => (<svg {...base} width={14} height={14} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const IconAlert = (p: P) => (<svg {...base} {...p}><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17h.01" /></svg>);
export const IconCheck = (p: P) => (<svg {...base} {...p}><path d="m4 12 5 5L20 6" /></svg>);
export const IconPrint = (p: P) => (<svg {...base} {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 17h12v4H6z" /></svg>);
export const IconMail = (p: P) => (<svg {...base} {...p}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>);
export const IconArrow = (p: P) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
