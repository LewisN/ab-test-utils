/**
 * @fileoverview A collection of utilities providing solutions to problems
 * regularly encountered in the development of third-party A/B tests
 * @author Lewis Needham
 */

/**
 * Returns a function to get current time
 * @returns {Function}
 */
const getNow = Date.now || function getNow() {
  return new Date().getTime();
};

/**
 * Merge together two objects with properties of the source object taking priority
 * The function is called recursively for properties that are also objects to avoid
 * overwriting the entire source object
 * @param {object} target Base object
 * @param {object} source Object with properties that will overwrite target
 * @returns {object}
 */
const mergeObjects = (target, source) => {
  const merged = target;
  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = merged[key];
    const isObject = typeof targetValue === 'object' && !(targetValue instanceof Array);

    if (isObject) {
      // If object, call function recursively to overwrite subproperties individually
      merged[key] = mergeObjects(targetValue, sourceValue);
    } else {
      // Overwrite default with value from options
      merged[key] = sourceValue;
    }
  });
  return merged;
};

/**
 * @desc Check for the existence of elements or some other logic before running callback
 * @param {array} conditions
 * @param {function} callback
 * @param {options} userOptions
 */
const poller = (conditions, callback, userOptions) => {
  /**
   * Default options
   */
  let options = {
    wait: 50,
    multiplier: 1.1,
    timeout: 0,
  };

  // Overwrite any default options with user supplied options
  if (userOptions) {
    options = mergeObjects(options, userOptions);
  }

  const { multiplier, wait } = options;

  /**
   * A date object created from the timeout option for easier comparison
   * @type {Date}
   */
  const timeout = options.timeout ? new Date(getNow() + options.timeout) : null;

  /**
   * Check if the poller has timed out
   * @returns {boolean}
   */
  const isTimedOut = () => timeout && getNow() > timeout;

  /**
   * Any successful polling conditions are pushed here to keep track of progress
   * @type {array}
   */
  const successfulConditions = [];

  /**
   * Check if a condition has passed
   * Conditions are evaluated differently depending on the type
   * Functions must return true and strings should be CSS selectors present in the DOM
   * @param {*} condition
   * @returns {boolean}
   */
  const evaluateCondition = (condition) => {
    const types = {
      function: () => condition(),
      string: () => document.querySelector(condition),
    };

    const evaluate = types[typeof condition];
    return evaluate ? evaluate() : true;
  };

  /**
   * Check if all the conditions have passed
   * @returns {boolean}
   */
  const allConditionsPassed = () => successfulConditions.length === conditions.length;

  /**
   * Recursive poll for a condition until it returns true
   * @param {*} condition
   * @param {number} waitTime Time before next polling attempt
   * @param {boolean} skipWait Bypasses the wait period if true
   */
  const pollForCondition = (condition, waitTime, skipWait) => {
    // End recursion if timeout has passed
    if (timeout && isTimedOut()) {
      return false;
    }

    const result = evaluateCondition(condition);

    if (result) {
      successfulConditions.push(result);
      if (allConditionsPassed()) {
        // Run the callback and pass the results as the first argument
        callback(successfulConditions);
      }
    } else {
      setTimeout(() => {
        pollForCondition(condition, waitTime * multiplier);
      }, skipWait ? 0 : waitTime);
    }
  };

  // Start polling for all conditions
  for (let i = 0; i < conditions.length; i += 1) {
    pollForCondition(conditions[i], wait, true);
  }
};

/**
 * @desc Helpers to make working with MutationObservers easier
 */
const observer = {
  /**
   * A reference to all elements with active observers applied with observer.connect
   * @type {array}
   */
  active: [],

  /**
   * @method Observer.connect
   * @desc Simplifies creating a MutationObservers and provides a throttle setting
   * @param  {Object} elements The element(s) to connect a MutationObserver to
   * @param  {function} cb Callback to run on mutation
   * @param  {Object} userOptions Settings to modify the behaviour of Observer
   * @param  {number} userOptions.throttle Minimum time to wait before callback can be fired again
   * @param  {object} userOptions.config MutationObserver config object (see: https://developer.mozilla.org/en/docs/Web/API/MutationObserver#MutationObserverInit)
   */
  connect: function connectMethod(elements, cb, userOptions) {
    let options = {
      throttle: 1000,
      config: {
        attributes: true,
        childList: true,
        subtree: false,
      },
    };

    // Overwrite any default options with user supplied options
    if (userOptions) {
      options = mergeObjects(options, userOptions);
    }

    let blockCb;
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (!blockCb) {
          blockCb = true;
          cb(elements, mutation);
          setTimeout(() => {
            blockCb = false;
          }, options.throttle);
        }
      });
    });

    if (elements.jquery) {
      // jQuery object
      for (let i = 0; i < elements.length; i += 1) {
        mutationObserver.observe(elements[i], options.config);
        this.active.push([elements[i], mutationObserver]);
      }
    } else {
      // HTMLElement
      mutationObserver.observe(elements, options.config);
      this.active.push([elements, mutationObserver]);
    }

    return mutationObserver;
  },

  /**
   * @method Observer.disconnect
   * @desc Allows MutationObservers connected with Observer.connect to easily be removed.
   * All MutationObservers will be removed from specified element(s).
   * @param  {object} elements - the elements to remove all MutationObservers from
   */
  disconnect: function disconnectMethod(elements) {
    const { active } = this;

    // Removes observers from active element
    function removeObservers(element) {
      for (let i = 0; i < active.length; i += 1) {
        if (element === active[i][0]) {
          active[i][1].disconnect();
        }
      }
    }

    // For each element in argument check if the node exists in active
    // If it does, disconnect the MutationObserver
    if (elements.length) {
      for (let i = 0; i < elements.length; i += 1) {
        removeObservers(elements[i]);
      }
    } else {
      removeObservers(elements);
    }
  },
};

