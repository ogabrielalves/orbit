type VirtualLayout = {
  viewportHeight: number;
  itemHeight: number;
};

const defaultLayout: VirtualLayout = { viewportHeight: 600, itemHeight: 0 };

let layout: VirtualLayout = defaultLayout;

export function setVirtualLayout(next: Partial<VirtualLayout>): void {
  layout = { ...layout, ...next };
}

export function resetVirtualLayout(): void {
  layout = defaultLayout;
}

function isScroller(element: Element): boolean {
  return element.hasAttribute("data-virtual-scroll");
}

function isRow(element: Element): boolean {
  return element.tagName === "LI" && element.hasAttribute("data-index");
}

function heightOf(element: Element): number {
  if (isScroller(element)) {
    return layout.viewportHeight;
  }
  return isRow(element) ? layout.itemHeight : 0;
}

function isMeasured(element: Element): boolean {
  return isScroller(element) || isRow(element);
}

function defineSize(property: string, read: (element: HTMLElement) => number): void {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get(this: HTMLElement) {
      return read(this);
    },
  });
}

export function installVirtualLayout(): void {
  defineSize("offsetHeight", heightOf);
  defineSize("clientHeight", heightOf);
  defineSize("scrollHeight", (element) =>
    isScroller(element) ? Number.parseFloat(element.querySelector("ul")?.style.height || "0") : 0,
  );
  defineSize("offsetWidth", (element) => (isMeasured(element) ? 300 : 0));
  defineSize("clientWidth", (element) => (isMeasured(element) ? 300 : 0));
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    const height = heightOf(this);
    return isMeasured(this)
      ? ({ x: 0, y: 0, top: 0, left: 0, right: 300, bottom: height, width: 300, height } as DOMRect)
      : original.call(this);
  };
}
