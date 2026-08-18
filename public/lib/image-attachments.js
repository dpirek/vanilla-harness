function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews(element, images, onRemove) {
  element.replaceChildren();
  images.forEach((image, index) => {
    const item = document.createElement("div"); item.className = "imagePreview";
    const img = document.createElement("img"); img.src = image.dataUrl; img.alt = image.name;
    const remove = document.createElement("button"); remove.type = "button";
    remove.ariaLabel = `Remove ${image.name}`; remove.textContent = "×";
    remove.addEventListener("click", () => onRemove(index));
    item.append(img, remove); element.append(item);
  });
}

export { readFileAsDataUrl, renderImagePreviews };
