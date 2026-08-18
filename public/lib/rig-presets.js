const RIG_EFFECT_KEYS = ["composer", "tools", "mcp", "validation"];

function normalizeRigModelDisplay(value) {
  return value === "synth" ? "synth" : "engine";
}

function normalizeRigComponentState(value = {}, steps = RIG_EFFECT_KEYS) {
  return {
    inputSource: value?.inputSource === "keyboard" ? "keyboard" : "microphone",
    modelDisplay: normalizeRigModelDisplay(value?.modelDisplay),
    effects: Object.fromEntries(
      steps
        .map((step) => String(step || "").trim())
        .filter(Boolean)
        .map((step) => [step, value?.effects?.[step] !== false]),
    ),
  };
}

export {
  normalizeRigComponentState,
};