/**
 * @desc Pass an array of elements and a number to split them into.
 * Useful for separating elements into sections.
 * @param {HTMLElement} elements
 * @param {number} num
 */
const group = (elements, num) => {
  const groups = [];

  for (let i = 0; i < elements.length; i += num) {
    groups.push(elements.slice(i, i + num));
  }

  return groups;
};

/**
 * Define a function to be invoked on mouseleave if the user hovered for a minimum of 'x' ms.
 * Useful for sending GA events on tooltip hovers as it avoids sending if a user just skims over.
 * @param {HTMLElement} elements
 * @param {function} cb
 * @param {number} delay
 */
const hoverDelay = (elements, cb, delay) => {
  if (!$) return false;
  let hovered;
  let startHover;
  if (!delay) delay = 1000;
  $(elements).hover(() => {
    startHover = getNow();
  }, () => {
    if (!hovered) {
      const endHover = getNow();
      const msHovered = endHover - startHover;
      if (msHovered >= delay) {
        cb();
        hovered = true;
      }
    }
  });

  return elements;
};

/**
 * @desc FullStory tagging
 * @param {string} experimentStr Experiment ID to show in Fullstory
 * @param {string} variationStr Variation number to show in Fullstory
 */
const fullStory = (experimentStr, variationStr) => {
  pollerLite([() => {
    const fs = window.FS;
    if (fs && fs.setUserVars) return true;
  }], () => {
    window.FS.setUserVars({
      experiment_str: experimentStr,
      variation_str: variationStr,
    });
  }, { multiplier: 1.2, timeout: 0 });
};

/**
 * @desc Universal GA event sender that works on all client implementations of GA
 * Polls for ga to exist and gets the tracker name from ga.getAll() to ensure
 * events are always sent
 */
const events = {
  trackerName: false,
  propertyId: false,
  analyticsReference: 'ga',
  eventCache: [],
  setDefaultCategory(category) {
    this.category = category;
    return this;
  },
  setPropertyId(propertyId) {
    // If set, will look for tracker matching given property ID
    this.propertyId = propertyId;
  },
  setTrackerName(trackerName) {
    this.trackerName = trackerName;
  },
  useLegacyTracker() {
    this.analyticsReference = '_gaq';
  },

  /**
   * Send an event
   * @param {string} evCategory
   * @param {string} evAction
   * @param {string} evLabel
   * @param {object} userOptions
   */
  send(evCategory, evAction, evLabel, userOptions) {
    const options = userOptions || {};
    const category = evCategory || this.category;
    const action = evAction;
    const label = evLabel;

    if (typeof options === 'object' && options.sendOnce) {
      const eventID = `${category}${action}${label}`;
      // Check eventCache to see if this has already been sent
      if (this.eventCache.indexOf(eventID) > -1) {
        return false;
      } else {
        // Store event in cache
        this.eventCache.push(eventID);
      }
    }

    const self = this;
    const fire = (tracker) => {
      if (self.analyticsReference === '_gaq') {
        window._gaq.push(['_trackEvent', category, action, label, null, (typeof options.nonInteraction !== 'undefined' ? options.nonInteraction : true)]);
      } else {
        window[self.analyticsReference](`${tracker}.send`, 'event', category, action, label, { nonInteraction: (options.nonInteraction ? options.nonInteraction : true) });
      }
    };

    if (self.trackerName) {
      fire(self.trackerName);
    } else {
      pollerLite([() => {
        try {
          if (self.analyticsReference === '_gaq') {
            return !!window._gaq;
          } else {
            const trackers = window[self.analyticsReference].getAll();
            if (trackers && trackers.length) {
              return true;
            } else {
              return false;
            }
          }
        } catch (err) {}
      }], () => {
        if (window[self.analyticsReference].getAll) {
          const trackers = window[self.analyticsReference].getAll();

          if (self.propertyId) {
            for (let i = 0; i < trackers.length; i += 1) {
              const tracker = trackers[i];
              if (tracker.get('trackingId') === self.propertyId) {
                self.trackerName = tracker.get('name');
                break;
              }
            }
          } else {
            self.trackerName = trackers[0].get('name');
          }

          fire(self.trackerName);
        }
      });
    }
  },
};

/**
 * Load a script wrapped in a promise. Any additional requests for the same script
 * following the first attempt will instead return the original promise.
 * This is useful to avoid sending unnecessary network requests when a script
 * is required across multiple experiments
 * @param {string} url
 * @param {boolean} options.async
 * @param {boolean} options.defer
 * @returns {Promise}
 */
