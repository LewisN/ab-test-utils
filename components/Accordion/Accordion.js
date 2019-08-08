import { events, Animation } from '../../utils';

export default class Accordion {
  /**
   * Creates an accordion
   * @param {string} ID Experiment ID
   * @param {array} options.content Array of each section of the accordion
   * @param {string|HTMLElement} options.content.tab Markup or element to go inside the tab
   * @param {string|HTMLElement} options.content.body Markup or element to go inside the body
   * @param {function} options.render Render component on creation (optional)
   * @param {boolean} options.onlyOneOpen When an item is opened close any other opened items (optional)
   * @param {boolean} options.scrollOnOpen Scroll to a tab when an item is opened (optional)
   * @param {boolean} options.navigation Show prev/next buttons on each item (optional)
   * @param {string} options.defaultOpenIndex Index of item to open by default (optional)
   * @param {boolean} options.forceOpenAll Open all items - cannot be closed (optional)
   */
  constructor(ID, options) {
    // Group common settings
    this.cache = {
      ID,
      content: options.content,
      onlyOneOpen: options.onlyOneOpen !== undefined ? options.onlyOneOpen : true,
      scrollOnOpen: options.scrollOnOpen !== undefined ? options.scrollOnOpen : false,
      navigation: options.navigation !== undefined ? options.navigation : false,
      defaultOpenIndex: options.defaultOpenIndex !== undefined ? options.defaultOpenIndex : false,
      forceOpenAll: options.forceOpenAll !== undefined ? options.forceOpenAll : false,
    };

    this.callbacks = {
      beforeOpen: options.beforeOpen || null,
      afterOpen: options.afterOpen || null,
      beforeClose: options.beforeClose || null,
      afterClose: options.afterClose || null,
    };

    this.openClass = `${this.cache.ID}_Accordion__item--open`;

    // Create component
    this.create();
    this.bindEvents();
    if (typeof options.render === 'function') {
      options.render();
    }

    // Expose public methods
    this.open = this.open;
    this.close = this.close;
    this.openAll = this.openAll;
    this.closeAll = this.closeAll;
  }

  /** Create elements */
  create() {
    const { cache, openClass } = this;
    const { defaultOpenIndex, forceOpenAll } = cache;

    // Component
    const component = document.createElement('div');
    component.classList.add(`${cache.ID}_Accordion`);

    if (forceOpenAll) {
      component.classList.add(`${cache.ID}_Accordion--forceOpenAll`);
    }

    /**
     * Create an accordion item for each item in the array
     * @param {object} item Item data
     * @param {string} i Item index
     */
    const createItem = (item, i) => {
      // Item wrap
      const itemWrap = document.createElement('div');
      itemWrap.classList.add(`${cache.ID}_Accordion__item`);

      // Tab
      const itemTab = document.createElement('div');
      itemTab.classList.add(`${cache.ID}_Accordion__itemTab`);

      // Tab content
      if (typeof item.tab === 'string') {
        itemTab.innerHTML = item.tab;
      } else if (typeof item.tab === 'object') {
        itemTab.appendChild(item.tab);
      }

      // Body
      const itemBody = document.createElement('div');
      itemBody.classList.add(`${cache.ID}_Accordion__itemBody`);

      // Body inner
      const itemBodyInner = document.createElement('div');
      itemBodyInner.classList.add(`${cache.ID}_Accordion__itemBodyInner`);

      // Body inner content
      if (typeof item.body === 'string') {
        itemBodyInner.innerHTML = item.body;
      } else if (typeof item.tab === 'object') {
        itemBodyInner.appendChild(item.body);
      }

      // Prev button
      if (cache.navigation && i > 0) {
        const prevButton = document.createElement('div');
        prevButton.classList.add(`${cache.ID}_Accordion__nav`);
        prevButton.classList.add(`${cache.ID}_Accordion__nav--prev`);
        prevButton.innerHTML = 'Prev';
        itemBodyInner.insertAdjacentElement('afterbegin', prevButton);
      }

      // Next button
      if (cache.navigation && i < cache.content.length - 1) {
        const nextButton = document.createElement('div');
        nextButton.classList.add(`${cache.ID}_Accordion__nav`);
        nextButton.classList.add(`${cache.ID}_Accordion__nav--next`);
        nextButton.innerHTML = 'Next';
        itemBodyInner.insertAdjacentElement('beforeEnd', nextButton);
      }

      // Default state
      if (forceOpenAll || defaultOpenIndex === i) {
        itemWrap.classList.add(openClass);
        itemBody.style.display = 'block';
      }

      // Append items
      itemBody.appendChild(itemBodyInner);
      itemWrap.appendChild(itemTab);
      itemWrap.appendChild(itemBody);
      component.appendChild(itemWrap);
    };
    cache.content.forEach(createItem);

    cache.component = component;
    cache.itemElements = component.querySelectorAll(`.${cache.ID}_Accordion__item`);
  }

