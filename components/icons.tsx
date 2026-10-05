/**
 * Outline icon set (24px grid, 1.75 stroke, currentColor). Hand-drawn here to keep the
 * project free of an icon dependency. Decorative by default (aria-hidden).
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...rest}>
      {children}
    </svg>
  );
}

/** Brand mark: a document with a pulse line across it. Legible down to 16px. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" fill="#B42336" />
      <path d="M10 6.5h8.5l4.5 4.5v14a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-17.5a1 1 0 0 1 1-1z" fill="#fff" />
      <path d="M18.5 6.5V11H23" fill="none" stroke="#F5C9CF" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11 18h2.6l1.4-3.2 2.2 6 1.5-2.8H21" fill="none" stroke="#B42336" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const IconOverview = (p: P) => <Icon {...p}><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></Icon>;
export const IconTimeline = (p: P) => <Icon {...p}><path d="M7 4v16" /><circle cx="7" cy="7" r="1.6" /><circle cx="7" cy="12" r="1.6" /><circle cx="7" cy="17" r="1.6" /><path d="M11 7h9M11 12h7M11 17h8" /></Icon>;
export const IconConflict = (p: P) => <Icon {...p}><path d="M8 4v10" /><path d="M5 11l3 3 3-3" /><path d="M16 20V10" /><path d="M13 13l3-3 3 3" /></Icon>;
export const IconPill = (p: P) => <Icon {...p}><rect x="3.2" y="8.5" width="17.6" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M9.2 9.2l5.6 5.6" /></Icon>;
export const IconCondition = (p: P) => <Icon {...p}><path d="M3 12h4l2-4 3 9 2.5-6 1.5 1H21" /></Icon>;
export const IconAllergy = (p: P) => <Icon {...p}><path d="M12 3.5l7 2.6v5.4c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6.1z" /><path d="M9.5 12h5" /></Icon>;
export const IconLab = (p: P) => <Icon {...p}><path d="M9.5 3.5h5" /><path d="M10.5 3.5v6L5.6 18a1.7 1.7 0 0 0 1.5 2.5h9.8a1.7 1.7 0 0 0 1.5-2.5l-4.9-8.5v-6" /><path d="M7.8 14.5h8.4" /></Icon>;
export const IconImaging = (p: P) => <Icon {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3.5" /></Icon>;
export const IconVisit = (p: P) => <Icon {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon>;
export const IconProvider = (p: P) => <Icon {...p}><path d="M4 20.5V7.5l8-4 8 4v13" /><path d="M2.5 20.5h19" /><path d="M12 8.5v5M9.5 11h5" /><path d="M9.5 20.5v-3.5h5v3.5" /></Icon>;
export const IconSources = (p: P) => <Icon {...p}><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z" /><path d="M14 3.5v5h5" /><path d="M8.5 13h7M8.5 16.5h5" /></Icon>;
export const IconAsk = (p: P) => <Icon {...p}><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.4A7.5 7.5 0 1 1 20 11.5z" /><path d="M10.2 9.6a2 2 0 0 1 3.8.8c0 1.3-2 1.6-2 2.8" /><path d="M12 15.6h.01" /></Icon>;
export const IconPlus = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconMenu = (p: P) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const IconClose = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconChevronDown = (p: P) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>;
export const IconArrowRight = (p: P) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const IconInfo = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const IconCheck = (p: P) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const IconClock = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const IconUnresolved = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" strokeDasharray="3 2.6" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /></Icon>;
export const IconDocError = (p: P) => <Icon {...p}><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z" /><path d="M14 3.5v5h5" /><path d="M9.5 12.5l5 5M14.5 12.5l-5 5" /></Icon>;
export const IconUpload = (p: P) => <Icon {...p}><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" /></Icon>;
export const IconSearch = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const IconLink = (p: P) => <Icon {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Icon>;
export const IconStart = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 8.5v7M8.5 12h7" /></Icon>;
export const IconStop = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12h7" /></Icon>;
export const IconChange = (p: P) => <Icon {...p}><path d="M4 9h13l-3.5-3.5" /><path d="M20 15H7l3.5 3.5" /></Icon>;
export const IconHospital = (p: P) => <Icon {...p}><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M12 8v8M8 12h8" /></Icon>;
export const IconDiagnosis = (p: P) => <Icon {...p}><path d="M9 3.5h6v3H9z" /><path d="M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="M9 13l2 2 4-4" /></Icon>;
export const IconProcedure = (p: P) => <Icon {...p}><path d="M14.5 4.5l5 5-9.5 9.5H5v-5z" /><path d="M12.5 6.5l5 5" /></Icon>;