const globalGetScript = (url, options) => {
  window.ucGlobals = window.ucGlobals || {};
  const { ucGlobals } = window;

  ucGlobals.requests = ucGlobals.requests || {};
  const { requests } = ucGlobals;

  const opts = options || {};

  /**
   * Create a script and resolve the promise on load
   * @returns {Promise}
   */
  const createGlobalPromise = () => new Promise((resolve, reject) => {
    let script = document.createElement('script');
    script.async = opts.async instanceof Boolean ? opts.async : true;
    script.defer = opts.defer instanceof Boolean ? opts.defer : true;

    const onloadHander = (_, isAbort) => {
      if (isAbort || !script.readyState || /loaded|complete/.test(script.readyState)) {
        script.onload = null;
        script.onreadystatechange = null;
        script = undefined;

        if (isAbort) {
          reject();
        } else {
          resolve();
        }
      }
    };

    script.onload = onloadHander;
    script.onreadystatechange = onloadHander;

    script.src = url;
    document.body.insertAdjacentElement('beforeend', script);
  });

  const isPromise = requests[url] instanceof Promise;
  if (!isPromise) {
    requests[url] = createGlobalPromise();
  }

  return requests[url];
};

/**
 * Run a callback when an element is in view
 * @param {HTMLElement} element The element you want to track viewability of
 * @param {function} cb Callback function to run once the element is in full view
 * @param {Object} options Settings for the tracker
 * @param {boolean} options.removeOnView Removes scroll tracking when element is in view
 * @param {number} options.throttle Custom throttle timing
 */
const viewabilityTracker = (element, cb, options) => {
  let throttledCheckElement;
  const stageHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  options = options || {
    zeroHeightElementsNotInView: true, /* Zero height elements are usually hidden */
    throttle: 250, /* Scroll throttle delay */
    allElementHasToBeInView: true, /* Otherwise only top of element has to be in view */
    removeOnView: true, /* cb fires once only */
  };
  const delay = options.throttle || 250;

  const elementIsInView = (element, stageHeight) => {
    const elementBoundingBox = element.getBoundingClientRect();
    if (options.zeroHeightElementsNotInView && elementBoundingBox.height == 0) {
      return false; 
    }
    const elementsTopY = elementBoundingBox.top;
    const elementsBottomY = elementBoundingBox.top + elementBoundingBox.height;

    if (options.allElementHasToBeInView) {
      return elementsTopY >= 0 && elementsBottomY < stageHeight;
    } else {
      return elementsTopY <= stageHeight;
    }
  };

  const checkElement = () => {
    if (elementIsInView(element, stageHeight)) {
      cb();
      if (options.removeOnView) {
        window.removeEventListener('scroll', throttledCheckElement);
      }
    }
  };

  throttledCheckElement = throttle(checkElement, delay);
  window.addEventListener('scroll', throttledCheckElement);
  checkElement();
};

/** Class for native JS animations */
class Animation {
  /**
   * Animate the style property of an element
   * @param {Object} options Options object
   * @param {HTMLElement} options.elem
   * @param {string} options.style CSS property to animate
   * @param {string} options.unit % or px
   * @param {number} options.from Animate value from
   * @param {number} options.to Animate value to
   * @param {number} options.time Time to complete animation
   * @param {number} options.buffer Time between each value change
   *  lower results in a smoother animation but is worse for performance
   * @param {function} options.beforeAnim Function to run before animation
   * @param {function} options.afterAnim Function to run after animation
   */
  constructor(options) {
    // Set defaults
    this.options = {
      elem: options.elem,
      style: options.style,
      unit: options.unit !== undefined ? options.unit : 'px',
      from: options.from !== 'undefined' ? options.from : options.elem.style[options.style],
      to: options.to,
      time: options.time !== 'undefined' ? options.time : 3000,
      buffer: options.buffer !== 'undefined' ? options.buffer : 20,
      beforeAnim: options.beforeAnim,
      afterAnim: options.afterAnim,
    };
    this.animate();
  }

  animate() {
    const {
      elem,
      style,
      unit,
      from,
      to,
      time,
      buffer,
      beforeAnim,
      afterAnim,
    } = this.options;

    // Run beforeAnim function
    if (beforeAnim && typeof beforeAnim === 'function') beforeAnim();

    // Initial values
    elem.style[style] = from + unit;
    const start = new Date().getTime();

    /**
     * Update style value for the next frame
     */
    const nextFrame = () => {
      const step = Math.min(1, (new Date().getTime() - start) / time);
      elem.style[style] = (from + step * (to - from)) + unit;
      if (step === 1) {
        if (afterAnim && typeof afterAnim === 'function') afterAnim();
      } else {
        window.requestAnimationFrame(nextFrame);
      }
    };

    // Init
    setTimeout(() => {
      window.requestAnimationFrame(nextFrame);
    }, buffer);
  }
}

export {
  poller,
  observer,
  group,
  hoverDelay,
  events,
  globalGetScript,
  viewabilityTracker,
  Animation,
  fullStory
};
