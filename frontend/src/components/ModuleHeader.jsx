// Shared Phase 4 presentation shell for non-dashboard workspace modules.
// It preserves the existing .page-intro / h1 contract while adding a restrained
// module icon and consistent visual rhythm. No behaviour or data is introduced.
export default function ModuleHeader({ title, description, action, icon: Icon, kicker = "SCHOOLFLOW WORKSPACE" }) {
  return (
    <header className="page-intro module-header">
      <div className="module-header-copy">
        {Icon && <span className="module-header-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>}
        <div className="module-header-text">
          <div className="page-kicker">{kicker}</div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      {action && <div className="intro-action">{action}</div>}
    </header>
  );
}
