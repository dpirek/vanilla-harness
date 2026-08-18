const RIG_EFFECT_KEYS = ["composer", "tools", "mcp", "validation"];
const RIG_MODEL_DISPLAY_MODES = ["engine", "synth"];

function normalizeRigModelDisplay(value) {
  return value === "synth" ? "synth" : "engine";
}

function effectStep(effect) {
  const value = effect?.props?.step || effect?.dataset?.step || "";
  return String(value).trim();
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

function effectStatesFromEffects(effects = []) {
  return Object.fromEntries(
    effects
      .map((effect) => [effectStep(effect), effect?.enabled !== false])
      .filter(([step]) => step),
  );
}

export {
  RIG_EFFECT_KEYS,
  RIG_MODEL_DISPLAY_MODES,
  effectStep,
  effectStatesFromEffects,
  normalizeRigModelDisplay,
  normalizeRigComponentState,
};
