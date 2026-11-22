import React from "react";
import {
  createIconProps,
  getIconComponent,
  ICON_REGISTRY,
  ICON_SIZES,
  ICON_STROKE_WIDTH
} from "./registry.js";

export { ICON_REGISTRY, ICON_SIZES, ICON_STROKE_WIDTH, getIconComponent };

/**
 * Semantic icon component. Every icon in SchoolFlow resolves through the
 * central registry. Decorative icons are hidden from assistive technology;
 * pass `label` or `title` for a meaningful standalone icon.
 */
export function Icon({
  name,
  size = "md",
  strokeWidth = ICON_STROKE_WIDTH,
  className = "",
  label,
  title,
  ...props
}) {
  const resolved = createIconProps({ name, size, strokeWidth, className, label, title });
  const Component = resolved.component;
  return <Component
    size={resolved.size}
    strokeWidth={resolved.strokeWidth}
    className={resolved.className}
    {...resolved.accessibility}
    {...props}
  />;
}

const alias = (name) => {
  const AliasIcon = (props) => <Icon name={name} {...props} />;
  AliasIcon.displayName = `Icon(${name})`;
  return AliasIcon;
};

/**
 * Migration-compatible named exports.
 *
 * Existing JSX keeps its original icon component names and handler props while
 * every render now flows through the central semantic registry. New code should
 * prefer `<Icon name="semantic-name" />` directly.
 */
export const Activity = alias("activity");
export const AlertCircle = alias("overdue");
export const AlertTriangle = alias("warning");
export const Archive = alias("archive");
export const ArrowDownToLine = alias("receive");
export const ArrowLeft = alias("back");
export const ArrowRight = alias("next");
export const ArrowRightLeft = alias("changeStatus");
export const ArrowUpDown = alias("sort");
export const ArrowUpFromLine = alias("issue");
export const ArrowUpRight = alias("trendUpSmall");
export const Award = alias("results");
export const Ban = alias("ban");
export const Banknote = alias("cash");
export const BarChart3 = alias("reports");
export const BedDouble = alias("hostel");
export const Bell = alias("notifications");
export const BellRing = alias("notificationRing");
export const BookOpen = alias("subjects");
export const BookOpenCheck = alias("bookOpenCheck");
export const Boxes = alias("boxes");
export const Building2 = alias("schoolBuilding");
export const Bus = alias("transport");
export const Calendar = alias("date");
export const CalendarCheck = alias("attendance");
export const CalendarClock = alias("timetable");
export const CalendarDays = alias("events");
export const CalendarOff = alias("leave");
export const ChartNoAxesCombined = alias("chartNoAxes");
export const Check = alias("confirm");
export const CheckCheck = alias("markAllRead");
export const CheckCircle2 = alias("success");
export const ChevronDown = alias("expand");
export const CircleDollarSign = alias("finance");
export const ClipboardList = alias("exams");
export const Clock = alias("pending");
export const Copy = alias("copy");
export const CreditCard = alias("payment");
export const Download = alias("download");
export const ExternalLink = alias("external");
export const Eye = alias("view");
export const EyeOff = alias("hide");
export const FileSpreadsheet = alias("spreadsheet");
export const FileText = alias("document");
export const GraduationCap = alias("students");
export const Heart = alias("care");
export const HelpCircle = alias("help");
export const Home = alias("home");
export const Image = alias("image");
export const ImagePlus = alias("uploadImage");
export const Inbox = alias("empty");
export const Info = alias("info");
export const KeyRound = alias("key");
export const Languages = alias("language");
export const LayoutDashboard = alias("dashboard");
export const Library = alias("library");
export const LibraryBig = alias("libraryLarge");
export const Link = alias("link");
export const Loader2 = alias("loading");
export const LoaderCircle = alias("loaderCircle");
export const Lock = alias("password");
export const LogOut = alias("logout");
export const Mail = alias("email");
export const MapPin = alias("location");
export const Megaphone = alias("notices");
export const Menu = alias("menu");
export const MessageSquare = alias("messages");
export const MoreHorizontal = alias("more");
export const Package = alias("inventory");
export const PanelLeftClose = alias("collapseSidebar");
export const PanelLeftOpen = alias("expandSidebar");
export const Paperclip = alias("attachment");
export const Pencil = alias("edit");
export const Plus = alias("add");
export const Presentation = alias("presentation");
export const Printer = alias("print");
export const Receipt = alias("invoices");
export const RefreshCw = alias("refresh");
export const RotateCcw = alias("restore");
export const Save = alias("save");
export const School = alias("school");
export const Search = alias("search");
export const Send = alias("send");
export const Settings = alias("settings");
export const Settings2 = alias("settingsAdvanced");
export const Shield = alias("shield");
export const ShieldCheck = alias("security");
export const SlidersHorizontal = alias("filter");
export const Trash2 = alias("delete");
export const TrendingDown = alias("trendDown");
export const TrendingUp = alias("trendUp");
export const Trophy = alias("achievement");
export const Upload = alias("upload");
export const User = alias("user");
export const UserCircle = alias("profile");
export const UserPlus = alias("addUser");
export const UserRound = alias("userRound");
export const Users = alias("staff");
export const UsersRound = alias("parents");
export const Wallet = alias("fees");
export const WifiOff = alias("offline");
export const X = alias("close");
export const XCircle = alias("error");
