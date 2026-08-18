function createStateSaveQueue(saveState, onError = () => {}) {
  let pendingState = null;
  let activeSave = null;

  const drain = async () => {
    while (pendingState) {
      const state = pendingState;
      pendingState = null;
      try {
        await saveState(state);
      } catch (error) {
        onError(error);
      }
    }
    activeSave = null;
  };

  return function enqueueStateSave(state) {
    pendingState = { ...(pendingState || {}), ...(state || {}) };
    if (!activeSave) activeSave = drain();
    return activeSave;
  };
}

export { createStateSaveQueue };
