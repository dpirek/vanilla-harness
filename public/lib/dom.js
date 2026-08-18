function element(tag, { className, text, attrs = {}, children = [] } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  node.append(...children);
  return node;
}

function ensureNodeMounted(node, parent = document.body) {
  if (!node.isConnected) parent.append(node);
  return node;
}

function registerDialogUnmount(host, dialog = host) {
  if (dialog.dataset.unmountOnClose === "true") return dialog;
  dialog.dataset.unmountOnClose = "true";
  dialog.addEventListener("close", () => {
    if (host.isConnected) host.remove();
  });
  return dialog;
}

function showTransientDialog(host, dialog = host, parent = document.body) {
  ensureNodeMounted(host, parent);
  registerDialogUnmount(host, dialog);
  if (!dialog.open) dialog.showModal();
  return dialog;
}

function showTransientDialogHost(host, selector, parent = document.body) {
  ensureNodeMounted(host, parent);
  const dialog = host.querySelector(selector);
  if (!dialog) throw new Error(`Dialog not found for selector: ${selector}`);
  return showTransientDialog(host, dialog, parent);
}

export { element, ensureNodeMounted, showTransientDialog, showTransientDialogHost };
