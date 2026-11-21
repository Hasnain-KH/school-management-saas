import React from "react";
import { getIconButtonProps } from "./registry.js";
import { Icon } from "./icons.jsx";

/**
 * Accessible icon-only button. Caller callbacks and props are forwarded
 * unchanged; only presentation and the required accessible label are added.
 */
export default function IconButton({
  name,
  label,
  title,
  size = 36,
  className = "",
  children,
  ...props
}) {
  const buttonProps = getIconButtonProps({ label, title, size, className });
  return <button {...props} {...buttonProps}>
    {children || <Icon name={name} size={size >= 40 ? "md" : "sm"} />}
  </button>;
}
