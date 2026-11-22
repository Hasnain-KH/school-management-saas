import {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDownToLine, ArrowLeft,
  ArrowRight, ArrowRightLeft, ArrowUpDown, ArrowUpFromLine, ArrowUpRight, Award,
  Ban, Banknote, BarChart3, BedDouble, Bell, BellRing, BookOpen, BookOpenCheck,
  Boxes, Building2, Bus, Calendar, CalendarCheck, CalendarClock, CalendarDays,
  CalendarOff, ChartNoAxesCombined, Check, CheckCheck, CheckCircle2, ChevronDown,
  CircleDollarSign, ClipboardList, Clock, Copy, CreditCard, Download, ExternalLink,
  Eye, EyeOff, FileSpreadsheet, FileText, GraduationCap, Heart, HelpCircle, Home,
  Image, ImagePlus, Inbox, Info, KeyRound, Languages, LayoutDashboard, Library,
  LibraryBig, Link, Loader2, LoaderCircle, Lock, LogOut, Mail, MapPin, Megaphone,
  Menu, MessageSquare, MoreHorizontal, Package, PanelLeftClose, PanelLeftOpen,
  Paperclip, Pencil, Phone, Plus, Presentation, Printer, Receipt, RefreshCw,
  RotateCcw, Save, School, Search, Send, Settings, Settings2, Shield, ShieldCheck,
  SlidersHorizontal, Trash2, TrendingDown, TrendingUp, Trophy, Upload, User,
  UserCircle, UserPlus, UserRound, Users, UsersRound, Wallet, WifiOff, X, XCircle
} from "lucide-react";

/**
 * SchoolFlow's single Lucide import boundary.
 *
 * This file is intentionally free of JSX so the registry can be exercised by
 * the dependency-free Node test suite. React components live in icons.jsx.
 */
export const ICON_STROKE_WIDTH = 1.75;

export const ICON_SIZES = Object.freeze({
  sm: 16,
  md: 18,
  nav: 20,
  lg: 24,
  xl: 32,
  "2xl": 40
});

export const ICON_REGISTRY = Object.freeze({
  // Navigation and identity
  dashboard: LayoutDashboard,
  students: GraduationCap,
  staff: Users,
  parents: UsersRound,
  classes: School,
  subjects: BookOpen,
  timetable: CalendarClock,
  attendance: CalendarCheck,
  exams: ClipboardList,
  results: Award,
  reports: BarChart3,
  fees: Wallet,
  invoices: Receipt,
  library: Library,
  transport: Bus,
  hostel: BedDouble,
  inventory: Package,
  notices: Megaphone,
  messages: MessageSquare,
  events: CalendarDays,
  settings: Settings,
  home: Home,
  notifications: Bell,
  school: School,
  schoolBuilding: Building2,

  // Actions
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  view: Eye,
  hide: EyeOff,
  save: Save,
  search: Search,
  filter: SlidersHorizontal,
  sort: ArrowUpDown,
  download: Download,
  upload: Upload,
  uploadImage: ImagePlus,
  print: Printer,
  copy: Copy,
  refresh: RefreshCw,
  send: Send,
  close: X,
  confirm: Check,
  more: MoreHorizontal,
  back: ArrowLeft,
  next: ArrowRight,
  expand: ChevronDown,
  external: ExternalLink,
  menu: Menu,
  collapseSidebar: PanelLeftClose,
  expandSidebar: PanelLeftOpen,

  // Fields and identity
  profile: UserCircle,
  user: User,
  addUser: UserPlus,
  email: Mail,
  phone: Phone,
  password: Lock,
  key: KeyRound,
  address: MapPin,
  date: Calendar,
  time: Clock,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  image: Image,
  attachment: Paperclip,
  link: Link,
  language: Languages,
  logout: LogOut,
  security: ShieldCheck,

  // Status and trends
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  help: HelpCircle,
  loading: Loader2,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  present: CheckCircle2,
  absent: XCircle,
  late: Clock,
  leave: CalendarOff,
  paid: CheckCircle2,
  pending: Clock,
  overdue: AlertCircle,

  // Money and other
  payment: CreditCard,
  cash: Banknote,
  achievement: Trophy,
  location: MapPin,

  // Migration-compatible entries that preserve prior visual meanings.
  offline: WifiOff,
  activity: Activity,
  archive: Archive,
  receive: ArrowDownToLine,
  changeStatus: ArrowRightLeft,
  issue: ArrowUpFromLine,
  trendUpSmall: ArrowUpRight,
  ban: Ban,
  notificationRing: BellRing,
  bookOpenCheck: BookOpenCheck,
  boxes: Boxes,
  chartNoAxes: ChartNoAxesCombined,
  markAllRead: CheckCheck,
  finance: CircleDollarSign,
  care: Heart,
  empty: Inbox,
  libraryLarge: LibraryBig,
  loaderCircle: LoaderCircle,
  settingsAdvanced: Settings2,
  shield: Shield,
  userRound: UserRound,
  presentation: Presentation,
  restore: RotateCcw
});

/** Resolve an unknown name to HelpCircle instead of rendering nothing. */
export function resolveIconName(name) {
  return Object.prototype.hasOwnProperty.call(ICON_REGISTRY, name) ? name : "help";
}

export function getIconComponent(name) {
  return ICON_REGISTRY[resolveIconName(name)];
}

/** Pure prop builder shared by Icon and its unit tests. */
export function createIconProps({
  name,
  size = "md",
  strokeWidth = ICON_STROKE_WIDTH,
  className = "",
  label,
  title
} = {}) {
  const accessibleName = label || title;
  return {
    component: getIconComponent(name),
    size: typeof size === "number" ? size : (ICON_SIZES[size] || ICON_SIZES.md),
    strokeWidth,
    className: `sf-icon${className ? ` ${className}` : ""}`,
    accessibility: accessibleName
      ? { role: "img", "aria-label": accessibleName }
      : { "aria-hidden": true, focusable: "false" }
  };
}

export function getIconBadgeClassName({ tone = "neutral", size = 40, className = "" } = {}) {
  const badgeSize = [32, 40, 48].includes(Number(size)) ? Number(size) : 40;
  return `icon-badge icon-badge-${tone} icon-badge-${badgeSize}${className ? ` ${className}` : ""}`;
}

export function getIconButtonProps({ label, title, size = 36, className = "" } = {}) {
  if (!label) throw new Error("IconButton requires a label for accessibility.");
  return {
    type: "button",
    className: `icon-action icon-button sf-icon-button${className ? ` ${className}` : ""}`,
    "aria-label": label,
    title: title || label,
    style: { "--icon-button-size": `${size}px` }
  };
}

export const NOTICE_ICON_NAMES = Object.freeze({
  success: "success",
  warning: "warning",
  error: "error",
  info: "info"
});

export function getNoticeIconName(type) {
  return NOTICE_ICON_NAMES[type] || "info";
}

export const CONFIRM_VARIANTS = Object.freeze({
  danger: { icon: "delete", tone: "danger" },
  warning: { icon: "warning", tone: "amber" },
  question: { icon: "help", tone: "primary" },
  success: { icon: "success", tone: "success" },
  error: { icon: "error", tone: "danger" },
  info: { icon: "info", tone: "info" },
  loading: { icon: "loading", tone: "neutral" }
});

export function getConfirmPresentation(variant = "danger") {
  return CONFIRM_VARIANTS[variant] || CONFIRM_VARIANTS.danger;
}
