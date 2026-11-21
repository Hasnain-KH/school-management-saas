import React from "react";
import { getIconBadgeClassName } from "./registry.js";
import { Icon } from "./icons.jsx";

const BADGE_ICON_SIZE = { 32: "sm", 40: "md", 48: "lg" };

/** Soft-tinted icon container using existing SchoolFlow semantic tokens. */
export default function IconBadge({ name, tone = "neutral", size = 40, className = "", ...props }) {
  const badgeSize = [32, 40, 48].includes(Number(size)) ? Number(size) : 40;
  return <span
    className={getIconBadgeClassName({ tone, size: badgeSize, className })}
    aria-hidden="true"
  >
    <Icon name={name} size={BADGE_ICON_SIZE[badgeSize]} {...props} />
  </span>;
}
