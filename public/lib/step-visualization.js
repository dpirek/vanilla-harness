const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_VISIBLE_STEPS = 6;

function stepVisualizationModel(activity = {}, { active = false, maxSteps = MAX_VISIBLE_STEPS } = {}) {
  const items = Array.isArray(activity.items) ? activity.items : [];
  const visibleItems = items.slice(-Math.max(1, maxSteps));
  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const running = active && !activity.complete;
  const state = running ? "running" : failed > 0 ? "failed" : activity.complete ? "completed" : "idle";
  const summary = [
    `${completed} of ${items.length} steps completed`,
    failed ? `${failed} failed` : "",
    running && activity.current?.label ? `Performing ${activity.current.label}` : "",
  ].filter(Boolean).join("; ");
  return {
    items: visibleItems.map((item, visibleIndex) => ({
      id: item.id || item.key || `${items.length - visibleItems.length + visibleIndex}`,
      label: item.label || "Harness step",
      status: item.status || "idle",
    })),
    omitted: items.length - visibleItems.length,
    state,
    summary: summary || "No harness steps yet",
  };
}

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function createStepVisualization() {
  const visualization = document.createElement("span");
  visualization.className = "stepVisualization";
  visualization.setAttribute("role", "img");
  const svg = svgElement("svg", {
    viewBox: "0 0 96 28",
    focusable: "false",
    "aria-hidden": "true",
  });
  visualization.append(svg);
  return visualization;
}

function appendNodeGlyph(group, status, x, y) {
  if (status === "completed") {
    group.append(svgElement("path", {
      class: "stepVizGlyph",
      d: `M${x - 2.4} ${y}l1.6 1.7 3.3-3.5`,
    }));
  } else if (status === "failed") {
    group.append(
      svgElement("path", { class: "stepVizGlyph", d: `M${x - 2} ${y - 2}l4 4` }),
      svgElement("path", { class: "stepVizGlyph", d: `M${x + 2} ${y - 2}l-4 4` }),
    );
  } else if (status === "running") {
    group.append(svgElement("circle", { class: "stepVizCore", cx: x, cy: y, r: 1.7 }));
  }
}

function updateStepVisualization(visualization, activity, options = {}) {
  const model = stepVisualizationModel(activity, options);
  const svg = visualization.querySelector("svg");
  const width = 96;
  const y = 14;
  const start = 8;
  const end = width - 8;
  const count = model.items.length;
  const positions = model.items.map((_, index) => count === 1
    ? width / 2
    : start + ((end - start) * index) / (count - 1));

  visualization.dataset.state = model.state;
  visualization.setAttribute("aria-label", model.summary);
  svg.replaceChildren();
  const title = svgElement("title");
  title.textContent = model.summary;
  svg.append(title);

  if (count === 0) {
    svg.append(svgElement("path", { class: "stepVizTrack", d: `M${start} ${y}H${end}` }));
    return model;
  }

  for (let index = 1; index < positions.length; index += 1) {
    const targetStatus = model.items[index].status;
    const connectorState = targetStatus === "completed"
      ? "completed"
      : targetStatus === "running" && model.state === "running"
        ? "running"
        : targetStatus === "failed" ? "failed" : "idle";
    svg.append(svgElement("line", {
      class: `stepVizConnector stepVizConnector-${connectorState}`,
      x1: positions[index - 1] + 5,
      y1: y,
      x2: positions[index] - 5,
      y2: y,
    }));
  }

  model.items.forEach((item, index) => {
    const x = positions[index];
    const group = svgElement("g", { class: `stepVizNode stepVizNode-${item.status}` });
    const nodeTitle = svgElement("title");
    nodeTitle.textContent = `${item.label} — ${item.status}`;
    group.append(nodeTitle);
    if (item.status === "running" && model.state === "running") {
      group.append(svgElement("circle", { class: "stepVizPulse", cx: x, cy: y, r: 6 }));
    }
    group.append(svgElement("circle", { class: "stepVizDot", cx: x, cy: y, r: 5 }));
    appendNodeGlyph(group, item.status, x, y);
    svg.append(group);
  });

  if (model.state === "running" && positions.length > 1) {
    const runner = svgElement("circle", { class: "stepVizRunner", cy: y, r: 1.8 });
    runner.append(
      svgElement("animate", {
        attributeName: "cx",
        values: `${positions[0]};${positions.at(-1)}`,
        dur: "1.35s",
        repeatCount: "indefinite",
      }),
      svgElement("animate", {
        attributeName: "opacity",
        values: "0;1;1;0",
        keyTimes: "0;.15;.8;1",
        dur: "1.35s",
        repeatCount: "indefinite",
      }),
    );
    svg.append(runner);
  }
  return model;
}

export {
  createStepVisualization,
  stepVisualizationModel,
  updateStepVisualization,
};
