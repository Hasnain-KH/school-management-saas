import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * Accessible row action menu. The panel is positioned with fixed coordinates so
 * it is never clipped by horizontally scrolling table containers.
 */
export default function RowMenu({ label = "Row actions", items = [] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 208;
      const height = items.length * 38 + 12;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      const openUp = rect.bottom + 6 + height > window.innerHeight && rect.top - height - 6 > 8;
      setPosition({ top: openUp ? rect.top - height - 6 : rect.bottom + 6, left, width });
    };
    place();
    const onPointer = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, items.length]);

  return <>
    <button ref={buttonRef} type="button" className="icon-button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={16} aria-hidden="true" /></button>
    {open && position && <div ref={panelRef} className="row-menu-panel" role="menu" style={{ position: "fixed", top: position.top, left: position.left, right: "auto", width: position.width }}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" className={`menu-item${item.danger ? " menu-item-danger" : ""}`} onClick={() => { setOpen(false); item.onSelect(); }}>{item.icon}<span>{item.label}</span></button>)}
    </div>}
  </>;
}
