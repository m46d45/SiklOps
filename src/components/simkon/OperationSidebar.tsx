import {
  BarChart3,
  BookOpen,
  BrickWall,
  Cylinder,
  Factory,
  Route,
  Shovel,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  OPERATIONS,
  type OperationId,
  type OperationInfo,
} from "@/lib/simkon/operations";
import { cn } from "@/lib/utils";
import { useUsageSnapshot } from "@/components/simkon/UsageTracker";

/** Simple tower-crane silhouette (lucide has no dedicated crane) */
function TowerCraneIcon({
  className,
  strokeWidth = 1.75,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* mast */}
      <path d="M8 21V5" />
      {/* base */}
      <path d="M5 21h8" />
      {/* jib */}
      <path d="M8 6h12" />
      {/* counter-jib */}
      <path d="M8 6H4" />
      {/* counterweight */}
      <path d="M3 6v2h2V6" />
      {/* trolley + hook */}
      <path d="M16 6v3" />
      <path d="M14.5 9h3" />
      <path d="M16 9v3" />
      <circle cx="16" cy="13" r="0.8" fill="currentColor" stroke="none" />
      {/* cabin */}
      <path d="M7 8h3v2H7z" />
    </svg>
  );
}

type OpIcon = LucideIcon | typeof TowerCraneIcon;

const ICONS: Record<OperationId, OpIcon> = {
  earthmoving: Shovel, // galian
  bricklaying: BrickWall, // pasangan bata
  concreting: Cylinder, // drum / ready-mix
  tower_crane: TowerCraneIcon,
  asphalt_paving: Route,
  precast_plant: Factory,
};

type Props = {
  selected: OperationId;
  onSelect: (id: OperationId) => void;
  onNavigate?: () => void;
  className?: string;
};

export function OperationSidebar({
  selected,
  onSelect,
  onNavigate,
  className,
}: Props) {
  const { stats, ready } = useUsageSnapshot();
  return (
    <nav
      className={cn("flex h-full min-h-0 flex-col", className)}
      aria-label="Navigasi operasi"
    >
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        <p className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Operasi
        </p>
        <p className="mb-3 px-1 text-[11px] leading-relaxed text-muted-foreground">
          Urutan pembelajaran: sederhana → kompleks
        </p>
        <ul className="space-y-1">
          {OPERATIONS.map((op) => (
            <li key={op.id}>
              <OperationItem
                op={op}
                active={selected === op.id}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 shrink-0 space-y-2 border-t border-border pt-4">
        <Link
          to="/statistik"
          onClick={() => onNavigate?.()}
          className={cn(
            "flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-3 text-left",
            "text-foreground transition-[background-color,border-color] duration-[var(--motion-quick)]",
            "hover:border-border hover:bg-muted",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-muted text-muted-foreground">
            <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">Statistik</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {ready
                ? `${stats.uniqueVisitors} pengunjung · ${stats.totalSimulations} simulasi`
                : "Pengunjung & run"}
            </span>
          </span>
        </Link>
        <Link
          to="/manual"
          onClick={() => onNavigate?.()}
          className={cn(
            "flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-3 text-left",
            "text-foreground transition-[background-color,border-color] duration-[var(--motion-quick)]",
            "hover:border-border hover:bg-muted",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-muted text-muted-foreground">
            <BookOpen className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-snug">Manual</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              Panduan umum SiklOps
            </span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

function OperationItem({
  op,
  active,
  onSelect,
}: {
  op: OperationInfo;
  active: boolean;
  onSelect: (id: OperationId) => void;
}) {
  const Icon = ICONS[op.id] ?? Shovel;
  const disabled = !op.available;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect(op.id);
      }}
      className={cn(
        "flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left transition-[background-color,border-color,opacity] duration-[var(--motion-quick)]",
        active && op.available
          ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
          : "border-transparent bg-transparent",
        !active && op.available && "hover:bg-muted text-foreground",
        disabled && "cursor-not-allowed opacity-55",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
          active && op.available
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium leading-snug">{op.shortTitle}</span>
        </span>
        <span
          className={cn(
            "mt-0.5 block text-xs leading-snug",
            active && op.available
              ? "text-primary-foreground/75"
              : "text-muted-foreground",
          )}
        >
          {op.available
            ? op.sidebarBlurb
            : "Segera hadir"}
        </span>
      </span>
    </button>
  );
}