  /** Add event listeners */
  bindEvents() {
    const { cache, toggle, open } = this;
    const { itemElements, navigation, forceOpenAll } = cache;

    if (!forceOpenAll) {
      for (let i = 0; i < itemElements.length; i += 1) {
        const item = itemElements[i];

        // Toggle state on tab click
        const tab = item.querySelector(`.${cache.ID}_Accordion__itemTab`);
        tab.addEventListener('click', () => {
          toggle.call(this, item, i);
        });

        // Navigation buttons
        if (navigation) {
          const prevButton = item.querySelector(`.${cache.ID}_Accordion__nav--prev`);
          const nextButton = item.querySelector(`.${cache.ID}_Accordion__nav--next`);

          if (prevButton) {
            const prev = itemElements[i - 1];
            prevButton.addEventListener('click', () => {
              open.call(this, prev, i - 1);
            });
          }

          if (nextButton) {
            const next = itemElements[i + 1];
            nextButton.addEventListener('click', () => {
              open.call(this, next, i + 1);
            });
          }
        }
      }
    }
  }

  /** Close all opened items */
  closeAll() {
    const { cache, close } = this;
    const { itemElements } = cache;

    for (let i = 0; i < itemElements.length; i += 1) {
      this.animating = false;
      close.call(this, itemElements[i], false);
    }
  }

  /** Open all closed items */
  openAll() {
    const { cache, open } = this;
    const { itemElements } = cache;

    for (let i = 0; i < itemElements.length; i += 1) {
      this.animating = false;
      open.call(this, itemElements[i], false);
    }
  }

  /**
   * Open an item
   * @param {HTMLElement} item Container of item to open
   * @param {string|boolean} i Index for use in GA events. Set as false for no event
   */
  open(item, i) {
    const { getHeight, scrollTo } = Accordion;
    const {
      cache,
      closeAll,
      openClass,
      animating,
    } = this;
    const instance = this;

    if (cache.onlyOneOpen) {
      closeAll.call(this);
    }

    // Only open if item is closed
    if (!item.classList.contains(openClass) && !animating) {
      instance.animating = true;
      const body = item.querySelector(`.${cache.ID}_Accordion__itemBody`);
      const height = getHeight(body);
      const anim = new Animation({
        elem: body,
        style: 'height',
        unit: 'px',
        from: 0,
        to: height,
        time: 200,
        beforeAnim: () => {
          item.classList.add(openClass);
          body.style.display = 'block';
          body.style.height = '';
        },
        afterAnim: () => {
          instance.animating = false;
          body.style.height = '';

          if (cache.scrollOnOpen) {
            const itemTop = item.getBoundingClientRect().y + window.scrollY;
            scrollTo(itemTop - 2, 800, 'easeInOutQuint');
          }

          // Event tracking
          if (i !== false) {
            events.send(cache.ID, 'Opened accordion', `Index ${i !== undefined ? i : 'unknown'}`);
          }
        },
      });
    }
  }

