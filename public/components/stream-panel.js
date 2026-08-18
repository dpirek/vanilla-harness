import BaseComponent from "./base-component.js";

class StreamPanel extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    const streamHeader = this.createElement('div', {
      class: 'streamPanelBody',
      children: [
        this.createElement('div', {
          class: 'streamHeader',
          children: [
            this.createElement('div', {
              children: [
                this.createElement('h2', { textContent: 'Stream' }),
                this.createElement('span', { textContent: 'Live interactions' })
              ]
            }),
            this.createElement('button', {
              id: 'clearEventsButton',
              type: 'button',
              textContent: 'Clear',
              addEventListener: {
                name: 'click',
                handler: () => this.emit('clear-stream')
              }
            })
          ]
        }),
        this.createElement('ol', { id: 'eventList', class: 'eventList' })
      ]
    });

    this.appendChild(streamHeader);
  }
}

customElements.define("stream-panel", StreamPanel);

export default StreamPanel;
