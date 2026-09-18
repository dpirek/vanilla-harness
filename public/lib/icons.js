const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function bootstrapIcon(name, className = "") {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", `bsIcon ${className}`.trim());
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NAMESPACE, "use");
  use.setAttribute("href", `/vendor/bootstrap-icons/bootstrap-icons.svg#${name}`);
  svg.append(use);
  return svg;
}

export const copyIcon = (className = "copyIcon") => bootstrapIcon("copy", className);
export const modelTestIcon = (className = "modelTestIcon") => bootstrapIcon("speedometer2", className);
export const workspaceExplorerIcon = (className = "workspaceExplorerIcon") => bootstrapIcon("folder2-open", className);
export const newWorkspaceIcon = (className = "workspaceExplorerIcon") => bootstrapIcon("folder-plus", className);
export const microphoneIcon = (className = "microphoneIcon") => bootstrapIcon("mic", className);
export const panelIcon = (className = "dmfuUa_panelIcon") => bootstrapIcon("layout-sidebar", className);