  /**
   * Close an item
   * @param {HTMLElement} item Container of item to close
   * @param {string|boolean} i Index for use in GA events. Set as false for no event
   */
  close(item, i) {
    const { getHeight } = Accordion;
    const {
      cache,
      openClass,
      animating,
    } = this;
    const instance = this;

    // Only close if item is open
    if (item.classList.contains(openClass) && !animating) {
      instance.animating = true;

      const body = item.querySelector(`.${cache.ID}_Accordion__itemBody`);
      const height = getHeight(body);
      const anim = new Animation({
        elem: body,
        style: 'height',
        unit: 'px',
        from: height,
        to: 0,
        time: 200,
        afterAnim: () => {
          instance.animating = false;
          item.classList.remove(openClass);
          body.style.display = 'none';
          body.style.height = '';

          // Event tracking
          if (i !== false) {
            events.send(cache.ID, 'Closed accordion', `Index ${i || 'unknown'}`);
          }
        },
      });
    }
  }

  /**
   * Open or close an item depending on it's current state
   * @param {HTMLElement} item Container of item to toggle
   * @param {string} i Index for use in GA events
   */
  toggle(item, i) {
    const { open, close, openClass } = this;

    if (!item.classList.contains(openClass)) {
      open.call(this, item, i);
    } else {
      close.call(this, item, i);
    }
  }

  /**
   * Get the height of an element whether it's hidden or visible
   * @param {HTMLElement} element Element to get the height of
   * @returns {number} Height
   */
  static getHeight(element) {
    const el = element;
    const style = window.getComputedStyle(el);
    const { display } = style;
    const maxHeight = style.maxHeight.replace('px', '').replace('%', '');
    let height = 0;

    // if its not hidden we just return normal height
    if (display !== 'none' && maxHeight !== '0') {
      height = el.offsetHeight;
    } else {
      // the element is hidden so:
      // making the el block so we can meassure its height but still be hidden
      el.style.position = 'absolute';
      el.style.visibility = 'hidden';
      el.style.display = 'block';

      height = el.offsetHeight;

      // Remove inline styles
      el.style.display = '';
      el.style.position = '';
      el.style.visibility = '';
    }
    return height;
  }

  /**
   * https://github.com/jbraithwaite/scroll-to-y/blob/master/scroll-to-y.js
   * Animated scroll to a point on the page
   * @param {number} scrollTarget scrollY value to scroll to
   * @param {number} scrollSpeed Speed of scroll
   * @param {string} scrollEasing Name of easing equation
   */
  static scrollTo(scrollTarget, scrollSpeed, scrollEasing) {
    const { scrollY } = window;
    const target = scrollTarget !== undefined ? scrollTarget : 0;
    const speed = scrollSpeed !== undefined ? scrollSpeed : 2000;
    const easing = scrollEasing || 'easeOutSine';

    // Min time .1, max time .8 seconds
    const time = Math.max(0.1, Math.min(Math.abs(scrollY - scrollTarget) / speed, 0.8));
    let currentTime = 0;

    // Easing equations from https://github.com/danro/easing-js/blob/master/easing.js
    const easingEquations = {
      easeOutSine: pos => Math.sin(pos * (Math.PI / 2)),
      easeInOutSine: pos => (-0.5 * (Math.cos(Math.PI * pos) - 1)),
      easeInOutQuint: pos => (pos /= 0.5) < 1 ? 0.5 * Math.pow(pos, 5) : 0.5 * (Math.pow((pos - 2), 5) + 2),
    };

    // Add animation loop
    const tick = () => {
      currentTime += 1 / 60;
      const p = currentTime / time;
      const t = easingEquations[easing](p);
      if (p < 1) {
        window.requestAnimationFrame(tick);
        window.scrollTo(0, scrollY + ((target - scrollY) * t));
      } else {
        window.scrollTo(0, target);
      }
    };

    tick();
  }
}
