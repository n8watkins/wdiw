export type IconProps = {
  name:
    | "chevron"
    | "copy"
    | "download"
    | "external"
    | "trash"
    | "reset"
    | "sliders"
    | "clock"
    | "bar-chart"
    | "eye"
    | "upload";
};

const PATHS: Record<IconProps["name"], string[]> = {
  chevron: ["M6 9l6 6 6-6"],
  copy: ["M8 8h10v10H8z", "M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  external: ["M14 3h7v7", "M10 14 21 3", "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 16h10l1-16", "M10 11v6", "M14 11v6"],
  reset: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v6h6"],
  sliders: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  "bar-chart": ["M3 3v18h18", "M7 16v-4", "M11 16V8", "M15 16v-7", "M19 16v-2"],
  eye: ["M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  upload: ["M12 15V3", "M7 8l5-5 5 5", "M5 21h14"],
};

export function Icon({ name }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
