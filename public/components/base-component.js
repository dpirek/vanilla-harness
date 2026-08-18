const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'circle', 'defs', 'ellipse', 'g', 'line', 'lineargradient', 'path', 'pattern',
  'polygon', 'polyline', 'rect', 'stop', 'svg', 'symbol', 'text', 'use'
]);

class BaseComponent extends HTMLElement {
  constructor() {
    super();
  }

  createElement(tag, props) {
    const element = (typeof tag === 'string')
      ? (SVG_TAGS.has(tag.toLowerCase())
          ? document.createElementNS(SVG_NAMESPACE, tag)
          : document.createElement(tag))
      : tag;
  
    if(props) {
      for (let key in props) {
        if(key === 'children') continue;
        if(key === 'addEventListener') continue;
        if(key === 'innerText') continue;
        if(key === 'textContent') continue;
        if(key === 'style') continue;
        element.setAttribute(key, props[key]);
      }
  
      if(props.innerText) element.innerText = props.innerText;
      if(props.textContent !== undefined) element.textContent = props.textContent;
  
      if(props.addEventListener) {
        element.addEventListener(props.addEventListener.name, props.addEventListener.handler);
      }
  
      if(props.children) {
        this.appendChildren(element, props.children);
      }
  
      if(props.style) {
        if (typeof props.style === 'string') {
          element.setAttribute('style', props.style);
        } else {
          for (let key in props.style) {
            element.style[key] = props.style[key];
          }
        }
      }
    }
    
    return element;
  }

  appendChildren(parent, children) {
    children.forEach(child => {
      if (child) {
        parent.appendChild(child);
      } 
    });
  }

  append(element) {
    this.appendChild(element);
  }

  navigateTo(url, event) {
    if (event) {
      event.preventDefault();
    }
    window.history.pushState({}, '', url);
    const navEvent = new PopStateEvent('popstate');
    window.dispatchEvent(navEvent);
  }

  showNoActivityMessage(message = '', type = 'info', duration = 2000) {
    const messageElement = this.createElement('div', {
      class: `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`,
      innerText: message
    });

    this.appendChild(messageElement);

    setTimeout(() => {
      this.removeChild(messageElement);
    }, duration);
  }

  render() {
    // to be implemented by subclasses
  }

  clear() {
    this.replaceChildren();
  }

  refresh() {
    this.clear();
    this.render();
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }
}

export default BaseComponent;
