// Allotiq design kit (Nikhil · N2). Living style guide: /kit.
// Server-safe entry: client parts ("use client") are imported through here as usual.
// getShellUser is server-only — import it from "@/components/kit/shell-user".
export { AnimatedNumber } from "./animated-number";
export { AppShell, type ShellUser } from "./app-shell";
export { LogoMark, Wordmark } from "./brand";
export { AiChip, ClockChip, RoomCode } from "./chips";
export {
  DITHER_FOREST,
  DITHER_GREEN,
  DitherField,
  pulseAt,
  pulseFrom,
  type DitherFieldProps,
  type Orb,
  type WaveSource,
} from "./dither-field";
export { EmptyState } from "./empty-state";
export { StatusPanel, StatusScreen } from "./status-screen";
export { formatNumber, type NumberFormat } from "./format";
export { Delta, KpiBand, KpiTile, type KpiDelta, type KpiFigure } from "./kpi-tile";
export { NAV, ROLE_HOME, ROLE_LABEL } from "./nav";
export { Panel, TONE_CLASS, type Tone } from "./panel";
export { Placeholder } from "./placeholder";
export { Reveal, RevealText, ScrollWords } from "./reveal";
export { RollLabel } from "./roll-label";
export { SCORE_COMPONENTS, scoreSegments } from "./score";
export { ScoreBar, ScoreReceipt } from "./score-bar";
export { Eyebrow, Headline, PageHeader, SECTION_TONE, Section, type SectionTone } from "./section";
export { STATUS_META, StatusBadge, Tag } from "./status-badge";
export { Ticker, type TickerItem } from "./ticker";
export { DemoControls, DemoDrawer, LiveClock } from "./demo-controls";
export { Countdown, ErrorNote, Loading, Toaster, toast } from "./feedback";
export { ChipToggle, Field, Input, Segmented, Select, Textarea } from "./form";
export { RoomCard, StatusStepper, Timeline, WhyList, WhyNot } from "./request-bits";
export { DayGrid, GridLegend } from "./day-grid";
export { BarList, Heatmap } from "./charts";
