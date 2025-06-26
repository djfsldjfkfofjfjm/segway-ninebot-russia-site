/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Accordion: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;
    var delay = 100;

    var NS = "cmp";
    var IS = "accordion";

    var keyCodes = {
        ENTER: 13,
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var cssClasses = {
        button: {
            disabled: "cmp-accordion__button--disabled",
            expanded: "cmp-accordion__button--expanded"
        },
        panel: {
            hidden: "cmp-accordion__panel--hidden",
            expanded: "cmp-accordion__panel--expanded"
        }
    };

    var dataAttributes = {
        item: {
            expanded: "data-cmp-expanded"
        }
    };

    var properties = {
        /**
         * Determines whether a single accordion item is forced to be expanded at a time.
         * Expanding one item will collapse all others.
         *
         * @memberof Accordion
         * @type {Boolean}
         * @default false
         */
        "singleExpansion": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Accordion Configuration.
     *
     * @typedef {Object} AccordionConfig Represents an Accordion configuration
     * @property {HTMLElement} element The HTMLElement representing the Accordion
     * @property {Object} options The Accordion options
     */

    /**
     * Accordion.
     *
     * @class Accordion
     * @classdesc An interactive Accordion component for toggling panels of related content
     * @param {AccordionConfig} config The Accordion configuration
     */
    function Accordion(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Accordion.
         *
         * @private
         * @param {AccordionConfig} config The Accordion configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            if (that._elements["item"]) {
                // ensures multiple element types are arrays.
                that._elements["item"] = Array.isArray(that._elements["item"]) ? that._elements["item"] : [that._elements["item"]];
                that._elements["button"] = Array.isArray(that._elements["button"]) ? that._elements["button"] : [that._elements["button"]];
                that._elements["panel"] = Array.isArray(that._elements["panel"]) ? that._elements["panel"] : [that._elements["panel"]];

                if (that._properties.singleExpansion) {
                    var expandedItems = getExpandedItems();
                    // multiple expanded items annotated, display the last item open.
                    if (expandedItems.length > 1) {
                        toggle(expandedItems.length - 1);
                    }
                }

                refreshItems();
                bindEvents();
                scrollToDeepLinkIdInAccordion();
            }
            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Accordion component
                 * - if so, route the "navigate" operation to enact a navigation of the Accordion based on index data
                 */
                window.CQ.CoreComponents.MESSAGE_CHANNEL = window.CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                window.CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-accordion" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            // switch to single expansion mode when navigating in edit mode.
                            var singleExpansion = that._properties.singleExpansion;
                            that._properties.singleExpansion = true;
                            toggle(message.data.index);

                            // revert to the configured state.
                            that._properties.singleExpansion = singleExpansion;
                        }
                    }
                });
            }
        }

        /**
         * Displays the panel containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInAccordion() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "item", "item");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["item"][deepLinkItemIdx];
                    if (deepLinkItem && !deepLinkItem.hasAttribute(dataAttributes.item.expanded)) {
                        // if single expansion: close all accordion items
                        if (that._properties.singleExpansion) {
                            for (var j = 0; j < that._elements["item"].length; j++) {
                                if (that._elements["item"][j].hasAttribute(dataAttributes.item.expanded)) {
                                    setItemExpanded(that._elements["item"][j], false, true);
                                }
                            }
                        }
                        // expand the accordion item containing the deep link
                        setItemExpanded(deepLinkItem, true, true);
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Caches the Accordion elements as defined via the {@code data-accordion-hook="ELEMENT_NAME"} markup API.
         *
         * @private
         * @param {HTMLElement} wrapper The Accordion wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own accordion elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Sets up properties for the Accordion based on the passed options.
         *
         * @private
         * @param {Object} options The Accordion options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Accordion event handling.
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInAccordion, false);
            var buttons = that._elements["button"];
            if (buttons) {
                for (var i = 0; i < buttons.length; i++) {
                    (function(index) {
                        buttons[i].addEventListener("click", function(event) {
                            toggle(index);
                            focusButton(index);
                        });
                        buttons[i].addEventListener("keydown", function(event) {
                            onButtonKeyDown(event, index);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles button keydown events.
         *
         * @private
         * @param {Object} event The keydown event
         * @param {Number} index The index of the button triggering the event
         */
        function onButtonKeyDown(event, index) {
            var lastIndex = that._elements["button"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        focusButton(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        focusButton(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    focusButton(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    focusButton(lastIndex);
                    break;
                case keyCodes.ENTER:
                case keyCodes.SPACE:
                    event.preventDefault();
                    toggle(index);
                    focusButton(index);
                    break;
                default:
                    return;
            }
        }

        /**
         * General handler for toggle of an item.
         *
         * @private
         * @param {Number} index The index of the item to toggle
         */
        function toggle(index) {
            var item = that._elements["item"][index];
            if (item) {
                if (that._properties.singleExpansion) {
                    // ensure only a single item is expanded if single expansion is enabled.
                    for (var i = 0; i < that._elements["item"].length; i++) {
                        if (that._elements["item"][i] !== item) {
                            var expanded = getItemExpanded(that._elements["item"][i]);
                            if (expanded) {
                                setItemExpanded(that._elements["item"][i], false);
                            }
                        }
                    }
                }
                setItemExpanded(item, !getItemExpanded(item));

                if (dataLayerEnabled) {
                    var accordionId = that._elements.self.id;
                    var expandedItems = getExpandedItems()
                        .map(function(item) {
                            return getDataLayerId(item);
                        });

                    var uploadPayload = { component: {} };
                    uploadPayload.component[accordionId] = { shownItems: expandedItems };

                    var removePayload = { component: {} };
                    removePayload.component[accordionId] = { shownItems: undefined };

                    dataLayer.push(removePayload);
                    dataLayer.push(uploadPayload);
                }
            }
        }

        /**
         * Sets an item's expanded state based on the provided flag and refreshes its internals.
         *
         * @private
         * @param {HTMLElement} item The item to mark as expanded, or not expanded
         * @param {Boolean} expanded true to mark the item expanded, false otherwise
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function setItemExpanded(item, expanded, keepHash) {
            if (expanded) {
                item.setAttribute(dataAttributes.item.expanded, "");
                var index = that._elements["item"].indexOf(item);
                if (!keepHash && containerUtils) {
                    containerUtils.updateUrlHash(that, "item", index);
                }
                if (dataLayerEnabled) {
                    dataLayer.push({
                        event: "cmp:show",
                        eventInfo: {
                            path: "component." + getDataLayerId(item)
                        }
                    });
                }

            } else {
                item.removeAttribute(dataAttributes.item.expanded);
                if (!keepHash && containerUtils) {
                    containerUtils.removeUrlHash();
                }
                if (dataLayerEnabled) {
                    dataLayer.push({
                        event: "cmp:hide",
                        eventInfo: {
                            path: "component." + getDataLayerId(item)
                        }
                    });
                }
            }
            refreshItem(item);
        }

        /**
         * Gets an item's expanded state.
         *
         * @private
         * @param {HTMLElement} item The item for checking its expanded state
         * @returns {Boolean} true if the item is expanded, false otherwise
         */
        function getItemExpanded(item) {
            return item && item.dataset && item.dataset["cmpExpanded"] !== undefined;
        }

        /**
         * Refreshes an item based on its expanded state.
         *
         * @private
         * @param {HTMLElement} item The item to refresh
         */
        function refreshItem(item) {
            var expanded = getItemExpanded(item);
            if (expanded) {
                expandItem(item);
            } else {
                collapseItem(item);
            }
        }

        /**
         * Refreshes all items based on their expanded state.
         *
         * @private
         */
        function refreshItems() {
            for (var i = 0; i < that._elements["item"].length; i++) {
                refreshItem(that._elements["item"][i]);
            }
        }

        /**
         * Returns all expanded items.
         *
         * @private
         * @returns {HTMLElement[]} The expanded items
         */
        function getExpandedItems() {
            var expandedItems = [];

            for (var i = 0; i < that._elements["item"].length; i++) {
                var item = that._elements["item"][i];
                var expanded = getItemExpanded(item);
                if (expanded) {
                    expandedItems.push(item);
                }
            }

            return expandedItems;
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as expanded
         */
        function expandItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.add(cssClasses.button.expanded);
                // used to fix some known screen readers issues in reading the correct state of the 'aria-expanded' attribute
                // e.g. https://bugs.webkit.org/show_bug.cgi?id=210934
                setTimeout(function() {
                    button.setAttribute("aria-expanded", true);
                }, delay);
                panel.classList.add(cssClasses.panel.expanded);
                panel.classList.remove(cssClasses.panel.hidden);
                panel.setAttribute("aria-hidden", false);
            }
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is not expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as not expanded
         */
        function collapseItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.remove(cssClasses.button.expanded);
                // used to fix some known screen readers issues in reading the correct state of the 'aria-expanded' attribute
                // e.g. https://bugs.webkit.org/show_bug.cgi?id=210934
                setTimeout(function() {
                    button.setAttribute("aria-expanded", false);
                }, delay);
                panel.classList.add(cssClasses.panel.hidden);
                panel.classList.remove(cssClasses.panel.expanded);
                panel.setAttribute("aria-hidden", true);
            }
        }

        /**
         * Focuses the button at the provided index.
         *
         * @private
         * @param {Number} index The index of the button to focus
         */
        function focusButton(index) {
            var button = that._elements["button"][index];
            button.focus();
        }
    }

    /**
     * Reads options data from the Accordion wrapper element, defined via {@code data-cmp-*} data attributes.
     *
     * @private
     * @param {HTMLElement} element The Accordion element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Accordion components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Accordion({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Accordion({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
/* global
    CQ
 */
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Tabs: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;

    var NS = "cmp";
    var IS = "tabs";

    var keyCodes = {
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        active: {
            tab: "cmp-tabs__tab--active",
            tabpanel: "cmp-tabs__tabpanel--active"
        }
    };

    /**
     * Tabs Configuration
     *
     * @typedef {Object} TabsConfig Represents a Tabs configuration
     * @property {HTMLElement} element The HTMLElement representing the Tabs
     * @property {Object} options The Tabs options
     */

    /**
     * Tabs
     *
     * @class Tabs
     * @classdesc An interactive Tabs component for navigating a list of tabs
     * @param {TabsConfig} config The Tabs configuration
     */
    function Tabs(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Tabs
         *
         * @private
         * @param {TabsConfig} config The Tabs configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            cacheElements(config.element);
            that._active = getActiveIndex(that._elements["tab"]);

            if (that._elements.tabpanel) {
                refreshActive();
                bindEvents();
                scrollToDeepLinkIdInTabs();
            }

            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Tabs component
                 * - if so, route the "navigate" operation to enact a navigation of the Tabs based on index data
                 */
                CQ.CoreComponents.MESSAGE_CHANNEL = CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-tabs" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Displays the panel containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInTabs() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "tab", "tabpanel");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["tab"][deepLinkItemIdx];
                    if (deepLinkItem && that._elements["tab"][that._active].id !== deepLinkItem.id) {
                        navigateAndFocusTab(deepLinkItemIdx, true);
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Returns the index of the active tab, if no tab is active returns 0
         *
         * @param {Array} tabs Tab elements
         * @returns {Number} Index of the active tab, 0 if none is active
         */
        function getActiveIndex(tabs) {
            if (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].classList.contains(selectors.active.tab)) {
                        return i;
                    }
                }
            }
            return 0;
        }

        /**
         * Caches the Tabs elements as defined via the {@code data-tabs-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Tabs wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own tab elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Binds Tabs event handling
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInTabs, false);
            var tabs = that._elements["tab"];
            if (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    (function(index) {
                        tabs[i].addEventListener("click", function(event) {
                            navigateAndFocusTab(index);
                        });
                        tabs[i].addEventListener("keydown", function(event) {
                            onKeyDown(event);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles tab keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["tab"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusTab(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusTab(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusTab(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusTab(lastIndex);
                    break;
                default:
                    return;
            }
        }

        /**
         * Refreshes the tab markup based on the current {@code Tabs#_active} index
         *
         * @private
         */
        function refreshActive() {
            var tabpanels = that._elements["tabpanel"];
            var tabs = that._elements["tab"];

            if (tabpanels) {
                if (Array.isArray(tabpanels)) {
                    for (var i = 0; i < tabpanels.length; i++) {
                        if (i === parseInt(that._active)) {
                            tabpanels[i].classList.add(selectors.active.tabpanel);
                            tabpanels[i].removeAttribute("aria-hidden");
                            tabs[i].classList.add(selectors.active.tab);
                            tabs[i].setAttribute("aria-selected", true);
                            tabs[i].setAttribute("tabindex", "0");
                        } else {
                            tabpanels[i].classList.remove(selectors.active.tabpanel);
                            tabpanels[i].setAttribute("aria-hidden", true);
                            tabs[i].classList.remove(selectors.active.tab);
                            tabs[i].setAttribute("aria-selected", false);
                            tabs[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one tab
                    tabpanels.classList.add(selectors.active.tabpanel);
                    tabs.classList.add(selectors.active.tab);
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Navigates to the tab at the provided index
         *
         * @private
         * @param {Number} index The index of the tab to navigate to
         */
        function navigate(index) {
            that._active = index;
            refreshActive();
        }

        /**
         * Navigates to the item at the provided index and ensures the active tab gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigateAndFocusTab(index, keepHash) {
            var exActive = that._active;
            if (!keepHash && containerUtils) {
                containerUtils.updateUrlHash(that, "tab", index);
            }
            navigate(index);
            focusWithoutScroll(that._elements["tab"][index]);

            if (dataLayerEnabled) {

                var activeItem = getDataLayerId(that._elements.tabpanel[index]);
                var exActiveItem = getDataLayerId(that._elements.tabpanel[exActive]);

                dataLayer.push({
                    event: "cmp:show",
                    eventInfo: {
                        path: "component." + activeItem
                    }
                });

                dataLayer.push({
                    event: "cmp:hide",
                    eventInfo: {
                        path: "component." + exActiveItem
                    }
                });

                var tabsId = that._elements.self.id;
                var uploadPayload = { component: {} };
                uploadPayload.component[tabsId] = { shownItems: [activeItem] };

                var removePayload = { component: {} };
                removePayload.component[tabsId] = { shownItems: undefined };

                dataLayer.push(removePayload);
                dataLayer.push(uploadPayload);
            }
        }
    }

    /**
     * Reads options data from the Tabs wrapper element, defined via {@code data-cmp-*} data attributes
     *
     * @private
     * @param {HTMLElement} element The Tabs element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Tabs components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Tabs({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Tabs({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Tabs: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;

    var NS = "cmp";
    var IS = "carousel";

    var keyCodes = {
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * Determines whether the Carousel will automatically transition between slides
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autoplay": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * Duration (in milliseconds) before automatically transitioning to the next slide
         *
         * @memberof Carousel
         * @type {Number}
         * @default 5000
         */
        "delay": {
            "default": 5000,
            "transform": function(value) {
                value = parseFloat(value);
                return !isNaN(value) ? value : null;
            }
        },
        /**
         * Determines whether automatic pause on hovering the carousel is disabled
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autopauseDisabled": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Carousel Configuration
     *
     * @typedef {Object} CarouselConfig Represents a Carousel configuration
     * @property {HTMLElement} element The HTMLElement representing the Carousel
     * @property {Object} options The Carousel options
     */

    /**
     * Carousel
     *
     * @class Carousel
     * @classdesc An interactive Carousel component for navigating a list of generic items
     * @param {CarouselConfig} config The Carousel configuration
     */
    function Carousel(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Carousel
         *
         * @private
         * @param {CarouselConfig} config The Carousel configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            that._active = 0;
            that._paused = false;

            if (that._elements.item) {
                refreshActive();
                bindEvents();
                resetAutoplayInterval();
                refreshPlayPauseActions();
                scrollToDeepLinkIdInCarousel();
            }

            // TODO: This section is only relevant in edit mode and should move to the editor clientLib
            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Carousel component
                 * - if so, route the "navigate" operation to enact a navigation of the Carousel based on index data
                 */
                window.CQ = window.CQ || {};
                window.CQ.CoreComponents = window.CQ.CoreComponents || {};
                window.CQ.CoreComponents.MESSAGE_CHANNEL = window.CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                window.CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-carousel" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Displays the slide containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInCarousel() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "item", "item");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["item"][deepLinkItemIdx];
                    if (deepLinkItem && that._elements["item"][that._active].id !== deepLinkItem.id) {
                        navigateAndFocusIndicator(deepLinkItemIdx, true);
                        // pause the carousel auto-rotation
                        pause();
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Caches the Carousel elements as defined via the {@code data-carousel-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Carousel wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                if (that._elements[key]) {
                    if (!Array.isArray(that._elements[key])) {
                        var tmp = that._elements[key];
                        that._elements[key] = [tmp];
                    }
                    that._elements[key].push(hook);
                } else {
                    that._elements[key] = hook;
                }
            }
        }

        /**
         * Sets up properties for the Carousel based on the passed options.
         *
         * @private
         * @param {Object} options The Carousel options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Carousel event handling
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInCarousel, false);
            if (that._elements["previous"]) {
                that._elements["previous"].addEventListener("click", function() {
                    var index = getPreviousIndex();
                    navigate(index);
                    if (dataLayerEnabled) {
                        dataLayer.push({
                            event: "cmp:show",
                            eventInfo: {
                                path: "component." + getDataLayerId(that._elements.item[index])
                            }
                        });
                    }
                });
            }

            if (that._elements["next"]) {
                that._elements["next"].addEventListener("click", function() {
                    var index = getNextIndex();
                    navigate(index);
                    if (dataLayerEnabled) {
                        dataLayer.push({
                            event: "cmp:show",
                            eventInfo: {
                                path: "component." + getDataLayerId(that._elements.item[index])
                            }
                        });
                    }
                });
            }

            var indicators = that._elements["indicator"];
            if (indicators) {
                for (var i = 0; i < indicators.length; i++) {
                    (function(index) {
                        indicators[i].addEventListener("click", function(event) {
                            navigateAndFocusIndicator(index);
                            // pause the carousel auto-rotation
                            pause();
                        });
                    })(i);
                }
            }

            if (that._elements["pause"]) {
                if (that._properties.autoplay) {
                    that._elements["pause"].addEventListener("click", onPauseClick);
                }
            }

            if (that._elements["play"]) {
                if (that._properties.autoplay) {
                    that._elements["play"].addEventListener("click", onPlayClick);
                }
            }

            that._elements.self.addEventListener("keydown", onKeyDown);

            if (!that._properties.autopauseDisabled) {
                that._elements.self.addEventListener("mouseenter", onMouseEnter);
                that._elements.self.addEventListener("mouseleave", onMouseLeave);
            }

            // for accessibility we pause animation when a element get focused
            var items = that._elements["item"];
            if (items) {
                for (var j = 0; j < items.length; j++) {
                    items[j].addEventListener("focusin", onMouseEnter);
                    items[j].addEventListener("focusout", onMouseLeave);
                }
            }
        }

        /**
         * Handles carousel keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["indicator"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusIndicator(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusIndicator(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusIndicator(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusIndicator(lastIndex);
                    break;
                case keyCodes.SPACE:
                    if (that._properties.autoplay && (event.target !== that._elements["previous"] && event.target !== that._elements["next"])) {
                        event.preventDefault();
                        if (!that._paused) {
                            pause();
                        } else {
                            play();
                        }
                    }
                    if (event.target === that._elements["pause"]) {
                        that._elements["play"].focus();
                    }
                    if (event.target === that._elements["play"]) {
                        that._elements["pause"].focus();
                    }
                    break;
                default:
                    return;
            }
        }

        /**
         * Handles carousel mouseenter events
         *
         * @private
         * @param {Object} event The mouseenter event
         */
        function onMouseEnter(event) {
            clearAutoplayInterval();
        }

        /**
         * Handles carousel mouseleave events
         *
         * @private
         * @param {Object} event The mouseleave event
         */
        function onMouseLeave(event) {
            resetAutoplayInterval();
        }

        /**
         * Handles pause element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPauseClick(event) {
            pause();
            that._elements["play"].focus();
        }

        /**
         * Handles play element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPlayClick() {
            play();
            that._elements["pause"].focus();
        }

        /**
         * Pauses the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function pause() {
            that._paused = true;
            clearAutoplayInterval();
            refreshPlayPauseActions();
        }

        /**
         * Enables the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function play() {
            that._paused = false;

            // If the Carousel is hovered, don't begin auto transitioning until the next mouse leave event
            var hovered = false;
            if (that._elements.self.parentElement) {
                hovered = that._elements.self.parentElement.querySelector(":hover") === that._elements.self;
            }
            if (that._properties.autopauseDisabled || !hovered) {
                resetAutoplayInterval();
            }

            refreshPlayPauseActions();
        }

        /**
         * Refreshes the play/pause action markup based on the {@code Carousel#_paused} state
         *
         * @private
         */
        function refreshPlayPauseActions() {
            setActionDisabled(that._elements["pause"], that._paused);
            setActionDisabled(that._elements["play"], !that._paused);
        }

        /**
         * Refreshes the item markup based on the current {@code Carousel#_active} index
         *
         * @private
         */
        function refreshActive() {
            var items = that._elements["item"];
            var indicators = that._elements["indicator"];

            if (items) {
                if (Array.isArray(items)) {
                    for (var i = 0; i < items.length; i++) {
                        if (i === parseInt(that._active)) {
                            items[i].classList.add("cmp-carousel__item--active");
                            items[i].removeAttribute("aria-hidden");
                            indicators[i].classList.add("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", true);
                            indicators[i].setAttribute("tabindex", "0");
                        } else {
                            items[i].classList.remove("cmp-carousel__item--active");
                            items[i].setAttribute("aria-hidden", true);
                            indicators[i].classList.remove("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", false);
                            indicators[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one item
                    items.classList.add("cmp-carousel__item--active");
                    indicators.classList.add("cmp-carousel__indicator--active");
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Retrieves the next active index, with looping
         *
         * @private
         * @returns {Number} Index of the next carousel item
         */
        function getNextIndex() {
            return that._active === (that._elements["item"].length - 1) ? 0 : that._active + 1;
        }

        /**
         * Retrieves the previous active index, with looping
         *
         * @private
         * @returns {Number} Index of the previous carousel item
         */
        function getPreviousIndex() {
            return that._active === 0 ? (that._elements["item"].length - 1) : that._active - 1;
        }

        /**
         * Navigates to the item at the provided index
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigate(index, keepHash) {
            if (index < 0 || index > (that._elements["item"].length - 1)) {
                return;
            }

            that._active = index;
            refreshActive();

            if (!keepHash && containerUtils) {
                containerUtils.updateUrlHash(that, "item", index);
            }

            if (dataLayerEnabled) {
                var carouselId = that._elements.self.id;
                var activeItem = getDataLayerId(that._elements.item[index]);
                var updatePayload = { component: {} };
                updatePayload.component[carouselId] = { shownItems: [activeItem] };

                var removePayload = { component: {} };
                removePayload.component[carouselId] = { shownItems: undefined };

                dataLayer.push(removePayload);
                dataLayer.push(updatePayload);
            }

            // reset the autoplay transition interval following navigation, if not already hovering the carousel
            if (that._elements.self.parentElement) {
                if (that._elements.self.parentElement.querySelector(":hover") !== that._elements.self) {
                    resetAutoplayInterval();
                }
            }
        }

        /**
         * Navigates to the item at the provided index and ensures the active indicator gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigateAndFocusIndicator(index, keepHash) {
            navigate(index, keepHash);
            focusWithoutScroll(that._elements["indicator"][index]);

            if (dataLayerEnabled) {
                dataLayer.push({
                    event: "cmp:show",
                    eventInfo: {
                        path: "component." + getDataLayerId(that._elements.item[index])
                    }
                });
            }
        }

        /**
         * Starts/resets automatic slide transition interval
         *
         * @private
         */
        function resetAutoplayInterval() {
            if (that._paused || !that._properties.autoplay) {
                return;
            }
            clearAutoplayInterval();
            that._autoplayIntervalId = window.setInterval(function() {
                if (document.visibilityState && document.hidden) {
                    return;
                }
                var indicators = that._elements["indicators"];
                if (indicators !== document.activeElement && indicators.contains(document.activeElement)) {
                    // if an indicator has focus, ensure we switch focus following navigation
                    navigateAndFocusIndicator(getNextIndex(), true);
                } else {
                    navigate(getNextIndex(), true);
                }
            }, that._properties.delay);
        }

        /**
         * Clears/pauses automatic slide transition interval
         *
         * @private
         */
        function clearAutoplayInterval() {
            window.clearInterval(that._autoplayIntervalId);
            that._autoplayIntervalId = null;
        }

        /**
         * Sets the disabled state for an action and toggles the appropriate CSS classes
         *
         * @private
         * @param {HTMLElement} action Action to disable
         * @param {Boolean} [disable] {@code true} to disable, {@code false} to enable
         */
        function setActionDisabled(action, disable) {
            if (!action) {
                return;
            }
            if (disable !== false) {
                action.disabled = true;
                action.classList.add("cmp-carousel__action--disabled");
            } else {
                action.disabled = false;
                action.classList.remove("cmp-carousel__action--disabled");
            }
        }
    }

    /**
     * Reads options data from the Carousel wrapper element, defined via {@code data-cmp-*} data attributes
     *
     * @private
     * @param {HTMLElement} element The Carousel element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Carousel components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Carousel({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Carousel({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }
    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {

    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.image = window.CMP.image || {};
    window.CMP.image.v3 = (function() {
        var selectors = {
            self: "[data-cmp-hook-image='imageV3']"
        };

        /**
         * Init the image if the image is from dynamic media
         * @param {HTMLElement} component the image component
         */
        var initImage = function(component) {
            var dmImage = component.matches("[data-cmp-dmimage]");
            if (dmImage) {
                var image = component.querySelector("img");
                CMP.image.dynamicMedia.setDMAttributes(component, image);
            }
        };

        return {
            init: function() {
                var componentList = document.querySelectorAll(selectors.self);
                var listLength = componentList.length;
                for (var i = 0; i < listLength; i++) {
                    var component = componentList[i];
                    initImage(component);
                }

                var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
                var body             = document.querySelector("body");
                var observer         = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        // needed for IE
                        var nodesArray = [].slice.call(mutation.addedNodes);
                        if (nodesArray.length > 0) {
                            nodesArray.forEach(function(addedNode) {
                                if (addedNode.querySelectorAll) {
                                    var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                                    elementsArray.forEach(function(element) {
                                        initImage(element);
                                    });
                                }
                            });
                        }
                    });
                });

                observer.observe(body, {
                    subtree: true,
                    childList: true,
                    characterData: true
                });
            }
        };
    }());
    if (document.readyState !== "loading") {
        window.CMP.image.v3.init();
    } else {
        document.addEventListener("DOMContentLoaded", window.CMP.image.v3.init);
    }

}(window.document));

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "search";

    var DELAY = 300; // time before fetching new results when the user is typing a search string
    var LOADING_DISPLAY_DELAY = 300; // minimum time during which the loading indicator is displayed
    var PARAM_RESULTS_OFFSET = "resultsOffset";

    var keyCodes = {
        TAB: 9,
        ENTER: 13,
        ESCAPE: 27,
        ARROW_UP: 38,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        item: {
            self: "[data-" + NS + "-hook-" + IS + '="item"]',
            title: "[data-" + NS + "-hook-" + IS + '="itemTitle"]',
            focused: "." + NS + "-search__item--is-focused"
        }
    };

    var properties = {
        /**
         * The minimum required length of the search term before results are fetched.
         *
         * @memberof Search
         * @type {Number}
         * @default 3
         */
        minLength: {
            "default": 3,
            transform: function(value) {
                value = parseFloat(value);
                return isNaN(value) ? null : value;
            }
        },
        /**
         * The maximal number of results fetched by a search request.
         *
         * @memberof Search
         * @type {Number}
         * @default 10
         */
        resultsSize: {
            "default": 10,
            transform: function(value) {
                value = parseFloat(value);
                return isNaN(value) ? null : value;
            }
        }
    };

    var idCount = 0;

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function toggleShow(element, show) {
        if (element) {
            if (show !== false) {
                element.style.display = "block";
                element.setAttribute("aria-hidden", false);
            } else {
                element.style.display = "none";
                element.setAttribute("aria-hidden", true);
            }
        }
    }

    function serialize(form) {
        var query = [];
        if (form && form.elements) {
            for (var i = 0; i < form.elements.length; i++) {
                var node = form.elements[i];
                if (!node.disabled && node.name) {
                    var param = [node.name, encodeURIComponent(node.value)];
                    query.push(param.join("="));
                }
            }
        }
        return query.join("&");
    }

    function mark(node, regex) {
        if (!node || !regex) {
            return;
        }

        // text nodes
        if (node.nodeType === 3) {
            var nodeValue = node.nodeValue;
            var match = regex.exec(nodeValue);

            if (nodeValue && match) {
                var element = document.createElement("mark");
                element.className = NS + "-search__item-mark";
                element.appendChild(document.createTextNode(match[0]));

                var after = node.splitText(match.index);
                after.nodeValue = after.nodeValue.substring(match[0].length);
                node.parentNode.insertBefore(element, after);
            }
        } else if (node.hasChildNodes()) {
            for (var i = 0; i < node.childNodes.length; i++) {
                // recurse
                mark(node.childNodes[i], regex);
            }
        }
    }

    // useful for Accessibility, helping users with low vision and users with cognitive disabilities to identify the change in results
    function updateSearchResultsStatusMessageElement(searchElementId, totalResults) {
        var searchResultsStatusMessage = document.querySelector("#" + searchElementId + "> .cmp_search__info");
        searchResultsStatusMessage.style.visibility = "visible";
        var searchResultsFoundMessage = totalResults === 1 ? totalResults + " result" : totalResults + " results";
        var searchResultsNotFoundMessage = "No results";
        searchResultsStatusMessage.innerText = totalResults > 0 ? searchResultsFoundMessage : searchResultsNotFoundMessage;
    }

    function Search(config) {
        if (config.element) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");
        }

        this._cacheElements(config.element);
        this._setupProperties(config.options);

        this._action = this._elements.form.getAttribute("action");
        this._resultsOffset = 0;
        this._hasMoreResults = true;

        this._elements.input.addEventListener("input", this._onInput.bind(this));
        this._elements.input.addEventListener("focus", this._onInput.bind(this));
        this._elements.input.addEventListener("keydown", this._onKeydown.bind(this));
        this._elements.clear.addEventListener("click", this._onClearClick.bind(this));
        document.addEventListener("click", this._onDocumentClick.bind(this));
        this._elements.results.addEventListener("scroll", this._onScroll.bind(this));

        this._makeAccessible();
    }

    Search.prototype._displayResults = function() {
        if (this._elements.input.value.length === 0) {
            toggleShow(this._elements.clear, false);
            this._cancelResults();
        } else if (this._elements.input.value.length < this._properties.minLength) {
            toggleShow(this._elements.clear, true);
        } else {
            this._updateResults();
            toggleShow(this._elements.clear, true);
        }
    };

    Search.prototype._onScroll = function(event) {
        // fetch new results when the results to be scrolled down are less than the visible results
        if (this._elements.results.scrollTop + 2 * this._elements.results.clientHeight >= this._elements.results.scrollHeight) {
            this._resultsOffset += this._properties.resultsSize;
            this._displayResults();
        }
    };

    Search.prototype._onInput = function(event) {
        var self = this;
        self._cancelResults();
        // start searching when the search term reaches the minimum length
        this._timeout = setTimeout(function() {
            self._displayResults();
        }, DELAY);
    };

    Search.prototype._onKeydown = function(event) {
        var self = this;

        switch (event.keyCode) {
            case keyCodes.TAB:
                if (self._resultsOpen()) {
                    toggleShow(self._elements.results, false);
                    self._elements.input.setAttribute("aria-expanded", "false");
                    this._hideSearchResultsStatusMessage();
                }
                break;
            case keyCodes.ENTER:
                event.preventDefault();
                if (self._resultsOpen()) {
                    var focused = self._elements.results.querySelector(selectors.item.focused);
                    if (focused) {
                        focused.click();
                    }
                }
                break;
            case keyCodes.ESCAPE:
                self._cancelResults();
                break;
            case keyCodes.ARROW_UP:
                if (self._resultsOpen()) {
                    event.preventDefault();
                    self._stepResultFocus(true);
                }
                break;
            case keyCodes.ARROW_DOWN:
                if (self._resultsOpen()) {
                    event.preventDefault();
                    self._stepResultFocus();
                } else {
                    // test the input and if necessary fetch and display the results
                    self._onInput();
                }
                break;
            default:
                return;
        }
    };

    Search.prototype._onClearClick = function(event) {
        event.preventDefault();
        this._elements.input.value = "";
        toggleShow(this._elements.clear, false);
        toggleShow(this._elements.results, false);
        this._elements.input.setAttribute("aria-expanded", "false");
        this._hideSearchResultsStatusMessage();
    };

    Search.prototype._onDocumentClick = function(event) {
        var inputContainsTarget =  this._elements.input.contains(event.target);
        var resultsContainTarget = this._elements.results.contains(event.target);

        if (!(inputContainsTarget || resultsContainTarget)) {
            toggleShow(this._elements.results, false);
            this._elements.input.setAttribute("aria-expanded", "false");
            this._hideSearchResultsStatusMessage();
        }
    };

    Search.prototype._resultsOpen = function() {
        return this._elements.results.style.display !== "none";
    };

    Search.prototype._makeAccessible = function() {
        var id = NS + "-search-results-" + idCount;
        this._elements.input.setAttribute("aria-owns", id);
        this._elements.results.id = id;
        idCount++;
    };

    Search.prototype._generateItems = function(data, results) {
        var self = this;

        data.forEach(function(item) {
            var el = document.createElement("span");
            el.innerHTML = self._elements.itemTemplate.innerHTML;
            el.querySelectorAll(selectors.item.title)[0].appendChild(document.createTextNode(item.title));
            el.querySelectorAll(selectors.item.self)[0].setAttribute("href", item.url);
            results.innerHTML += el.innerHTML;
        });
    };

    Search.prototype._markResults = function() {
        var nodeList = this._elements.results.querySelectorAll(selectors.item.self);
        var escapedTerm = this._elements.input.value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        var regex = new RegExp("(" + escapedTerm + ")", "gi");

        for (var i = this._resultsOffset - 1; i < nodeList.length; ++i) {
            var result = nodeList[i];
            mark(result, regex);
        }
    };

    Search.prototype._stepResultFocus = function(reverse) {
        var results = this._elements.results.querySelectorAll(selectors.item.self);
        var focused = this._elements.results.querySelector(selectors.item.focused);
        var newFocused;
        var index = Array.prototype.indexOf.call(results, focused);
        var focusedCssClass = NS + "-search__item--is-focused";

        if (results.length > 0) {

            if (!reverse) {
                // highlight the next result
                if (index < 0) {
                    results[0].classList.add(focusedCssClass);
                    results[0].setAttribute("aria-selected", "true");
                } else if (index + 1 < results.length) {
                    results[index].classList.remove(focusedCssClass);
                    results[index].setAttribute("aria-selected", "false");
                    results[index + 1].classList.add(focusedCssClass);
                    results[index + 1].setAttribute("aria-selected", "true");
                }

                // if the last visible result is partially hidden, scroll up until it's completely visible
                newFocused = this._elements.results.querySelector(selectors.item.focused);
                if (newFocused) {
                    var bottomHiddenHeight = newFocused.offsetTop + newFocused.offsetHeight - this._elements.results.scrollTop - this._elements.results.clientHeight;
                    if (bottomHiddenHeight > 0) {
                        this._elements.results.scrollTop += bottomHiddenHeight;
                    } else {
                        this._onScroll();
                    }
                }

            } else {
                // highlight the previous result
                if (index >= 1) {
                    results[index].classList.remove(focusedCssClass);
                    results[index].setAttribute("aria-selected", "false");
                    results[index - 1].classList.add(focusedCssClass);
                    results[index - 1].setAttribute("aria-selected", "true");
                }

                // if the first visible result is partially hidden, scroll down until it's completely visible
                newFocused = this._elements.results.querySelector(selectors.item.focused);
                if (newFocused) {
                    var topHiddenHeight = this._elements.results.scrollTop - newFocused.offsetTop;
                    if (topHiddenHeight > 0) {
                        this._elements.results.scrollTop -= topHiddenHeight;
                    }
                }
            }
        }
    };

    Search.prototype._updateResults = function() {
        var self = this;
        if (self._hasMoreResults) {
            var request = new XMLHttpRequest();
            var url = self._action + "?" + serialize(self._elements.form) + "&" + PARAM_RESULTS_OFFSET + "=" + self._resultsOffset;

            request.open("GET", url, true);
            request.onload = function() {
                // when the results are loaded: hide the loading indicator and display the search icon after a minimum period
                setTimeout(function() {
                    toggleShow(self._elements.loadingIndicator, false);
                    toggleShow(self._elements.icon, true);
                }, LOADING_DISPLAY_DELAY);
                if (request.status >= 200 && request.status < 400) {
                    // success status
                    var data = JSON.parse(request.responseText);
                    updateSearchResultsStatusMessageElement(self._elements.self.id, data.length);
                    if (data.length > 0) {
                        self._generateItems(data, self._elements.results);
                        self._markResults();
                        toggleShow(self._elements.results, true);
                        self._elements.input.setAttribute("aria-expanded", "true");
                    } else {
                        self._hasMoreResults = false;
                    }
                    // the total number of results is not a multiple of the fetched results:
                    // -> we reached the end of the query
                    if (self._elements.results.querySelectorAll(selectors.item.self).length % self._properties.resultsSize > 0) {
                        self._hasMoreResults = false;
                    }
                } else {
                    // error status
                }
            };
            // when the results are loading: display the loading indicator and hide the search icon
            toggleShow(self._elements.loadingIndicator, true);
            toggleShow(self._elements.icon, false);
            request.send();
        }
    };

    Search.prototype._cancelResults = function() {
        clearTimeout(this._timeout);
        this._elements.results.scrollTop = 0;
        this._resultsOffset = 0;
        this._hasMoreResults = true;
        this._elements.results.innerHTML = "";
        this._elements.input.setAttribute("aria-expanded", "false");
        this._hideSearchResultsStatusMessage();
    };

    Search.prototype._hideSearchResultsStatusMessage = function() {
        var searchResultsStatusMessage = document.querySelector("#" + this._elements.self.id + "> .cmp_search__info");
        searchResultsStatusMessage.style.visibility = "hidden";
    };

    Search.prototype._cacheElements = function(wrapper) {
        this._elements = {};
        this._elements.self = wrapper;
        var hooks = this._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

        for (var i = 0; i < hooks.length; i++) {
            var hook = hooks[i];
            var capitalized = IS;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var key = hook.dataset[NS + "Hook" + capitalized];
            this._elements[key] = hook;
        }
    };

    Search.prototype._setupProperties = function(options) {
        this._properties = {};

        for (var key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                var property = properties[key];
                if (options && options[key] != null) {
                    if (property && typeof property.transform === "function") {
                        this._properties[key] = property.transform(options[key]);
                    } else {
                        this._properties[key] = options[key];
                    }
                } else {
                    this._properties[key] = properties[key]["default"];
                }
            }
        }
    };

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Search({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Search({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

})();

/*******************************************************************************
 * Copyright 2016 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "formText";
    var IS_DASH = "form-text";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * A validation message to display if there is a type mismatch between the user input and expected input.
         *
         * @type {String}
         */
        constraintMessage: "",
        /**
         * A validation message to display if no input is supplied, but input is expected for the field.
         *
         * @type {String}
         */
        requiredMessage: ""
    };

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function FormText(config) {
        if (config.element) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");
        }

        this._cacheElements(config.element);
        this._setupProperties(config.options);

        this._elements.input.addEventListener("invalid", this._onInvalid.bind(this));
        this._elements.input.addEventListener("input", this._onInput.bind(this));
    }

    FormText.prototype._onInvalid = function(event) {
        event.target.setCustomValidity("");
        if (event.target.validity.typeMismatch) {
            if (this._properties.constraintMessage) {
                event.target.setCustomValidity(this._properties.constraintMessage);
            }
        } else if (event.target.validity.valueMissing) {
            if (this._properties.requiredMessage) {
                event.target.setCustomValidity(this._properties.requiredMessage);
            }
        }
    };

    FormText.prototype._onInput = function(event) {
        event.target.setCustomValidity("");
    };

    FormText.prototype._cacheElements = function(wrapper) {
        this._elements = {};
        this._elements.self = wrapper;
        var hooks = this._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS_DASH + "]");
        for (var i = 0; i < hooks.length; i++) {
            var hook = hooks[i];
            var capitalized = IS;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var key = hook.dataset[NS + "Hook" + capitalized];
            this._elements[key] = hook;
        }
    };

    FormText.prototype._setupProperties = function(options) {
        this._properties = {};

        for (var key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                var property = properties[key];
                if (options && options[key] != null) {
                    if (property && typeof property.transform === "function") {
                        this._properties[key] = property.transform(options[key]);
                    } else {
                        this._properties[key] = options[key];
                    }
                } else {
                    this._properties[key] = properties[key]["default"];
                }
            }
        }
    };

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new FormText({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new FormText({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

})();

/*******************************************************************************
 * Copyright 2020 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "pdfviewer";
    var SDK_URL = "https://documentcloud.adobe.com/view-sdk/main.js";
    var SDK_READY_EVENT = "adobe_dc_view_sdk.ready";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        sdkScript: 'script[src="' + SDK_URL + '"]'
    };

    function initSDK() {
        var sdkIncluded = document.querySelectorAll(selectors.sdkScript).length > 0;
        if (!window.adobe_dc_view_sdk && !sdkIncluded) {
            var dcv = document.createElement("script");
            dcv.type = "text/javascript";
            dcv.src = SDK_URL;
            document.body.appendChild(dcv);
        }
    }

    function previewPdf(component) {
        // prevents multiple initialization
        component.removeAttribute("data-" + NS + "-is");

        // add the view sdk to the page
        initSDK();

        // manage the preview
        if (component.dataset && component.id) {
            if (window.AdobeDC && window.AdobeDC.View) {
                dcView(component);
            } else {
                document.addEventListener(SDK_READY_EVENT, function() {
                    dcView(component);
                });
            }
        }
    }

    function dcView(component) {
        var adobeDCView = new window.AdobeDC.View({
            clientId: component.dataset.cmpClientId,
            divId: component.id + "-content",
            reportSuiteId: component.dataset.cmpReportSuiteId
        });
        adobeDCView.previewFile({
            content: { location: { url: component.dataset.cmpDocumentPath } },
            metaData: { fileName: component.dataset.cmpDocumentFileName }
        }, JSON.parse(component.dataset.cmpViewerConfigJson));
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Accordion components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            previewPdf(elements[i]);
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                previewPdf(element);
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });

    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }
}());

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var dataLayerEnabled;
    var dataLayer;

    /**
     * Adds Click Event Listener to the main <div> of the Text Components
     */
    function addClickEventListenerToTextComponents() {
        var componentMainDivs = document.getElementsByClassName("cmp-text");

        for (var i = 0; i < componentMainDivs.length; i++) {
            componentMainDivs[i].addEventListener("click", addClickedLinkToDataLayer);
        }
    }

    /**
     * Adds clicked link contained by the Text Component to Data Layer
     *
     * @private
     * @param {Object} event The Click event
     */
    function addClickedLinkToDataLayer(event) {
        var element = event.currentTarget;
        var componentId = getDataLayerId(element);

        if (event.target.tagName === "A") {
            dataLayer.push({
                event: "cmp:click",
                eventInfo: {
                    path: "component." + componentId,
                    link: event.target.getAttribute("href")
                }
            });
        }

    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item, the Text item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        if (dataLayerEnabled) {
            addClickEventListenerToTextComponents();
        }
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }
})();

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var linkAccessibilityClass = "cmp-link__screen-reader-only";
    var selectors = {
        linkAccessibility: "." + linkAccessibilityClass,
        linkAccessibilityEnabled: "[data-cmp-link-accessibility-enabled]",
        linkAccessibilityText: "[data-cmp-link-accessibility-text]"
    };

    function getLinkAccessibilityText() {
        var linkAccessibilityEnabled = document.querySelectorAll(selectors.linkAccessibilityEnabled);
        if (!linkAccessibilityEnabled[0]) {
            return;
        }
        var linkAccessibilityTextElements = document.querySelectorAll(selectors.linkAccessibilityText);
        if (!linkAccessibilityTextElements[0]) {
            return;
        }
        return linkAccessibilityTextElements[0].dataset.cmpLinkAccessibilityText;
    }

    function onDocumentReady() {
        var linkAccessibilityText = getLinkAccessibilityText();
        if (linkAccessibilityText) {
            var linkAccessibilityHtml = "<span class='" + linkAccessibilityClass + "'>(" + linkAccessibilityText + ")</span>";
            document.querySelectorAll("a[target='_blank']").forEach(function(link) {
                if (!link.querySelector(selectors.linkAccessibility)) {
                    link.insertAdjacentHTML("beforeend",  linkAccessibilityHtml);
                }
            });
        }
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

}());

"use strict";(self.webpackChunkaem_maven_archetype=self.webpackChunkaem_maven_archetype||[]).push([[96],{2893:function(t,e,n){n.d(e,{Ay:function(){return rr}});
/*!
 * Vue.js v2.7.16
 * (c) 2014-2023 Evan You
 * Released under the MIT License.
 */
var r=Object.freeze({}),o=Array.isArray;function i(t){return null==t}function a(t){return null!=t}function s(t){return!0===t}function c(t){return"string"==typeof t||"number"==typeof t||"symbol"==typeof t||"boolean"==typeof t}function u(t){return"function"==typeof t}function l(t){return null!==t&&"object"==typeof t}var f=Object.prototype.toString;function p(t){return"[object Object]"===f.call(t)}function d(t){return"[object RegExp]"===f.call(t)}function v(t){var e=parseFloat(String(t));return e>=0&&Math.floor(e)===e&&isFinite(t)}function h(t){return a(t)&&"function"==typeof t.then&&"function"==typeof t.catch}function m(t){return null==t?"":Array.isArray(t)||p(t)&&t.toString===f?JSON.stringify(t,g,2):String(t)}function g(t,e){return e&&e.__v_isRef?e.value:e}function y(t){var e=parseFloat(t);return isNaN(e)?t:e}function _(t,e){for(var n=Object.create(null),r=t.split(","),o=0;o<r.length;o++)n[r[o]]=!0;return e?function(t){return n[t.toLowerCase()]}:function(t){return n[t]}}var b=_("slot,component",!0),$=_("key,ref,slot,slot-scope,is");function w(t,e){var n=t.length;if(n){if(e===t[n-1])return void(t.length=n-1);var r=t.indexOf(e);if(r>-1)return t.splice(r,1)}}var x=Object.prototype.hasOwnProperty;function C(t,e){return x.call(t,e)}function k(t){var e=Object.create(null);return function(n){return e[n]||(e[n]=t(n))}}var O=/-(\w)/g,S=k((function(t){return t.replace(O,(function(t,e){return e?e.toUpperCase():""}))})),T=k((function(t){return t.charAt(0).toUpperCase()+t.slice(1)})),A=/\B([A-Z])/g,j=k((function(t){return t.replace(A,"-$1").toLowerCase()}));var N=Function.prototype.bind?function(t,e){return t.bind(e)}:function(t,e){function n(n){var r=arguments.length;return r?r>1?t.apply(e,arguments):t.call(e,n):t.call(e)}return n._length=t.length,n};function E(t,e){e=e||0;for(var n=t.length-e,r=new Array(n);n--;)r[n]=t[n+e];return r}function D(t,e){for(var n in e)t[n]=e[n];return t}function P(t){for(var e={},n=0;n<t.length;n++)t[n]&&D(e,t[n]);return e}function M(t,e,n){}var I=function(t,e,n){return!1},L=function(t){return t};function F(t,e){if(t===e)return!0;var n=l(t),r=l(e);if(!n||!r)return!n&&!r&&String(t)===String(e);try{var o=Array.isArray(t),i=Array.isArray(e);if(o&&i)return t.length===e.length&&t.every((function(t,n){return F(t,e[n])}));if(t instanceof Date&&e instanceof Date)return t.getTime()===e.getTime();if(o||i)return!1;var a=Object.keys(t),s=Object.keys(e);return a.length===s.length&&a.every((function(n){return F(t[n],e[n])}))}catch(t){return!1}}function R(t,e){for(var n=0;n<t.length;n++)if(F(t[n],e))return n;return-1}function H(t){var e=!1;return function(){e||(e=!0,t.apply(this,arguments))}}function B(t,e){return t===e?0===t&&1/t!=1/e:t==t||e==e}var U="data-server-rendered",z=["component","directive","filter"],V=["beforeCreate","created","beforeMount","mounted","beforeUpdate","updated","beforeDestroy","destroyed","activated","deactivated","errorCaptured","serverPrefetch","renderTracked","renderTriggered"],K={optionMergeStrategies:Object.create(null),silent:!1,productionTip:!1,devtools:!1,performance:!1,errorHandler:null,warnHandler:null,ignoredElements:[],keyCodes:Object.create(null),isReservedTag:I,isReservedAttr:I,isUnknownElement:I,getTagNamespace:M,parsePlatformTagName:L,mustUseProp:I,async:!0,_lifecycleHooks:V},J=/a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/;function q(t){var e=(t+"").charCodeAt(0);return 36===e||95===e}function W(t,e,n,r){Object.defineProperty(t,e,{value:n,enumerable:!!r,writable:!0,configurable:!0})}var Z=new RegExp("[^".concat(J.source,".$_\\d]"));var G="__proto__"in{},X="undefined"!=typeof window,Y=X&&window.navigator.userAgent.toLowerCase(),Q=Y&&/msie|trident/.test(Y),tt=Y&&Y.indexOf("msie 9.0")>0,et=Y&&Y.indexOf("edge/")>0;Y&&Y.indexOf("android");var nt=Y&&/iphone|ipad|ipod|ios/.test(Y);Y&&/chrome\/\d+/.test(Y),Y&&/phantomjs/.test(Y);var rt,ot=Y&&Y.match(/firefox\/(\d+)/),it={}.watch,at=!1;if(X)try{var st={};Object.defineProperty(st,"passive",{get:function(){at=!0}}),window.addEventListener("test-passive",null,st)}catch(t){}var ct=function(){return void 0===rt&&(rt=!X&&void 0!==n.g&&(n.g.process&&"server"===n.g.process.env.VUE_ENV)),rt},ut=X&&window.__VUE_DEVTOOLS_GLOBAL_HOOK__;function lt(t){return"function"==typeof t&&/native code/.test(t.toString())}var ft,pt="undefined"!=typeof Symbol&&lt(Symbol)&&"undefined"!=typeof Reflect&&lt(Reflect.ownKeys);ft="undefined"!=typeof Set&&lt(Set)?Set:function(){function t(){this.set=Object.create(null)}return t.prototype.has=function(t){return!0===this.set[t]},t.prototype.add=function(t){this.set[t]=!0},t.prototype.clear=function(){this.set=Object.create(null)},t}();var dt=null;function vt(t){void 0===t&&(t=null),t||dt&&dt._scope.off(),dt=t,t&&t._scope.on()}var ht=function(){function t(t,e,n,r,o,i,a,s){this.tag=t,this.data=e,this.children=n,this.text=r,this.elm=o,this.ns=void 0,this.context=i,this.fnContext=void 0,this.fnOptions=void 0,this.fnScopeId=void 0,this.key=e&&e.key,this.componentOptions=a,this.componentInstance=void 0,this.parent=void 0,this.raw=!1,this.isStatic=!1,this.isRootInsert=!0,this.isComment=!1,this.isCloned=!1,this.isOnce=!1,this.asyncFactory=s,this.asyncMeta=void 0,this.isAsyncPlaceholder=!1}return Object.defineProperty(t.prototype,"child",{get:function(){return this.componentInstance},enumerable:!1,configurable:!0}),t}(),mt=function(t){void 0===t&&(t="");var e=new ht;return e.text=t,e.isComment=!0,e};function gt(t){return new ht(void 0,void 0,void 0,String(t))}function yt(t){var e=new ht(t.tag,t.data,t.children&&t.children.slice(),t.text,t.elm,t.context,t.componentOptions,t.asyncFactory);return e.ns=t.ns,e.isStatic=t.isStatic,e.key=t.key,e.isComment=t.isComment,e.fnContext=t.fnContext,e.fnOptions=t.fnOptions,e.fnScopeId=t.fnScopeId,e.asyncMeta=t.asyncMeta,e.isCloned=!0,e}"function"==typeof SuppressedError&&SuppressedError;var _t=0,bt=[],$t=function(){for(var t=0;t<bt.length;t++){var e=bt[t];e.subs=e.subs.filter((function(t){return t})),e._pending=!1}bt.length=0},wt=function(){function t(){this._pending=!1,this.id=_t++,this.subs=[]}return t.prototype.addSub=function(t){this.subs.push(t)},t.prototype.removeSub=function(t){this.subs[this.subs.indexOf(t)]=null,this._pending||(this._pending=!0,bt.push(this))},t.prototype.depend=function(e){t.target&&t.target.addDep(this)},t.prototype.notify=function(t){var e=this.subs.filter((function(t){return t}));for(var n=0,r=e.length;n<r;n++){0,e[n].update()}},t}();wt.target=null;var xt=[];function Ct(t){xt.push(t),wt.target=t}function kt(){xt.pop(),wt.target=xt[xt.length-1]}var Ot=Array.prototype,St=Object.create(Ot);["push","pop","shift","unshift","splice","sort","reverse"].forEach((function(t){var e=Ot[t];W(St,t,(function(){for(var n=[],r=0;r<arguments.length;r++)n[r]=arguments[r];var o,i=e.apply(this,n),a=this.__ob__;switch(t){case"push":case"unshift":o=n;break;case"splice":o=n.slice(2)}return o&&a.observeArray(o),a.dep.notify(),i}))}));var Tt=Object.getOwnPropertyNames(St),At={},jt=!0;function Nt(t){jt=t}var Et={notify:M,depend:M,addSub:M,removeSub:M},Dt=function(){function t(t,e,n){if(void 0===e&&(e=!1),void 0===n&&(n=!1),this.value=t,this.shallow=e,this.mock=n,this.dep=n?Et:new wt,this.vmCount=0,W(t,"__ob__",this),o(t)){if(!n)if(G)t.__proto__=St;else for(var r=0,i=Tt.length;r<i;r++){W(t,s=Tt[r],St[s])}e||this.observeArray(t)}else{var a=Object.keys(t);for(r=0;r<a.length;r++){var s;Mt(t,s=a[r],At,void 0,e,n)}}}return t.prototype.observeArray=function(t){for(var e=0,n=t.length;e<n;e++)Pt(t[e],!1,this.mock)},t}();function Pt(t,e,n){return t&&C(t,"__ob__")&&t.__ob__ instanceof Dt?t.__ob__:!jt||!n&&ct()||!o(t)&&!p(t)||!Object.isExtensible(t)||t.__v_skip||Ut(t)||t instanceof ht?void 0:new Dt(t,e,n)}function Mt(t,e,n,r,i,a,s){void 0===s&&(s=!1);var c=new wt,u=Object.getOwnPropertyDescriptor(t,e);if(!u||!1!==u.configurable){var l=u&&u.get,f=u&&u.set;l&&!f||n!==At&&2!==arguments.length||(n=t[e]);var p=i?n&&n.__ob__:Pt(n,!1,a);return Object.defineProperty(t,e,{enumerable:!0,configurable:!0,get:function(){var e=l?l.call(t):n;return wt.target&&(c.depend(),p&&(p.dep.depend(),o(e)&&Ft(e))),Ut(e)&&!i?e.value:e},set:function(e){var r=l?l.call(t):n;if(B(r,e)){if(f)f.call(t,e);else{if(l)return;if(!i&&Ut(r)&&!Ut(e))return void(r.value=e);n=e}p=i?e&&e.__ob__:Pt(e,!1,a),c.notify()}}}),c}}function It(t,e,n){if(!Bt(t)){var r=t.__ob__;return o(t)&&v(e)?(t.length=Math.max(t.length,e),t.splice(e,1,n),r&&!r.shallow&&r.mock&&Pt(n,!1,!0),n):e in t&&!(e in Object.prototype)?(t[e]=n,n):t._isVue||r&&r.vmCount?n:r?(Mt(r.value,e,n,void 0,r.shallow,r.mock),r.dep.notify(),n):(t[e]=n,n)}}function Lt(t,e){if(o(t)&&v(e))t.splice(e,1);else{var n=t.__ob__;t._isVue||n&&n.vmCount||Bt(t)||C(t,e)&&(delete t[e],n&&n.dep.notify())}}function Ft(t){for(var e=void 0,n=0,r=t.length;n<r;n++)(e=t[n])&&e.__ob__&&e.__ob__.dep.depend(),o(e)&&Ft(e)}function Rt(t){return Ht(t,!0),W(t,"__v_isShallow",!0),t}function Ht(t,e){if(!Bt(t)){Pt(t,e,ct());0}}function Bt(t){return!(!t||!t.__v_isReadonly)}function Ut(t){return!(!t||!0!==t.__v_isRef)}function zt(t,e,n){Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:function(){var t=e[n];if(Ut(t))return t.value;var r=t&&t.__ob__;return r&&r.dep.depend(),t},set:function(t){var r=e[n];Ut(r)&&!Ut(t)?r.value=t:e[n]=t}})}var Vt=k((function(t){var e="&"===t.charAt(0),n="~"===(t=e?t.slice(1):t).charAt(0),r="!"===(t=n?t.slice(1):t).charAt(0);return{name:t=r?t.slice(1):t,once:n,capture:r,passive:e}}));function Kt(t,e){function n(){var t=n.fns;if(!o(t))return on(t,null,arguments,e,"v-on handler");for(var r=t.slice(),i=0;i<r.length;i++)on(r[i],null,arguments,e,"v-on handler")}return n.fns=t,n}function Jt(t,e,n,r,o,a){var c,u,l,f;for(c in t)u=t[c],l=e[c],f=Vt(c),i(u)||(i(l)?(i(u.fns)&&(u=t[c]=Kt(u,a)),s(f.once)&&(u=t[c]=o(f.name,u,f.capture)),n(f.name,u,f.capture,f.passive,f.params)):u!==l&&(l.fns=u,t[c]=l));for(c in e)i(t[c])&&r((f=Vt(c)).name,e[c],f.capture)}function qt(t,e,n){var r;t instanceof ht&&(t=t.data.hook||(t.data.hook={}));var o=t[e];function c(){n.apply(this,arguments),w(r.fns,c)}i(o)?r=Kt([c]):a(o.fns)&&s(o.merged)?(r=o).fns.push(c):r=Kt([o,c]),r.merged=!0,t[e]=r}function Wt(t,e,n,r,o){if(a(e)){if(C(e,n))return t[n]=e[n],o||delete e[n],!0;if(C(e,r))return t[n]=e[r],o||delete e[r],!0}return!1}function Zt(t){return c(t)?[gt(t)]:o(t)?Xt(t):void 0}function Gt(t){return a(t)&&a(t.text)&&!1===t.isComment}function Xt(t,e){var n,r,u,l,f=[];for(n=0;n<t.length;n++)i(r=t[n])||"boolean"==typeof r||(l=f[u=f.length-1],o(r)?r.length>0&&(Gt((r=Xt(r,"".concat(e||"","_").concat(n)))[0])&&Gt(l)&&(f[u]=gt(l.text+r[0].text),r.shift()),f.push.apply(f,r)):c(r)?Gt(l)?f[u]=gt(l.text+r):""!==r&&f.push(gt(r)):Gt(r)&&Gt(l)?f[u]=gt(l.text+r.text):(s(t._isVList)&&a(r.tag)&&i(r.key)&&a(e)&&(r.key="__vlist".concat(e,"_").concat(n,"__")),f.push(r)));return f}var Yt=1,Qt=2;function te(t,e,n,r,i,f){return(o(n)||c(n))&&(i=r,r=n,n=void 0),s(f)&&(i=Qt),function(t,e,n,r,i){if(a(n)&&a(n.__ob__))return mt();a(n)&&a(n.is)&&(e=n.is);if(!e)return mt();0;o(r)&&u(r[0])&&((n=n||{}).scopedSlots={default:r[0]},r.length=0);i===Qt?r=Zt(r):i===Yt&&(r=function(t){for(var e=0;e<t.length;e++)if(o(t[e]))return Array.prototype.concat.apply([],t);return t}(r));var s,c;if("string"==typeof e){var f=void 0;c=t.$vnode&&t.$vnode.ns||K.getTagNamespace(e),s=K.isReservedTag(e)?new ht(K.parsePlatformTagName(e),n,r,void 0,void 0,t):n&&n.pre||!a(f=Xn(t.$options,"components",e))?new ht(e,n,r,void 0,void 0,t):Bn(f,n,t,r,e)}else s=Bn(e,n,t,r);return o(s)?s:a(s)?(a(c)&&ee(s,c),a(n)&&function(t){l(t.style)&&bn(t.style);l(t.class)&&bn(t.class)}(n),s):mt()}(t,e,n,r,i)}function ee(t,e,n){if(t.ns=e,"foreignObject"===t.tag&&(e=void 0,n=!0),a(t.children))for(var r=0,o=t.children.length;r<o;r++){var c=t.children[r];a(c.tag)&&(i(c.ns)||s(n)&&"svg"!==c.tag)&&ee(c,e,n)}}function ne(t,e){var n,r,i,s,c=null;if(o(t)||"string"==typeof t)for(c=new Array(t.length),n=0,r=t.length;n<r;n++)c[n]=e(t[n],n);else if("number"==typeof t)for(c=new Array(t),n=0;n<t;n++)c[n]=e(n+1,n);else if(l(t))if(pt&&t[Symbol.iterator]){c=[];for(var u=t[Symbol.iterator](),f=u.next();!f.done;)c.push(e(f.value,c.length)),f=u.next()}else for(i=Object.keys(t),c=new Array(i.length),n=0,r=i.length;n<r;n++)s=i[n],c[n]=e(t[s],s,n);return a(c)||(c=[]),c._isVList=!0,c}function re(t,e,n,r){var o,i=this.$scopedSlots[t];i?(n=n||{},r&&(n=D(D({},r),n)),o=i(n)||(u(e)?e():e)):o=this.$slots[t]||(u(e)?e():e);var a=n&&n.slot;return a?this.$createElement("template",{slot:a},o):o}function oe(t){return Xn(this.$options,"filters",t,!0)||L}function ie(t,e){return o(t)?-1===t.indexOf(e):t!==e}function ae(t,e,n,r,o){var i=K.keyCodes[e]||n;return o&&r&&!K.keyCodes[e]?ie(o,r):i?ie(i,t):r?j(r)!==e:void 0===t}function se(t,e,n,r,i){if(n)if(l(n)){o(n)&&(n=P(n));var a=void 0,s=function(o){if("class"===o||"style"===o||$(o))a=t;else{var s=t.attrs&&t.attrs.type;a=r||K.mustUseProp(e,s,o)?t.domProps||(t.domProps={}):t.attrs||(t.attrs={})}var c=S(o),u=j(o);c in a||u in a||(a[o]=n[o],i&&((t.on||(t.on={}))["update:".concat(o)]=function(t){n[o]=t}))};for(var c in n)s(c)}else;return t}function ce(t,e){var n=this._staticTrees||(this._staticTrees=[]),r=n[t];return r&&!e||le(r=n[t]=this.$options.staticRenderFns[t].call(this._renderProxy,this._c,this),"__static__".concat(t),!1),r}function ue(t,e,n){return le(t,"__once__".concat(e).concat(n?"_".concat(n):""),!0),t}function le(t,e,n){if(o(t))for(var r=0;r<t.length;r++)t[r]&&"string"!=typeof t[r]&&fe(t[r],"".concat(e,"_").concat(r),n);else fe(t,e,n)}function fe(t,e,n){t.isStatic=!0,t.key=e,t.isOnce=n}function pe(t,e){if(e)if(p(e)){var n=t.on=t.on?D({},t.on):{};for(var r in e){var o=n[r],i=e[r];n[r]=o?[].concat(o,i):i}}else;return t}function de(t,e,n,r){e=e||{$stable:!n};for(var i=0;i<t.length;i++){var a=t[i];o(a)?de(a,e,n):a&&(a.proxy&&(a.fn.proxy=!0),e[a.key]=a.fn)}return r&&(e.$key=r),e}function ve(t,e){for(var n=0;n<e.length;n+=2){var r=e[n];"string"==typeof r&&r&&(t[e[n]]=e[n+1])}return t}function he(t,e){return"string"==typeof t?e+t:t}function me(t){t._o=ue,t._n=y,t._s=m,t._l=ne,t._t=re,t._q=F,t._i=R,t._m=ce,t._f=oe,t._k=ae,t._b=se,t._v=gt,t._e=mt,t._u=de,t._g=pe,t._d=ve,t._p=he}function ge(t,e){if(!t||!t.length)return{};for(var n={},r=0,o=t.length;r<o;r++){var i=t[r],a=i.data;if(a&&a.attrs&&a.attrs.slot&&delete a.attrs.slot,i.context!==e&&i.fnContext!==e||!a||null==a.slot)(n.default||(n.default=[])).push(i);else{var s=a.slot,c=n[s]||(n[s]=[]);"template"===i.tag?c.push.apply(c,i.children||[]):c.push(i)}}for(var u in n)n[u].every(ye)&&delete n[u];return n}function ye(t){return t.isComment&&!t.asyncFactory||" "===t.text}function _e(t){return t.isComment&&t.asyncFactory}function be(t,e,n,o){var i,a=Object.keys(n).length>0,s=e?!!e.$stable:!a,c=e&&e.$key;if(e){if(e._normalized)return e._normalized;if(s&&o&&o!==r&&c===o.$key&&!a&&!o.$hasNormal)return o;for(var u in i={},e)e[u]&&"$"!==u[0]&&(i[u]=$e(t,n,u,e[u]))}else i={};for(var l in n)l in i||(i[l]=we(n,l));return e&&Object.isExtensible(e)&&(e._normalized=i),W(i,"$stable",s),W(i,"$key",c),W(i,"$hasNormal",a),i}function $e(t,e,n,r){var i=function(){var e=dt;vt(t);var n=arguments.length?r.apply(null,arguments):r({}),i=(n=n&&"object"==typeof n&&!o(n)?[n]:Zt(n))&&n[0];return vt(e),n&&(!i||1===n.length&&i.isComment&&!_e(i))?void 0:n};return r.proxy&&Object.defineProperty(e,n,{get:i,enumerable:!0,configurable:!0}),i}function we(t,e){return function(){return t[e]}}function xe(t){return{get attrs(){if(!t._attrsProxy){var e=t._attrsProxy={};W(e,"_v_attr_proxy",!0),Ce(e,t.$attrs,r,t,"$attrs")}return t._attrsProxy},get listeners(){t._listenersProxy||Ce(t._listenersProxy={},t.$listeners,r,t,"$listeners");return t._listenersProxy},get slots(){return function(t){t._slotsProxy||Oe(t._slotsProxy={},t.$scopedSlots);return t._slotsProxy}(t)},emit:N(t.$emit,t),expose:function(e){e&&Object.keys(e).forEach((function(n){return zt(t,e,n)}))}}}function Ce(t,e,n,r,o){var i=!1;for(var a in e)a in t?e[a]!==n[a]&&(i=!0):(i=!0,ke(t,a,r,o));for(var a in t)a in e||(i=!0,delete t[a]);return i}function ke(t,e,n,r){Object.defineProperty(t,e,{enumerable:!0,configurable:!0,get:function(){return n[r][e]}})}function Oe(t,e){for(var n in e)t[n]=e[n];for(var n in t)n in e||delete t[n]}var Se,Te,Ae=null;function je(t,e){return(t.__esModule||pt&&"Module"===t[Symbol.toStringTag])&&(t=t.default),l(t)?e.extend(t):t}function Ne(t){if(o(t))for(var e=0;e<t.length;e++){var n=t[e];if(a(n)&&(a(n.componentOptions)||_e(n)))return n}}function Ee(t,e){Se.$on(t,e)}function De(t,e){Se.$off(t,e)}function Pe(t,e){var n=Se;return function r(){null!==e.apply(null,arguments)&&n.$off(t,r)}}function Me(t,e,n){Se=t,Jt(e,n||{},Ee,De,Pe,t),Se=void 0}var Ie=function(){function t(t){void 0===t&&(t=!1),this.detached=t,this.active=!0,this.effects=[],this.cleanups=[],this.parent=Te,!t&&Te&&(this.index=(Te.scopes||(Te.scopes=[])).push(this)-1)}return t.prototype.run=function(t){if(this.active){var e=Te;try{return Te=this,t()}finally{Te=e}}else 0},t.prototype.on=function(){Te=this},t.prototype.off=function(){Te=this.parent},t.prototype.stop=function(t){if(this.active){var e=void 0,n=void 0;for(e=0,n=this.effects.length;e<n;e++)this.effects[e].teardown();for(e=0,n=this.cleanups.length;e<n;e++)this.cleanups[e]();if(this.scopes)for(e=0,n=this.scopes.length;e<n;e++)this.scopes[e].stop(!0);if(!this.detached&&this.parent&&!t){var r=this.parent.scopes.pop();r&&r!==this&&(this.parent.scopes[this.index]=r,r.index=this.index)}this.parent=void 0,this.active=!1}},t}();var Le=null;function Fe(t){var e=Le;return Le=t,function(){Le=e}}function Re(t){for(;t&&(t=t.$parent);)if(t._inactive)return!0;return!1}function He(t,e){if(e){if(t._directInactive=!1,Re(t))return}else if(t._directInactive)return;if(t._inactive||null===t._inactive){t._inactive=!1;for(var n=0;n<t.$children.length;n++)He(t.$children[n]);Ue(t,"activated")}}function Be(t,e){if(!(e&&(t._directInactive=!0,Re(t))||t._inactive)){t._inactive=!0;for(var n=0;n<t.$children.length;n++)Be(t.$children[n]);Ue(t,"deactivated")}}function Ue(t,e,n,r){void 0===r&&(r=!0),Ct();var o=dt,i=Te;r&&vt(t);var a=t.$options[e],s="".concat(e," hook");if(a)for(var c=0,u=a.length;c<u;c++)on(a[c],t,n||null,t,s);t._hasHookEvent&&t.$emit("hook:"+e),r&&(vt(o),i&&i.on()),kt()}var ze=[],Ve=[],Ke={},Je=!1,qe=!1,We=0;var Ze=0,Ge=Date.now;if(X&&!Q){var Xe=window.performance;Xe&&"function"==typeof Xe.now&&Ge()>document.createEvent("Event").timeStamp&&(Ge=function(){return Xe.now()})}var Ye=function(t,e){if(t.post){if(!e.post)return 1}else if(e.post)return-1;return t.id-e.id};function Qe(){var t,e;for(Ze=Ge(),qe=!0,ze.sort(Ye),We=0;We<ze.length;We++)(t=ze[We]).before&&t.before(),e=t.id,Ke[e]=null,t.run();var n=Ve.slice(),r=ze.slice();We=ze.length=Ve.length=0,Ke={},Je=qe=!1,function(t){for(var e=0;e<t.length;e++)t[e]._inactive=!0,He(t[e],!0)}(n),function(t){var e=t.length;for(;e--;){var n=t[e],r=n.vm;r&&r._watcher===n&&r._isMounted&&!r._isDestroyed&&Ue(r,"updated")}}(r),$t(),ut&&K.devtools&&ut.emit("flush")}function tn(t){var e=t.id;if(null==Ke[e]&&(t!==wt.target||!t.noRecurse)){if(Ke[e]=!0,qe){for(var n=ze.length-1;n>We&&ze[n].id>t.id;)n--;ze.splice(n+1,0,t)}else ze.push(t);Je||(Je=!0,gn(Qe))}}var en="watcher";"".concat(en," callback"),"".concat(en," getter"),"".concat(en," cleanup");function nn(t){var e=t._provided,n=t.$parent&&t.$parent._provided;return n===e?t._provided=Object.create(n):e}function rn(t,e,n){Ct();try{if(e)for(var r=e;r=r.$parent;){var o=r.$options.errorCaptured;if(o)for(var i=0;i<o.length;i++)try{if(!1===o[i].call(r,t,e,n))return}catch(t){an(t,r,"errorCaptured hook")}}an(t,e,n)}finally{kt()}}function on(t,e,n,r,o){var i;try{(i=n?t.apply(e,n):t.call(e))&&!i._isVue&&h(i)&&!i._handled&&(i.catch((function(t){return rn(t,r,o+" (Promise/async)")})),i._handled=!0)}catch(t){rn(t,r,o)}return i}function an(t,e,n){if(K.errorHandler)try{return K.errorHandler.call(null,t,e,n)}catch(e){e!==t&&sn(e,null,"config.errorHandler")}sn(t,e,n)}function sn(t,e,n){if(!X||"undefined"==typeof console)throw t;console.error(t)}var cn,un=!1,ln=[],fn=!1;function pn(){fn=!1;var t=ln.slice(0);ln.length=0;for(var e=0;e<t.length;e++)t[e]()}if("undefined"!=typeof Promise&&lt(Promise)){var dn=Promise.resolve();cn=function(){dn.then(pn),nt&&setTimeout(M)},un=!0}else if(Q||"undefined"==typeof MutationObserver||!lt(MutationObserver)&&"[object MutationObserverConstructor]"!==MutationObserver.toString())cn="undefined"!=typeof setImmediate&&lt(setImmediate)?function(){setImmediate(pn)}:function(){setTimeout(pn,0)};else{var vn=1,hn=new MutationObserver(pn),mn=document.createTextNode(String(vn));hn.observe(mn,{characterData:!0}),cn=function(){vn=(vn+1)%2,mn.data=String(vn)},un=!0}function gn(t,e){var n;if(ln.push((function(){if(t)try{t.call(e)}catch(t){rn(t,e,"nextTick")}else n&&n(e)})),fn||(fn=!0,cn()),!t&&"undefined"!=typeof Promise)return new Promise((function(t){n=t}))}function yn(t){return function(e,n){if(void 0===n&&(n=dt),n)return function(t,e,n){var r=t.$options;r[e]=qn(r[e],n)}(n,t,e)}}yn("beforeMount"),yn("mounted"),yn("beforeUpdate"),yn("updated"),yn("beforeDestroy"),yn("destroyed"),yn("activated"),yn("deactivated"),yn("serverPrefetch"),yn("renderTracked"),yn("renderTriggered"),yn("errorCaptured");var _n=new ft;function bn(t){return $n(t,_n),_n.clear(),t}function $n(t,e){var n,r,i=o(t);if(!(!i&&!l(t)||t.__v_skip||Object.isFrozen(t)||t instanceof ht)){if(t.__ob__){var a=t.__ob__.dep.id;if(e.has(a))return;e.add(a)}if(i)for(n=t.length;n--;)$n(t[n],e);else if(Ut(t))$n(t.value,e);else for(n=(r=Object.keys(t)).length;n--;)$n(t[r[n]],e)}}var wn=0,xn=function(){function t(t,e,n,r,o){var i,a;i=this,void 0===(a=Te&&!Te._vm?Te:t?t._scope:void 0)&&(a=Te),a&&a.active&&a.effects.push(i),(this.vm=t)&&o&&(t._watcher=this),r?(this.deep=!!r.deep,this.user=!!r.user,this.lazy=!!r.lazy,this.sync=!!r.sync,this.before=r.before):this.deep=this.user=this.lazy=this.sync=!1,this.cb=n,this.id=++wn,this.active=!0,this.post=!1,this.dirty=this.lazy,this.deps=[],this.newDeps=[],this.depIds=new ft,this.newDepIds=new ft,this.expression="",u(e)?this.getter=e:(this.getter=function(t){if(!Z.test(t)){var e=t.split(".");return function(t){for(var n=0;n<e.length;n++){if(!t)return;t=t[e[n]]}return t}}}(e),this.getter||(this.getter=M)),this.value=this.lazy?void 0:this.get()}return t.prototype.get=function(){var t;Ct(this);var e=this.vm;try{t=this.getter.call(e,e)}catch(t){if(!this.user)throw t;rn(t,e,'getter for watcher "'.concat(this.expression,'"'))}finally{this.deep&&bn(t),kt(),this.cleanupDeps()}return t},t.prototype.addDep=function(t){var e=t.id;this.newDepIds.has(e)||(this.newDepIds.add(e),this.newDeps.push(t),this.depIds.has(e)||t.addSub(this))},t.prototype.cleanupDeps=function(){for(var t=this.deps.length;t--;){var e=this.deps[t];this.newDepIds.has(e.id)||e.removeSub(this)}var n=this.depIds;this.depIds=this.newDepIds,this.newDepIds=n,this.newDepIds.clear(),n=this.deps,this.deps=this.newDeps,this.newDeps=n,this.newDeps.length=0},t.prototype.update=function(){this.lazy?this.dirty=!0:this.sync?this.run():tn(this)},t.prototype.run=function(){if(this.active){var t=this.get();if(t!==this.value||l(t)||this.deep){var e=this.value;if(this.value=t,this.user){var n='callback for watcher "'.concat(this.expression,'"');on(this.cb,this.vm,[t,e],this.vm,n)}else this.cb.call(this.vm,t,e)}}},t.prototype.evaluate=function(){this.value=this.get(),this.dirty=!1},t.prototype.depend=function(){for(var t=this.deps.length;t--;)this.deps[t].depend()},t.prototype.teardown=function(){if(this.vm&&!this.vm._isBeingDestroyed&&w(this.vm._scope.effects,this),this.active){for(var t=this.deps.length;t--;)this.deps[t].removeSub(this);this.active=!1,this.onStop&&this.onStop()}},t}(),Cn={enumerable:!0,configurable:!0,get:M,set:M};function kn(t,e,n){Cn.get=function(){return this[e][n]},Cn.set=function(t){this[e][n]=t},Object.defineProperty(t,n,Cn)}function On(t){var e=t.$options;if(e.props&&function(t,e){var n=t.$options.propsData||{},r=t._props=Rt({}),o=t.$options._propKeys=[],i=!t.$parent;i||Nt(!1);var a=function(i){o.push(i);var a=Yn(i,e,n,t);Mt(r,i,a,void 0,!0),i in t||kn(t,"_props",i)};for(var s in e)a(s);Nt(!0)}(t,e.props),function(t){var e=t.$options,n=e.setup;if(n){var r=t._setupContext=xe(t);vt(t),Ct();var o=on(n,null,[t._props||Rt({}),r],t,"setup");if(kt(),vt(),u(o))e.render=o;else if(l(o))if(t._setupState=o,o.__sfc){var i=t._setupProxy={};for(var a in o)"__sfc"!==a&&zt(i,o,a)}else for(var a in o)q(a)||zt(t,o,a)}}(t),e.methods&&function(t,e){t.$options.props;for(var n in e)t[n]="function"!=typeof e[n]?M:N(e[n],t)}(t,e.methods),e.data)!function(t){var e=t.$options.data;e=t._data=u(e)?function(t,e){Ct();try{return t.call(e,e)}catch(t){return rn(t,e,"data()"),{}}finally{kt()}}(e,t):e||{},p(e)||(e={});var n=Object.keys(e),r=t.$options.props,o=(t.$options.methods,n.length);for(;o--;){var i=n[o];0,r&&C(r,i)||q(i)||kn(t,"_data",i)}var a=Pt(e);a&&a.vmCount++}(t);else{var n=Pt(t._data={});n&&n.vmCount++}e.computed&&function(t,e){var n=t._computedWatchers=Object.create(null),r=ct();for(var o in e){var i=e[o],a=u(i)?i:i.get;0,r||(n[o]=new xn(t,a||M,M,Sn)),o in t||Tn(t,o,i)}}(t,e.computed),e.watch&&e.watch!==it&&function(t,e){for(var n in e){var r=e[n];if(o(r))for(var i=0;i<r.length;i++)Nn(t,n,r[i]);else Nn(t,n,r)}}(t,e.watch)}var Sn={lazy:!0};function Tn(t,e,n){var r=!ct();u(n)?(Cn.get=r?An(e):jn(n),Cn.set=M):(Cn.get=n.get?r&&!1!==n.cache?An(e):jn(n.get):M,Cn.set=n.set||M),Object.defineProperty(t,e,Cn)}function An(t){return function(){var e=this._computedWatchers&&this._computedWatchers[t];if(e)return e.dirty&&e.evaluate(),wt.target&&e.depend(),e.value}}function jn(t){return function(){return t.call(this,this)}}function Nn(t,e,n,r){return p(n)&&(r=n,n=n.handler),"string"==typeof n&&(n=t[n]),t.$watch(e,n,r)}function En(t,e){if(t){for(var n=Object.create(null),r=pt?Reflect.ownKeys(t):Object.keys(t),o=0;o<r.length;o++){var i=r[o];if("__ob__"!==i){var a=t[i].from;if(a in e._provided)n[i]=e._provided[a];else if("default"in t[i]){var s=t[i].default;n[i]=u(s)?s.call(e):s}else 0}}return n}}var Dn=0;function Pn(t){var e=t.options;if(t.super){var n=Pn(t.super);if(n!==t.superOptions){t.superOptions=n;var r=function(t){var e,n=t.options,r=t.sealedOptions;for(var o in n)n[o]!==r[o]&&(e||(e={}),e[o]=n[o]);return e}(t);r&&D(t.extendOptions,r),(e=t.options=Gn(n,t.extendOptions)).name&&(e.components[e.name]=t)}}return e}function Mn(t,e,n,i,a){var c,u=this,l=a.options;C(i,"_uid")?(c=Object.create(i))._original=i:(c=i,i=i._original);var f=s(l._compiled),p=!f;this.data=t,this.props=e,this.children=n,this.parent=i,this.listeners=t.on||r,this.injections=En(l.inject,i),this.slots=function(){return u.$slots||be(i,t.scopedSlots,u.$slots=ge(n,i)),u.$slots},Object.defineProperty(this,"scopedSlots",{enumerable:!0,get:function(){return be(i,t.scopedSlots,this.slots())}}),f&&(this.$options=l,this.$slots=this.slots(),this.$scopedSlots=be(i,t.scopedSlots,this.$slots)),l._scopeId?this._c=function(t,e,n,r){var a=te(c,t,e,n,r,p);return a&&!o(a)&&(a.fnScopeId=l._scopeId,a.fnContext=i),a}:this._c=function(t,e,n,r){return te(c,t,e,n,r,p)}}function In(t,e,n,r,o){var i=yt(t);return i.fnContext=n,i.fnOptions=r,e.slot&&((i.data||(i.data={})).slot=e.slot),i}function Ln(t,e){for(var n in e)t[S(n)]=e[n]}function Fn(t){return t.name||t.__name||t._componentTag}me(Mn.prototype);var Rn={init:function(t,e){if(t.componentInstance&&!t.componentInstance._isDestroyed&&t.data.keepAlive){var n=t;Rn.prepatch(n,n)}else{(t.componentInstance=function(t,e){var n={_isComponent:!0,_parentVnode:t,parent:e},r=t.data.inlineTemplate;a(r)&&(n.render=r.render,n.staticRenderFns=r.staticRenderFns);return new t.componentOptions.Ctor(n)}(t,Le)).$mount(e?t.elm:void 0,e)}},prepatch:function(t,e){var n=e.componentOptions;!function(t,e,n,o,i){var a=o.data.scopedSlots,s=t.$scopedSlots,c=!!(a&&!a.$stable||s!==r&&!s.$stable||a&&t.$scopedSlots.$key!==a.$key||!a&&t.$scopedSlots.$key),u=!!(i||t.$options._renderChildren||c),l=t.$vnode;t.$options._parentVnode=o,t.$vnode=o,t._vnode&&(t._vnode.parent=o),t.$options._renderChildren=i;var f=o.data.attrs||r;t._attrsProxy&&Ce(t._attrsProxy,f,l.data&&l.data.attrs||r,t,"$attrs")&&(u=!0),t.$attrs=f,n=n||r;var p=t.$options._parentListeners;if(t._listenersProxy&&Ce(t._listenersProxy,n,p||r,t,"$listeners"),t.$listeners=t.$options._parentListeners=n,Me(t,n,p),e&&t.$options.props){Nt(!1);for(var d=t._props,v=t.$options._propKeys||[],h=0;h<v.length;h++){var m=v[h],g=t.$options.props;d[m]=Yn(m,g,e,t)}Nt(!0),t.$options.propsData=e}u&&(t.$slots=ge(i,o.context),t.$forceUpdate())}(e.componentInstance=t.componentInstance,n.propsData,n.listeners,e,n.children)},insert:function(t){var e,n=t.context,r=t.componentInstance;r._isMounted||(r._isMounted=!0,Ue(r,"mounted")),t.data.keepAlive&&(n._isMounted?((e=r)._inactive=!1,Ve.push(e)):He(r,!0))},destroy:function(t){var e=t.componentInstance;e._isDestroyed||(t.data.keepAlive?Be(e,!0):e.$destroy())}},Hn=Object.keys(Rn);function Bn(t,e,n,c,u){if(!i(t)){var f=n.$options._base;if(l(t)&&(t=f.extend(t)),"function"==typeof t){var p;if(i(t.cid)&&(t=function(t,e){if(s(t.error)&&a(t.errorComp))return t.errorComp;if(a(t.resolved))return t.resolved;var n=Ae;if(n&&a(t.owners)&&-1===t.owners.indexOf(n)&&t.owners.push(n),s(t.loading)&&a(t.loadingComp))return t.loadingComp;if(n&&!a(t.owners)){var r=t.owners=[n],o=!0,c=null,u=null;n.$on("hook:destroyed",(function(){return w(r,n)}));var f=function(t){for(var e=0,n=r.length;e<n;e++)r[e].$forceUpdate();t&&(r.length=0,null!==c&&(clearTimeout(c),c=null),null!==u&&(clearTimeout(u),u=null))},p=H((function(n){t.resolved=je(n,e),o?r.length=0:f(!0)})),d=H((function(e){a(t.errorComp)&&(t.error=!0,f(!0))})),v=t(p,d);return l(v)&&(h(v)?i(t.resolved)&&v.then(p,d):h(v.component)&&(v.component.then(p,d),a(v.error)&&(t.errorComp=je(v.error,e)),a(v.loading)&&(t.loadingComp=je(v.loading,e),0===v.delay?t.loading=!0:c=setTimeout((function(){c=null,i(t.resolved)&&i(t.error)&&(t.loading=!0,f(!1))}),v.delay||200)),a(v.timeout)&&(u=setTimeout((function(){u=null,i(t.resolved)&&d(null)}),v.timeout)))),o=!1,t.loading?t.loadingComp:t.resolved}}(p=t,f),void 0===t))return function(t,e,n,r,o){var i=mt();return i.asyncFactory=t,i.asyncMeta={data:e,context:n,children:r,tag:o},i}(p,e,n,c,u);e=e||{},Pn(t),a(e.model)&&function(t,e){var n=t.model&&t.model.prop||"value",r=t.model&&t.model.event||"input";(e.attrs||(e.attrs={}))[n]=e.model.value;var i=e.on||(e.on={}),s=i[r],c=e.model.callback;a(s)?(o(s)?-1===s.indexOf(c):s!==c)&&(i[r]=[c].concat(s)):i[r]=c}(t.options,e);var d=function(t,e){var n=e.options.props;if(!i(n)){var r={},o=t.attrs,s=t.props;if(a(o)||a(s))for(var c in n){var u=j(c);Wt(r,s,c,u,!0)||Wt(r,o,c,u,!1)}return r}}(e,t);if(s(t.options.functional))return function(t,e,n,i,s){var c=t.options,u={},l=c.props;if(a(l))for(var f in l)u[f]=Yn(f,l,e||r);else a(n.attrs)&&Ln(u,n.attrs),a(n.props)&&Ln(u,n.props);var p=new Mn(n,u,s,i,t),d=c.render.call(null,p._c,p);if(d instanceof ht)return In(d,n,p.parent,c);if(o(d)){for(var v=Zt(d)||[],h=new Array(v.length),m=0;m<v.length;m++)h[m]=In(v[m],n,p.parent,c);return h}}(t,d,e,n,c);var v=e.on;if(e.on=e.nativeOn,s(t.options.abstract)){var m=e.slot;e={},m&&(e.slot=m)}!function(t){for(var e=t.hook||(t.hook={}),n=0;n<Hn.length;n++){var r=Hn[n],o=e[r],i=Rn[r];o===i||o&&o._merged||(e[r]=o?Un(i,o):i)}}(e);var g=Fn(t.options)||u;return new ht("vue-component-".concat(t.cid).concat(g?"-".concat(g):""),e,void 0,void 0,void 0,n,{Ctor:t,propsData:d,listeners:v,tag:u,children:c},p)}}}function Un(t,e){var n=function(n,r){t(n,r),e(n,r)};return n._merged=!0,n}var zn=M,Vn=K.optionMergeStrategies;function Kn(t,e,n){if(void 0===n&&(n=!0),!e)return t;for(var r,o,i,a=pt?Reflect.ownKeys(e):Object.keys(e),s=0;s<a.length;s++)"__ob__"!==(r=a[s])&&(o=t[r],i=e[r],n&&C(t,r)?o!==i&&p(o)&&p(i)&&Kn(o,i):It(t,r,i));return t}function Jn(t,e,n){return n?function(){var r=u(e)?e.call(n,n):e,o=u(t)?t.call(n,n):t;return r?Kn(r,o):o}:e?t?function(){return Kn(u(e)?e.call(this,this):e,u(t)?t.call(this,this):t)}:e:t}function qn(t,e){var n=e?t?t.concat(e):o(e)?e:[e]:t;return n?function(t){for(var e=[],n=0;n<t.length;n++)-1===e.indexOf(t[n])&&e.push(t[n]);return e}(n):n}function Wn(t,e,n,r){var o=Object.create(t||null);return e?D(o,e):o}Vn.data=function(t,e,n){return n?Jn(t,e,n):e&&"function"!=typeof e?t:Jn(t,e)},V.forEach((function(t){Vn[t]=qn})),z.forEach((function(t){Vn[t+"s"]=Wn})),Vn.watch=function(t,e,n,r){if(t===it&&(t=void 0),e===it&&(e=void 0),!e)return Object.create(t||null);if(!t)return e;var i={};for(var a in D(i,t),e){var s=i[a],c=e[a];s&&!o(s)&&(s=[s]),i[a]=s?s.concat(c):o(c)?c:[c]}return i},Vn.props=Vn.methods=Vn.inject=Vn.computed=function(t,e,n,r){if(!t)return e;var o=Object.create(null);return D(o,t),e&&D(o,e),o},Vn.provide=function(t,e){return t?function(){var n=Object.create(null);return Kn(n,u(t)?t.call(this):t),e&&Kn(n,u(e)?e.call(this):e,!1),n}:e};var Zn=function(t,e){return void 0===e?t:e};function Gn(t,e,n){if(u(e)&&(e=e.options),function(t){var e=t.props;if(e){var n,r,i={};if(o(e))for(n=e.length;n--;)"string"==typeof(r=e[n])&&(i[S(r)]={type:null});else if(p(e))for(var a in e)r=e[a],i[S(a)]=p(r)?r:{type:r};t.props=i}}(e),function(t){var e=t.inject;if(e){var n=t.inject={};if(o(e))for(var r=0;r<e.length;r++)n[e[r]]={from:e[r]};else if(p(e))for(var i in e){var a=e[i];n[i]=p(a)?D({from:i},a):{from:a}}}}(e),function(t){var e=t.directives;if(e)for(var n in e){var r=e[n];u(r)&&(e[n]={bind:r,update:r})}}(e),!e._base&&(e.extends&&(t=Gn(t,e.extends,n)),e.mixins))for(var r=0,i=e.mixins.length;r<i;r++)t=Gn(t,e.mixins[r],n);var a,s={};for(a in t)c(a);for(a in e)C(t,a)||c(a);function c(r){var o=Vn[r]||Zn;s[r]=o(t[r],e[r],n,r)}return s}function Xn(t,e,n,r){if("string"==typeof n){var o=t[e];if(C(o,n))return o[n];var i=S(n);if(C(o,i))return o[i];var a=T(i);return C(o,a)?o[a]:o[n]||o[i]||o[a]}}function Yn(t,e,n,r){var o=e[t],i=!C(n,t),a=n[t],s=nr(Boolean,o.type);if(s>-1)if(i&&!C(o,"default"))a=!1;else if(""===a||a===j(t)){var c=nr(String,o.type);(c<0||s<c)&&(a=!0)}if(void 0===a){a=function(t,e,n){if(!C(e,"default"))return;var r=e.default;0;if(t&&t.$options.propsData&&void 0===t.$options.propsData[n]&&void 0!==t._props[n])return t._props[n];return u(r)&&"Function"!==tr(e.type)?r.call(t):r}(r,o,t);var l=jt;Nt(!0),Pt(a),Nt(l)}return a}var Qn=/^\s*function (\w+)/;function tr(t){var e=t&&t.toString().match(Qn);return e?e[1]:""}function er(t,e){return tr(t)===tr(e)}function nr(t,e){if(!o(e))return er(e,t)?0:-1;for(var n=0,r=e.length;n<r;n++)if(er(e[n],t))return n;return-1}function rr(t){this._init(t)}function or(t){t.cid=0;var e=1;t.extend=function(t){t=t||{};var n=this,r=n.cid,o=t._Ctor||(t._Ctor={});if(o[r])return o[r];var i=Fn(t)||Fn(n.options);var a=function(t){this._init(t)};return(a.prototype=Object.create(n.prototype)).constructor=a,a.cid=e++,a.options=Gn(n.options,t),a.super=n,a.options.props&&function(t){var e=t.options.props;for(var n in e)kn(t.prototype,"_props",n)}(a),a.options.computed&&function(t){var e=t.options.computed;for(var n in e)Tn(t.prototype,n,e[n])}(a),a.extend=n.extend,a.mixin=n.mixin,a.use=n.use,z.forEach((function(t){a[t]=n[t]})),i&&(a.options.components[i]=a),a.superOptions=n.options,a.extendOptions=t,a.sealedOptions=D({},a.options),o[r]=a,a}}function ir(t){return t&&(Fn(t.Ctor.options)||t.tag)}function ar(t,e){return o(t)?t.indexOf(e)>-1:"string"==typeof t?t.split(",").indexOf(e)>-1:!!d(t)&&t.test(e)}function sr(t,e){var n=t.cache,r=t.keys,o=t._vnode,i=t.$vnode;for(var a in n){var s=n[a];if(s){var c=s.name;c&&!e(c)&&cr(n,a,r,o)}}i.componentOptions.children=void 0}function cr(t,e,n,r){var o=t[e];!o||r&&o.tag===r.tag||o.componentInstance.$destroy(),t[e]=null,w(n,e)}!function(t){t.prototype._init=function(t){var e=this;e._uid=Dn++,e._isVue=!0,e.__v_skip=!0,e._scope=new Ie(!0),e._scope.parent=void 0,e._scope._vm=!0,t&&t._isComponent?function(t,e){var n=t.$options=Object.create(t.constructor.options),r=e._parentVnode;n.parent=e.parent,n._parentVnode=r;var o=r.componentOptions;n.propsData=o.propsData,n._parentListeners=o.listeners,n._renderChildren=o.children,n._componentTag=o.tag,e.render&&(n.render=e.render,n.staticRenderFns=e.staticRenderFns)}(e,t):e.$options=Gn(Pn(e.constructor),t||{},e),e._renderProxy=e,e._self=e,function(t){var e=t.$options,n=e.parent;if(n&&!e.abstract){for(;n.$options.abstract&&n.$parent;)n=n.$parent;n.$children.push(t)}t.$parent=n,t.$root=n?n.$root:t,t.$children=[],t.$refs={},t._provided=n?n._provided:Object.create(null),t._watcher=null,t._inactive=null,t._directInactive=!1,t._isMounted=!1,t._isDestroyed=!1,t._isBeingDestroyed=!1}(e),function(t){t._events=Object.create(null),t._hasHookEvent=!1;var e=t.$options._parentListeners;e&&Me(t,e)}(e),function(t){t._vnode=null,t._staticTrees=null;var e=t.$options,n=t.$vnode=e._parentVnode,o=n&&n.context;t.$slots=ge(e._renderChildren,o),t.$scopedSlots=n?be(t.$parent,n.data.scopedSlots,t.$slots):r,t._c=function(e,n,r,o){return te(t,e,n,r,o,!1)},t.$createElement=function(e,n,r,o){return te(t,e,n,r,o,!0)};var i=n&&n.data;Mt(t,"$attrs",i&&i.attrs||r,null,!0),Mt(t,"$listeners",e._parentListeners||r,null,!0)}(e),Ue(e,"beforeCreate",void 0,!1),function(t){var e=En(t.$options.inject,t);e&&(Nt(!1),Object.keys(e).forEach((function(n){Mt(t,n,e[n])})),Nt(!0))}(e),On(e),function(t){var e=t.$options.provide;if(e){var n=u(e)?e.call(t):e;if(!l(n))return;for(var r=nn(t),o=pt?Reflect.ownKeys(n):Object.keys(n),i=0;i<o.length;i++){var a=o[i];Object.defineProperty(r,a,Object.getOwnPropertyDescriptor(n,a))}}}(e),Ue(e,"created"),e.$options.el&&e.$mount(e.$options.el)}}(rr),function(t){var e={get:function(){return this._data}},n={get:function(){return this._props}};Object.defineProperty(t.prototype,"$data",e),Object.defineProperty(t.prototype,"$props",n),t.prototype.$set=It,t.prototype.$delete=Lt,t.prototype.$watch=function(t,e,n){var r=this;if(p(e))return Nn(r,t,e,n);(n=n||{}).user=!0;var o=new xn(r,t,e,n);if(n.immediate){var i='callback for immediate watcher "'.concat(o.expression,'"');Ct(),on(e,r,[o.value],r,i),kt()}return function(){o.teardown()}}}(rr),function(t){var e=/^hook:/;t.prototype.$on=function(t,n){var r=this;if(o(t))for(var i=0,a=t.length;i<a;i++)r.$on(t[i],n);else(r._events[t]||(r._events[t]=[])).push(n),e.test(t)&&(r._hasHookEvent=!0);return r},t.prototype.$once=function(t,e){var n=this;function r(){n.$off(t,r),e.apply(n,arguments)}return r.fn=e,n.$on(t,r),n},t.prototype.$off=function(t,e){var n=this;if(!arguments.length)return n._events=Object.create(null),n;if(o(t)){for(var r=0,i=t.length;r<i;r++)n.$off(t[r],e);return n}var a,s=n._events[t];if(!s)return n;if(!e)return n._events[t]=null,n;for(var c=s.length;c--;)if((a=s[c])===e||a.fn===e){s.splice(c,1);break}return n},t.prototype.$emit=function(t){var e=this,n=e._events[t];if(n){n=n.length>1?E(n):n;for(var r=E(arguments,1),o='event handler for "'.concat(t,'"'),i=0,a=n.length;i<a;i++)on(n[i],e,r,e,o)}return e}}(rr),function(t){t.prototype._update=function(t,e){var n=this,r=n.$el,o=n._vnode,i=Fe(n);n._vnode=t,n.$el=o?n.__patch__(o,t):n.__patch__(n.$el,t,e,!1),i(),r&&(r.__vue__=null),n.$el&&(n.$el.__vue__=n);for(var a=n;a&&a.$vnode&&a.$parent&&a.$vnode===a.$parent._vnode;)a.$parent.$el=a.$el,a=a.$parent},t.prototype.$forceUpdate=function(){this._watcher&&this._watcher.update()},t.prototype.$destroy=function(){var t=this;if(!t._isBeingDestroyed){Ue(t,"beforeDestroy"),t._isBeingDestroyed=!0;var e=t.$parent;!e||e._isBeingDestroyed||t.$options.abstract||w(e.$children,t),t._scope.stop(),t._data.__ob__&&t._data.__ob__.vmCount--,t._isDestroyed=!0,t.__patch__(t._vnode,null),Ue(t,"destroyed"),t.$off(),t.$el&&(t.$el.__vue__=null),t.$vnode&&(t.$vnode.parent=null)}}}(rr),function(t){me(t.prototype),t.prototype.$nextTick=function(t){return gn(t,this)},t.prototype._render=function(){var t=this,e=t.$options,n=e.render,r=e._parentVnode;r&&t._isMounted&&(t.$scopedSlots=be(t.$parent,r.data.scopedSlots,t.$slots,t.$scopedSlots),t._slotsProxy&&Oe(t._slotsProxy,t.$scopedSlots)),t.$vnode=r;var i,a=dt,s=Ae;try{vt(t),Ae=t,i=n.call(t._renderProxy,t.$createElement)}catch(e){rn(e,t,"render"),i=t._vnode}finally{Ae=s,vt(a)}return o(i)&&1===i.length&&(i=i[0]),i instanceof ht||(i=mt()),i.parent=r,i}}(rr);var ur=[String,RegExp,Array],lr={name:"keep-alive",abstract:!0,props:{include:ur,exclude:ur,max:[String,Number]},methods:{cacheVNode:function(){var t=this,e=t.cache,n=t.keys,r=t.vnodeToCache,o=t.keyToCache;if(r){var i=r.tag,a=r.componentInstance,s=r.componentOptions;e[o]={name:ir(s),tag:i,componentInstance:a},n.push(o),this.max&&n.length>parseInt(this.max)&&cr(e,n[0],n,this._vnode),this.vnodeToCache=null}}},created:function(){this.cache=Object.create(null),this.keys=[]},destroyed:function(){for(var t in this.cache)cr(this.cache,t,this.keys)},mounted:function(){var t=this;this.cacheVNode(),this.$watch("include",(function(e){sr(t,(function(t){return ar(e,t)}))})),this.$watch("exclude",(function(e){sr(t,(function(t){return!ar(e,t)}))}))},updated:function(){this.cacheVNode()},render:function(){var t=this.$slots.default,e=Ne(t),n=e&&e.componentOptions;if(n){var r=ir(n),o=this.include,i=this.exclude;if(o&&(!r||!ar(o,r))||i&&r&&ar(i,r))return e;var a=this.cache,s=this.keys,c=null==e.key?n.Ctor.cid+(n.tag?"::".concat(n.tag):""):e.key;a[c]?(e.componentInstance=a[c].componentInstance,w(s,c),s.push(c)):(this.vnodeToCache=e,this.keyToCache=c),e.data.keepAlive=!0}return e||t&&t[0]}},fr={KeepAlive:lr};!function(t){var e={get:function(){return K}};Object.defineProperty(t,"config",e),t.util={warn:zn,extend:D,mergeOptions:Gn,defineReactive:Mt},t.set=It,t.delete=Lt,t.nextTick=gn,t.observable=function(t){return Pt(t),t},t.options=Object.create(null),z.forEach((function(e){t.options[e+"s"]=Object.create(null)})),t.options._base=t,D(t.options.components,fr),function(t){t.use=function(t){var e=this._installedPlugins||(this._installedPlugins=[]);if(e.indexOf(t)>-1)return this;var n=E(arguments,1);return n.unshift(this),u(t.install)?t.install.apply(t,n):u(t)&&t.apply(null,n),e.push(t),this}}(t),function(t){t.mixin=function(t){return this.options=Gn(this.options,t),this}}(t),or(t),function(t){z.forEach((function(e){t[e]=function(t,n){return n?("component"===e&&p(n)&&(n.name=n.name||t,n=this.options._base.extend(n)),"directive"===e&&u(n)&&(n={bind:n,update:n}),this.options[e+"s"][t]=n,n):this.options[e+"s"][t]}}))}(t)}(rr),Object.defineProperty(rr.prototype,"$isServer",{get:ct}),Object.defineProperty(rr.prototype,"$ssrContext",{get:function(){return this.$vnode&&this.$vnode.ssrContext}}),Object.defineProperty(rr,"FunctionalRenderContext",{value:Mn}),rr.version="2.7.16";var pr=_("style,class"),dr=_("input,textarea,option,select,progress"),vr=function(t,e,n){return"value"===n&&dr(t)&&"button"!==e||"selected"===n&&"option"===t||"checked"===n&&"input"===t||"muted"===n&&"video"===t},hr=_("contenteditable,draggable,spellcheck"),mr=_("events,caret,typing,plaintext-only"),gr=function(t,e){return wr(e)||"false"===e?"false":"contenteditable"===t&&mr(e)?e:"true"},yr=_("allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,default,defaultchecked,defaultmuted,defaultselected,defer,disabled,enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,required,reversed,scoped,seamless,selected,sortable,truespeed,typemustmatch,visible"),_r="http://www.w3.org/1999/xlink",br=function(t){return":"===t.charAt(5)&&"xlink"===t.slice(0,5)},$r=function(t){return br(t)?t.slice(6,t.length):""},wr=function(t){return null==t||!1===t};function xr(t){for(var e=t.data,n=t,r=t;a(r.componentInstance);)(r=r.componentInstance._vnode)&&r.data&&(e=Cr(r.data,e));for(;a(n=n.parent);)n&&n.data&&(e=Cr(e,n.data));return function(t,e){if(a(t)||a(e))return kr(t,Or(e));return""}(e.staticClass,e.class)}function Cr(t,e){return{staticClass:kr(t.staticClass,e.staticClass),class:a(t.class)?[t.class,e.class]:e.class}}function kr(t,e){return t?e?t+" "+e:t:e||""}function Or(t){return Array.isArray(t)?function(t){for(var e,n="",r=0,o=t.length;r<o;r++)a(e=Or(t[r]))&&""!==e&&(n&&(n+=" "),n+=e);return n}(t):l(t)?function(t){var e="";for(var n in t)t[n]&&(e&&(e+=" "),e+=n);return e}(t):"string"==typeof t?t:""}var Sr={svg:"http://www.w3.org/2000/svg",math:"http://www.w3.org/1998/Math/MathML"},Tr=_("html,body,base,head,link,meta,style,title,address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,menuitem,summary,content,element,shadow,template,blockquote,iframe,tfoot"),Ar=_("svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,foreignobject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view",!0),jr=function(t){return Tr(t)||Ar(t)};function Nr(t){return Ar(t)?"svg":"math"===t?"math":void 0}var Er=Object.create(null);var Dr=_("text,number,password,search,email,tel,url");function Pr(t){if("string"==typeof t){var e=document.querySelector(t);return e||document.createElement("div")}return t}var Mr=Object.freeze({__proto__:null,createElement:function(t,e){var n=document.createElement(t);return"select"!==t||e.data&&e.data.attrs&&void 0!==e.data.attrs.multiple&&n.setAttribute("multiple","multiple"),n},createElementNS:function(t,e){return document.createElementNS(Sr[t],e)},createTextNode:function(t){return document.createTextNode(t)},createComment:function(t){return document.createComment(t)},insertBefore:function(t,e,n){t.insertBefore(e,n)},removeChild:function(t,e){t.removeChild(e)},appendChild:function(t,e){t.appendChild(e)},parentNode:function(t){return t.parentNode},nextSibling:function(t){return t.nextSibling},tagName:function(t){return t.tagName},setTextContent:function(t,e){t.textContent=e},setStyleScope:function(t,e){t.setAttribute(e,"")}}),Ir={create:function(t,e){Lr(e)},update:function(t,e){t.data.ref!==e.data.ref&&(Lr(t,!0),Lr(e))},destroy:function(t){Lr(t,!0)}};function Lr(t,e){var n=t.data.ref;if(a(n)){var r=t.context,i=t.componentInstance||t.elm,s=e?null:i,c=e?void 0:i;if(u(n))on(n,r,[s],r,"template ref function");else{var l=t.data.refInFor,f="string"==typeof n||"number"==typeof n,p=Ut(n),d=r.$refs;if(f||p)if(l){var v=f?d[n]:n.value;e?o(v)&&w(v,i):o(v)?v.includes(i)||v.push(i):f?(d[n]=[i],Fr(r,n,d[n])):n.value=[i]}else if(f){if(e&&d[n]!==i)return;d[n]=c,Fr(r,n,s)}else if(p){if(e&&n.value!==i)return;n.value=s}else 0}}}function Fr(t,e,n){var r=t._setupState;r&&C(r,e)&&(Ut(r[e])?r[e].value=n:r[e]=n)}var Rr=new ht("",{},[]),Hr=["create","activate","update","remove","destroy"];function Br(t,e){return t.key===e.key&&t.asyncFactory===e.asyncFactory&&(t.tag===e.tag&&t.isComment===e.isComment&&a(t.data)===a(e.data)&&function(t,e){if("input"!==t.tag)return!0;var n,r=a(n=t.data)&&a(n=n.attrs)&&n.type,o=a(n=e.data)&&a(n=n.attrs)&&n.type;return r===o||Dr(r)&&Dr(o)}(t,e)||s(t.isAsyncPlaceholder)&&i(e.asyncFactory.error))}function Ur(t,e,n){var r,o,i={};for(r=e;r<=n;++r)a(o=t[r].key)&&(i[o]=r);return i}var zr={create:Vr,update:Vr,destroy:function(t){Vr(t,Rr)}};function Vr(t,e){(t.data.directives||e.data.directives)&&function(t,e){var n,r,o,i=t===Rr,a=e===Rr,s=Jr(t.data.directives,t.context),c=Jr(e.data.directives,e.context),u=[],l=[];for(n in c)r=s[n],o=c[n],r?(o.oldValue=r.value,o.oldArg=r.arg,Wr(o,"update",e,t),o.def&&o.def.componentUpdated&&l.push(o)):(Wr(o,"bind",e,t),o.def&&o.def.inserted&&u.push(o));if(u.length){var f=function(){for(var n=0;n<u.length;n++)Wr(u[n],"inserted",e,t)};i?qt(e,"insert",f):f()}l.length&&qt(e,"postpatch",(function(){for(var n=0;n<l.length;n++)Wr(l[n],"componentUpdated",e,t)}));if(!i)for(n in s)c[n]||Wr(s[n],"unbind",t,t,a)}(t,e)}var Kr=Object.create(null);function Jr(t,e){var n,r,o=Object.create(null);if(!t)return o;for(n=0;n<t.length;n++){if((r=t[n]).modifiers||(r.modifiers=Kr),o[qr(r)]=r,e._setupState&&e._setupState.__sfc){var i=r.def||Xn(e,"_setupState","v-"+r.name);r.def="function"==typeof i?{bind:i,update:i}:i}r.def=r.def||Xn(e.$options,"directives",r.name)}return o}function qr(t){return t.rawName||"".concat(t.name,".").concat(Object.keys(t.modifiers||{}).join("."))}function Wr(t,e,n,r,o){var i=t.def&&t.def[e];if(i)try{i(n.elm,t,n,r,o)}catch(r){rn(r,n.context,"directive ".concat(t.name," ").concat(e," hook"))}}var Zr=[Ir,zr];function Gr(t,e){var n=e.componentOptions;if(!(a(n)&&!1===n.Ctor.options.inheritAttrs||i(t.data.attrs)&&i(e.data.attrs))){var r,o,c=e.elm,u=t.data.attrs||{},l=e.data.attrs||{};for(r in(a(l.__ob__)||s(l._v_attr_proxy))&&(l=e.data.attrs=D({},l)),l)o=l[r],u[r]!==o&&Xr(c,r,o,e.data.pre);for(r in(Q||et)&&l.value!==u.value&&Xr(c,"value",l.value),u)i(l[r])&&(br(r)?c.removeAttributeNS(_r,$r(r)):hr(r)||c.removeAttribute(r))}}function Xr(t,e,n,r){r||t.tagName.indexOf("-")>-1?Yr(t,e,n):yr(e)?wr(n)?t.removeAttribute(e):(n="allowfullscreen"===e&&"EMBED"===t.tagName?"true":e,t.setAttribute(e,n)):hr(e)?t.setAttribute(e,gr(e,n)):br(e)?wr(n)?t.removeAttributeNS(_r,$r(e)):t.setAttributeNS(_r,e,n):Yr(t,e,n)}function Yr(t,e,n){if(wr(n))t.removeAttribute(e);else{if(Q&&!tt&&"TEXTAREA"===t.tagName&&"placeholder"===e&&""!==n&&!t.__ieph){var r=function(e){e.stopImmediatePropagation(),t.removeEventListener("input",r)};t.addEventListener("input",r),t.__ieph=!0}t.setAttribute(e,n)}}var Qr={create:Gr,update:Gr};function to(t,e){var n=e.elm,r=e.data,o=t.data;if(!(i(r.staticClass)&&i(r.class)&&(i(o)||i(o.staticClass)&&i(o.class)))){var s=xr(e),c=n._transitionClasses;a(c)&&(s=kr(s,Or(c))),s!==n._prevClass&&(n.setAttribute("class",s),n._prevClass=s)}}var eo,no,ro,oo,io,ao,so={create:to,update:to},co=/[\w).+\-_$\]]/;function uo(t){var e,n,r,o,i,a=!1,s=!1,c=!1,u=!1,l=0,f=0,p=0,d=0;for(r=0;r<t.length;r++)if(n=e,e=t.charCodeAt(r),a)39===e&&92!==n&&(a=!1);else if(s)34===e&&92!==n&&(s=!1);else if(c)96===e&&92!==n&&(c=!1);else if(u)47===e&&92!==n&&(u=!1);else if(124!==e||124===t.charCodeAt(r+1)||124===t.charCodeAt(r-1)||l||f||p){switch(e){case 34:s=!0;break;case 39:a=!0;break;case 96:c=!0;break;case 40:p++;break;case 41:p--;break;case 91:f++;break;case 93:f--;break;case 123:l++;break;case 125:l--}if(47===e){for(var v=r-1,h=void 0;v>=0&&" "===(h=t.charAt(v));v--);h&&co.test(h)||(u=!0)}}else void 0===o?(d=r+1,o=t.slice(0,r).trim()):m();function m(){(i||(i=[])).push(t.slice(d,r).trim()),d=r+1}if(void 0===o?o=t.slice(0,r).trim():0!==d&&m(),i)for(r=0;r<i.length;r++)o=lo(o,i[r]);return o}function lo(t,e){var n=e.indexOf("(");if(n<0)return'_f("'.concat(e,'")(').concat(t,")");var r=e.slice(0,n),o=e.slice(n+1);return'_f("'.concat(r,'")(').concat(t).concat(")"!==o?","+o:o)}function fo(t,e){console.error("[Vue compiler]: ".concat(t))}function po(t,e){return t?t.map((function(t){return t[e]})).filter((function(t){return t})):[]}function vo(t,e,n,r,o){(t.props||(t.props=[])).push(xo({name:e,value:n,dynamic:o},r)),t.plain=!1}function ho(t,e,n,r,o){(o?t.dynamicAttrs||(t.dynamicAttrs=[]):t.attrs||(t.attrs=[])).push(xo({name:e,value:n,dynamic:o},r)),t.plain=!1}function mo(t,e,n,r){t.attrsMap[e]=n,t.attrsList.push(xo({name:e,value:n},r))}function go(t,e,n,r,o,i,a,s){(t.directives||(t.directives=[])).push(xo({name:e,rawName:n,value:r,arg:o,isDynamicArg:i,modifiers:a},s)),t.plain=!1}function yo(t,e,n){return n?"_p(".concat(e,',"').concat(t,'")'):t+e}function _o(t,e,n,o,i,a,s,c){var u;(o=o||r).right?c?e="(".concat(e,")==='click'?'contextmenu':(").concat(e,")"):"click"===e&&(e="contextmenu",delete o.right):o.middle&&(c?e="(".concat(e,")==='click'?'mouseup':(").concat(e,")"):"click"===e&&(e="mouseup")),o.capture&&(delete o.capture,e=yo("!",e,c)),o.once&&(delete o.once,e=yo("~",e,c)),o.passive&&(delete o.passive,e=yo("&",e,c)),o.native?(delete o.native,u=t.nativeEvents||(t.nativeEvents={})):u=t.events||(t.events={});var l=xo({value:n.trim(),dynamic:c},s);o!==r&&(l.modifiers=o);var f=u[e];Array.isArray(f)?i?f.unshift(l):f.push(l):u[e]=f?i?[l,f]:[f,l]:l,t.plain=!1}function bo(t,e,n){var r=$o(t,":"+e)||$o(t,"v-bind:"+e);if(null!=r)return uo(r);if(!1!==n){var o=$o(t,e);if(null!=o)return JSON.stringify(o)}}function $o(t,e,n){var r;if(null!=(r=t.attrsMap[e]))for(var o=t.attrsList,i=0,a=o.length;i<a;i++)if(o[i].name===e){o.splice(i,1);break}return n&&delete t.attrsMap[e],r}function wo(t,e){for(var n=t.attrsList,r=0,o=n.length;r<o;r++){var i=n[r];if(e.test(i.name))return n.splice(r,1),i}}function xo(t,e){return e&&(null!=e.start&&(t.start=e.start),null!=e.end&&(t.end=e.end)),t}function Co(t,e,n){var r=n||{},o=r.number,i="$$v",a=i;r.trim&&(a="(typeof ".concat(i," === 'string'")+"? ".concat(i,".trim()")+": ".concat(i,")")),o&&(a="_n(".concat(a,")"));var s=ko(e,a);t.model={value:"(".concat(e,")"),expression:JSON.stringify(e),callback:"function (".concat(i,") {").concat(s,"}")}}function ko(t,e){var n=function(t){if(t=t.trim(),eo=t.length,t.indexOf("[")<0||t.lastIndexOf("]")<eo-1)return(oo=t.lastIndexOf("."))>-1?{exp:t.slice(0,oo),key:'"'+t.slice(oo+1)+'"'}:{exp:t,key:null};no=t,oo=io=ao=0;for(;!So();)To(ro=Oo())?jo(ro):91===ro&&Ao(ro);return{exp:t.slice(0,io),key:t.slice(io+1,ao)}}(t);return null===n.key?"".concat(t,"=").concat(e):"$set(".concat(n.exp,", ").concat(n.key,", ").concat(e,")")}function Oo(){return no.charCodeAt(++oo)}function So(){return oo>=eo}function To(t){return 34===t||39===t}function Ao(t){var e=1;for(io=oo;!So();)if(To(t=Oo()))jo(t);else if(91===t&&e++,93===t&&e--,0===e){ao=oo;break}}function jo(t){for(var e=t;!So()&&(t=Oo())!==e;);}var No,Eo="__r",Do="__c";function Po(t,e,n){var r=No;return function o(){null!==e.apply(null,arguments)&&Lo(t,o,n,r)}}var Mo=un&&!(ot&&Number(ot[1])<=53);function Io(t,e,n,r){if(Mo){var o=Ze,i=e;e=i._wrapper=function(t){if(t.target===t.currentTarget||t.timeStamp>=o||t.timeStamp<=0||t.target.ownerDocument!==document)return i.apply(this,arguments)}}No.addEventListener(t,e,at?{capture:n,passive:r}:n)}function Lo(t,e,n,r){(r||No).removeEventListener(t,e._wrapper||e,n)}function Fo(t,e){if(!i(t.data.on)||!i(e.data.on)){var n=e.data.on||{},r=t.data.on||{};No=e.elm||t.elm,function(t){if(a(t[Eo])){var e=Q?"change":"input";t[e]=[].concat(t[Eo],t[e]||[]),delete t[Eo]}a(t[Do])&&(t.change=[].concat(t[Do],t.change||[]),delete t[Do])}(n),Jt(n,r,Io,Lo,Po,e.context),No=void 0}}var Ro,Ho={create:Fo,update:Fo,destroy:function(t){return Fo(t,Rr)}};function Bo(t,e){if(!i(t.data.domProps)||!i(e.data.domProps)){var n,r,o=e.elm,c=t.data.domProps||{},u=e.data.domProps||{};for(n in(a(u.__ob__)||s(u._v_attr_proxy))&&(u=e.data.domProps=D({},u)),c)n in u||(o[n]="");for(n in u){if(r=u[n],"textContent"===n||"innerHTML"===n){if(e.children&&(e.children.length=0),r===c[n])continue;1===o.childNodes.length&&o.removeChild(o.childNodes[0])}if("value"===n&&"PROGRESS"!==o.tagName){o._value=r;var l=i(r)?"":String(r);Uo(o,l)&&(o.value=l)}else if("innerHTML"===n&&Ar(o.tagName)&&i(o.innerHTML)){(Ro=Ro||document.createElement("div")).innerHTML="<svg>".concat(r,"</svg>");for(var f=Ro.firstChild;o.firstChild;)o.removeChild(o.firstChild);for(;f.firstChild;)o.appendChild(f.firstChild)}else if(r!==c[n])try{o[n]=r}catch(t){}}}}function Uo(t,e){return!t.composing&&("OPTION"===t.tagName||function(t,e){var n=!0;try{n=document.activeElement!==t}catch(t){}return n&&t.value!==e}(t,e)||function(t,e){var n=t.value,r=t._vModifiers;if(a(r)){if(r.number)return y(n)!==y(e);if(r.trim)return n.trim()!==e.trim()}return n!==e}(t,e))}var zo={create:Bo,update:Bo},Vo=k((function(t){var e={},n=/:(.+)/;return t.split(/;(?![^(]*\))/g).forEach((function(t){if(t){var r=t.split(n);r.length>1&&(e[r[0].trim()]=r[1].trim())}})),e}));function Ko(t){var e=Jo(t.style);return t.staticStyle?D(t.staticStyle,e):e}function Jo(t){return Array.isArray(t)?P(t):"string"==typeof t?Vo(t):t}var qo,Wo=/^--/,Zo=/\s*!important$/,Go=function(t,e,n){if(Wo.test(e))t.style.setProperty(e,n);else if(Zo.test(n))t.style.setProperty(j(e),n.replace(Zo,""),"important");else{var r=Yo(e);if(Array.isArray(n))for(var o=0,i=n.length;o<i;o++)t.style[r]=n[o];else t.style[r]=n}},Xo=["Webkit","Moz","ms"],Yo=k((function(t){if(qo=qo||document.createElement("div").style,"filter"!==(t=S(t))&&t in qo)return t;for(var e=t.charAt(0).toUpperCase()+t.slice(1),n=0;n<Xo.length;n++){var r=Xo[n]+e;if(r in qo)return r}}));function Qo(t,e){var n=e.data,r=t.data;if(!(i(n.staticStyle)&&i(n.style)&&i(r.staticStyle)&&i(r.style))){var o,s,c=e.elm,u=r.staticStyle,l=r.normalizedStyle||r.style||{},f=u||l,p=Jo(e.data.style)||{};e.data.normalizedStyle=a(p.__ob__)?D({},p):p;var d=function(t,e){var n,r={};if(e)for(var o=t;o.componentInstance;)(o=o.componentInstance._vnode)&&o.data&&(n=Ko(o.data))&&D(r,n);(n=Ko(t.data))&&D(r,n);for(var i=t;i=i.parent;)i.data&&(n=Ko(i.data))&&D(r,n);return r}(e,!0);for(s in f)i(d[s])&&Go(c,s,"");for(s in d)o=d[s],Go(c,s,null==o?"":o)}}var ti={create:Qo,update:Qo},ei=/\s+/;function ni(t,e){if(e&&(e=e.trim()))if(t.classList)e.indexOf(" ")>-1?e.split(ei).forEach((function(e){return t.classList.add(e)})):t.classList.add(e);else{var n=" ".concat(t.getAttribute("class")||""," ");n.indexOf(" "+e+" ")<0&&t.setAttribute("class",(n+e).trim())}}function ri(t,e){if(e&&(e=e.trim()))if(t.classList)e.indexOf(" ")>-1?e.split(ei).forEach((function(e){return t.classList.remove(e)})):t.classList.remove(e),t.classList.length||t.removeAttribute("class");else{for(var n=" ".concat(t.getAttribute("class")||""," "),r=" "+e+" ";n.indexOf(r)>=0;)n=n.replace(r," ");(n=n.trim())?t.setAttribute("class",n):t.removeAttribute("class")}}function oi(t){if(t){if("object"==typeof t){var e={};return!1!==t.css&&D(e,ii(t.name||"v")),D(e,t),e}return"string"==typeof t?ii(t):void 0}}var ii=k((function(t){return{enterClass:"".concat(t,"-enter"),enterToClass:"".concat(t,"-enter-to"),enterActiveClass:"".concat(t,"-enter-active"),leaveClass:"".concat(t,"-leave"),leaveToClass:"".concat(t,"-leave-to"),leaveActiveClass:"".concat(t,"-leave-active")}})),ai=X&&!tt,si="transition",ci="animation",ui="transition",li="transitionend",fi="animation",pi="animationend";ai&&(void 0===window.ontransitionend&&void 0!==window.onwebkittransitionend&&(ui="WebkitTransition",li="webkitTransitionEnd"),void 0===window.onanimationend&&void 0!==window.onwebkitanimationend&&(fi="WebkitAnimation",pi="webkitAnimationEnd"));var di=X?window.requestAnimationFrame?window.requestAnimationFrame.bind(window):setTimeout:function(t){return t()};function vi(t){di((function(){di(t)}))}function hi(t,e){var n=t._transitionClasses||(t._transitionClasses=[]);n.indexOf(e)<0&&(n.push(e),ni(t,e))}function mi(t,e){t._transitionClasses&&w(t._transitionClasses,e),ri(t,e)}function gi(t,e,n){var r=_i(t,e),o=r.type,i=r.timeout,a=r.propCount;if(!o)return n();var s=o===si?li:pi,c=0,u=function(){t.removeEventListener(s,l),n()},l=function(e){e.target===t&&++c>=a&&u()};setTimeout((function(){c<a&&u()}),i+1),t.addEventListener(s,l)}var yi=/\b(transform|all)(,|$)/;function _i(t,e){var n,r=window.getComputedStyle(t),o=(r[ui+"Delay"]||"").split(", "),i=(r[ui+"Duration"]||"").split(", "),a=bi(o,i),s=(r[fi+"Delay"]||"").split(", "),c=(r[fi+"Duration"]||"").split(", "),u=bi(s,c),l=0,f=0;return e===si?a>0&&(n=si,l=a,f=i.length):e===ci?u>0&&(n=ci,l=u,f=c.length):f=(n=(l=Math.max(a,u))>0?a>u?si:ci:null)?n===si?i.length:c.length:0,{type:n,timeout:l,propCount:f,hasTransform:n===si&&yi.test(r[ui+"Property"])}}function bi(t,e){for(;t.length<e.length;)t=t.concat(t);return Math.max.apply(null,e.map((function(e,n){return $i(e)+$i(t[n])})))}function $i(t){return 1e3*Number(t.slice(0,-1).replace(",","."))}function wi(t,e){var n=t.elm;a(n._leaveCb)&&(n._leaveCb.cancelled=!0,n._leaveCb());var r=oi(t.data.transition);if(!i(r)&&!a(n._enterCb)&&1===n.nodeType){for(var o=r.css,s=r.type,c=r.enterClass,f=r.enterToClass,p=r.enterActiveClass,d=r.appearClass,v=r.appearToClass,h=r.appearActiveClass,m=r.beforeEnter,g=r.enter,_=r.afterEnter,b=r.enterCancelled,$=r.beforeAppear,w=r.appear,x=r.afterAppear,C=r.appearCancelled,k=r.duration,O=Le,S=Le.$vnode;S&&S.parent;)O=S.context,S=S.parent;var T=!O._isMounted||!t.isRootInsert;if(!T||w||""===w){var A=T&&d?d:c,j=T&&h?h:p,N=T&&v?v:f,E=T&&$||m,D=T&&u(w)?w:g,P=T&&x||_,M=T&&C||b,I=y(l(k)?k.enter:k);0;var L=!1!==o&&!tt,F=ki(D),R=n._enterCb=H((function(){L&&(mi(n,N),mi(n,j)),R.cancelled?(L&&mi(n,A),M&&M(n)):P&&P(n),n._enterCb=null}));t.data.show||qt(t,"insert",(function(){var e=n.parentNode,r=e&&e._pending&&e._pending[t.key];r&&r.tag===t.tag&&r.elm._leaveCb&&r.elm._leaveCb(),D&&D(n,R)})),E&&E(n),L&&(hi(n,A),hi(n,j),vi((function(){mi(n,A),R.cancelled||(hi(n,N),F||(Ci(I)?setTimeout(R,I):gi(n,s,R)))}))),t.data.show&&(e&&e(),D&&D(n,R)),L||F||R()}}}function xi(t,e){var n=t.elm;a(n._enterCb)&&(n._enterCb.cancelled=!0,n._enterCb());var r=oi(t.data.transition);if(i(r)||1!==n.nodeType)return e();if(!a(n._leaveCb)){var o=r.css,s=r.type,c=r.leaveClass,u=r.leaveToClass,f=r.leaveActiveClass,p=r.beforeLeave,d=r.leave,v=r.afterLeave,h=r.leaveCancelled,m=r.delayLeave,g=r.duration,_=!1!==o&&!tt,b=ki(d),$=y(l(g)?g.leave:g);0;var w=n._leaveCb=H((function(){n.parentNode&&n.parentNode._pending&&(n.parentNode._pending[t.key]=null),_&&(mi(n,u),mi(n,f)),w.cancelled?(_&&mi(n,c),h&&h(n)):(e(),v&&v(n)),n._leaveCb=null}));m?m(x):x()}function x(){w.cancelled||(!t.data.show&&n.parentNode&&((n.parentNode._pending||(n.parentNode._pending={}))[t.key]=t),p&&p(n),_&&(hi(n,c),hi(n,f),vi((function(){mi(n,c),w.cancelled||(hi(n,u),b||(Ci($)?setTimeout(w,$):gi(n,s,w)))}))),d&&d(n,w),_||b||w())}}function Ci(t){return"number"==typeof t&&!isNaN(t)}function ki(t){if(i(t))return!1;var e=t.fns;return a(e)?ki(Array.isArray(e)?e[0]:e):(t._length||t.length)>1}function Oi(t,e){!0!==e.data.show&&wi(e)}var Si=function(t){var e,n,r={},u=t.modules,l=t.nodeOps;for(e=0;e<Hr.length;++e)for(r[Hr[e]]=[],n=0;n<u.length;++n)a(u[n][Hr[e]])&&r[Hr[e]].push(u[n][Hr[e]]);function f(t){var e=l.parentNode(t);a(e)&&l.removeChild(e,t)}function p(t,e,n,o,i,c,u){if(a(t.elm)&&a(c)&&(t=c[u]=yt(t)),t.isRootInsert=!i,!function(t,e,n,o){var i=t.data;if(a(i)){var c=a(t.componentInstance)&&i.keepAlive;if(a(i=i.hook)&&a(i=i.init)&&i(t,!1),a(t.componentInstance))return d(t,e),v(n,t.elm,o),s(c)&&function(t,e,n,o){var i,s=t;for(;s.componentInstance;)if(a(i=(s=s.componentInstance._vnode).data)&&a(i=i.transition)){for(i=0;i<r.activate.length;++i)r.activate[i](Rr,s);e.push(s);break}v(n,t.elm,o)}(t,e,n,o),!0}}(t,e,n,o)){var f=t.data,p=t.children,m=t.tag;a(m)?(t.elm=t.ns?l.createElementNS(t.ns,m):l.createElement(m,t),y(t),h(t,p,e),a(f)&&g(t,e),v(n,t.elm,o)):s(t.isComment)?(t.elm=l.createComment(t.text),v(n,t.elm,o)):(t.elm=l.createTextNode(t.text),v(n,t.elm,o))}}function d(t,e){a(t.data.pendingInsert)&&(e.push.apply(e,t.data.pendingInsert),t.data.pendingInsert=null),t.elm=t.componentInstance.$el,m(t)?(g(t,e),y(t)):(Lr(t),e.push(t))}function v(t,e,n){a(t)&&(a(n)?l.parentNode(n)===t&&l.insertBefore(t,e,n):l.appendChild(t,e))}function h(t,e,n){if(o(e)){0;for(var r=0;r<e.length;++r)p(e[r],n,t.elm,null,!0,e,r)}else c(t.text)&&l.appendChild(t.elm,l.createTextNode(String(t.text)))}function m(t){for(;t.componentInstance;)t=t.componentInstance._vnode;return a(t.tag)}function g(t,n){for(var o=0;o<r.create.length;++o)r.create[o](Rr,t);a(e=t.data.hook)&&(a(e.create)&&e.create(Rr,t),a(e.insert)&&n.push(t))}function y(t){var e;if(a(e=t.fnScopeId))l.setStyleScope(t.elm,e);else for(var n=t;n;)a(e=n.context)&&a(e=e.$options._scopeId)&&l.setStyleScope(t.elm,e),n=n.parent;a(e=Le)&&e!==t.context&&e!==t.fnContext&&a(e=e.$options._scopeId)&&l.setStyleScope(t.elm,e)}function b(t,e,n,r,o,i){for(;r<=o;++r)p(n[r],i,t,e,!1,n,r)}function $(t){var e,n,o=t.data;if(a(o))for(a(e=o.hook)&&a(e=e.destroy)&&e(t),e=0;e<r.destroy.length;++e)r.destroy[e](t);if(a(e=t.children))for(n=0;n<t.children.length;++n)$(t.children[n])}function w(t,e,n){for(;e<=n;++e){var r=t[e];a(r)&&(a(r.tag)?(x(r),$(r)):f(r.elm))}}function x(t,e){if(a(e)||a(t.data)){var n,o=r.remove.length+1;for(a(e)?e.listeners+=o:e=function(t,e){function n(){0==--n.listeners&&f(t)}return n.listeners=e,n}(t.elm,o),a(n=t.componentInstance)&&a(n=n._vnode)&&a(n.data)&&x(n,e),n=0;n<r.remove.length;++n)r.remove[n](t,e);a(n=t.data.hook)&&a(n=n.remove)?n(t,e):e()}else f(t.elm)}function C(t,e,n,r){for(var o=n;o<r;o++){var i=e[o];if(a(i)&&Br(t,i))return o}}function k(t,e,n,o,c,u){if(t!==e){a(e.elm)&&a(o)&&(e=o[c]=yt(e));var f=e.elm=t.elm;if(s(t.isAsyncPlaceholder))a(e.asyncFactory.resolved)?T(t.elm,e,n):e.isAsyncPlaceholder=!0;else if(s(e.isStatic)&&s(t.isStatic)&&e.key===t.key&&(s(e.isCloned)||s(e.isOnce)))e.componentInstance=t.componentInstance;else{var d,v=e.data;a(v)&&a(d=v.hook)&&a(d=d.prepatch)&&d(t,e);var h=t.children,g=e.children;if(a(v)&&m(e)){for(d=0;d<r.update.length;++d)r.update[d](t,e);a(d=v.hook)&&a(d=d.update)&&d(t,e)}i(e.text)?a(h)&&a(g)?h!==g&&function(t,e,n,r,o){var s,c,u,f=0,d=0,v=e.length-1,h=e[0],m=e[v],g=n.length-1,y=n[0],_=n[g],$=!o;for(;f<=v&&d<=g;)i(h)?h=e[++f]:i(m)?m=e[--v]:Br(h,y)?(k(h,y,r,n,d),h=e[++f],y=n[++d]):Br(m,_)?(k(m,_,r,n,g),m=e[--v],_=n[--g]):Br(h,_)?(k(h,_,r,n,g),$&&l.insertBefore(t,h.elm,l.nextSibling(m.elm)),h=e[++f],_=n[--g]):Br(m,y)?(k(m,y,r,n,d),$&&l.insertBefore(t,m.elm,h.elm),m=e[--v],y=n[++d]):(i(s)&&(s=Ur(e,f,v)),i(c=a(y.key)?s[y.key]:C(y,e,f,v))?p(y,r,t,h.elm,!1,n,d):Br(u=e[c],y)?(k(u,y,r,n,d),e[c]=void 0,$&&l.insertBefore(t,u.elm,h.elm)):p(y,r,t,h.elm,!1,n,d),y=n[++d]);f>v?b(t,i(n[g+1])?null:n[g+1].elm,n,d,g,r):d>g&&w(e,f,v)}(f,h,g,n,u):a(g)?(a(t.text)&&l.setTextContent(f,""),b(f,null,g,0,g.length-1,n)):a(h)?w(h,0,h.length-1):a(t.text)&&l.setTextContent(f,""):t.text!==e.text&&l.setTextContent(f,e.text),a(v)&&a(d=v.hook)&&a(d=d.postpatch)&&d(t,e)}}}function O(t,e,n){if(s(n)&&a(t.parent))t.parent.data.pendingInsert=e;else for(var r=0;r<e.length;++r)e[r].data.hook.insert(e[r])}var S=_("attrs,class,staticClass,staticStyle,key");function T(t,e,n,r){var o,i=e.tag,c=e.data,u=e.children;if(r=r||c&&c.pre,e.elm=t,s(e.isComment)&&a(e.asyncFactory))return e.isAsyncPlaceholder=!0,!0;if(a(c)&&(a(o=c.hook)&&a(o=o.init)&&o(e,!0),a(o=e.componentInstance)))return d(e,n),!0;if(a(i)){if(a(u))if(t.hasChildNodes())if(a(o=c)&&a(o=o.domProps)&&a(o=o.innerHTML)){if(o!==t.innerHTML)return!1}else{for(var l=!0,f=t.firstChild,p=0;p<u.length;p++){if(!f||!T(f,u[p],n,r)){l=!1;break}f=f.nextSibling}if(!l||f)return!1}else h(e,u,n);if(a(c)){var v=!1;for(var m in c)if(!S(m)){v=!0,g(e,n);break}!v&&c.class&&bn(c.class)}}else t.data!==e.text&&(t.data=e.text);return!0}return function(t,e,n,o){if(!i(e)){var c,u=!1,f=[];if(i(t))u=!0,p(e,f);else{var d=a(t.nodeType);if(!d&&Br(t,e))k(t,e,f,null,null,o);else{if(d){if(1===t.nodeType&&t.hasAttribute(U)&&(t.removeAttribute(U),n=!0),s(n)&&T(t,e,f))return O(e,f,!0),t;c=t,t=new ht(l.tagName(c).toLowerCase(),{},[],void 0,c)}var v=t.elm,h=l.parentNode(v);if(p(e,f,v._leaveCb?null:h,l.nextSibling(v)),a(e.parent))for(var g=e.parent,y=m(e);g;){for(var _=0;_<r.destroy.length;++_)r.destroy[_](g);if(g.elm=e.elm,y){for(var b=0;b<r.create.length;++b)r.create[b](Rr,g);var x=g.data.hook.insert;if(x.merged)for(var C=x.fns.slice(1),S=0;S<C.length;S++)C[S]()}else Lr(g);g=g.parent}a(h)?w([t],0,0):a(t.tag)&&$(t)}}return O(e,f,u),e.elm}a(t)&&$(t)}}({nodeOps:Mr,modules:[Qr,so,Ho,zo,ti,X?{create:Oi,activate:Oi,remove:function(t,e){!0!==t.data.show?xi(t,e):e()}}:{}].concat(Zr)});tt&&document.addEventListener("selectionchange",(function(){var t=document.activeElement;t&&t.vmodel&&Mi(t,"input")}));var Ti={inserted:function(t,e,n,r){"select"===n.tag?(r.elm&&!r.elm._vOptions?qt(n,"postpatch",(function(){Ti.componentUpdated(t,e,n)})):Ai(t,e,n.context),t._vOptions=[].map.call(t.options,Ei)):("textarea"===n.tag||Dr(t.type))&&(t._vModifiers=e.modifiers,e.modifiers.lazy||(t.addEventListener("compositionstart",Di),t.addEventListener("compositionend",Pi),t.addEventListener("change",Pi),tt&&(t.vmodel=!0)))},componentUpdated:function(t,e,n){if("select"===n.tag){Ai(t,e,n.context);var r=t._vOptions,o=t._vOptions=[].map.call(t.options,Ei);if(o.some((function(t,e){return!F(t,r[e])})))(t.multiple?e.value.some((function(t){return Ni(t,o)})):e.value!==e.oldValue&&Ni(e.value,o))&&Mi(t,"change")}}};function Ai(t,e,n){ji(t,e,n),(Q||et)&&setTimeout((function(){ji(t,e,n)}),0)}function ji(t,e,n){var r=e.value,o=t.multiple;if(!o||Array.isArray(r)){for(var i,a,s=0,c=t.options.length;s<c;s++)if(a=t.options[s],o)i=R(r,Ei(a))>-1,a.selected!==i&&(a.selected=i);else if(F(Ei(a),r))return void(t.selectedIndex!==s&&(t.selectedIndex=s));o||(t.selectedIndex=-1)}}function Ni(t,e){return e.every((function(e){return!F(e,t)}))}function Ei(t){return"_value"in t?t._value:t.value}function Di(t){t.target.composing=!0}function Pi(t){t.target.composing&&(t.target.composing=!1,Mi(t.target,"input"))}function Mi(t,e){var n=document.createEvent("HTMLEvents");n.initEvent(e,!0,!0),t.dispatchEvent(n)}function Ii(t){return!t.componentInstance||t.data&&t.data.transition?t:Ii(t.componentInstance._vnode)}var Li={bind:function(t,e,n){var r=e.value,o=(n=Ii(n)).data&&n.data.transition,i=t.__vOriginalDisplay="none"===t.style.display?"":t.style.display;r&&o?(n.data.show=!0,wi(n,(function(){t.style.display=i}))):t.style.display=r?i:"none"},update:function(t,e,n){var r=e.value;!r!=!e.oldValue&&((n=Ii(n)).data&&n.data.transition?(n.data.show=!0,r?wi(n,(function(){t.style.display=t.__vOriginalDisplay})):xi(n,(function(){t.style.display="none"}))):t.style.display=r?t.__vOriginalDisplay:"none")},unbind:function(t,e,n,r,o){o||(t.style.display=t.__vOriginalDisplay)}},Fi={model:Ti,show:Li},Ri={name:String,appear:Boolean,css:Boolean,mode:String,type:String,enterClass:String,leaveClass:String,enterToClass:String,leaveToClass:String,enterActiveClass:String,leaveActiveClass:String,appearClass:String,appearActiveClass:String,appearToClass:String,duration:[Number,String,Object]};function Hi(t){var e=t&&t.componentOptions;return e&&e.Ctor.options.abstract?Hi(Ne(e.children)):t}function Bi(t){var e={},n=t.$options;for(var r in n.propsData)e[r]=t[r];var o=n._parentListeners;for(var r in o)e[S(r)]=o[r];return e}function Ui(t,e){if(/\d-keep-alive$/.test(e.tag))return t("keep-alive",{props:e.componentOptions.propsData})}var zi=function(t){return t.tag||_e(t)},Vi=function(t){return"show"===t.name},Ki={name:"transition",props:Ri,abstract:!0,render:function(t){var e=this,n=this.$slots.default;if(n&&(n=n.filter(zi)).length){0;var r=this.mode;0;var o=n[0];if(function(t){for(;t=t.parent;)if(t.data.transition)return!0}(this.$vnode))return o;var i=Hi(o);if(!i)return o;if(this._leaving)return Ui(t,o);var a="__transition-".concat(this._uid,"-");i.key=null==i.key?i.isComment?a+"comment":a+i.tag:c(i.key)?0===String(i.key).indexOf(a)?i.key:a+i.key:i.key;var s=(i.data||(i.data={})).transition=Bi(this),u=this._vnode,l=Hi(u);if(i.data.directives&&i.data.directives.some(Vi)&&(i.data.show=!0),l&&l.data&&!function(t,e){return e.key===t.key&&e.tag===t.tag}(i,l)&&!_e(l)&&(!l.componentInstance||!l.componentInstance._vnode.isComment)){var f=l.data.transition=D({},s);if("out-in"===r)return this._leaving=!0,qt(f,"afterLeave",(function(){e._leaving=!1,e.$forceUpdate()})),Ui(t,o);if("in-out"===r){if(_e(i))return u;var p,d=function(){p()};qt(s,"afterEnter",d),qt(s,"enterCancelled",d),qt(f,"delayLeave",(function(t){p=t}))}}return o}}},Ji=D({tag:String,moveClass:String},Ri);delete Ji.mode;var qi={props:Ji,beforeMount:function(){var t=this,e=this._update;this._update=function(n,r){var o=Fe(t);t.__patch__(t._vnode,t.kept,!1,!0),t._vnode=t.kept,o(),e.call(t,n,r)}},render:function(t){for(var e=this.tag||this.$vnode.data.tag||"span",n=Object.create(null),r=this.prevChildren=this.children,o=this.$slots.default||[],i=this.children=[],a=Bi(this),s=0;s<o.length;s++){if((l=o[s]).tag)if(null!=l.key&&0!==String(l.key).indexOf("__vlist"))i.push(l),n[l.key]=l,(l.data||(l.data={})).transition=a;else;}if(r){var c=[],u=[];for(s=0;s<r.length;s++){var l;(l=r[s]).data.transition=a,l.data.pos=l.elm.getBoundingClientRect(),n[l.key]?c.push(l):u.push(l)}this.kept=t(e,null,c),this.removed=u}return t(e,null,i)},updated:function(){var t=this.prevChildren,e=this.moveClass||(this.name||"v")+"-move";t.length&&this.hasMove(t[0].elm,e)&&(t.forEach(Wi),t.forEach(Zi),t.forEach(Gi),this._reflow=document.body.offsetHeight,t.forEach((function(t){if(t.data.moved){var n=t.elm,r=n.style;hi(n,e),r.transform=r.WebkitTransform=r.transitionDuration="",n.addEventListener(li,n._moveCb=function t(r){r&&r.target!==n||r&&!/transform$/.test(r.propertyName)||(n.removeEventListener(li,t),n._moveCb=null,mi(n,e))})}})))},methods:{hasMove:function(t,e){if(!ai)return!1;if(this._hasMove)return this._hasMove;var n=t.cloneNode();t._transitionClasses&&t._transitionClasses.forEach((function(t){ri(n,t)})),ni(n,e),n.style.display="none",this.$el.appendChild(n);var r=_i(n);return this.$el.removeChild(n),this._hasMove=r.hasTransform}}};function Wi(t){t.elm._moveCb&&t.elm._moveCb(),t.elm._enterCb&&t.elm._enterCb()}function Zi(t){t.data.newPos=t.elm.getBoundingClientRect()}function Gi(t){var e=t.data.pos,n=t.data.newPos,r=e.left-n.left,o=e.top-n.top;if(r||o){t.data.moved=!0;var i=t.elm.style;i.transform=i.WebkitTransform="translate(".concat(r,"px,").concat(o,"px)"),i.transitionDuration="0s"}}var Xi={Transition:Ki,TransitionGroup:qi};rr.config.mustUseProp=vr,rr.config.isReservedTag=jr,rr.config.isReservedAttr=pr,rr.config.getTagNamespace=Nr,rr.config.isUnknownElement=function(t){if(!X)return!0;if(jr(t))return!1;if(t=t.toLowerCase(),null!=Er[t])return Er[t];var e=document.createElement(t);return t.indexOf("-")>-1?Er[t]=e.constructor===window.HTMLUnknownElement||e.constructor===window.HTMLElement:Er[t]=/HTMLUnknownElement/.test(e.toString())},D(rr.options.directives,Fi),D(rr.options.components,Xi),rr.prototype.__patch__=X?Si:M,rr.prototype.$mount=function(t,e){return function(t,e,n){var r;t.$el=e,t.$options.render||(t.$options.render=mt),Ue(t,"beforeMount"),r=function(){t._update(t._render(),n)},new xn(t,r,M,{before:function(){t._isMounted&&!t._isDestroyed&&Ue(t,"beforeUpdate")}},!0),n=!1;var o=t._preWatchers;if(o)for(var i=0;i<o.length;i++)o[i].run();return null==t.$vnode&&(t._isMounted=!0,Ue(t,"mounted")),t}(this,t=t&&X?Pr(t):void 0,e)},X&&setTimeout((function(){K.devtools&&ut&&ut.emit("init",rr)}),0);var Yi=/\{\{((?:.|\r?\n)+?)\}\}/g,Qi=/[-.*+?^${}()|[\]\/\\]/g,ta=k((function(t){var e=t[0].replace(Qi,"\\$&"),n=t[1].replace(Qi,"\\$&");return new RegExp(e+"((?:.|\\n)+?)"+n,"g")}));var ea={staticKeys:["staticClass"],transformNode:function(t,e){e.warn;var n=$o(t,"class");n&&(t.staticClass=JSON.stringify(n.replace(/\s+/g," ").trim()));var r=bo(t,"class",!1);r&&(t.classBinding=r)},genData:function(t){var e="";return t.staticClass&&(e+="staticClass:".concat(t.staticClass,",")),t.classBinding&&(e+="class:".concat(t.classBinding,",")),e}};var na,ra={staticKeys:["staticStyle"],transformNode:function(t,e){e.warn;var n=$o(t,"style");n&&(t.staticStyle=JSON.stringify(Vo(n)));var r=bo(t,"style",!1);r&&(t.styleBinding=r)},genData:function(t){var e="";return t.staticStyle&&(e+="staticStyle:".concat(t.staticStyle,",")),t.styleBinding&&(e+="style:(".concat(t.styleBinding,"),")),e}},oa=function(t){return(na=na||document.createElement("div")).innerHTML=t,na.textContent},ia=_("area,base,br,col,embed,frame,hr,img,input,isindex,keygen,link,meta,param,source,track,wbr"),aa=_("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr,source"),sa=_("address,article,aside,base,blockquote,body,caption,col,colgroup,dd,details,dialog,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,legend,li,menuitem,meta,optgroup,option,param,rp,rt,source,style,summary,tbody,td,tfoot,th,thead,title,tr,track"),ca=/^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/,ua=/^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/,la="[a-zA-Z_][\\-\\.0-9_a-zA-Z".concat(J.source,"]*"),fa="((?:".concat(la,"\\:)?").concat(la,")"),pa=new RegExp("^<".concat(fa)),da=/^\s*(\/?)>/,va=new RegExp("^<\\/".concat(fa,"[^>]*>")),ha=/^<!DOCTYPE [^>]+>/i,ma=/^<!\--/,ga=/^<!\[/,ya=_("script,style,textarea",!0),_a={},ba={"&lt;":"<","&gt;":">","&quot;":'"',"&amp;":"&","&#10;":"\n","&#9;":"\t","&#39;":"'"},$a=/&(?:lt|gt|quot|amp|#39);/g,wa=/&(?:lt|gt|quot|amp|#39|#10|#9);/g,xa=_("pre,textarea",!0),Ca=function(t,e){return t&&xa(t)&&"\n"===e[0]};function ka(t,e){var n=e?wa:$a;return t.replace(n,(function(t){return ba[t]}))}function Oa(t,e){for(var n,r,o=[],i=e.expectHTML,a=e.isUnaryTag||I,s=e.canBeLeftOpenTag||I,c=0,u=function(){if(n=t,r&&ya(r)){var u=0,p=r.toLowerCase(),d=_a[p]||(_a[p]=new RegExp("([\\s\\S]*?)(</"+p+"[^>]*>)","i"));w=t.replace(d,(function(t,n,r){return u=r.length,ya(p)||"noscript"===p||(n=n.replace(/<!\--([\s\S]*?)-->/g,"$1").replace(/<!\[CDATA\[([\s\S]*?)]]>/g,"$1")),Ca(p,n)&&(n=n.slice(1)),e.chars&&e.chars(n),""}));c+=t.length-w.length,t=w,f(p,c-u,c)}else{var v=t.indexOf("<");if(0===v){if(ma.test(t)){var h=t.indexOf("--\x3e");if(h>=0)return e.shouldKeepComment&&e.comment&&e.comment(t.substring(4,h),c,c+h+3),l(h+3),"continue"}if(ga.test(t)){var m=t.indexOf("]>");if(m>=0)return l(m+2),"continue"}var g=t.match(ha);if(g)return l(g[0].length),"continue";var y=t.match(va);if(y){var _=c;return l(y[0].length),f(y[1],_,c),"continue"}var b=function(){var e=t.match(pa);if(e){var n={tagName:e[1],attrs:[],start:c};l(e[0].length);for(var r=void 0,o=void 0;!(r=t.match(da))&&(o=t.match(ua)||t.match(ca));)o.start=c,l(o[0].length),o.end=c,n.attrs.push(o);if(r)return n.unarySlash=r[1],l(r[0].length),n.end=c,n}}();if(b)return function(t){var n=t.tagName,c=t.unarySlash;i&&("p"===r&&sa(n)&&f(r),s(n)&&r===n&&f(n));for(var u=a(n)||!!c,l=t.attrs.length,p=new Array(l),d=0;d<l;d++){var v=t.attrs[d],h=v[3]||v[4]||v[5]||"",m="a"===n&&"href"===v[1]?e.shouldDecodeNewlinesForHref:e.shouldDecodeNewlines;p[d]={name:v[1],value:ka(h,m)}}u||(o.push({tag:n,lowerCasedTag:n.toLowerCase(),attrs:p,start:t.start,end:t.end}),r=n);e.start&&e.start(n,p,u,t.start,t.end)}(b),Ca(b.tagName,t)&&l(1),"continue"}var $=void 0,w=void 0,x=void 0;if(v>=0){for(w=t.slice(v);!(va.test(w)||pa.test(w)||ma.test(w)||ga.test(w)||(x=w.indexOf("<",1))<0);)v+=x,w=t.slice(v);$=t.substring(0,v)}v<0&&($=t),$&&l($.length),e.chars&&$&&e.chars($,c-$.length,c)}if(t===n)return e.chars&&e.chars(t),"break"};t;){if("break"===u())break}function l(e){c+=e,t=t.substring(e)}function f(t,n,i){var a,s;if(null==n&&(n=c),null==i&&(i=c),t)for(s=t.toLowerCase(),a=o.length-1;a>=0&&o[a].lowerCasedTag!==s;a--);else a=0;if(a>=0){for(var u=o.length-1;u>=a;u--)e.end&&e.end(o[u].tag,n,i);o.length=a,r=a&&o[a-1].tag}else"br"===s?e.start&&e.start(t,[],!0,n,i):"p"===s&&(e.start&&e.start(t,[],!1,n,i),e.end&&e.end(t,n,i))}f()}var Sa,Ta,Aa,ja,Na,Ea,Da,Pa,Ma=/^@|^v-on:/,Ia=/^v-|^@|^:|^#/,La=/([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/,Fa=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Ra=/^\(|\)$/g,Ha=/^\[.*\]$/,Ba=/:(.*)$/,Ua=/^:|^\.|^v-bind:/,za=/\.[^.\]]+(?=[^\]]*$)/g,Va=/^v-slot(:|$)|^#/,Ka=/[\r\n]/,Ja=/[ \f\t\r\n]+/g,qa=k(oa),Wa="_empty_";function Za(t,e,n){return{type:1,tag:t,attrsList:e,attrsMap:ns(e),rawAttrsMap:{},parent:n,children:[]}}function Ga(t,e){Sa=e.warn||fo,Ea=e.isPreTag||I,Da=e.mustUseProp||I,Pa=e.getTagNamespace||I;var n=e.isReservedTag||I;Aa=po(e.modules,"transformNode"),ja=po(e.modules,"preTransformNode"),Na=po(e.modules,"postTransformNode"),Ta=e.delimiters;var r,o,i=[],a=!1!==e.preserveWhitespace,s=e.whitespace,c=!1,u=!1;function l(t){if(f(t),c||t.processed||(t=Xa(t,e)),i.length||t===r||r.if&&(t.elseif||t.else)&&Qa(r,{exp:t.elseif,block:t}),o&&!t.forbidden)if(t.elseif||t.else)a=t,s=function(t){for(var e=t.length;e--;){if(1===t[e].type)return t[e];t.pop()}}(o.children),s&&s.if&&Qa(s,{exp:a.elseif,block:a});else{if(t.slotScope){var n=t.slotTarget||'"default"';(o.scopedSlots||(o.scopedSlots={}))[n]=t}o.children.push(t),t.parent=o}var a,s;t.children=t.children.filter((function(t){return!t.slotScope})),f(t),t.pre&&(c=!1),Ea(t.tag)&&(u=!1);for(var l=0;l<Na.length;l++)Na[l](t,e)}function f(t){if(!u)for(var e=void 0;(e=t.children[t.children.length-1])&&3===e.type&&" "===e.text;)t.children.pop()}return Oa(t,{warn:Sa,expectHTML:e.expectHTML,isUnaryTag:e.isUnaryTag,canBeLeftOpenTag:e.canBeLeftOpenTag,shouldDecodeNewlines:e.shouldDecodeNewlines,shouldDecodeNewlinesForHref:e.shouldDecodeNewlinesForHref,shouldKeepComment:e.comments,outputSourceRange:e.outputSourceRange,start:function(t,n,a,s,f){var p=o&&o.ns||Pa(t);Q&&"svg"===p&&(n=function(t){for(var e=[],n=0;n<t.length;n++){var r=t[n];rs.test(r.name)||(r.name=r.name.replace(os,""),e.push(r))}return e}(n));var d,v=Za(t,n,o);p&&(v.ns=p),"style"!==(d=v).tag&&("script"!==d.tag||d.attrsMap.type&&"text/javascript"!==d.attrsMap.type)||ct()||(v.forbidden=!0);for(var h=0;h<ja.length;h++)v=ja[h](v,e)||v;c||(!function(t){null!=$o(t,"v-pre")&&(t.pre=!0)}(v),v.pre&&(c=!0)),Ea(v.tag)&&(u=!0),c?function(t){var e=t.attrsList,n=e.length;if(n)for(var r=t.attrs=new Array(n),o=0;o<n;o++)r[o]={name:e[o].name,value:JSON.stringify(e[o].value)},null!=e[o].start&&(r[o].start=e[o].start,r[o].end=e[o].end);else t.pre||(t.plain=!0)}(v):v.processed||(Ya(v),function(t){var e=$o(t,"v-if");if(e)t.if=e,Qa(t,{exp:e,block:t});else{null!=$o(t,"v-else")&&(t.else=!0);var n=$o(t,"v-else-if");n&&(t.elseif=n)}}(v),function(t){var e=$o(t,"v-once");null!=e&&(t.once=!0)}(v)),r||(r=v),a?l(v):(o=v,i.push(v))},end:function(t,e,n){var r=i[i.length-1];i.length-=1,o=i[i.length-1],l(r)},chars:function(t,e,n){if(o&&(!Q||"textarea"!==o.tag||o.attrsMap.placeholder!==t)){var r,i=o.children;if(t=u||t.trim()?"script"===(r=o).tag||"style"===r.tag?t:qa(t):i.length?s?"condense"===s&&Ka.test(t)?"":" ":a?" ":"":""){u||"condense"!==s||(t=t.replace(Ja," "));var l=void 0,f=void 0;!c&&" "!==t&&(l=function(t,e){var n=e?ta(e):Yi;if(n.test(t)){for(var r,o,i,a=[],s=[],c=n.lastIndex=0;r=n.exec(t);){(o=r.index)>c&&(s.push(i=t.slice(c,o)),a.push(JSON.stringify(i)));var u=uo(r[1].trim());a.push("_s(".concat(u,")")),s.push({"@binding":u}),c=o+r[0].length}return c<t.length&&(s.push(i=t.slice(c)),a.push(JSON.stringify(i))),{expression:a.join("+"),tokens:s}}}(t,Ta))?f={type:2,expression:l.expression,tokens:l.tokens,text:t}:" "===t&&i.length&&" "===i[i.length-1].text||(f={type:3,text:t}),f&&i.push(f)}}},comment:function(t,e,n){if(o){var r={type:3,text:t,isComment:!0};0,o.children.push(r)}}}),r}function Xa(t,e){var n;!function(t){var e=bo(t,"key");if(e){t.key=e}}(t),t.plain=!t.key&&!t.scopedSlots&&!t.attrsList.length,function(t){var e=bo(t,"ref");e&&(t.ref=e,t.refInFor=function(t){var e=t;for(;e;){if(void 0!==e.for)return!0;e=e.parent}return!1}(t))}(t),function(t){var e;"template"===t.tag?(e=$o(t,"scope"),t.slotScope=e||$o(t,"slot-scope")):(e=$o(t,"slot-scope"))&&(t.slotScope=e);var n=bo(t,"slot");n&&(t.slotTarget='""'===n?'"default"':n,t.slotTargetDynamic=!(!t.attrsMap[":slot"]&&!t.attrsMap["v-bind:slot"]),"template"===t.tag||t.slotScope||ho(t,"slot",n,function(t,e){return t.rawAttrsMap[":"+e]||t.rawAttrsMap["v-bind:"+e]||t.rawAttrsMap[e]}(t,"slot")));if("template"===t.tag){if(a=wo(t,Va)){0;var r=ts(a),o=r.name,i=r.dynamic;t.slotTarget=o,t.slotTargetDynamic=i,t.slotScope=a.value||Wa}}else{var a;if(a=wo(t,Va)){0;var s=t.scopedSlots||(t.scopedSlots={}),c=ts(a),u=c.name,l=(i=c.dynamic,s[u]=Za("template",[],t));l.slotTarget=u,l.slotTargetDynamic=i,l.children=t.children.filter((function(t){if(!t.slotScope)return t.parent=l,!0})),l.slotScope=a.value||Wa,t.children=[],t.plain=!1}}}(t),"slot"===(n=t).tag&&(n.slotName=bo(n,"name")),function(t){var e;(e=bo(t,"is"))&&(t.component=e);null!=$o(t,"inline-template")&&(t.inlineTemplate=!0)}(t);for(var r=0;r<Aa.length;r++)t=Aa[r](t,e)||t;return function(t){var e,n,r,o,i,a,s,c,u=t.attrsList;for(e=0,n=u.length;e<n;e++){if(r=o=u[e].name,i=u[e].value,Ia.test(r))if(t.hasBindings=!0,(a=es(r.replace(Ia,"")))&&(r=r.replace(za,"")),Ua.test(r))r=r.replace(Ua,""),i=uo(i),(c=Ha.test(r))&&(r=r.slice(1,-1)),a&&(a.prop&&!c&&"innerHtml"===(r=S(r))&&(r="innerHTML"),a.camel&&!c&&(r=S(r)),a.sync&&(s=ko(i,"$event"),c?_o(t,'"update:"+('.concat(r,")"),s,null,!1,0,u[e],!0):(_o(t,"update:".concat(S(r)),s,null,!1,0,u[e]),j(r)!==S(r)&&_o(t,"update:".concat(j(r)),s,null,!1,0,u[e])))),a&&a.prop||!t.component&&Da(t.tag,t.attrsMap.type,r)?vo(t,r,i,u[e],c):ho(t,r,i,u[e],c);else if(Ma.test(r))r=r.replace(Ma,""),(c=Ha.test(r))&&(r=r.slice(1,-1)),_o(t,r,i,a,!1,0,u[e],c);else{var l=(r=r.replace(Ia,"")).match(Ba),f=l&&l[1];c=!1,f&&(r=r.slice(0,-(f.length+1)),Ha.test(f)&&(f=f.slice(1,-1),c=!0)),go(t,r,o,i,f,c,a,u[e])}else ho(t,r,JSON.stringify(i),u[e]),!t.component&&"muted"===r&&Da(t.tag,t.attrsMap.type,r)&&vo(t,r,"true",u[e])}}(t),t}function Ya(t){var e;if(e=$o(t,"v-for")){var n=function(t){var e=t.match(La);if(!e)return;var n={};n.for=e[2].trim();var r=e[1].trim().replace(Ra,""),o=r.match(Fa);o?(n.alias=r.replace(Fa,"").trim(),n.iterator1=o[1].trim(),o[2]&&(n.iterator2=o[2].trim())):n.alias=r;return n}(e);n&&D(t,n)}}function Qa(t,e){t.ifConditions||(t.ifConditions=[]),t.ifConditions.push(e)}function ts(t){var e=t.name.replace(Va,"");return e||"#"!==t.name[0]&&(e="default"),Ha.test(e)?{name:e.slice(1,-1),dynamic:!0}:{name:'"'.concat(e,'"'),dynamic:!1}}function es(t){var e=t.match(za);if(e){var n={};return e.forEach((function(t){n[t.slice(1)]=!0})),n}}function ns(t){for(var e={},n=0,r=t.length;n<r;n++)e[t[n].name]=t[n].value;return e}var rs=/^xmlns:NS\d+/,os=/^NS\d+:/;function is(t){return Za(t.tag,t.attrsList.slice(),t.parent)}var as=[ea,ra,{preTransformNode:function(t,e){if("input"===t.tag){var n=t.attrsMap;if(!n["v-model"])return;var r=void 0;if((n[":type"]||n["v-bind:type"])&&(r=bo(t,"type")),n.type||r||!n["v-bind"]||(r="(".concat(n["v-bind"],").type")),r){var o=$o(t,"v-if",!0),i=o?"&&(".concat(o,")"):"",a=null!=$o(t,"v-else",!0),s=$o(t,"v-else-if",!0),c=is(t);Ya(c),mo(c,"type","checkbox"),Xa(c,e),c.processed=!0,c.if="(".concat(r,")==='checkbox'")+i,Qa(c,{exp:c.if,block:c});var u=is(t);$o(u,"v-for",!0),mo(u,"type","radio"),Xa(u,e),Qa(c,{exp:"(".concat(r,")==='radio'")+i,block:u});var l=is(t);return $o(l,"v-for",!0),mo(l,":type",r),Xa(l,e),Qa(c,{exp:o,block:l}),a?c.else=!0:s&&(c.elseif=s),c}}}}];var ss,cs,us={model:function(t,e,n){n;var r=e.value,o=e.modifiers,i=t.tag,a=t.attrsMap.type;if(t.component)return Co(t,r,o),!1;if("select"===i)!function(t,e,n){var r=n&&n.number,o='Array.prototype.filter.call($event.target.options,function(o){return o.selected}).map(function(o){var val = "_value" in o ? o._value : o.value;'+"return ".concat(r?"_n(val)":"val","})"),i="$event.target.multiple ? $$selectedVal : $$selectedVal[0]",a="var $$selectedVal = ".concat(o,";");a="".concat(a," ").concat(ko(e,i)),_o(t,"change",a,null,!0)}(t,r,o);else if("input"===i&&"checkbox"===a)!function(t,e,n){var r=n&&n.number,o=bo(t,"value")||"null",i=bo(t,"true-value")||"true",a=bo(t,"false-value")||"false";vo(t,"checked","Array.isArray(".concat(e,")")+"?_i(".concat(e,",").concat(o,")>-1")+("true"===i?":(".concat(e,")"):":_q(".concat(e,",").concat(i,")"))),_o(t,"change","var $$a=".concat(e,",")+"$$el=$event.target,"+"$$c=$$el.checked?(".concat(i,"):(").concat(a,");")+"if(Array.isArray($$a)){"+"var $$v=".concat(r?"_n("+o+")":o,",")+"$$i=_i($$a,$$v);"+"if($$el.checked){$$i<0&&(".concat(ko(e,"$$a.concat([$$v])"),")}")+"else{$$i>-1&&(".concat(ko(e,"$$a.slice(0,$$i).concat($$a.slice($$i+1))"),")}")+"}else{".concat(ko(e,"$$c"),"}"),null,!0)}(t,r,o);else if("input"===i&&"radio"===a)!function(t,e,n){var r=n&&n.number,o=bo(t,"value")||"null";o=r?"_n(".concat(o,")"):o,vo(t,"checked","_q(".concat(e,",").concat(o,")")),_o(t,"change",ko(e,o),null,!0)}(t,r,o);else if("input"===i||"textarea"===i)!function(t,e,n){var r=t.attrsMap.type;0;var o=n||{},i=o.lazy,a=o.number,s=o.trim,c=!i&&"range"!==r,u=i?"change":"range"===r?Eo:"input",l="$event.target.value";s&&(l="$event.target.value.trim()");a&&(l="_n(".concat(l,")"));var f=ko(e,l);c&&(f="if($event.target.composing)return;".concat(f));vo(t,"value","(".concat(e,")")),_o(t,u,f,null,!0),(s||a)&&_o(t,"blur","$forceUpdate()")}(t,r,o);else{if(!K.isReservedTag(i))return Co(t,r,o),!1}return!0},text:function(t,e){e.value&&vo(t,"textContent","_s(".concat(e.value,")"),e)},html:function(t,e){e.value&&vo(t,"innerHTML","_s(".concat(e.value,")"),e)}},ls={expectHTML:!0,modules:as,directives:us,isPreTag:function(t){return"pre"===t},isUnaryTag:ia,mustUseProp:vr,canBeLeftOpenTag:aa,isReservedTag:jr,getTagNamespace:Nr,staticKeys:function(t){return t.reduce((function(t,e){return t.concat(e.staticKeys||[])}),[]).join(",")}(as)},fs=k((function(t){return _("type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap"+(t?","+t:""))}));function ps(t,e){t&&(ss=fs(e.staticKeys||""),cs=e.isReservedTag||I,ds(t),vs(t,!1))}function ds(t){if(t.static=function(t){if(2===t.type)return!1;if(3===t.type)return!0;return!(!t.pre&&(t.hasBindings||t.if||t.for||b(t.tag)||!cs(t.tag)||function(t){for(;t.parent;){if("template"!==(t=t.parent).tag)return!1;if(t.for)return!0}return!1}(t)||!Object.keys(t).every(ss)))}(t),1===t.type){if(!cs(t.tag)&&"slot"!==t.tag&&null==t.attrsMap["inline-template"])return;for(var e=0,n=t.children.length;e<n;e++){var r=t.children[e];ds(r),r.static||(t.static=!1)}if(t.ifConditions)for(e=1,n=t.ifConditions.length;e<n;e++){var o=t.ifConditions[e].block;ds(o),o.static||(t.static=!1)}}}function vs(t,e){if(1===t.type){if((t.static||t.once)&&(t.staticInFor=e),t.static&&t.children.length&&(1!==t.children.length||3!==t.children[0].type))return void(t.staticRoot=!0);if(t.staticRoot=!1,t.children)for(var n=0,r=t.children.length;n<r;n++)vs(t.children[n],e||!!t.for);if(t.ifConditions)for(n=1,r=t.ifConditions.length;n<r;n++)vs(t.ifConditions[n].block,e)}}var hs=/^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/,ms=/\([^)]*?\);*$/,gs=/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/,ys={esc:27,tab:9,enter:13,space:32,up:38,left:37,right:39,down:40,delete:[8,46]},_s={esc:["Esc","Escape"],tab:"Tab",enter:"Enter",space:[" ","Spacebar"],up:["Up","ArrowUp"],left:["Left","ArrowLeft"],right:["Right","ArrowRight"],down:["Down","ArrowDown"],delete:["Backspace","Delete","Del"]},bs=function(t){return"if(".concat(t,")return null;")},$s={stop:"$event.stopPropagation();",prevent:"$event.preventDefault();",self:bs("$event.target !== $event.currentTarget"),ctrl:bs("!$event.ctrlKey"),shift:bs("!$event.shiftKey"),alt:bs("!$event.altKey"),meta:bs("!$event.metaKey"),left:bs("'button' in $event && $event.button !== 0"),middle:bs("'button' in $event && $event.button !== 1"),right:bs("'button' in $event && $event.button !== 2")};function ws(t,e){var n=e?"nativeOn:":"on:",r="",o="";for(var i in t){var a=xs(t[i]);t[i]&&t[i].dynamic?o+="".concat(i,",").concat(a,","):r+='"'.concat(i,'":').concat(a,",")}return r="{".concat(r.slice(0,-1),"}"),o?n+"_d(".concat(r,",[").concat(o.slice(0,-1),"])"):n+r}function xs(t){if(!t)return"function(){}";if(Array.isArray(t))return"[".concat(t.map((function(t){return xs(t)})).join(","),"]");var e=gs.test(t.value),n=hs.test(t.value),r=gs.test(t.value.replace(ms,""));if(t.modifiers){var o="",i="",a=[],s=function(e){if($s[e])i+=$s[e],ys[e]&&a.push(e);else if("exact"===e){var n=t.modifiers;i+=bs(["ctrl","shift","alt","meta"].filter((function(t){return!n[t]})).map((function(t){return"$event.".concat(t,"Key")})).join("||"))}else a.push(e)};for(var c in t.modifiers)s(c);a.length&&(o+=function(t){return"if(!$event.type.indexOf('key')&&"+"".concat(t.map(Cs).join("&&"),")return null;")}(a)),i&&(o+=i);var u=e?"return ".concat(t.value,".apply(null, arguments)"):n?"return (".concat(t.value,").apply(null, arguments)"):r?"return ".concat(t.value):t.value;return"function($event){".concat(o).concat(u,"}")}return e||n?t.value:"function($event){".concat(r?"return ".concat(t.value):t.value,"}")}function Cs(t){var e=parseInt(t,10);if(e)return"$event.keyCode!==".concat(e);var n=ys[t],r=_s[t];return"_k($event.keyCode,"+"".concat(JSON.stringify(t),",")+"".concat(JSON.stringify(n),",")+"$event.key,"+"".concat(JSON.stringify(r))+")"}var ks={on:function(t,e){t.wrapListeners=function(t){return"_g(".concat(t,",").concat(e.value,")")}},bind:function(t,e){t.wrapData=function(n){return"_b(".concat(n,",'").concat(t.tag,"',").concat(e.value,",").concat(e.modifiers&&e.modifiers.prop?"true":"false").concat(e.modifiers&&e.modifiers.sync?",true":"",")")}},cloak:M},Os=function(t){this.options=t,this.warn=t.warn||fo,this.transforms=po(t.modules,"transformCode"),this.dataGenFns=po(t.modules,"genData"),this.directives=D(D({},ks),t.directives);var e=t.isReservedTag||I;this.maybeComponent=function(t){return!!t.component||!e(t.tag)},this.onceId=0,this.staticRenderFns=[],this.pre=!1};function Ss(t,e){var n=new Os(e),r=t?"script"===t.tag?"null":Ts(t,n):'_c("div")';return{render:"with(this){return ".concat(r,"}"),staticRenderFns:n.staticRenderFns}}function Ts(t,e){if(t.parent&&(t.pre=t.pre||t.parent.pre),t.staticRoot&&!t.staticProcessed)return As(t,e);if(t.once&&!t.onceProcessed)return js(t,e);if(t.for&&!t.forProcessed)return Ds(t,e);if(t.if&&!t.ifProcessed)return Ns(t,e);if("template"!==t.tag||t.slotTarget||e.pre){if("slot"===t.tag)return function(t,e){var n=t.slotName||'"default"',r=Ls(t,e),o="_t(".concat(n).concat(r?",function(){return ".concat(r,"}"):""),i=t.attrs||t.dynamicAttrs?Hs((t.attrs||[]).concat(t.dynamicAttrs||[]).map((function(t){return{name:S(t.name),value:t.value,dynamic:t.dynamic}}))):null,a=t.attrsMap["v-bind"];!i&&!a||r||(o+=",null");i&&(o+=",".concat(i));a&&(o+="".concat(i?"":",null",",").concat(a));return o+")"}(t,e);var n=void 0;if(t.component)n=function(t,e,n){var r=e.inlineTemplate?null:Ls(e,n,!0);return"_c(".concat(t,",").concat(Ps(e,n)).concat(r?",".concat(r):"",")")}(t.component,t,e);else{var r=void 0,o=e.maybeComponent(t);(!t.plain||t.pre&&o)&&(r=Ps(t,e));var i=void 0,a=e.options.bindings;o&&a&&!1!==a.__isScriptSetup&&(i=function(t,e){var n=S(e),r=T(n),o=function(o){return t[e]===o?e:t[n]===o?n:t[r]===o?r:void 0},i=o("setup-const")||o("setup-reactive-const");if(i)return i;var a=o("setup-let")||o("setup-ref")||o("setup-maybe-ref");if(a)return a}(a,t.tag)),i||(i="'".concat(t.tag,"'"));var s=t.inlineTemplate?null:Ls(t,e,!0);n="_c(".concat(i).concat(r?",".concat(r):"").concat(s?",".concat(s):"",")")}for(var c=0;c<e.transforms.length;c++)n=e.transforms[c](t,n);return n}return Ls(t,e)||"void 0"}function As(t,e){t.staticProcessed=!0;var n=e.pre;return t.pre&&(e.pre=t.pre),e.staticRenderFns.push("with(this){return ".concat(Ts(t,e),"}")),e.pre=n,"_m(".concat(e.staticRenderFns.length-1).concat(t.staticInFor?",true":"",")")}function js(t,e){if(t.onceProcessed=!0,t.if&&!t.ifProcessed)return Ns(t,e);if(t.staticInFor){for(var n="",r=t.parent;r;){if(r.for){n=r.key;break}r=r.parent}return n?"_o(".concat(Ts(t,e),",").concat(e.onceId++,",").concat(n,")"):Ts(t,e)}return As(t,e)}function Ns(t,e,n,r){return t.ifProcessed=!0,Es(t.ifConditions.slice(),e,n,r)}function Es(t,e,n,r){if(!t.length)return r||"_e()";var o=t.shift();return o.exp?"(".concat(o.exp,")?").concat(i(o.block),":").concat(Es(t,e,n,r)):"".concat(i(o.block));function i(t){return n?n(t,e):t.once?js(t,e):Ts(t,e)}}function Ds(t,e,n,r){var o=t.for,i=t.alias,a=t.iterator1?",".concat(t.iterator1):"",s=t.iterator2?",".concat(t.iterator2):"";return t.forProcessed=!0,"".concat(r||"_l","((").concat(o,"),")+"function(".concat(i).concat(a).concat(s,"){")+"return ".concat((n||Ts)(t,e))+"})"}function Ps(t,e){var n="{",r=function(t,e){var n=t.directives;if(!n)return;var r,o,i,a,s="directives:[",c=!1;for(r=0,o=n.length;r<o;r++){i=n[r],a=!0;var u=e.directives[i.name];u&&(a=!!u(t,i,e.warn)),a&&(c=!0,s+='{name:"'.concat(i.name,'",rawName:"').concat(i.rawName,'"').concat(i.value?",value:(".concat(i.value,"),expression:").concat(JSON.stringify(i.value)):"").concat(i.arg?",arg:".concat(i.isDynamicArg?i.arg:'"'.concat(i.arg,'"')):"").concat(i.modifiers?",modifiers:".concat(JSON.stringify(i.modifiers)):"","},"))}if(c)return s.slice(0,-1)+"]"}(t,e);r&&(n+=r+","),t.key&&(n+="key:".concat(t.key,",")),t.ref&&(n+="ref:".concat(t.ref,",")),t.refInFor&&(n+="refInFor:true,"),t.pre&&(n+="pre:true,"),t.component&&(n+='tag:"'.concat(t.tag,'",'));for(var o=0;o<e.dataGenFns.length;o++)n+=e.dataGenFns[o](t);if(t.attrs&&(n+="attrs:".concat(Hs(t.attrs),",")),t.props&&(n+="domProps:".concat(Hs(t.props),",")),t.events&&(n+="".concat(ws(t.events,!1),",")),t.nativeEvents&&(n+="".concat(ws(t.nativeEvents,!0),",")),t.slotTarget&&!t.slotScope&&(n+="slot:".concat(t.slotTarget,",")),t.scopedSlots&&(n+="".concat(function(t,e,n){var r=t.for||Object.keys(e).some((function(t){var n=e[t];return n.slotTargetDynamic||n.if||n.for||Ms(n)})),o=!!t.if;if(!r)for(var i=t.parent;i;){if(i.slotScope&&i.slotScope!==Wa||i.for){r=!0;break}i.if&&(o=!0),i=i.parent}var a=Object.keys(e).map((function(t){return Is(e[t],n)})).join(",");return"scopedSlots:_u([".concat(a,"]").concat(r?",null,true":"").concat(!r&&o?",null,false,".concat(function(t){var e=5381,n=t.length;for(;n;)e=33*e^t.charCodeAt(--n);return e>>>0}(a)):"",")")}(t,t.scopedSlots,e),",")),t.model&&(n+="model:{value:".concat(t.model.value,",callback:").concat(t.model.callback,",expression:").concat(t.model.expression,"},")),t.inlineTemplate){var i=function(t,e){var n=t.children[0];0;if(n&&1===n.type){var r=Ss(n,e.options);return"inlineTemplate:{render:function(){".concat(r.render,"},staticRenderFns:[").concat(r.staticRenderFns.map((function(t){return"function(){".concat(t,"}")})).join(","),"]}")}}(t,e);i&&(n+="".concat(i,","))}return n=n.replace(/,$/,"")+"}",t.dynamicAttrs&&(n="_b(".concat(n,',"').concat(t.tag,'",').concat(Hs(t.dynamicAttrs),")")),t.wrapData&&(n=t.wrapData(n)),t.wrapListeners&&(n=t.wrapListeners(n)),n}function Ms(t){return 1===t.type&&("slot"===t.tag||t.children.some(Ms))}function Is(t,e){var n=t.attrsMap["slot-scope"];if(t.if&&!t.ifProcessed&&!n)return Ns(t,e,Is,"null");if(t.for&&!t.forProcessed)return Ds(t,e,Is);var r=t.slotScope===Wa?"":String(t.slotScope),o="function(".concat(r,"){")+"return ".concat("template"===t.tag?t.if&&n?"(".concat(t.if,")?").concat(Ls(t,e)||"undefined",":undefined"):Ls(t,e)||"undefined":Ts(t,e),"}"),i=r?"":",proxy:true";return"{key:".concat(t.slotTarget||'"default"',",fn:").concat(o).concat(i,"}")}function Ls(t,e,n,r,o){var i=t.children;if(i.length){var a=i[0];if(1===i.length&&a.for&&"template"!==a.tag&&"slot"!==a.tag){var s=n?e.maybeComponent(a)?",1":",0":"";return"".concat((r||Ts)(a,e)).concat(s)}var c=n?function(t,e){for(var n=0,r=0;r<t.length;r++){var o=t[r];if(1===o.type){if(Fs(o)||o.ifConditions&&o.ifConditions.some((function(t){return Fs(t.block)}))){n=2;break}(e(o)||o.ifConditions&&o.ifConditions.some((function(t){return e(t.block)})))&&(n=1)}}return n}(i,e.maybeComponent):0,u=o||Rs;return"[".concat(i.map((function(t){return u(t,e)})).join(","),"]").concat(c?",".concat(c):"")}}function Fs(t){return void 0!==t.for||"template"===t.tag||"slot"===t.tag}function Rs(t,e){return 1===t.type?Ts(t,e):3===t.type&&t.isComment?function(t){return"_e(".concat(JSON.stringify(t.text),")")}(t):function(t){return"_v(".concat(2===t.type?t.expression:Bs(JSON.stringify(t.text)),")")}(t)}function Hs(t){for(var e="",n="",r=0;r<t.length;r++){var o=t[r],i=Bs(o.value);o.dynamic?n+="".concat(o.name,",").concat(i,","):e+='"'.concat(o.name,'":').concat(i,",")}return e="{".concat(e.slice(0,-1),"}"),n?"_d(".concat(e,",[").concat(n.slice(0,-1),"])"):e}function Bs(t){return t.replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")}new RegExp("\\b"+"do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,super,throw,while,yield,delete,export,import,return,switch,default,extends,finally,continue,debugger,function,arguments".split(",").join("\\b|\\b")+"\\b"),new RegExp("\\b"+"delete,typeof,void".split(",").join("\\s*\\([^\\)]*\\)|\\b")+"\\s*\\([^\\)]*\\)");function Us(t,e){try{return new Function(t)}catch(n){return e.push({err:n,code:t}),M}}function zs(t){var e=Object.create(null);return function(n,r,o){(r=D({},r)).warn;delete r.warn;var i=r.delimiters?String(r.delimiters)+n:n;if(e[i])return e[i];var a=t(n,r);var s={},c=[];return s.render=Us(a.render,c),s.staticRenderFns=a.staticRenderFns.map((function(t){return Us(t,c)})),e[i]=s}}var Vs,Ks,Js=(Vs=function(t,e){var n=Ga(t.trim(),e);!1!==e.optimize&&ps(n,e);var r=Ss(n,e);return{ast:n,render:r.render,staticRenderFns:r.staticRenderFns}},function(t){function e(e,n){var r=Object.create(t),o=[],i=[];if(n)for(var a in n.modules&&(r.modules=(t.modules||[]).concat(n.modules)),n.directives&&(r.directives=D(Object.create(t.directives||null),n.directives)),n)"modules"!==a&&"directives"!==a&&(r[a]=n[a]);r.warn=function(t,e,n){(n?i:o).push(t)};var s=Vs(e.trim(),r);return s.errors=o,s.tips=i,s}return{compile:e,compileToFunctions:zs(e)}}),qs=Js(ls).compileToFunctions;function Ws(t){return(Ks=Ks||document.createElement("div")).innerHTML=t?'<a href="\n"/>':'<div a="\n"/>',Ks.innerHTML.indexOf("&#10;")>0}var Zs=!!X&&Ws(!1),Gs=!!X&&Ws(!0),Xs=k((function(t){var e=Pr(t);return e&&e.innerHTML})),Ys=rr.prototype.$mount;rr.prototype.$mount=function(t,e){if((t=t&&Pr(t))===document.body||t===document.documentElement)return this;var n=this.$options;if(!n.render){var r=n.template;if(r)if("string"==typeof r)"#"===r.charAt(0)&&(r=Xs(r));else{if(!r.nodeType)return this;r=r.innerHTML}else t&&(r=function(t){if(t.outerHTML)return t.outerHTML;var e=document.createElement("div");return e.appendChild(t.cloneNode(!0)),e.innerHTML}(t));if(r){0;var o=qs(r,{outputSourceRange:!1,shouldDecodeNewlines:Zs,shouldDecodeNewlinesForHref:Gs,delimiters:n.delimiters,comments:n.comments},this),i=o.render,a=o.staticRenderFns;n.render=i,n.staticRenderFns=a}}return Ys.call(this,t,e)},rr.compile=qs}}]);
/*!
 * Vue.js v2.7.16
 * (c) 2014-2023 Evan You
 * Released under the MIT License.
 */
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t="undefined"!=typeof globalThis?globalThis:t||self).Vue=e()}(this,(function(){"use strict";var t=Object.freeze({}),e=Array.isArray;function n(t){return null==t}function r(t){return null!=t}function o(t){return!0===t}function i(t){return"string"==typeof t||"number"==typeof t||"symbol"==typeof t||"boolean"==typeof t}function a(t){return"function"==typeof t}function s(t){return null!==t&&"object"==typeof t}var c=Object.prototype.toString;function u(t){return"[object Object]"===c.call(t)}function l(t){var e=parseFloat(String(t));return e>=0&&Math.floor(e)===e&&isFinite(t)}function f(t){return r(t)&&"function"==typeof t.then&&"function"==typeof t.catch}function d(t){return null==t?"":Array.isArray(t)||u(t)&&t.toString===c?JSON.stringify(t,p,2):String(t)}function p(t,e){return e&&e.__v_isRef?e.value:e}function v(t){var e=parseFloat(t);return isNaN(e)?t:e}function h(t,e){for(var n=Object.create(null),r=t.split(","),o=0;o<r.length;o++)n[r[o]]=!0;return e?function(t){return n[t.toLowerCase()]}:function(t){return n[t]}}var m=h("slot,component",!0),g=h("key,ref,slot,slot-scope,is");function y(t,e){var n=t.length;if(n){if(e===t[n-1])return void(t.length=n-1);var r=t.indexOf(e);if(r>-1)return t.splice(r,1)}}var _=Object.prototype.hasOwnProperty;function b(t,e){return _.call(t,e)}function $(t){var e=Object.create(null);return function(n){return e[n]||(e[n]=t(n))}}var w=/-(\w)/g,x=$((function(t){return t.replace(w,(function(t,e){return e?e.toUpperCase():""}))})),C=$((function(t){return t.charAt(0).toUpperCase()+t.slice(1)})),k=/\B([A-Z])/g,S=$((function(t){return t.replace(k,"-$1").toLowerCase()}));var O=Function.prototype.bind?function(t,e){return t.bind(e)}:function(t,e){function n(n){var r=arguments.length;return r?r>1?t.apply(e,arguments):t.call(e,n):t.call(e)}return n._length=t.length,n};function T(t,e){e=e||0;for(var n=t.length-e,r=new Array(n);n--;)r[n]=t[n+e];return r}function A(t,e){for(var n in e)t[n]=e[n];return t}function j(t){for(var e={},n=0;n<t.length;n++)t[n]&&A(e,t[n]);return e}function E(t,e,n){}var N=function(t,e,n){return!1},P=function(t){return t};function D(t,e){if(t===e)return!0;var n=s(t),r=s(e);if(!n||!r)return!n&&!r&&String(t)===String(e);try{var o=Array.isArray(t),i=Array.isArray(e);if(o&&i)return t.length===e.length&&t.every((function(t,n){return D(t,e[n])}));if(t instanceof Date&&e instanceof Date)return t.getTime()===e.getTime();if(o||i)return!1;var a=Object.keys(t),c=Object.keys(e);return a.length===c.length&&a.every((function(n){return D(t[n],e[n])}))}catch(t){return!1}}function M(t,e){for(var n=0;n<t.length;n++)if(D(t[n],e))return n;return-1}function I(t){var e=!1;return function(){e||(e=!0,t.apply(this,arguments))}}function L(t,e){return t===e?0===t&&1/t!=1/e:t==t||e==e}var R="data-server-rendered",F=["component","directive","filter"],H=["beforeCreate","created","beforeMount","mounted","beforeUpdate","updated","beforeDestroy","destroyed","activated","deactivated","errorCaptured","serverPrefetch","renderTracked","renderTriggered"],B={optionMergeStrategies:Object.create(null),silent:!1,productionTip:!1,devtools:!1,performance:!1,errorHandler:null,warnHandler:null,ignoredElements:[],keyCodes:Object.create(null),isReservedTag:N,isReservedAttr:N,isUnknownElement:N,getTagNamespace:E,parsePlatformTagName:P,mustUseProp:N,async:!0,_lifecycleHooks:H},U=/a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/;function z(t){var e=(t+"").charCodeAt(0);return 36===e||95===e}function V(t,e,n,r){Object.defineProperty(t,e,{value:n,enumerable:!!r,writable:!0,configurable:!0})}var K=new RegExp("[^".concat(U.source,".$_\\d]"));var J="__proto__"in{},q="undefined"!=typeof window,W=q&&window.navigator.userAgent.toLowerCase(),Z=W&&/msie|trident/.test(W),G=W&&W.indexOf("msie 9.0")>0,X=W&&W.indexOf("edge/")>0;W&&W.indexOf("android");var Y=W&&/iphone|ipad|ipod|ios/.test(W);W&&/chrome\/\d+/.test(W),W&&/phantomjs/.test(W);var Q,tt=W&&W.match(/firefox\/(\d+)/),et={}.watch,nt=!1;if(q)try{var rt={};Object.defineProperty(rt,"passive",{get:function(){nt=!0}}),window.addEventListener("test-passive",null,rt)}catch(t){}var ot=function(){return void 0===Q&&(Q=!q&&"undefined"!=typeof global&&(global.process&&"server"===global.process.env.VUE_ENV)),Q},it=q&&window.__VUE_DEVTOOLS_GLOBAL_HOOK__;function at(t){return"function"==typeof t&&/native code/.test(t.toString())}var st,ct="undefined"!=typeof Symbol&&at(Symbol)&&"undefined"!=typeof Reflect&&at(Reflect.ownKeys);st="undefined"!=typeof Set&&at(Set)?Set:function(){function t(){this.set=Object.create(null)}return t.prototype.has=function(t){return!0===this.set[t]},t.prototype.add=function(t){this.set[t]=!0},t.prototype.clear=function(){this.set=Object.create(null)},t}();var ut=null;function lt(t){void 0===t&&(t=null),t||ut&&ut._scope.off(),ut=t,t&&t._scope.on()}var ft=function(){function t(t,e,n,r,o,i,a,s){this.tag=t,this.data=e,this.children=n,this.text=r,this.elm=o,this.ns=void 0,this.context=i,this.fnContext=void 0,this.fnOptions=void 0,this.fnScopeId=void 0,this.key=e&&e.key,this.componentOptions=a,this.componentInstance=void 0,this.parent=void 0,this.raw=!1,this.isStatic=!1,this.isRootInsert=!0,this.isComment=!1,this.isCloned=!1,this.isOnce=!1,this.asyncFactory=s,this.asyncMeta=void 0,this.isAsyncPlaceholder=!1}return Object.defineProperty(t.prototype,"child",{get:function(){return this.componentInstance},enumerable:!1,configurable:!0}),t}(),dt=function(t){void 0===t&&(t="");var e=new ft;return e.text=t,e.isComment=!0,e};function pt(t){return new ft(void 0,void 0,void 0,String(t))}function vt(t){var e=new ft(t.tag,t.data,t.children&&t.children.slice(),t.text,t.elm,t.context,t.componentOptions,t.asyncFactory);return e.ns=t.ns,e.isStatic=t.isStatic,e.key=t.key,e.isComment=t.isComment,e.fnContext=t.fnContext,e.fnOptions=t.fnOptions,e.fnScopeId=t.fnScopeId,e.asyncMeta=t.asyncMeta,e.isCloned=!0,e}"function"==typeof SuppressedError&&SuppressedError;var ht=0,mt=[],gt=function(){for(var t=0;t<mt.length;t++){var e=mt[t];e.subs=e.subs.filter((function(t){return t})),e._pending=!1}mt.length=0},yt=function(){function t(){this._pending=!1,this.id=ht++,this.subs=[]}return t.prototype.addSub=function(t){this.subs.push(t)},t.prototype.removeSub=function(t){this.subs[this.subs.indexOf(t)]=null,this._pending||(this._pending=!0,mt.push(this))},t.prototype.depend=function(e){t.target&&t.target.addDep(this)},t.prototype.notify=function(t){for(var e=this.subs.filter((function(t){return t})),n=0,r=e.length;n<r;n++){e[n].update()}},t}();yt.target=null;var _t=[];function bt(t){_t.push(t),yt.target=t}function $t(){_t.pop(),yt.target=_t[_t.length-1]}var wt=Array.prototype,xt=Object.create(wt);["push","pop","shift","unshift","splice","sort","reverse"].forEach((function(t){var e=wt[t];V(xt,t,(function(){for(var n=[],r=0;r<arguments.length;r++)n[r]=arguments[r];var o,i=e.apply(this,n),a=this.__ob__;switch(t){case"push":case"unshift":o=n;break;case"splice":o=n.slice(2)}return o&&a.observeArray(o),a.dep.notify(),i}))}));var Ct=Object.getOwnPropertyNames(xt),kt={},St=!0;function Ot(t){St=t}var Tt={notify:E,depend:E,addSub:E,removeSub:E},At=function(){function t(t,n,r){if(void 0===n&&(n=!1),void 0===r&&(r=!1),this.value=t,this.shallow=n,this.mock=r,this.dep=r?Tt:new yt,this.vmCount=0,V(t,"__ob__",this),e(t)){if(!r)if(J)t.__proto__=xt;else for(var o=0,i=Ct.length;o<i;o++){V(t,s=Ct[o],xt[s])}n||this.observeArray(t)}else{var a=Object.keys(t);for(o=0;o<a.length;o++){var s;Et(t,s=a[o],kt,void 0,n,r)}}}return t.prototype.observeArray=function(t){for(var e=0,n=t.length;e<n;e++)jt(t[e],!1,this.mock)},t}();function jt(t,n,r){return t&&b(t,"__ob__")&&t.__ob__ instanceof At?t.__ob__:!St||!r&&ot()||!e(t)&&!u(t)||!Object.isExtensible(t)||t.__v_skip||Bt(t)||t instanceof ft?void 0:new At(t,n,r)}function Et(t,n,r,o,i,a,s){void 0===s&&(s=!1);var c=new yt,u=Object.getOwnPropertyDescriptor(t,n);if(!u||!1!==u.configurable){var l=u&&u.get,f=u&&u.set;l&&!f||r!==kt&&2!==arguments.length||(r=t[n]);var d=i?r&&r.__ob__:jt(r,!1,a);return Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:function(){var n=l?l.call(t):r;return yt.target&&(c.depend(),d&&(d.dep.depend(),e(n)&&Dt(n))),Bt(n)&&!i?n.value:n},set:function(e){var n=l?l.call(t):r;if(L(n,e)){if(f)f.call(t,e);else{if(l)return;if(!i&&Bt(n)&&!Bt(e))return void(n.value=e);r=e}d=i?e&&e.__ob__:jt(e,!1,a),c.notify()}}}),c}}function Nt(t,n,r){if(!Ft(t)){var o=t.__ob__;return e(t)&&l(n)?(t.length=Math.max(t.length,n),t.splice(n,1,r),o&&!o.shallow&&o.mock&&jt(r,!1,!0),r):n in t&&!(n in Object.prototype)?(t[n]=r,r):t._isVue||o&&o.vmCount?r:o?(Et(o.value,n,r,void 0,o.shallow,o.mock),o.dep.notify(),r):(t[n]=r,r)}}function Pt(t,n){if(e(t)&&l(n))t.splice(n,1);else{var r=t.__ob__;t._isVue||r&&r.vmCount||Ft(t)||b(t,n)&&(delete t[n],r&&r.dep.notify())}}function Dt(t){for(var n=void 0,r=0,o=t.length;r<o;r++)(n=t[r])&&n.__ob__&&n.__ob__.dep.depend(),e(n)&&Dt(n)}function Mt(t){return It(t,!0),V(t,"__v_isShallow",!0),t}function It(t,e){Ft(t)||jt(t,e,ot())}function Lt(t){return Ft(t)?Lt(t.__v_raw):!(!t||!t.__ob__)}function Rt(t){return!(!t||!t.__v_isShallow)}function Ft(t){return!(!t||!t.__v_isReadonly)}var Ht="__v_isRef";function Bt(t){return!(!t||!0!==t.__v_isRef)}function Ut(t,e){if(Bt(t))return t;var n={};return V(n,Ht,!0),V(n,"__v_isShallow",e),V(n,"dep",Et(n,"value",t,null,e,ot())),n}function zt(t,e,n){Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:function(){var t=e[n];if(Bt(t))return t.value;var r=t&&t.__ob__;return r&&r.dep.depend(),t},set:function(t){var r=e[n];Bt(r)&&!Bt(t)?r.value=t:e[n]=t}})}function Vt(t,e,n){var r=t[e];if(Bt(r))return r;var o={get value(){var r=t[e];return void 0===r?n:r},set value(n){t[e]=n}};return V(o,Ht,!0),o}var Kt="__v_rawToReadonly",Jt="__v_rawToShallowReadonly";function qt(t){return Wt(t,!1)}function Wt(t,e){if(!u(t))return t;if(Ft(t))return t;var n=e?Jt:Kt,r=t[n];if(r)return r;var o=Object.create(Object.getPrototypeOf(t));V(t,n,o),V(o,"__v_isReadonly",!0),V(o,"__v_raw",t),Bt(t)&&V(o,Ht,!0),(e||Rt(t))&&V(o,"__v_isShallow",!0);for(var i=Object.keys(t),a=0;a<i.length;a++)Zt(o,t,i[a],e);return o}function Zt(t,e,n,r){Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:function(){var t=e[n];return r||!u(t)?t:qt(t)},set:function(){}})}var Gt=$((function(t){var e="&"===t.charAt(0),n="~"===(t=e?t.slice(1):t).charAt(0),r="!"===(t=n?t.slice(1):t).charAt(0);return{name:t=r?t.slice(1):t,once:n,capture:r,passive:e}}));function Xt(t,n){function r(){var t=r.fns;if(!e(t))return _n(t,null,arguments,n,"v-on handler");for(var o=t.slice(),i=0;i<o.length;i++)_n(o[i],null,arguments,n,"v-on handler")}return r.fns=t,r}function Yt(t,e,r,i,a,s){var c,u,l,f;for(c in t)u=t[c],l=e[c],f=Gt(c),n(u)||(n(l)?(n(u.fns)&&(u=t[c]=Xt(u,s)),o(f.once)&&(u=t[c]=a(f.name,u,f.capture)),r(f.name,u,f.capture,f.passive,f.params)):u!==l&&(l.fns=u,t[c]=l));for(c in e)n(t[c])&&i((f=Gt(c)).name,e[c],f.capture)}function Qt(t,e,i){var a;t instanceof ft&&(t=t.data.hook||(t.data.hook={}));var s=t[e];function c(){i.apply(this,arguments),y(a.fns,c)}n(s)?a=Xt([c]):r(s.fns)&&o(s.merged)?(a=s).fns.push(c):a=Xt([s,c]),a.merged=!0,t[e]=a}function te(t,e,n,o,i){if(r(e)){if(b(e,n))return t[n]=e[n],i||delete e[n],!0;if(b(e,o))return t[n]=e[o],i||delete e[o],!0}return!1}function ee(t){return i(t)?[pt(t)]:e(t)?re(t):void 0}function ne(t){return r(t)&&r(t.text)&&!1===t.isComment}function re(t,a){var s,c,u,l,f=[];for(s=0;s<t.length;s++)n(c=t[s])||"boolean"==typeof c||(l=f[u=f.length-1],e(c)?c.length>0&&(ne((c=re(c,"".concat(a||"","_").concat(s)))[0])&&ne(l)&&(f[u]=pt(l.text+c[0].text),c.shift()),f.push.apply(f,c)):i(c)?ne(l)?f[u]=pt(l.text+c):""!==c&&f.push(pt(c)):ne(c)&&ne(l)?f[u]=pt(l.text+c.text):(o(t._isVList)&&r(c.tag)&&n(c.key)&&r(a)&&(c.key="__vlist".concat(a,"_").concat(s,"__")),f.push(c)));return f}var oe=1,ie=2;function ae(t,n,c,u,l,f){return(e(c)||i(c))&&(l=u,u=c,c=void 0),o(f)&&(l=ie),function(t,n,o,i,c){if(r(o)&&r(o.__ob__))return dt();r(o)&&r(o.is)&&(n=o.is);if(!n)return dt();e(i)&&a(i[0])&&((o=o||{}).scopedSlots={default:i[0]},i.length=0);c===ie?i=ee(i):c===oe&&(i=function(t){for(var n=0;n<t.length;n++)if(e(t[n]))return Array.prototype.concat.apply([],t);return t}(i));var u,l;if("string"==typeof n){var f=void 0;l=t.$vnode&&t.$vnode.ns||B.getTagNamespace(n),u=B.isReservedTag(n)?new ft(B.parsePlatformTagName(n),o,i,void 0,void 0,t):o&&o.pre||!r(f=kr(t.$options,"components",n))?new ft(n,o,i,void 0,void 0,t):hr(f,o,t,i,n)}else u=hr(n,o,t,i);return e(u)?u:r(u)?(r(l)&&se(u,l),r(o)&&function(t){s(t.style)&&Wn(t.style);s(t.class)&&Wn(t.class)}(o),u):dt()}(t,n,c,u,l)}function se(t,e,i){if(t.ns=e,"foreignObject"===t.tag&&(e=void 0,i=!0),r(t.children))for(var a=0,s=t.children.length;a<s;a++){var c=t.children[a];r(c.tag)&&(n(c.ns)||o(i)&&"svg"!==c.tag)&&se(c,e,i)}}function ce(t,n){var o,i,a,c,u=null;if(e(t)||"string"==typeof t)for(u=new Array(t.length),o=0,i=t.length;o<i;o++)u[o]=n(t[o],o);else if("number"==typeof t)for(u=new Array(t),o=0;o<t;o++)u[o]=n(o+1,o);else if(s(t))if(ct&&t[Symbol.iterator]){u=[];for(var l=t[Symbol.iterator](),f=l.next();!f.done;)u.push(n(f.value,u.length)),f=l.next()}else for(a=Object.keys(t),u=new Array(a.length),o=0,i=a.length;o<i;o++)c=a[o],u[o]=n(t[c],c,o);return r(u)||(u=[]),u._isVList=!0,u}function ue(t,e,n,r){var o,i=this.$scopedSlots[t];i?(n=n||{},r&&(n=A(A({},r),n)),o=i(n)||(a(e)?e():e)):o=this.$slots[t]||(a(e)?e():e);var s=n&&n.slot;return s?this.$createElement("template",{slot:s},o):o}function le(t){return kr(this.$options,"filters",t)||P}function fe(t,n){return e(t)?-1===t.indexOf(n):t!==n}function de(t,e,n,r,o){var i=B.keyCodes[e]||n;return o&&r&&!B.keyCodes[e]?fe(o,r):i?fe(i,t):r?S(r)!==e:void 0===t}function pe(t,n,r,o,i){if(r)if(s(r)){e(r)&&(r=j(r));var a=void 0,c=function(e){if("class"===e||"style"===e||g(e))a=t;else{var s=t.attrs&&t.attrs.type;a=o||B.mustUseProp(n,s,e)?t.domProps||(t.domProps={}):t.attrs||(t.attrs={})}var c=x(e),u=S(e);c in a||u in a||(a[e]=r[e],i&&((t.on||(t.on={}))["update:".concat(e)]=function(t){r[e]=t}))};for(var u in r)c(u)}else;return t}function ve(t,e){var n=this._staticTrees||(this._staticTrees=[]),r=n[t];return r&&!e||me(r=n[t]=this.$options.staticRenderFns[t].call(this._renderProxy,this._c,this),"__static__".concat(t),!1),r}function he(t,e,n){return me(t,"__once__".concat(e).concat(n?"_".concat(n):""),!0),t}function me(t,n,r){if(e(t))for(var o=0;o<t.length;o++)t[o]&&"string"!=typeof t[o]&&ge(t[o],"".concat(n,"_").concat(o),r);else ge(t,n,r)}function ge(t,e,n){t.isStatic=!0,t.key=e,t.isOnce=n}function ye(t,e){if(e)if(u(e)){var n=t.on=t.on?A({},t.on):{};for(var r in e){var o=n[r],i=e[r];n[r]=o?[].concat(o,i):i}}else;return t}function _e(t,n,r,o){n=n||{$stable:!r};for(var i=0;i<t.length;i++){var a=t[i];e(a)?_e(a,n,r):a&&(a.proxy&&(a.fn.proxy=!0),n[a.key]=a.fn)}return o&&(n.$key=o),n}function be(t,e){for(var n=0;n<e.length;n+=2){var r=e[n];"string"==typeof r&&r&&(t[e[n]]=e[n+1])}return t}function $e(t,e){return"string"==typeof t?e+t:t}function we(t){t._o=he,t._n=v,t._s=d,t._l=ce,t._t=ue,t._q=D,t._i=M,t._m=ve,t._f=le,t._k=de,t._b=pe,t._v=pt,t._e=dt,t._u=_e,t._g=ye,t._d=be,t._p=$e}function xe(t,e){if(!t||!t.length)return{};for(var n={},r=0,o=t.length;r<o;r++){var i=t[r],a=i.data;if(a&&a.attrs&&a.attrs.slot&&delete a.attrs.slot,i.context!==e&&i.fnContext!==e||!a||null==a.slot)(n.default||(n.default=[])).push(i);else{var s=a.slot,c=n[s]||(n[s]=[]);"template"===i.tag?c.push.apply(c,i.children||[]):c.push(i)}}for(var u in n)n[u].every(Ce)&&delete n[u];return n}function Ce(t){return t.isComment&&!t.asyncFactory||" "===t.text}function ke(t){return t.isComment&&t.asyncFactory}function Se(e,n,r,o){var i,a=Object.keys(r).length>0,s=n?!!n.$stable:!a,c=n&&n.$key;if(n){if(n._normalized)return n._normalized;if(s&&o&&o!==t&&c===o.$key&&!a&&!o.$hasNormal)return o;for(var u in i={},n)n[u]&&"$"!==u[0]&&(i[u]=Oe(e,r,u,n[u]))}else i={};for(var l in r)l in i||(i[l]=Te(r,l));return n&&Object.isExtensible(n)&&(n._normalized=i),V(i,"$stable",s),V(i,"$key",c),V(i,"$hasNormal",a),i}function Oe(t,n,r,o){var i=function(){var n=ut;lt(t);var r=arguments.length?o.apply(null,arguments):o({}),i=(r=r&&"object"==typeof r&&!e(r)?[r]:ee(r))&&r[0];return lt(n),r&&(!i||1===r.length&&i.isComment&&!ke(i))?void 0:r};return o.proxy&&Object.defineProperty(n,r,{get:i,enumerable:!0,configurable:!0}),i}function Te(t,e){return function(){return t[e]}}function Ae(e){return{get attrs(){if(!e._attrsProxy){var n=e._attrsProxy={};V(n,"_v_attr_proxy",!0),je(n,e.$attrs,t,e,"$attrs")}return e._attrsProxy},get listeners(){e._listenersProxy||je(e._listenersProxy={},e.$listeners,t,e,"$listeners");return e._listenersProxy},get slots(){return function(t){t._slotsProxy||Ne(t._slotsProxy={},t.$scopedSlots);return t._slotsProxy}(e)},emit:O(e.$emit,e),expose:function(t){t&&Object.keys(t).forEach((function(n){return zt(e,t,n)}))}}}function je(t,e,n,r,o){var i=!1;for(var a in e)a in t?e[a]!==n[a]&&(i=!0):(i=!0,Ee(t,a,r,o));for(var a in t)a in e||(i=!0,delete t[a]);return i}function Ee(t,e,n,r){Object.defineProperty(t,e,{enumerable:!0,configurable:!0,get:function(){return n[r][e]}})}function Ne(t,e){for(var n in e)t[n]=e[n];for(var n in t)n in e||delete t[n]}function Pe(){var t=ut;return t._setupContext||(t._setupContext=Ae(t))}var De,Me,Ie=null;function Le(t,e){return(t.__esModule||ct&&"Module"===t[Symbol.toStringTag])&&(t=t.default),s(t)?e.extend(t):t}function Re(t){if(e(t))for(var n=0;n<t.length;n++){var o=t[n];if(r(o)&&(r(o.componentOptions)||ke(o)))return o}}function Fe(t,e){De.$on(t,e)}function He(t,e){De.$off(t,e)}function Be(t,e){var n=De;return function r(){null!==e.apply(null,arguments)&&n.$off(t,r)}}function Ue(t,e,n){De=t,Yt(e,n||{},Fe,He,Be,t),De=void 0}var ze=function(){function t(t){void 0===t&&(t=!1),this.detached=t,this.active=!0,this.effects=[],this.cleanups=[],this.parent=Me,!t&&Me&&(this.index=(Me.scopes||(Me.scopes=[])).push(this)-1)}return t.prototype.run=function(t){if(this.active){var e=Me;try{return Me=this,t()}finally{Me=e}}},t.prototype.on=function(){Me=this},t.prototype.off=function(){Me=this.parent},t.prototype.stop=function(t){if(this.active){var e=void 0,n=void 0;for(e=0,n=this.effects.length;e<n;e++)this.effects[e].teardown();for(e=0,n=this.cleanups.length;e<n;e++)this.cleanups[e]();if(this.scopes)for(e=0,n=this.scopes.length;e<n;e++)this.scopes[e].stop(!0);if(!this.detached&&this.parent&&!t){var r=this.parent.scopes.pop();r&&r!==this&&(this.parent.scopes[this.index]=r,r.index=this.index)}this.parent=void 0,this.active=!1}},t}();function Ve(){return Me}var Ke=null;function Je(t){var e=Ke;return Ke=t,function(){Ke=e}}function qe(t){for(;t&&(t=t.$parent);)if(t._inactive)return!0;return!1}function We(t,e){if(e){if(t._directInactive=!1,qe(t))return}else if(t._directInactive)return;if(t._inactive||null===t._inactive){t._inactive=!1;for(var n=0;n<t.$children.length;n++)We(t.$children[n]);Ge(t,"activated")}}function Ze(t,e){if(!(e&&(t._directInactive=!0,qe(t))||t._inactive)){t._inactive=!0;for(var n=0;n<t.$children.length;n++)Ze(t.$children[n]);Ge(t,"deactivated")}}function Ge(t,e,n,r){void 0===r&&(r=!0),bt();var o=ut,i=Ve();r&&lt(t);var a=t.$options[e],s="".concat(e," hook");if(a)for(var c=0,u=a.length;c<u;c++)_n(a[c],t,n||null,t,s);t._hasHookEvent&&t.$emit("hook:"+e),r&&(lt(o),i&&i.on()),$t()}var Xe=[],Ye=[],Qe={},tn=!1,en=!1,nn=0;var rn=0,on=Date.now;if(q&&!Z){var an=window.performance;an&&"function"==typeof an.now&&on()>document.createEvent("Event").timeStamp&&(on=function(){return an.now()})}var sn=function(t,e){if(t.post){if(!e.post)return 1}else if(e.post)return-1;return t.id-e.id};function cn(){var t,e;for(rn=on(),en=!0,Xe.sort(sn),nn=0;nn<Xe.length;nn++)(t=Xe[nn]).before&&t.before(),e=t.id,Qe[e]=null,t.run();var n=Ye.slice(),r=Xe.slice();nn=Xe.length=Ye.length=0,Qe={},tn=en=!1,function(t){for(var e=0;e<t.length;e++)t[e]._inactive=!0,We(t[e],!0)}(n),function(t){var e=t.length;for(;e--;){var n=t[e],r=n.vm;r&&r._watcher===n&&r._isMounted&&!r._isDestroyed&&Ge(r,"updated")}}(r),gt(),it&&B.devtools&&it.emit("flush")}function un(t){var e=t.id;if(null==Qe[e]&&(t!==yt.target||!t.noRecurse)){if(Qe[e]=!0,en){for(var n=Xe.length-1;n>nn&&Xe[n].id>t.id;)n--;Xe.splice(n+1,0,t)}else Xe.push(t);tn||(tn=!0,En(cn))}}var ln="watcher",fn="".concat(ln," callback"),dn="".concat(ln," getter"),pn="".concat(ln," cleanup");function vn(t,e){return mn(t,null,{flush:"post"})}var hn={};function mn(n,r,o){var i=void 0===o?t:o,s=i.immediate,c=i.deep,u=i.flush,l=void 0===u?"pre":u;i.onTrack,i.onTrigger;var f,d,p=ut,v=function(t,e,n){void 0===n&&(n=null);var r=_n(t,null,n,p,e);return c&&r&&r.__ob__&&r.__ob__.dep.depend(),r},h=!1,m=!1;if(Bt(n)?(f=function(){return n.value},h=Rt(n)):Lt(n)?(f=function(){return n.__ob__.dep.depend(),n},c=!0):e(n)?(m=!0,h=n.some((function(t){return Lt(t)||Rt(t)})),f=function(){return n.map((function(t){return Bt(t)?t.value:Lt(t)?(t.__ob__.dep.depend(),Wn(t)):a(t)?v(t,dn):void 0}))}):f=a(n)?r?function(){return v(n,dn)}:function(){if(!p||!p._isDestroyed)return d&&d(),v(n,ln,[y])}:E,r&&c){var g=f;f=function(){return Wn(g())}}var y=function(t){d=_.onStop=function(){v(t,pn)}};if(ot())return y=E,r?s&&v(r,fn,[f(),m?[]:void 0,y]):f(),E;var _=new Xn(ut,f,E,{lazy:!0});_.noRecurse=!r;var b=m?[]:hn;return _.run=function(){if(_.active)if(r){var t=_.get();(c||h||(m?t.some((function(t,e){return L(t,b[e])})):L(t,b)))&&(d&&d(),v(r,fn,[t,b===hn?void 0:b,y]),b=t)}else _.get()},"sync"===l?_.update=_.run:"post"===l?(_.post=!0,_.update=function(){return un(_)}):_.update=function(){if(p&&p===ut&&!p._isMounted){var t=p._preWatchers||(p._preWatchers=[]);t.indexOf(_)<0&&t.push(_)}else un(_)},r?s?_.run():b=_.get():"post"===l&&p?p.$once("hook:mounted",(function(){return _.get()})):_.get(),function(){_.teardown()}}function gn(t){var e=t._provided,n=t.$parent&&t.$parent._provided;return n===e?t._provided=Object.create(n):e}function yn(t,e,n){bt();try{if(e)for(var r=e;r=r.$parent;){var o=r.$options.errorCaptured;if(o)for(var i=0;i<o.length;i++)try{if(!1===o[i].call(r,t,e,n))return}catch(t){bn(t,r,"errorCaptured hook")}}bn(t,e,n)}finally{$t()}}function _n(t,e,n,r,o){var i;try{(i=n?t.apply(e,n):t.call(e))&&!i._isVue&&f(i)&&!i._handled&&(i.catch((function(t){return yn(t,r,o+" (Promise/async)")})),i._handled=!0)}catch(t){yn(t,r,o)}return i}function bn(t,e,n){if(B.errorHandler)try{return B.errorHandler.call(null,t,e,n)}catch(e){e!==t&&$n(e)}$n(t)}function $n(t,e,n){if(!q||"undefined"==typeof console)throw t;console.error(t)}var wn,xn=!1,Cn=[],kn=!1;function Sn(){kn=!1;var t=Cn.slice(0);Cn.length=0;for(var e=0;e<t.length;e++)t[e]()}if("undefined"!=typeof Promise&&at(Promise)){var On=Promise.resolve();wn=function(){On.then(Sn),Y&&setTimeout(E)},xn=!0}else if(Z||"undefined"==typeof MutationObserver||!at(MutationObserver)&&"[object MutationObserverConstructor]"!==MutationObserver.toString())wn="undefined"!=typeof setImmediate&&at(setImmediate)?function(){setImmediate(Sn)}:function(){setTimeout(Sn,0)};else{var Tn=1,An=new MutationObserver(Sn),jn=document.createTextNode(String(Tn));An.observe(jn,{characterData:!0}),wn=function(){Tn=(Tn+1)%2,jn.data=String(Tn)},xn=!0}function En(t,e){var n;if(Cn.push((function(){if(t)try{t.call(e)}catch(t){yn(t,e,"nextTick")}else n&&n(e)})),kn||(kn=!0,wn()),!t&&"undefined"!=typeof Promise)return new Promise((function(t){n=t}))}function Nn(t){return function(e,n){if(void 0===n&&(n=ut),n)return function(t,e,n){var r=t.$options;r[e]=$r(r[e],n)}(n,t,e)}}var Pn=Nn("beforeMount"),Dn=Nn("mounted"),Mn=Nn("beforeUpdate"),In=Nn("updated"),Ln=Nn("beforeDestroy"),Rn=Nn("destroyed"),Fn=Nn("activated"),Hn=Nn("deactivated"),Bn=Nn("serverPrefetch"),Un=Nn("renderTracked"),zn=Nn("renderTriggered"),Vn=Nn("errorCaptured");var Kn="2.7.16";var Jn=Object.freeze({__proto__:null,version:Kn,defineComponent:function(t){return t},ref:function(t){return Ut(t,!1)},shallowRef:function(t){return Ut(t,!0)},isRef:Bt,toRef:Vt,toRefs:function(t){var n=e(t)?new Array(t.length):{};for(var r in t)n[r]=Vt(t,r);return n},unref:function(t){return Bt(t)?t.value:t},proxyRefs:function(t){if(Lt(t))return t;for(var e={},n=Object.keys(t),r=0;r<n.length;r++)zt(e,t,n[r]);return e},customRef:function(t){var e=new yt,n=t((function(){e.depend()}),(function(){e.notify()})),r=n.get,o=n.set,i={get value(){return r()},set value(t){o(t)}};return V(i,Ht,!0),i},triggerRef:function(t){t.dep&&t.dep.notify()},reactive:function(t){return It(t,!1),t},isReactive:Lt,isReadonly:Ft,isShallow:Rt,isProxy:function(t){return Lt(t)||Ft(t)},shallowReactive:Mt,markRaw:function(t){return Object.isExtensible(t)&&V(t,"__v_skip",!0),t},toRaw:function t(e){var n=e&&e.__v_raw;return n?t(n):e},readonly:qt,shallowReadonly:function(t){return Wt(t,!0)},computed:function(t,e){var n,r,o=a(t);o?(n=t,r=E):(n=t.get,r=t.set);var i=ot()?null:new Xn(ut,n,E,{lazy:!0}),s={effect:i,get value(){return i?(i.dirty&&i.evaluate(),yt.target&&i.depend(),i.value):n()},set value(t){r(t)}};return V(s,Ht,!0),V(s,"__v_isReadonly",o),s},watch:function(t,e,n){return mn(t,e,n)},watchEffect:function(t,e){return mn(t,null,e)},watchPostEffect:vn,watchSyncEffect:function(t,e){return mn(t,null,{flush:"sync"})},EffectScope:ze,effectScope:function(t){return new ze(t)},onScopeDispose:function(t){Me&&Me.cleanups.push(t)},getCurrentScope:Ve,provide:function(t,e){ut&&(gn(ut)[t]=e)},inject:function(t,e,n){void 0===n&&(n=!1);var r=ut;if(r){var o=r.$parent&&r.$parent._provided;if(o&&t in o)return o[t];if(arguments.length>1)return n&&a(e)?e.call(r):e}},h:function(t,e,n){return ae(ut,t,e,n,2,!0)},getCurrentInstance:function(){return ut&&{proxy:ut}},useSlots:function(){return Pe().slots},useAttrs:function(){return Pe().attrs},useListeners:function(){return Pe().listeners},mergeDefaults:function(t,n){var r=e(t)?t.reduce((function(t,e){return t[e]={},t}),{}):t;for(var o in n){var i=r[o];i?e(i)||a(i)?r[o]={type:i,default:n[o]}:i.default=n[o]:null===i&&(r[o]={default:n[o]})}return r},nextTick:En,set:Nt,del:Pt,useCssModule:function(e){return t},useCssVars:function(t){if(q){var e=ut;e&&vn((function(){var n=e.$el,r=t(e,e._setupProxy);if(n&&1===n.nodeType){var o=n.style;for(var i in r)o.setProperty("--".concat(i),r[i])}}))}},defineAsyncComponent:function(t){a(t)&&(t={loader:t});var e=t.loader,n=t.loadingComponent,r=t.errorComponent,o=t.delay,i=void 0===o?200:o,s=t.timeout;t.suspensible;var c=t.onError,u=null,l=0,f=function(){var t;return u||(t=u=e().catch((function(t){if(t=t instanceof Error?t:new Error(String(t)),c)return new Promise((function(e,n){c(t,(function(){return e((l++,u=null,f()))}),(function(){return n(t)}),l+1)}));throw t})).then((function(e){return t!==u&&u?u:(e&&(e.__esModule||"Module"===e[Symbol.toStringTag])&&(e=e.default),e)})))};return function(){return{component:f(),delay:i,timeout:s,error:r,loading:n}}},onBeforeMount:Pn,onMounted:Dn,onBeforeUpdate:Mn,onUpdated:In,onBeforeUnmount:Ln,onUnmounted:Rn,onActivated:Fn,onDeactivated:Hn,onServerPrefetch:Bn,onRenderTracked:Un,onRenderTriggered:zn,onErrorCaptured:function(t,e){void 0===e&&(e=ut),Vn(t,e)}}),qn=new st;function Wn(t){return Zn(t,qn),qn.clear(),t}function Zn(t,n){var r,o,i=e(t);if(!(!i&&!s(t)||t.__v_skip||Object.isFrozen(t)||t instanceof ft)){if(t.__ob__){var a=t.__ob__.dep.id;if(n.has(a))return;n.add(a)}if(i)for(r=t.length;r--;)Zn(t[r],n);else if(Bt(t))Zn(t.value,n);else for(r=(o=Object.keys(t)).length;r--;)Zn(t[o[r]],n)}}var Gn=0,Xn=function(){function t(t,e,n,r,o){!function(t,e){void 0===e&&(e=Me),e&&e.active&&e.effects.push(t)}(this,Me&&!Me._vm?Me:t?t._scope:void 0),(this.vm=t)&&o&&(t._watcher=this),r?(this.deep=!!r.deep,this.user=!!r.user,this.lazy=!!r.lazy,this.sync=!!r.sync,this.before=r.before):this.deep=this.user=this.lazy=this.sync=!1,this.cb=n,this.id=++Gn,this.active=!0,this.post=!1,this.dirty=this.lazy,this.deps=[],this.newDeps=[],this.depIds=new st,this.newDepIds=new st,this.expression="",a(e)?this.getter=e:(this.getter=function(t){if(!K.test(t)){var e=t.split(".");return function(t){for(var n=0;n<e.length;n++){if(!t)return;t=t[e[n]]}return t}}}(e),this.getter||(this.getter=E)),this.value=this.lazy?void 0:this.get()}return t.prototype.get=function(){var t;bt(this);var e=this.vm;try{t=this.getter.call(e,e)}catch(t){if(!this.user)throw t;yn(t,e,'getter for watcher "'.concat(this.expression,'"'))}finally{this.deep&&Wn(t),$t(),this.cleanupDeps()}return t},t.prototype.addDep=function(t){var e=t.id;this.newDepIds.has(e)||(this.newDepIds.add(e),this.newDeps.push(t),this.depIds.has(e)||t.addSub(this))},t.prototype.cleanupDeps=function(){for(var t=this.deps.length;t--;){var e=this.deps[t];this.newDepIds.has(e.id)||e.removeSub(this)}var n=this.depIds;this.depIds=this.newDepIds,this.newDepIds=n,this.newDepIds.clear(),n=this.deps,this.deps=this.newDeps,this.newDeps=n,this.newDeps.length=0},t.prototype.update=function(){this.lazy?this.dirty=!0:this.sync?this.run():un(this)},t.prototype.run=function(){if(this.active){var t=this.get();if(t!==this.value||s(t)||this.deep){var e=this.value;if(this.value=t,this.user){var n='callback for watcher "'.concat(this.expression,'"');_n(this.cb,this.vm,[t,e],this.vm,n)}else this.cb.call(this.vm,t,e)}}},t.prototype.evaluate=function(){this.value=this.get(),this.dirty=!1},t.prototype.depend=function(){for(var t=this.deps.length;t--;)this.deps[t].depend()},t.prototype.teardown=function(){if(this.vm&&!this.vm._isBeingDestroyed&&y(this.vm._scope.effects,this),this.active){for(var t=this.deps.length;t--;)this.deps[t].removeSub(this);this.active=!1,this.onStop&&this.onStop()}},t}(),Yn={enumerable:!0,configurable:!0,get:E,set:E};function Qn(t,e,n){Yn.get=function(){return this[e][n]},Yn.set=function(t){this[e][n]=t},Object.defineProperty(t,n,Yn)}function tr(t){var n=t.$options;if(n.props&&function(t,e){var n=t.$options.propsData||{},r=t._props=Mt({}),o=t.$options._propKeys=[],i=!t.$parent;i||Ot(!1);var a=function(i){o.push(i);var a=Sr(i,e,n,t);Et(r,i,a,void 0,!0),i in t||Qn(t,"_props",i)};for(var s in e)a(s);Ot(!0)}(t,n.props),function(t){var e=t.$options,n=e.setup;if(n){var r=t._setupContext=Ae(t);lt(t),bt();var o=_n(n,null,[t._props||Mt({}),r],t,"setup");if($t(),lt(),a(o))e.render=o;else if(s(o))if(t._setupState=o,o.__sfc){var i=t._setupProxy={};for(var c in o)"__sfc"!==c&&zt(i,o,c)}else for(var c in o)z(c)||zt(t,o,c)}}(t),n.methods&&function(t,e){for(var n in t.$options.props,e)t[n]="function"!=typeof e[n]?E:O(e[n],t)}(t,n.methods),n.data)!function(t){var e=t.$options.data;e=t._data=a(e)?function(t,e){bt();try{return t.call(e,e)}catch(t){return yn(t,e,"data()"),{}}finally{$t()}}(e,t):e||{},u(e)||(e={});var n=Object.keys(e),r=t.$options.props;t.$options.methods;var o=n.length;for(;o--;){var i=n[o];r&&b(r,i)||z(i)||Qn(t,"_data",i)}var s=jt(e);s&&s.vmCount++}(t);else{var r=jt(t._data={});r&&r.vmCount++}n.computed&&function(t,e){var n=t._computedWatchers=Object.create(null),r=ot();for(var o in e){var i=e[o],s=a(i)?i:i.get;r||(n[o]=new Xn(t,s||E,E,er)),o in t||nr(t,o,i)}}(t,n.computed),n.watch&&n.watch!==et&&function(t,n){for(var r in n){var o=n[r];if(e(o))for(var i=0;i<o.length;i++)ir(t,r,o[i]);else ir(t,r,o)}}(t,n.watch)}var er={lazy:!0};function nr(t,e,n){var r=!ot();a(n)?(Yn.get=r?rr(e):or(n),Yn.set=E):(Yn.get=n.get?r&&!1!==n.cache?rr(e):or(n.get):E,Yn.set=n.set||E),Object.defineProperty(t,e,Yn)}function rr(t){return function(){var e=this._computedWatchers&&this._computedWatchers[t];if(e)return e.dirty&&e.evaluate(),yt.target&&e.depend(),e.value}}function or(t){return function(){return t.call(this,this)}}function ir(t,e,n,r){return u(n)&&(r=n,n=n.handler),"string"==typeof n&&(n=t[n]),t.$watch(e,n,r)}function ar(t,e){if(t){for(var n=Object.create(null),r=ct?Reflect.ownKeys(t):Object.keys(t),o=0;o<r.length;o++){var i=r[o];if("__ob__"!==i){var s=t[i].from;if(s in e._provided)n[i]=e._provided[s];else if("default"in t[i]){var c=t[i].default;n[i]=a(c)?c.call(e):c}}}return n}}var sr=0;function cr(t){var e=t.options;if(t.super){var n=cr(t.super);if(n!==t.superOptions){t.superOptions=n;var r=function(t){var e,n=t.options,r=t.sealedOptions;for(var o in n)n[o]!==r[o]&&(e||(e={}),e[o]=n[o]);return e}(t);r&&A(t.extendOptions,r),(e=t.options=Cr(n,t.extendOptions)).name&&(e.components[e.name]=t)}}return e}function ur(n,r,i,a,s){var c,u=this,l=s.options;b(a,"_uid")?(c=Object.create(a))._original=a:(c=a,a=a._original);var f=o(l._compiled),d=!f;this.data=n,this.props=r,this.children=i,this.parent=a,this.listeners=n.on||t,this.injections=ar(l.inject,a),this.slots=function(){return u.$slots||Se(a,n.scopedSlots,u.$slots=xe(i,a)),u.$slots},Object.defineProperty(this,"scopedSlots",{enumerable:!0,get:function(){return Se(a,n.scopedSlots,this.slots())}}),f&&(this.$options=l,this.$slots=this.slots(),this.$scopedSlots=Se(a,n.scopedSlots,this.$slots)),l._scopeId?this._c=function(t,n,r,o){var i=ae(c,t,n,r,o,d);return i&&!e(i)&&(i.fnScopeId=l._scopeId,i.fnContext=a),i}:this._c=function(t,e,n,r){return ae(c,t,e,n,r,d)}}function lr(t,e,n,r,o){var i=vt(t);return i.fnContext=n,i.fnOptions=r,e.slot&&((i.data||(i.data={})).slot=e.slot),i}function fr(t,e){for(var n in e)t[x(n)]=e[n]}function dr(t){return t.name||t.__name||t._componentTag}we(ur.prototype);var pr={init:function(t,e){if(t.componentInstance&&!t.componentInstance._isDestroyed&&t.data.keepAlive){var n=t;pr.prepatch(n,n)}else{(t.componentInstance=function(t,e){var n={_isComponent:!0,_parentVnode:t,parent:e},o=t.data.inlineTemplate;r(o)&&(n.render=o.render,n.staticRenderFns=o.staticRenderFns);return new t.componentOptions.Ctor(n)}(t,Ke)).$mount(e?t.elm:void 0,e)}},prepatch:function(e,n){var r=n.componentOptions;!function(e,n,r,o,i){var a=o.data.scopedSlots,s=e.$scopedSlots,c=!!(a&&!a.$stable||s!==t&&!s.$stable||a&&e.$scopedSlots.$key!==a.$key||!a&&e.$scopedSlots.$key),u=!!(i||e.$options._renderChildren||c),l=e.$vnode;e.$options._parentVnode=o,e.$vnode=o,e._vnode&&(e._vnode.parent=o),e.$options._renderChildren=i;var f=o.data.attrs||t;e._attrsProxy&&je(e._attrsProxy,f,l.data&&l.data.attrs||t,e,"$attrs")&&(u=!0),e.$attrs=f,r=r||t;var d=e.$options._parentListeners;if(e._listenersProxy&&je(e._listenersProxy,r,d||t,e,"$listeners"),e.$listeners=e.$options._parentListeners=r,Ue(e,r,d),n&&e.$options.props){Ot(!1);for(var p=e._props,v=e.$options._propKeys||[],h=0;h<v.length;h++){var m=v[h],g=e.$options.props;p[m]=Sr(m,g,n,e)}Ot(!0),e.$options.propsData=n}u&&(e.$slots=xe(i,o.context),e.$forceUpdate())}(n.componentInstance=e.componentInstance,r.propsData,r.listeners,n,r.children)},insert:function(t){var e,n=t.context,r=t.componentInstance;r._isMounted||(r._isMounted=!0,Ge(r,"mounted")),t.data.keepAlive&&(n._isMounted?((e=r)._inactive=!1,Ye.push(e)):We(r,!0))},destroy:function(t){var e=t.componentInstance;e._isDestroyed||(t.data.keepAlive?Ze(e,!0):e.$destroy())}},vr=Object.keys(pr);function hr(i,a,c,u,l){if(!n(i)){var d=c.$options._base;if(s(i)&&(i=d.extend(i)),"function"==typeof i){var p;if(n(i.cid)&&(i=function(t,e){if(o(t.error)&&r(t.errorComp))return t.errorComp;if(r(t.resolved))return t.resolved;var i=Ie;if(i&&r(t.owners)&&-1===t.owners.indexOf(i)&&t.owners.push(i),o(t.loading)&&r(t.loadingComp))return t.loadingComp;if(i&&!r(t.owners)){var a=t.owners=[i],c=!0,u=null,l=null;i.$on("hook:destroyed",(function(){return y(a,i)}));var d=function(t){for(var e=0,n=a.length;e<n;e++)a[e].$forceUpdate();t&&(a.length=0,null!==u&&(clearTimeout(u),u=null),null!==l&&(clearTimeout(l),l=null))},p=I((function(n){t.resolved=Le(n,e),c?a.length=0:d(!0)})),v=I((function(e){r(t.errorComp)&&(t.error=!0,d(!0))})),h=t(p,v);return s(h)&&(f(h)?n(t.resolved)&&h.then(p,v):f(h.component)&&(h.component.then(p,v),r(h.error)&&(t.errorComp=Le(h.error,e)),r(h.loading)&&(t.loadingComp=Le(h.loading,e),0===h.delay?t.loading=!0:u=setTimeout((function(){u=null,n(t.resolved)&&n(t.error)&&(t.loading=!0,d(!1))}),h.delay||200)),r(h.timeout)&&(l=setTimeout((function(){l=null,n(t.resolved)&&v(null)}),h.timeout)))),c=!1,t.loading?t.loadingComp:t.resolved}}(p=i,d),void 0===i))return function(t,e,n,r,o){var i=dt();return i.asyncFactory=t,i.asyncMeta={data:e,context:n,children:r,tag:o},i}(p,a,c,u,l);a=a||{},cr(i),r(a.model)&&function(t,n){var o=t.model&&t.model.prop||"value",i=t.model&&t.model.event||"input";(n.attrs||(n.attrs={}))[o]=n.model.value;var a=n.on||(n.on={}),s=a[i],c=n.model.callback;r(s)?(e(s)?-1===s.indexOf(c):s!==c)&&(a[i]=[c].concat(s)):a[i]=c}(i.options,a);var v=function(t,e,o){var i=e.options.props;if(!n(i)){var a={},s=t.attrs,c=t.props;if(r(s)||r(c))for(var u in i){var l=S(u);te(a,c,u,l,!0)||te(a,s,u,l,!1)}return a}}(a,i);if(o(i.options.functional))return function(n,o,i,a,s){var c=n.options,u={},l=c.props;if(r(l))for(var f in l)u[f]=Sr(f,l,o||t);else r(i.attrs)&&fr(u,i.attrs),r(i.props)&&fr(u,i.props);var d=new ur(i,u,s,a,n),p=c.render.call(null,d._c,d);if(p instanceof ft)return lr(p,i,d.parent,c);if(e(p)){for(var v=ee(p)||[],h=new Array(v.length),m=0;m<v.length;m++)h[m]=lr(v[m],i,d.parent,c);return h}}(i,v,a,c,u);var h=a.on;if(a.on=a.nativeOn,o(i.options.abstract)){var m=a.slot;a={},m&&(a.slot=m)}!function(t){for(var e=t.hook||(t.hook={}),n=0;n<vr.length;n++){var r=vr[n],o=e[r],i=pr[r];o===i||o&&o._merged||(e[r]=o?mr(i,o):i)}}(a);var g=dr(i.options)||l;return new ft("vue-component-".concat(i.cid).concat(g?"-".concat(g):""),a,void 0,void 0,void 0,c,{Ctor:i,propsData:v,listeners:h,tag:l,children:u},p)}}}function mr(t,e){var n=function(n,r){t(n,r),e(n,r)};return n._merged=!0,n}var gr=E,yr=B.optionMergeStrategies;function _r(t,e,n){if(void 0===n&&(n=!0),!e)return t;for(var r,o,i,a=ct?Reflect.ownKeys(e):Object.keys(e),s=0;s<a.length;s++)"__ob__"!==(r=a[s])&&(o=t[r],i=e[r],n&&b(t,r)?o!==i&&u(o)&&u(i)&&_r(o,i):Nt(t,r,i));return t}function br(t,e,n){return n?function(){var r=a(e)?e.call(n,n):e,o=a(t)?t.call(n,n):t;return r?_r(r,o):o}:e?t?function(){return _r(a(e)?e.call(this,this):e,a(t)?t.call(this,this):t)}:e:t}function $r(t,n){var r=n?t?t.concat(n):e(n)?n:[n]:t;return r?function(t){for(var e=[],n=0;n<t.length;n++)-1===e.indexOf(t[n])&&e.push(t[n]);return e}(r):r}function wr(t,e,n,r){var o=Object.create(t||null);return e?A(o,e):o}yr.data=function(t,e,n){return n?br(t,e,n):e&&"function"!=typeof e?t:br(t,e)},H.forEach((function(t){yr[t]=$r})),F.forEach((function(t){yr[t+"s"]=wr})),yr.watch=function(t,n,r,o){if(t===et&&(t=void 0),n===et&&(n=void 0),!n)return Object.create(t||null);if(!t)return n;var i={};for(var a in A(i,t),n){var s=i[a],c=n[a];s&&!e(s)&&(s=[s]),i[a]=s?s.concat(c):e(c)?c:[c]}return i},yr.props=yr.methods=yr.inject=yr.computed=function(t,e,n,r){if(!t)return e;var o=Object.create(null);return A(o,t),e&&A(o,e),o},yr.provide=function(t,e){return t?function(){var n=Object.create(null);return _r(n,a(t)?t.call(this):t),e&&_r(n,a(e)?e.call(this):e,!1),n}:e};var xr=function(t,e){return void 0===e?t:e};function Cr(t,n,r){if(a(n)&&(n=n.options),function(t,n){var r=t.props;if(r){var o,i,a={};if(e(r))for(o=r.length;o--;)"string"==typeof(i=r[o])&&(a[x(i)]={type:null});else if(u(r))for(var s in r)i=r[s],a[x(s)]=u(i)?i:{type:i};t.props=a}}(n),function(t,n){var r=t.inject;if(r){var o=t.inject={};if(e(r))for(var i=0;i<r.length;i++)o[r[i]]={from:r[i]};else if(u(r))for(var a in r){var s=r[a];o[a]=u(s)?A({from:a},s):{from:s}}}}(n),function(t){var e=t.directives;if(e)for(var n in e){var r=e[n];a(r)&&(e[n]={bind:r,update:r})}}(n),!n._base&&(n.extends&&(t=Cr(t,n.extends,r)),n.mixins))for(var o=0,i=n.mixins.length;o<i;o++)t=Cr(t,n.mixins[o],r);var s,c={};for(s in t)l(s);for(s in n)b(t,s)||l(s);function l(e){var o=yr[e]||xr;c[e]=o(t[e],n[e],r,e)}return c}function kr(t,e,n,r){if("string"==typeof n){var o=t[e];if(b(o,n))return o[n];var i=x(n);if(b(o,i))return o[i];var a=C(i);return b(o,a)?o[a]:o[n]||o[i]||o[a]}}function Sr(t,e,n,r){var o=e[t],i=!b(n,t),s=n[t],c=jr(Boolean,o.type);if(c>-1)if(i&&!b(o,"default"))s=!1;else if(""===s||s===S(t)){var u=jr(String,o.type);(u<0||c<u)&&(s=!0)}if(void 0===s){s=function(t,e,n){if(!b(e,"default"))return;var r=e.default;if(t&&t.$options.propsData&&void 0===t.$options.propsData[n]&&void 0!==t._props[n])return t._props[n];return a(r)&&"Function"!==Tr(e.type)?r.call(t):r}(r,o,t);var l=St;Ot(!0),jt(s),Ot(l)}return s}var Or=/^\s*function (\w+)/;function Tr(t){var e=t&&t.toString().match(Or);return e?e[1]:""}function Ar(t,e){return Tr(t)===Tr(e)}function jr(t,n){if(!e(n))return Ar(n,t)?0:-1;for(var r=0,o=n.length;r<o;r++)if(Ar(n[r],t))return r;return-1}function Er(t){this._init(t)}function Nr(t){t.cid=0;var e=1;t.extend=function(t){t=t||{};var n=this,r=n.cid,o=t._Ctor||(t._Ctor={});if(o[r])return o[r];var i=dr(t)||dr(n.options),a=function(t){this._init(t)};return(a.prototype=Object.create(n.prototype)).constructor=a,a.cid=e++,a.options=Cr(n.options,t),a.super=n,a.options.props&&function(t){var e=t.options.props;for(var n in e)Qn(t.prototype,"_props",n)}(a),a.options.computed&&function(t){var e=t.options.computed;for(var n in e)nr(t.prototype,n,e[n])}(a),a.extend=n.extend,a.mixin=n.mixin,a.use=n.use,F.forEach((function(t){a[t]=n[t]})),i&&(a.options.components[i]=a),a.superOptions=n.options,a.extendOptions=t,a.sealedOptions=A({},a.options),o[r]=a,a}}function Pr(t){return t&&(dr(t.Ctor.options)||t.tag)}function Dr(t,n){return e(t)?t.indexOf(n)>-1:"string"==typeof t?t.split(",").indexOf(n)>-1:(r=t,"[object RegExp]"===c.call(r)&&t.test(n));var r}function Mr(t,e){var n=t.cache,r=t.keys,o=t._vnode,i=t.$vnode;for(var a in n){var s=n[a];if(s){var c=s.name;c&&!e(c)&&Ir(n,a,r,o)}}i.componentOptions.children=void 0}function Ir(t,e,n,r){var o=t[e];!o||r&&o.tag===r.tag||o.componentInstance.$destroy(),t[e]=null,y(n,e)}!function(e){e.prototype._init=function(e){var n=this;n._uid=sr++,n._isVue=!0,n.__v_skip=!0,n._scope=new ze(!0),n._scope.parent=void 0,n._scope._vm=!0,e&&e._isComponent?function(t,e){var n=t.$options=Object.create(t.constructor.options),r=e._parentVnode;n.parent=e.parent,n._parentVnode=r;var o=r.componentOptions;n.propsData=o.propsData,n._parentListeners=o.listeners,n._renderChildren=o.children,n._componentTag=o.tag,e.render&&(n.render=e.render,n.staticRenderFns=e.staticRenderFns)}(n,e):n.$options=Cr(cr(n.constructor),e||{},n),n._renderProxy=n,n._self=n,function(t){var e=t.$options,n=e.parent;if(n&&!e.abstract){for(;n.$options.abstract&&n.$parent;)n=n.$parent;n.$children.push(t)}t.$parent=n,t.$root=n?n.$root:t,t.$children=[],t.$refs={},t._provided=n?n._provided:Object.create(null),t._watcher=null,t._inactive=null,t._directInactive=!1,t._isMounted=!1,t._isDestroyed=!1,t._isBeingDestroyed=!1}(n),function(t){t._events=Object.create(null),t._hasHookEvent=!1;var e=t.$options._parentListeners;e&&Ue(t,e)}(n),function(e){e._vnode=null,e._staticTrees=null;var n=e.$options,r=e.$vnode=n._parentVnode,o=r&&r.context;e.$slots=xe(n._renderChildren,o),e.$scopedSlots=r?Se(e.$parent,r.data.scopedSlots,e.$slots):t,e._c=function(t,n,r,o){return ae(e,t,n,r,o,!1)},e.$createElement=function(t,n,r,o){return ae(e,t,n,r,o,!0)};var i=r&&r.data;Et(e,"$attrs",i&&i.attrs||t,null,!0),Et(e,"$listeners",n._parentListeners||t,null,!0)}(n),Ge(n,"beforeCreate",void 0,!1),function(t){var e=ar(t.$options.inject,t);e&&(Ot(!1),Object.keys(e).forEach((function(n){Et(t,n,e[n])})),Ot(!0))}(n),tr(n),function(t){var e=t.$options.provide;if(e){var n=a(e)?e.call(t):e;if(!s(n))return;for(var r=gn(t),o=ct?Reflect.ownKeys(n):Object.keys(n),i=0;i<o.length;i++){var c=o[i];Object.defineProperty(r,c,Object.getOwnPropertyDescriptor(n,c))}}}(n),Ge(n,"created"),n.$options.el&&n.$mount(n.$options.el)}}(Er),function(t){var e={get:function(){return this._data}},n={get:function(){return this._props}};Object.defineProperty(t.prototype,"$data",e),Object.defineProperty(t.prototype,"$props",n),t.prototype.$set=Nt,t.prototype.$delete=Pt,t.prototype.$watch=function(t,e,n){var r=this;if(u(e))return ir(r,t,e,n);(n=n||{}).user=!0;var o=new Xn(r,t,e,n);if(n.immediate){var i='callback for immediate watcher "'.concat(o.expression,'"');bt(),_n(e,r,[o.value],r,i),$t()}return function(){o.teardown()}}}(Er),function(t){var n=/^hook:/;t.prototype.$on=function(t,r){var o=this;if(e(t))for(var i=0,a=t.length;i<a;i++)o.$on(t[i],r);else(o._events[t]||(o._events[t]=[])).push(r),n.test(t)&&(o._hasHookEvent=!0);return o},t.prototype.$once=function(t,e){var n=this;function r(){n.$off(t,r),e.apply(n,arguments)}return r.fn=e,n.$on(t,r),n},t.prototype.$off=function(t,n){var r=this;if(!arguments.length)return r._events=Object.create(null),r;if(e(t)){for(var o=0,i=t.length;o<i;o++)r.$off(t[o],n);return r}var a,s=r._events[t];if(!s)return r;if(!n)return r._events[t]=null,r;for(var c=s.length;c--;)if((a=s[c])===n||a.fn===n){s.splice(c,1);break}return r},t.prototype.$emit=function(t){var e=this,n=e._events[t];if(n){n=n.length>1?T(n):n;for(var r=T(arguments,1),o='event handler for "'.concat(t,'"'),i=0,a=n.length;i<a;i++)_n(n[i],e,r,e,o)}return e}}(Er),function(t){t.prototype._update=function(t,e){var n=this,r=n.$el,o=n._vnode,i=Je(n);n._vnode=t,n.$el=o?n.__patch__(o,t):n.__patch__(n.$el,t,e,!1),i(),r&&(r.__vue__=null),n.$el&&(n.$el.__vue__=n);for(var a=n;a&&a.$vnode&&a.$parent&&a.$vnode===a.$parent._vnode;)a.$parent.$el=a.$el,a=a.$parent},t.prototype.$forceUpdate=function(){this._watcher&&this._watcher.update()},t.prototype.$destroy=function(){var t=this;if(!t._isBeingDestroyed){Ge(t,"beforeDestroy"),t._isBeingDestroyed=!0;var e=t.$parent;!e||e._isBeingDestroyed||t.$options.abstract||y(e.$children,t),t._scope.stop(),t._data.__ob__&&t._data.__ob__.vmCount--,t._isDestroyed=!0,t.__patch__(t._vnode,null),Ge(t,"destroyed"),t.$off(),t.$el&&(t.$el.__vue__=null),t.$vnode&&(t.$vnode.parent=null)}}}(Er),function(t){we(t.prototype),t.prototype.$nextTick=function(t){return En(t,this)},t.prototype._render=function(){var t=this,n=t.$options,r=n.render,o=n._parentVnode;o&&t._isMounted&&(t.$scopedSlots=Se(t.$parent,o.data.scopedSlots,t.$slots,t.$scopedSlots),t._slotsProxy&&Ne(t._slotsProxy,t.$scopedSlots)),t.$vnode=o;var i,a=ut,s=Ie;try{lt(t),Ie=t,i=r.call(t._renderProxy,t.$createElement)}catch(e){yn(e,t,"render"),i=t._vnode}finally{Ie=s,lt(a)}return e(i)&&1===i.length&&(i=i[0]),i instanceof ft||(i=dt()),i.parent=o,i}}(Er);var Lr=[String,RegExp,Array],Rr={name:"keep-alive",abstract:!0,props:{include:Lr,exclude:Lr,max:[String,Number]},methods:{cacheVNode:function(){var t=this,e=t.cache,n=t.keys,r=t.vnodeToCache,o=t.keyToCache;if(r){var i=r.tag,a=r.componentInstance,s=r.componentOptions;e[o]={name:Pr(s),tag:i,componentInstance:a},n.push(o),this.max&&n.length>parseInt(this.max)&&Ir(e,n[0],n,this._vnode),this.vnodeToCache=null}}},created:function(){this.cache=Object.create(null),this.keys=[]},destroyed:function(){for(var t in this.cache)Ir(this.cache,t,this.keys)},mounted:function(){var t=this;this.cacheVNode(),this.$watch("include",(function(e){Mr(t,(function(t){return Dr(e,t)}))})),this.$watch("exclude",(function(e){Mr(t,(function(t){return!Dr(e,t)}))}))},updated:function(){this.cacheVNode()},render:function(){var t=this.$slots.default,e=Re(t),n=e&&e.componentOptions;if(n){var r=Pr(n),o=this.include,i=this.exclude;if(o&&(!r||!Dr(o,r))||i&&r&&Dr(i,r))return e;var a=this.cache,s=this.keys,c=null==e.key?n.Ctor.cid+(n.tag?"::".concat(n.tag):""):e.key;a[c]?(e.componentInstance=a[c].componentInstance,y(s,c),s.push(c)):(this.vnodeToCache=e,this.keyToCache=c),e.data.keepAlive=!0}return e||t&&t[0]}},Fr={KeepAlive:Rr};!function(t){var e={get:function(){return B}};Object.defineProperty(t,"config",e),t.util={warn:gr,extend:A,mergeOptions:Cr,defineReactive:Et},t.set=Nt,t.delete=Pt,t.nextTick=En,t.observable=function(t){return jt(t),t},t.options=Object.create(null),F.forEach((function(e){t.options[e+"s"]=Object.create(null)})),t.options._base=t,A(t.options.components,Fr),function(t){t.use=function(t){var e=this._installedPlugins||(this._installedPlugins=[]);if(e.indexOf(t)>-1)return this;var n=T(arguments,1);return n.unshift(this),a(t.install)?t.install.apply(t,n):a(t)&&t.apply(null,n),e.push(t),this}}(t),function(t){t.mixin=function(t){return this.options=Cr(this.options,t),this}}(t),Nr(t),function(t){F.forEach((function(e){t[e]=function(t,n){return n?("component"===e&&u(n)&&(n.name=n.name||t,n=this.options._base.extend(n)),"directive"===e&&a(n)&&(n={bind:n,update:n}),this.options[e+"s"][t]=n,n):this.options[e+"s"][t]}}))}(t)}(Er),Object.defineProperty(Er.prototype,"$isServer",{get:ot}),Object.defineProperty(Er.prototype,"$ssrContext",{get:function(){return this.$vnode&&this.$vnode.ssrContext}}),Object.defineProperty(Er,"FunctionalRenderContext",{value:ur}),Er.version=Kn;var Hr=h("style,class"),Br=h("input,textarea,option,select,progress"),Ur=function(t,e,n){return"value"===n&&Br(t)&&"button"!==e||"selected"===n&&"option"===t||"checked"===n&&"input"===t||"muted"===n&&"video"===t},zr=h("contenteditable,draggable,spellcheck"),Vr=h("events,caret,typing,plaintext-only"),Kr=function(t,e){return Gr(e)||"false"===e?"false":"contenteditable"===t&&Vr(e)?e:"true"},Jr=h("allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,default,defaultchecked,defaultmuted,defaultselected,defer,disabled,enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,required,reversed,scoped,seamless,selected,sortable,truespeed,typemustmatch,visible"),qr="http://www.w3.org/1999/xlink",Wr=function(t){return":"===t.charAt(5)&&"xlink"===t.slice(0,5)},Zr=function(t){return Wr(t)?t.slice(6,t.length):""},Gr=function(t){return null==t||!1===t};function Xr(t){for(var e=t.data,n=t,o=t;r(o.componentInstance);)(o=o.componentInstance._vnode)&&o.data&&(e=Yr(o.data,e));for(;r(n=n.parent);)n&&n.data&&(e=Yr(e,n.data));return function(t,e){if(r(t)||r(e))return Qr(t,to(e));return""}(e.staticClass,e.class)}function Yr(t,e){return{staticClass:Qr(t.staticClass,e.staticClass),class:r(t.class)?[t.class,e.class]:e.class}}function Qr(t,e){return t?e?t+" "+e:t:e||""}function to(t){return Array.isArray(t)?function(t){for(var e,n="",o=0,i=t.length;o<i;o++)r(e=to(t[o]))&&""!==e&&(n&&(n+=" "),n+=e);return n}(t):s(t)?function(t){var e="";for(var n in t)t[n]&&(e&&(e+=" "),e+=n);return e}(t):"string"==typeof t?t:""}var eo={svg:"http://www.w3.org/2000/svg",math:"http://www.w3.org/1998/Math/MathML"},no=h("html,body,base,head,link,meta,style,title,address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,menuitem,summary,content,element,shadow,template,blockquote,iframe,tfoot"),ro=h("svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,foreignobject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view",!0),oo=function(t){return no(t)||ro(t)};function io(t){return ro(t)?"svg":"math"===t?"math":void 0}var ao=Object.create(null);var so=h("text,number,password,search,email,tel,url");function co(t){if("string"==typeof t){var e=document.querySelector(t);return e||document.createElement("div")}return t}var uo=Object.freeze({__proto__:null,createElement:function(t,e){var n=document.createElement(t);return"select"!==t||e.data&&e.data.attrs&&void 0!==e.data.attrs.multiple&&n.setAttribute("multiple","multiple"),n},createElementNS:function(t,e){return document.createElementNS(eo[t],e)},createTextNode:function(t){return document.createTextNode(t)},createComment:function(t){return document.createComment(t)},insertBefore:function(t,e,n){t.insertBefore(e,n)},removeChild:function(t,e){t.removeChild(e)},appendChild:function(t,e){t.appendChild(e)},parentNode:function(t){return t.parentNode},nextSibling:function(t){return t.nextSibling},tagName:function(t){return t.tagName},setTextContent:function(t,e){t.textContent=e},setStyleScope:function(t,e){t.setAttribute(e,"")}}),lo={create:function(t,e){fo(e)},update:function(t,e){t.data.ref!==e.data.ref&&(fo(t,!0),fo(e))},destroy:function(t){fo(t,!0)}};function fo(t,n){var o=t.data.ref;if(r(o)){var i=t.context,s=t.componentInstance||t.elm,c=n?null:s,u=n?void 0:s;if(a(o))_n(o,i,[c],i,"template ref function");else{var l=t.data.refInFor,f="string"==typeof o||"number"==typeof o,d=Bt(o),p=i.$refs;if(f||d)if(l){var v=f?p[o]:o.value;n?e(v)&&y(v,s):e(v)?v.includes(s)||v.push(s):f?(p[o]=[s],po(i,o,p[o])):o.value=[s]}else if(f){if(n&&p[o]!==s)return;p[o]=u,po(i,o,c)}else if(d){if(n&&o.value!==s)return;o.value=c}}}}function po(t,e,n){var r=t._setupState;r&&b(r,e)&&(Bt(r[e])?r[e].value=n:r[e]=n)}var vo=new ft("",{},[]),ho=["create","activate","update","remove","destroy"];function mo(t,e){return t.key===e.key&&t.asyncFactory===e.asyncFactory&&(t.tag===e.tag&&t.isComment===e.isComment&&r(t.data)===r(e.data)&&function(t,e){if("input"!==t.tag)return!0;var n,o=r(n=t.data)&&r(n=n.attrs)&&n.type,i=r(n=e.data)&&r(n=n.attrs)&&n.type;return o===i||so(o)&&so(i)}(t,e)||o(t.isAsyncPlaceholder)&&n(e.asyncFactory.error))}function go(t,e,n){var o,i,a={};for(o=e;o<=n;++o)r(i=t[o].key)&&(a[i]=o);return a}var yo={create:_o,update:_o,destroy:function(t){_o(t,vo)}};function _o(t,e){(t.data.directives||e.data.directives)&&function(t,e){var n,r,o,i=t===vo,a=e===vo,s=$o(t.data.directives,t.context),c=$o(e.data.directives,e.context),u=[],l=[];for(n in c)r=s[n],o=c[n],r?(o.oldValue=r.value,o.oldArg=r.arg,xo(o,"update",e,t),o.def&&o.def.componentUpdated&&l.push(o)):(xo(o,"bind",e,t),o.def&&o.def.inserted&&u.push(o));if(u.length){var f=function(){for(var n=0;n<u.length;n++)xo(u[n],"inserted",e,t)};i?Qt(e,"insert",f):f()}l.length&&Qt(e,"postpatch",(function(){for(var n=0;n<l.length;n++)xo(l[n],"componentUpdated",e,t)}));if(!i)for(n in s)c[n]||xo(s[n],"unbind",t,t,a)}(t,e)}var bo=Object.create(null);function $o(t,e){var n,r,o=Object.create(null);if(!t)return o;for(n=0;n<t.length;n++){if((r=t[n]).modifiers||(r.modifiers=bo),o[wo(r)]=r,e._setupState&&e._setupState.__sfc){var i=r.def||kr(e,"_setupState","v-"+r.name);r.def="function"==typeof i?{bind:i,update:i}:i}r.def=r.def||kr(e.$options,"directives",r.name)}return o}function wo(t){return t.rawName||"".concat(t.name,".").concat(Object.keys(t.modifiers||{}).join("."))}function xo(t,e,n,r,o){var i=t.def&&t.def[e];if(i)try{i(n.elm,t,n,r,o)}catch(r){yn(r,n.context,"directive ".concat(t.name," ").concat(e," hook"))}}var Co=[lo,yo];function ko(t,e){var i=e.componentOptions;if(!(r(i)&&!1===i.Ctor.options.inheritAttrs||n(t.data.attrs)&&n(e.data.attrs))){var a,s,c=e.elm,u=t.data.attrs||{},l=e.data.attrs||{};for(a in(r(l.__ob__)||o(l._v_attr_proxy))&&(l=e.data.attrs=A({},l)),l)s=l[a],u[a]!==s&&So(c,a,s,e.data.pre);for(a in(Z||X)&&l.value!==u.value&&So(c,"value",l.value),u)n(l[a])&&(Wr(a)?c.removeAttributeNS(qr,Zr(a)):zr(a)||c.removeAttribute(a))}}function So(t,e,n,r){r||t.tagName.indexOf("-")>-1?Oo(t,e,n):Jr(e)?Gr(n)?t.removeAttribute(e):(n="allowfullscreen"===e&&"EMBED"===t.tagName?"true":e,t.setAttribute(e,n)):zr(e)?t.setAttribute(e,Kr(e,n)):Wr(e)?Gr(n)?t.removeAttributeNS(qr,Zr(e)):t.setAttributeNS(qr,e,n):Oo(t,e,n)}function Oo(t,e,n){if(Gr(n))t.removeAttribute(e);else{if(Z&&!G&&"TEXTAREA"===t.tagName&&"placeholder"===e&&""!==n&&!t.__ieph){var r=function(e){e.stopImmediatePropagation(),t.removeEventListener("input",r)};t.addEventListener("input",r),t.__ieph=!0}t.setAttribute(e,n)}}var To={create:ko,update:ko};function Ao(t,e){var o=e.elm,i=e.data,a=t.data;if(!(n(i.staticClass)&&n(i.class)&&(n(a)||n(a.staticClass)&&n(a.class)))){var s=Xr(e),c=o._transitionClasses;r(c)&&(s=Qr(s,to(c))),s!==o._prevClass&&(o.setAttribute("class",s),o._prevClass=s)}}var jo,Eo,No,Po,Do,Mo,Io={create:Ao,update:Ao},Lo=/[\w).+\-_$\]]/;function Ro(t){var e,n,r,o,i,a=!1,s=!1,c=!1,u=!1,l=0,f=0,d=0,p=0;for(r=0;r<t.length;r++)if(n=e,e=t.charCodeAt(r),a)39===e&&92!==n&&(a=!1);else if(s)34===e&&92!==n&&(s=!1);else if(c)96===e&&92!==n&&(c=!1);else if(u)47===e&&92!==n&&(u=!1);else if(124!==e||124===t.charCodeAt(r+1)||124===t.charCodeAt(r-1)||l||f||d){switch(e){case 34:s=!0;break;case 39:a=!0;break;case 96:c=!0;break;case 40:d++;break;case 41:d--;break;case 91:f++;break;case 93:f--;break;case 123:l++;break;case 125:l--}if(47===e){for(var v=r-1,h=void 0;v>=0&&" "===(h=t.charAt(v));v--);h&&Lo.test(h)||(u=!0)}}else void 0===o?(p=r+1,o=t.slice(0,r).trim()):m();function m(){(i||(i=[])).push(t.slice(p,r).trim()),p=r+1}if(void 0===o?o=t.slice(0,r).trim():0!==p&&m(),i)for(r=0;r<i.length;r++)o=Fo(o,i[r]);return o}function Fo(t,e){var n=e.indexOf("(");if(n<0)return'_f("'.concat(e,'")(').concat(t,")");var r=e.slice(0,n),o=e.slice(n+1);return'_f("'.concat(r,'")(').concat(t).concat(")"!==o?","+o:o)}function Ho(t,e){console.error("[Vue compiler]: ".concat(t))}function Bo(t,e){return t?t.map((function(t){return t[e]})).filter((function(t){return t})):[]}function Uo(t,e,n,r,o){(t.props||(t.props=[])).push(Xo({name:e,value:n,dynamic:o},r)),t.plain=!1}function zo(t,e,n,r,o){(o?t.dynamicAttrs||(t.dynamicAttrs=[]):t.attrs||(t.attrs=[])).push(Xo({name:e,value:n,dynamic:o},r)),t.plain=!1}function Vo(t,e,n,r){t.attrsMap[e]=n,t.attrsList.push(Xo({name:e,value:n},r))}function Ko(t,e,n,r,o,i,a,s){(t.directives||(t.directives=[])).push(Xo({name:e,rawName:n,value:r,arg:o,isDynamicArg:i,modifiers:a},s)),t.plain=!1}function Jo(t,e,n){return n?"_p(".concat(e,',"').concat(t,'")'):t+e}function qo(e,n,r,o,i,a,s,c){var u;(o=o||t).right?c?n="(".concat(n,")==='click'?'contextmenu':(").concat(n,")"):"click"===n&&(n="contextmenu",delete o.right):o.middle&&(c?n="(".concat(n,")==='click'?'mouseup':(").concat(n,")"):"click"===n&&(n="mouseup")),o.capture&&(delete o.capture,n=Jo("!",n,c)),o.once&&(delete o.once,n=Jo("~",n,c)),o.passive&&(delete o.passive,n=Jo("&",n,c)),o.native?(delete o.native,u=e.nativeEvents||(e.nativeEvents={})):u=e.events||(e.events={});var l=Xo({value:r.trim(),dynamic:c},s);o!==t&&(l.modifiers=o);var f=u[n];Array.isArray(f)?i?f.unshift(l):f.push(l):u[n]=f?i?[l,f]:[f,l]:l,e.plain=!1}function Wo(t,e,n){var r=Zo(t,":"+e)||Zo(t,"v-bind:"+e);if(null!=r)return Ro(r);if(!1!==n){var o=Zo(t,e);if(null!=o)return JSON.stringify(o)}}function Zo(t,e,n){var r;if(null!=(r=t.attrsMap[e]))for(var o=t.attrsList,i=0,a=o.length;i<a;i++)if(o[i].name===e){o.splice(i,1);break}return n&&delete t.attrsMap[e],r}function Go(t,e){for(var n=t.attrsList,r=0,o=n.length;r<o;r++){var i=n[r];if(e.test(i.name))return n.splice(r,1),i}}function Xo(t,e){return e&&(null!=e.start&&(t.start=e.start),null!=e.end&&(t.end=e.end)),t}function Yo(t,e,n){var r=n||{},o=r.number,i="$$v",a=i;r.trim&&(a="(typeof ".concat(i," === 'string'")+"? ".concat(i,".trim()")+": ".concat(i,")")),o&&(a="_n(".concat(a,")"));var s=Qo(e,a);t.model={value:"(".concat(e,")"),expression:JSON.stringify(e),callback:"function (".concat(i,") {").concat(s,"}")}}function Qo(t,e){var n=function(t){if(t=t.trim(),jo=t.length,t.indexOf("[")<0||t.lastIndexOf("]")<jo-1)return(Po=t.lastIndexOf("."))>-1?{exp:t.slice(0,Po),key:'"'+t.slice(Po+1)+'"'}:{exp:t,key:null};Eo=t,Po=Do=Mo=0;for(;!ei();)ni(No=ti())?oi(No):91===No&&ri(No);return{exp:t.slice(0,Do),key:t.slice(Do+1,Mo)}}(t);return null===n.key?"".concat(t,"=").concat(e):"$set(".concat(n.exp,", ").concat(n.key,", ").concat(e,")")}function ti(){return Eo.charCodeAt(++Po)}function ei(){return Po>=jo}function ni(t){return 34===t||39===t}function ri(t){var e=1;for(Do=Po;!ei();)if(ni(t=ti()))oi(t);else if(91===t&&e++,93===t&&e--,0===e){Mo=Po;break}}function oi(t){for(var e=t;!ei()&&(t=ti())!==e;);}var ii,ai="__r",si="__c";function ci(t,e,n){var r=ii;return function o(){null!==e.apply(null,arguments)&&fi(t,o,n,r)}}var ui=xn&&!(tt&&Number(tt[1])<=53);function li(t,e,n,r){if(ui){var o=rn,i=e;e=i._wrapper=function(t){if(t.target===t.currentTarget||t.timeStamp>=o||t.timeStamp<=0||t.target.ownerDocument!==document)return i.apply(this,arguments)}}ii.addEventListener(t,e,nt?{capture:n,passive:r}:n)}function fi(t,e,n,r){(r||ii).removeEventListener(t,e._wrapper||e,n)}function di(t,e){if(!n(t.data.on)||!n(e.data.on)){var o=e.data.on||{},i=t.data.on||{};ii=e.elm||t.elm,function(t){if(r(t[ai])){var e=Z?"change":"input";t[e]=[].concat(t[ai],t[e]||[]),delete t[ai]}r(t[si])&&(t.change=[].concat(t[si],t.change||[]),delete t[si])}(o),Yt(o,i,li,fi,ci,e.context),ii=void 0}}var pi,vi={create:di,update:di,destroy:function(t){return di(t,vo)}};function hi(t,e){if(!n(t.data.domProps)||!n(e.data.domProps)){var i,a,s=e.elm,c=t.data.domProps||{},u=e.data.domProps||{};for(i in(r(u.__ob__)||o(u._v_attr_proxy))&&(u=e.data.domProps=A({},u)),c)i in u||(s[i]="");for(i in u){if(a=u[i],"textContent"===i||"innerHTML"===i){if(e.children&&(e.children.length=0),a===c[i])continue;1===s.childNodes.length&&s.removeChild(s.childNodes[0])}if("value"===i&&"PROGRESS"!==s.tagName){s._value=a;var l=n(a)?"":String(a);mi(s,l)&&(s.value=l)}else if("innerHTML"===i&&ro(s.tagName)&&n(s.innerHTML)){(pi=pi||document.createElement("div")).innerHTML="<svg>".concat(a,"</svg>");for(var f=pi.firstChild;s.firstChild;)s.removeChild(s.firstChild);for(;f.firstChild;)s.appendChild(f.firstChild)}else if(a!==c[i])try{s[i]=a}catch(t){}}}}function mi(t,e){return!t.composing&&("OPTION"===t.tagName||function(t,e){var n=!0;try{n=document.activeElement!==t}catch(t){}return n&&t.value!==e}(t,e)||function(t,e){var n=t.value,o=t._vModifiers;if(r(o)){if(o.number)return v(n)!==v(e);if(o.trim)return n.trim()!==e.trim()}return n!==e}(t,e))}var gi={create:hi,update:hi},yi=$((function(t){var e={},n=/:(.+)/;return t.split(/;(?![^(]*\))/g).forEach((function(t){if(t){var r=t.split(n);r.length>1&&(e[r[0].trim()]=r[1].trim())}})),e}));function _i(t){var e=bi(t.style);return t.staticStyle?A(t.staticStyle,e):e}function bi(t){return Array.isArray(t)?j(t):"string"==typeof t?yi(t):t}var $i,wi=/^--/,xi=/\s*!important$/,Ci=function(t,e,n){if(wi.test(e))t.style.setProperty(e,n);else if(xi.test(n))t.style.setProperty(S(e),n.replace(xi,""),"important");else{var r=Si(e);if(Array.isArray(n))for(var o=0,i=n.length;o<i;o++)t.style[r]=n[o];else t.style[r]=n}},ki=["Webkit","Moz","ms"],Si=$((function(t){if($i=$i||document.createElement("div").style,"filter"!==(t=x(t))&&t in $i)return t;for(var e=t.charAt(0).toUpperCase()+t.slice(1),n=0;n<ki.length;n++){var r=ki[n]+e;if(r in $i)return r}}));function Oi(t,e){var o=e.data,i=t.data;if(!(n(o.staticStyle)&&n(o.style)&&n(i.staticStyle)&&n(i.style))){var a,s,c=e.elm,u=i.staticStyle,l=i.normalizedStyle||i.style||{},f=u||l,d=bi(e.data.style)||{};e.data.normalizedStyle=r(d.__ob__)?A({},d):d;var p=function(t,e){var n,r={};if(e)for(var o=t;o.componentInstance;)(o=o.componentInstance._vnode)&&o.data&&(n=_i(o.data))&&A(r,n);(n=_i(t.data))&&A(r,n);for(var i=t;i=i.parent;)i.data&&(n=_i(i.data))&&A(r,n);return r}(e,!0);for(s in f)n(p[s])&&Ci(c,s,"");for(s in p)a=p[s],Ci(c,s,null==a?"":a)}}var Ti={create:Oi,update:Oi},Ai=/\s+/;function ji(t,e){if(e&&(e=e.trim()))if(t.classList)e.indexOf(" ")>-1?e.split(Ai).forEach((function(e){return t.classList.add(e)})):t.classList.add(e);else{var n=" ".concat(t.getAttribute("class")||""," ");n.indexOf(" "+e+" ")<0&&t.setAttribute("class",(n+e).trim())}}function Ei(t,e){if(e&&(e=e.trim()))if(t.classList)e.indexOf(" ")>-1?e.split(Ai).forEach((function(e){return t.classList.remove(e)})):t.classList.remove(e),t.classList.length||t.removeAttribute("class");else{for(var n=" ".concat(t.getAttribute("class")||""," "),r=" "+e+" ";n.indexOf(r)>=0;)n=n.replace(r," ");(n=n.trim())?t.setAttribute("class",n):t.removeAttribute("class")}}function Ni(t){if(t){if("object"==typeof t){var e={};return!1!==t.css&&A(e,Pi(t.name||"v")),A(e,t),e}return"string"==typeof t?Pi(t):void 0}}var Pi=$((function(t){return{enterClass:"".concat(t,"-enter"),enterToClass:"".concat(t,"-enter-to"),enterActiveClass:"".concat(t,"-enter-active"),leaveClass:"".concat(t,"-leave"),leaveToClass:"".concat(t,"-leave-to"),leaveActiveClass:"".concat(t,"-leave-active")}})),Di=q&&!G,Mi="transition",Ii="animation",Li="transition",Ri="transitionend",Fi="animation",Hi="animationend";Di&&(void 0===window.ontransitionend&&void 0!==window.onwebkittransitionend&&(Li="WebkitTransition",Ri="webkitTransitionEnd"),void 0===window.onanimationend&&void 0!==window.onwebkitanimationend&&(Fi="WebkitAnimation",Hi="webkitAnimationEnd"));var Bi=q?window.requestAnimationFrame?window.requestAnimationFrame.bind(window):setTimeout:function(t){return t()};function Ui(t){Bi((function(){Bi(t)}))}function zi(t,e){var n=t._transitionClasses||(t._transitionClasses=[]);n.indexOf(e)<0&&(n.push(e),ji(t,e))}function Vi(t,e){t._transitionClasses&&y(t._transitionClasses,e),Ei(t,e)}function Ki(t,e,n){var r=qi(t,e),o=r.type,i=r.timeout,a=r.propCount;if(!o)return n();var s=o===Mi?Ri:Hi,c=0,u=function(){t.removeEventListener(s,l),n()},l=function(e){e.target===t&&++c>=a&&u()};setTimeout((function(){c<a&&u()}),i+1),t.addEventListener(s,l)}var Ji=/\b(transform|all)(,|$)/;function qi(t,e){var n,r=window.getComputedStyle(t),o=(r[Li+"Delay"]||"").split(", "),i=(r[Li+"Duration"]||"").split(", "),a=Wi(o,i),s=(r[Fi+"Delay"]||"").split(", "),c=(r[Fi+"Duration"]||"").split(", "),u=Wi(s,c),l=0,f=0;return e===Mi?a>0&&(n=Mi,l=a,f=i.length):e===Ii?u>0&&(n=Ii,l=u,f=c.length):f=(n=(l=Math.max(a,u))>0?a>u?Mi:Ii:null)?n===Mi?i.length:c.length:0,{type:n,timeout:l,propCount:f,hasTransform:n===Mi&&Ji.test(r[Li+"Property"])}}function Wi(t,e){for(;t.length<e.length;)t=t.concat(t);return Math.max.apply(null,e.map((function(e,n){return Zi(e)+Zi(t[n])})))}function Zi(t){return 1e3*Number(t.slice(0,-1).replace(",","."))}function Gi(t,e){var o=t.elm;r(o._leaveCb)&&(o._leaveCb.cancelled=!0,o._leaveCb());var i=Ni(t.data.transition);if(!n(i)&&!r(o._enterCb)&&1===o.nodeType){for(var c=i.css,u=i.type,l=i.enterClass,f=i.enterToClass,d=i.enterActiveClass,p=i.appearClass,h=i.appearToClass,m=i.appearActiveClass,g=i.beforeEnter,y=i.enter,_=i.afterEnter,b=i.enterCancelled,$=i.beforeAppear,w=i.appear,x=i.afterAppear,C=i.appearCancelled,k=i.duration,S=Ke,O=Ke.$vnode;O&&O.parent;)S=O.context,O=O.parent;var T=!S._isMounted||!t.isRootInsert;if(!T||w||""===w){var A=T&&p?p:l,j=T&&m?m:d,E=T&&h?h:f,N=T&&$||g,P=T&&a(w)?w:y,D=T&&x||_,M=T&&C||b,L=v(s(k)?k.enter:k),R=!1!==c&&!G,F=Qi(P),H=o._enterCb=I((function(){R&&(Vi(o,E),Vi(o,j)),H.cancelled?(R&&Vi(o,A),M&&M(o)):D&&D(o),o._enterCb=null}));t.data.show||Qt(t,"insert",(function(){var e=o.parentNode,n=e&&e._pending&&e._pending[t.key];n&&n.tag===t.tag&&n.elm._leaveCb&&n.elm._leaveCb(),P&&P(o,H)})),N&&N(o),R&&(zi(o,A),zi(o,j),Ui((function(){Vi(o,A),H.cancelled||(zi(o,E),F||(Yi(L)?setTimeout(H,L):Ki(o,u,H)))}))),t.data.show&&(e&&e(),P&&P(o,H)),R||F||H()}}}function Xi(t,e){var o=t.elm;r(o._enterCb)&&(o._enterCb.cancelled=!0,o._enterCb());var i=Ni(t.data.transition);if(n(i)||1!==o.nodeType)return e();if(!r(o._leaveCb)){var a=i.css,c=i.type,u=i.leaveClass,l=i.leaveToClass,f=i.leaveActiveClass,d=i.beforeLeave,p=i.leave,h=i.afterLeave,m=i.leaveCancelled,g=i.delayLeave,y=i.duration,_=!1!==a&&!G,b=Qi(p),$=v(s(y)?y.leave:y),w=o._leaveCb=I((function(){o.parentNode&&o.parentNode._pending&&(o.parentNode._pending[t.key]=null),_&&(Vi(o,l),Vi(o,f)),w.cancelled?(_&&Vi(o,u),m&&m(o)):(e(),h&&h(o)),o._leaveCb=null}));g?g(x):x()}function x(){w.cancelled||(!t.data.show&&o.parentNode&&((o.parentNode._pending||(o.parentNode._pending={}))[t.key]=t),d&&d(o),_&&(zi(o,u),zi(o,f),Ui((function(){Vi(o,u),w.cancelled||(zi(o,l),b||(Yi($)?setTimeout(w,$):Ki(o,c,w)))}))),p&&p(o,w),_||b||w())}}function Yi(t){return"number"==typeof t&&!isNaN(t)}function Qi(t){if(n(t))return!1;var e=t.fns;return r(e)?Qi(Array.isArray(e)?e[0]:e):(t._length||t.length)>1}function ta(t,e){!0!==e.data.show&&Gi(e)}var ea=function(t){var a,s,c={},u=t.modules,l=t.nodeOps;for(a=0;a<ho.length;++a)for(c[ho[a]]=[],s=0;s<u.length;++s)r(u[s][ho[a]])&&c[ho[a]].push(u[s][ho[a]]);function f(t){var e=l.parentNode(t);r(e)&&l.removeChild(e,t)}function d(t,e,n,i,a,s,u){if(r(t.elm)&&r(s)&&(t=s[u]=vt(t)),t.isRootInsert=!a,!function(t,e,n,i){var a=t.data;if(r(a)){var s=r(t.componentInstance)&&a.keepAlive;if(r(a=a.hook)&&r(a=a.init)&&a(t,!1),r(t.componentInstance))return p(t,e),v(n,t.elm,i),o(s)&&function(t,e,n,o){var i,a=t;for(;a.componentInstance;)if(r(i=(a=a.componentInstance._vnode).data)&&r(i=i.transition)){for(i=0;i<c.activate.length;++i)c.activate[i](vo,a);e.push(a);break}v(n,t.elm,o)}(t,e,n,i),!0}}(t,e,n,i)){var f=t.data,d=t.children,h=t.tag;r(h)?(t.elm=t.ns?l.createElementNS(t.ns,h):l.createElement(h,t),_(t),m(t,d,e),r(f)&&y(t,e),v(n,t.elm,i)):o(t.isComment)?(t.elm=l.createComment(t.text),v(n,t.elm,i)):(t.elm=l.createTextNode(t.text),v(n,t.elm,i))}}function p(t,e){r(t.data.pendingInsert)&&(e.push.apply(e,t.data.pendingInsert),t.data.pendingInsert=null),t.elm=t.componentInstance.$el,g(t)?(y(t,e),_(t)):(fo(t),e.push(t))}function v(t,e,n){r(t)&&(r(n)?l.parentNode(n)===t&&l.insertBefore(t,e,n):l.appendChild(t,e))}function m(t,n,r){if(e(n))for(var o=0;o<n.length;++o)d(n[o],r,t.elm,null,!0,n,o);else i(t.text)&&l.appendChild(t.elm,l.createTextNode(String(t.text)))}function g(t){for(;t.componentInstance;)t=t.componentInstance._vnode;return r(t.tag)}function y(t,e){for(var n=0;n<c.create.length;++n)c.create[n](vo,t);r(a=t.data.hook)&&(r(a.create)&&a.create(vo,t),r(a.insert)&&e.push(t))}function _(t){var e;if(r(e=t.fnScopeId))l.setStyleScope(t.elm,e);else for(var n=t;n;)r(e=n.context)&&r(e=e.$options._scopeId)&&l.setStyleScope(t.elm,e),n=n.parent;r(e=Ke)&&e!==t.context&&e!==t.fnContext&&r(e=e.$options._scopeId)&&l.setStyleScope(t.elm,e)}function b(t,e,n,r,o,i){for(;r<=o;++r)d(n[r],i,t,e,!1,n,r)}function $(t){var e,n,o=t.data;if(r(o))for(r(e=o.hook)&&r(e=e.destroy)&&e(t),e=0;e<c.destroy.length;++e)c.destroy[e](t);if(r(e=t.children))for(n=0;n<t.children.length;++n)$(t.children[n])}function w(t,e,n){for(;e<=n;++e){var o=t[e];r(o)&&(r(o.tag)?(x(o),$(o)):f(o.elm))}}function x(t,e){if(r(e)||r(t.data)){var n,o=c.remove.length+1;for(r(e)?e.listeners+=o:e=function(t,e){function n(){0==--n.listeners&&f(t)}return n.listeners=e,n}(t.elm,o),r(n=t.componentInstance)&&r(n=n._vnode)&&r(n.data)&&x(n,e),n=0;n<c.remove.length;++n)c.remove[n](t,e);r(n=t.data.hook)&&r(n=n.remove)?n(t,e):e()}else f(t.elm)}function C(t,e,n,o){for(var i=n;i<o;i++){var a=e[i];if(r(a)&&mo(t,a))return i}}function k(t,e,i,a,s,u){if(t!==e){r(e.elm)&&r(a)&&(e=a[s]=vt(e));var f=e.elm=t.elm;if(o(t.isAsyncPlaceholder))r(e.asyncFactory.resolved)?T(t.elm,e,i):e.isAsyncPlaceholder=!0;else if(o(e.isStatic)&&o(t.isStatic)&&e.key===t.key&&(o(e.isCloned)||o(e.isOnce)))e.componentInstance=t.componentInstance;else{var p,v=e.data;r(v)&&r(p=v.hook)&&r(p=p.prepatch)&&p(t,e);var h=t.children,m=e.children;if(r(v)&&g(e)){for(p=0;p<c.update.length;++p)c.update[p](t,e);r(p=v.hook)&&r(p=p.update)&&p(t,e)}n(e.text)?r(h)&&r(m)?h!==m&&function(t,e,o,i,a){for(var s,c,u,f=0,p=0,v=e.length-1,h=e[0],m=e[v],g=o.length-1,y=o[0],_=o[g],$=!a;f<=v&&p<=g;)n(h)?h=e[++f]:n(m)?m=e[--v]:mo(h,y)?(k(h,y,i,o,p),h=e[++f],y=o[++p]):mo(m,_)?(k(m,_,i,o,g),m=e[--v],_=o[--g]):mo(h,_)?(k(h,_,i,o,g),$&&l.insertBefore(t,h.elm,l.nextSibling(m.elm)),h=e[++f],_=o[--g]):mo(m,y)?(k(m,y,i,o,p),$&&l.insertBefore(t,m.elm,h.elm),m=e[--v],y=o[++p]):(n(s)&&(s=go(e,f,v)),n(c=r(y.key)?s[y.key]:C(y,e,f,v))?d(y,i,t,h.elm,!1,o,p):mo(u=e[c],y)?(k(u,y,i,o,p),e[c]=void 0,$&&l.insertBefore(t,u.elm,h.elm)):d(y,i,t,h.elm,!1,o,p),y=o[++p]);f>v?b(t,n(o[g+1])?null:o[g+1].elm,o,p,g,i):p>g&&w(e,f,v)}(f,h,m,i,u):r(m)?(r(t.text)&&l.setTextContent(f,""),b(f,null,m,0,m.length-1,i)):r(h)?w(h,0,h.length-1):r(t.text)&&l.setTextContent(f,""):t.text!==e.text&&l.setTextContent(f,e.text),r(v)&&r(p=v.hook)&&r(p=p.postpatch)&&p(t,e)}}}function S(t,e,n){if(o(n)&&r(t.parent))t.parent.data.pendingInsert=e;else for(var i=0;i<e.length;++i)e[i].data.hook.insert(e[i])}var O=h("attrs,class,staticClass,staticStyle,key");function T(t,e,n,i){var a,s=e.tag,c=e.data,u=e.children;if(i=i||c&&c.pre,e.elm=t,o(e.isComment)&&r(e.asyncFactory))return e.isAsyncPlaceholder=!0,!0;if(r(c)&&(r(a=c.hook)&&r(a=a.init)&&a(e,!0),r(a=e.componentInstance)))return p(e,n),!0;if(r(s)){if(r(u))if(t.hasChildNodes())if(r(a=c)&&r(a=a.domProps)&&r(a=a.innerHTML)){if(a!==t.innerHTML)return!1}else{for(var l=!0,f=t.firstChild,d=0;d<u.length;d++){if(!f||!T(f,u[d],n,i)){l=!1;break}f=f.nextSibling}if(!l||f)return!1}else m(e,u,n);if(r(c)){var v=!1;for(var h in c)if(!O(h)){v=!0,y(e,n);break}!v&&c.class&&Wn(c.class)}}else t.data!==e.text&&(t.data=e.text);return!0}return function(t,e,i,a){if(!n(e)){var s,u=!1,f=[];if(n(t))u=!0,d(e,f);else{var p=r(t.nodeType);if(!p&&mo(t,e))k(t,e,f,null,null,a);else{if(p){if(1===t.nodeType&&t.hasAttribute(R)&&(t.removeAttribute(R),i=!0),o(i)&&T(t,e,f))return S(e,f,!0),t;s=t,t=new ft(l.tagName(s).toLowerCase(),{},[],void 0,s)}var v=t.elm,h=l.parentNode(v);if(d(e,f,v._leaveCb?null:h,l.nextSibling(v)),r(e.parent))for(var m=e.parent,y=g(e);m;){for(var _=0;_<c.destroy.length;++_)c.destroy[_](m);if(m.elm=e.elm,y){for(var b=0;b<c.create.length;++b)c.create[b](vo,m);var x=m.data.hook.insert;if(x.merged)for(var C=x.fns.slice(1),O=0;O<C.length;O++)C[O]()}else fo(m);m=m.parent}r(h)?w([t],0,0):r(t.tag)&&$(t)}}return S(e,f,u),e.elm}r(t)&&$(t)}}({nodeOps:uo,modules:[To,Io,vi,gi,Ti,q?{create:ta,activate:ta,remove:function(t,e){!0!==t.data.show?Xi(t,e):e()}}:{}].concat(Co)});G&&document.addEventListener("selectionchange",(function(){var t=document.activeElement;t&&t.vmodel&&ua(t,"input")}));var na={inserted:function(t,e,n,r){"select"===n.tag?(r.elm&&!r.elm._vOptions?Qt(n,"postpatch",(function(){na.componentUpdated(t,e,n)})):ra(t,e,n.context),t._vOptions=[].map.call(t.options,aa)):("textarea"===n.tag||so(t.type))&&(t._vModifiers=e.modifiers,e.modifiers.lazy||(t.addEventListener("compositionstart",sa),t.addEventListener("compositionend",ca),t.addEventListener("change",ca),G&&(t.vmodel=!0)))},componentUpdated:function(t,e,n){if("select"===n.tag){ra(t,e,n.context);var r=t._vOptions,o=t._vOptions=[].map.call(t.options,aa);if(o.some((function(t,e){return!D(t,r[e])})))(t.multiple?e.value.some((function(t){return ia(t,o)})):e.value!==e.oldValue&&ia(e.value,o))&&ua(t,"change")}}};function ra(t,e,n){oa(t,e),(Z||X)&&setTimeout((function(){oa(t,e)}),0)}function oa(t,e,n){var r=e.value,o=t.multiple;if(!o||Array.isArray(r)){for(var i,a,s=0,c=t.options.length;s<c;s++)if(a=t.options[s],o)i=M(r,aa(a))>-1,a.selected!==i&&(a.selected=i);else if(D(aa(a),r))return void(t.selectedIndex!==s&&(t.selectedIndex=s));o||(t.selectedIndex=-1)}}function ia(t,e){return e.every((function(e){return!D(e,t)}))}function aa(t){return"_value"in t?t._value:t.value}function sa(t){t.target.composing=!0}function ca(t){t.target.composing&&(t.target.composing=!1,ua(t.target,"input"))}function ua(t,e){var n=document.createEvent("HTMLEvents");n.initEvent(e,!0,!0),t.dispatchEvent(n)}function la(t){return!t.componentInstance||t.data&&t.data.transition?t:la(t.componentInstance._vnode)}var fa={bind:function(t,e,n){var r=e.value,o=(n=la(n)).data&&n.data.transition,i=t.__vOriginalDisplay="none"===t.style.display?"":t.style.display;r&&o?(n.data.show=!0,Gi(n,(function(){t.style.display=i}))):t.style.display=r?i:"none"},update:function(t,e,n){var r=e.value;!r!=!e.oldValue&&((n=la(n)).data&&n.data.transition?(n.data.show=!0,r?Gi(n,(function(){t.style.display=t.__vOriginalDisplay})):Xi(n,(function(){t.style.display="none"}))):t.style.display=r?t.__vOriginalDisplay:"none")},unbind:function(t,e,n,r,o){o||(t.style.display=t.__vOriginalDisplay)}},da={model:na,show:fa},pa={name:String,appear:Boolean,css:Boolean,mode:String,type:String,enterClass:String,leaveClass:String,enterToClass:String,leaveToClass:String,enterActiveClass:String,leaveActiveClass:String,appearClass:String,appearActiveClass:String,appearToClass:String,duration:[Number,String,Object]};function va(t){var e=t&&t.componentOptions;return e&&e.Ctor.options.abstract?va(Re(e.children)):t}function ha(t){var e={},n=t.$options;for(var r in n.propsData)e[r]=t[r];var o=n._parentListeners;for(var r in o)e[x(r)]=o[r];return e}function ma(t,e){if(/\d-keep-alive$/.test(e.tag))return t("keep-alive",{props:e.componentOptions.propsData})}var ga=function(t){return t.tag||ke(t)},ya=function(t){return"show"===t.name},_a={name:"transition",props:pa,abstract:!0,render:function(t){var e=this,n=this.$slots.default;if(n&&(n=n.filter(ga)).length){var r=this.mode,o=n[0];if(function(t){for(;t=t.parent;)if(t.data.transition)return!0}(this.$vnode))return o;var a=va(o);if(!a)return o;if(this._leaving)return ma(t,o);var s="__transition-".concat(this._uid,"-");a.key=null==a.key?a.isComment?s+"comment":s+a.tag:i(a.key)?0===String(a.key).indexOf(s)?a.key:s+a.key:a.key;var c=(a.data||(a.data={})).transition=ha(this),u=this._vnode,l=va(u);if(a.data.directives&&a.data.directives.some(ya)&&(a.data.show=!0),l&&l.data&&!function(t,e){return e.key===t.key&&e.tag===t.tag}(a,l)&&!ke(l)&&(!l.componentInstance||!l.componentInstance._vnode.isComment)){var f=l.data.transition=A({},c);if("out-in"===r)return this._leaving=!0,Qt(f,"afterLeave",(function(){e._leaving=!1,e.$forceUpdate()})),ma(t,o);if("in-out"===r){if(ke(a))return u;var d,p=function(){d()};Qt(c,"afterEnter",p),Qt(c,"enterCancelled",p),Qt(f,"delayLeave",(function(t){d=t}))}}return o}}},ba=A({tag:String,moveClass:String},pa);delete ba.mode;var $a={props:ba,beforeMount:function(){var t=this,e=this._update;this._update=function(n,r){var o=Je(t);t.__patch__(t._vnode,t.kept,!1,!0),t._vnode=t.kept,o(),e.call(t,n,r)}},render:function(t){for(var e=this.tag||this.$vnode.data.tag||"span",n=Object.create(null),r=this.prevChildren=this.children,o=this.$slots.default||[],i=this.children=[],a=ha(this),s=0;s<o.length;s++){(l=o[s]).tag&&null!=l.key&&0!==String(l.key).indexOf("__vlist")&&(i.push(l),n[l.key]=l,(l.data||(l.data={})).transition=a)}if(r){var c=[],u=[];for(s=0;s<r.length;s++){var l;(l=r[s]).data.transition=a,l.data.pos=l.elm.getBoundingClientRect(),n[l.key]?c.push(l):u.push(l)}this.kept=t(e,null,c),this.removed=u}return t(e,null,i)},updated:function(){var t=this.prevChildren,e=this.moveClass||(this.name||"v")+"-move";t.length&&this.hasMove(t[0].elm,e)&&(t.forEach(wa),t.forEach(xa),t.forEach(Ca),this._reflow=document.body.offsetHeight,t.forEach((function(t){if(t.data.moved){var n=t.elm,r=n.style;zi(n,e),r.transform=r.WebkitTransform=r.transitionDuration="",n.addEventListener(Ri,n._moveCb=function t(r){r&&r.target!==n||r&&!/transform$/.test(r.propertyName)||(n.removeEventListener(Ri,t),n._moveCb=null,Vi(n,e))})}})))},methods:{hasMove:function(t,e){if(!Di)return!1;if(this._hasMove)return this._hasMove;var n=t.cloneNode();t._transitionClasses&&t._transitionClasses.forEach((function(t){Ei(n,t)})),ji(n,e),n.style.display="none",this.$el.appendChild(n);var r=qi(n);return this.$el.removeChild(n),this._hasMove=r.hasTransform}}};function wa(t){t.elm._moveCb&&t.elm._moveCb(),t.elm._enterCb&&t.elm._enterCb()}function xa(t){t.data.newPos=t.elm.getBoundingClientRect()}function Ca(t){var e=t.data.pos,n=t.data.newPos,r=e.left-n.left,o=e.top-n.top;if(r||o){t.data.moved=!0;var i=t.elm.style;i.transform=i.WebkitTransform="translate(".concat(r,"px,").concat(o,"px)"),i.transitionDuration="0s"}}var ka={Transition:_a,TransitionGroup:$a};Er.config.mustUseProp=Ur,Er.config.isReservedTag=oo,Er.config.isReservedAttr=Hr,Er.config.getTagNamespace=io,Er.config.isUnknownElement=function(t){if(!q)return!0;if(oo(t))return!1;if(t=t.toLowerCase(),null!=ao[t])return ao[t];var e=document.createElement(t);return t.indexOf("-")>-1?ao[t]=e.constructor===window.HTMLUnknownElement||e.constructor===window.HTMLElement:ao[t]=/HTMLUnknownElement/.test(e.toString())},A(Er.options.directives,da),A(Er.options.components,ka),Er.prototype.__patch__=q?ea:E,Er.prototype.$mount=function(t,e){return function(t,e,n){var r;t.$el=e,t.$options.render||(t.$options.render=dt),Ge(t,"beforeMount"),r=function(){t._update(t._render(),n)},new Xn(t,r,E,{before:function(){t._isMounted&&!t._isDestroyed&&Ge(t,"beforeUpdate")}},!0),n=!1;var o=t._preWatchers;if(o)for(var i=0;i<o.length;i++)o[i].run();return null==t.$vnode&&(t._isMounted=!0,Ge(t,"mounted")),t}(this,t=t&&q?co(t):void 0,e)},q&&setTimeout((function(){B.devtools&&it&&it.emit("init",Er)}),0);var Sa=/\{\{((?:.|\r?\n)+?)\}\}/g,Oa=/[-.*+?^${}()|[\]\/\\]/g,Ta=$((function(t){var e=t[0].replace(Oa,"\\$&"),n=t[1].replace(Oa,"\\$&");return new RegExp(e+"((?:.|\\n)+?)"+n,"g")}));var Aa={staticKeys:["staticClass"],transformNode:function(t,e){e.warn;var n=Zo(t,"class");n&&(t.staticClass=JSON.stringify(n.replace(/\s+/g," ").trim()));var r=Wo(t,"class",!1);r&&(t.classBinding=r)},genData:function(t){var e="";return t.staticClass&&(e+="staticClass:".concat(t.staticClass,",")),t.classBinding&&(e+="class:".concat(t.classBinding,",")),e}};var ja,Ea={staticKeys:["staticStyle"],transformNode:function(t,e){e.warn;var n=Zo(t,"style");n&&(t.staticStyle=JSON.stringify(yi(n)));var r=Wo(t,"style",!1);r&&(t.styleBinding=r)},genData:function(t){var e="";return t.staticStyle&&(e+="staticStyle:".concat(t.staticStyle,",")),t.styleBinding&&(e+="style:(".concat(t.styleBinding,"),")),e}},Na=function(t){return(ja=ja||document.createElement("div")).innerHTML=t,ja.textContent},Pa=h("area,base,br,col,embed,frame,hr,img,input,isindex,keygen,link,meta,param,source,track,wbr"),Da=h("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr,source"),Ma=h("address,article,aside,base,blockquote,body,caption,col,colgroup,dd,details,dialog,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,legend,li,menuitem,meta,optgroup,option,param,rp,rt,source,style,summary,tbody,td,tfoot,th,thead,title,tr,track"),Ia=/^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/,La=/^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/,Ra="[a-zA-Z_][\\-\\.0-9_a-zA-Z".concat(U.source,"]*"),Fa="((?:".concat(Ra,"\\:)?").concat(Ra,")"),Ha=new RegExp("^<".concat(Fa)),Ba=/^\s*(\/?)>/,Ua=new RegExp("^<\\/".concat(Fa,"[^>]*>")),za=/^<!DOCTYPE [^>]+>/i,Va=/^<!\--/,Ka=/^<!\[/,Ja=h("script,style,textarea",!0),qa={},Wa={"&lt;":"<","&gt;":">","&quot;":'"',"&amp;":"&","&#10;":"\n","&#9;":"\t","&#39;":"'"},Za=/&(?:lt|gt|quot|amp|#39);/g,Ga=/&(?:lt|gt|quot|amp|#39|#10|#9);/g,Xa=h("pre,textarea",!0),Ya=function(t,e){return t&&Xa(t)&&"\n"===e[0]};function Qa(t,e){var n=e?Ga:Za;return t.replace(n,(function(t){return Wa[t]}))}function ts(t,e){for(var n,r,o=[],i=e.expectHTML,a=e.isUnaryTag||N,s=e.canBeLeftOpenTag||N,c=0,u=function(){if(n=t,r&&Ja(r)){var u=0,d=r.toLowerCase(),p=qa[d]||(qa[d]=new RegExp("([\\s\\S]*?)(</"+d+"[^>]*>)","i"));w=t.replace(p,(function(t,n,r){return u=r.length,Ja(d)||"noscript"===d||(n=n.replace(/<!\--([\s\S]*?)-->/g,"$1").replace(/<!\[CDATA\[([\s\S]*?)]]>/g,"$1")),Ya(d,n)&&(n=n.slice(1)),e.chars&&e.chars(n),""}));c+=t.length-w.length,t=w,f(d,c-u,c)}else{var v=t.indexOf("<");if(0===v){if(Va.test(t)){var h=t.indexOf("--\x3e");if(h>=0)return e.shouldKeepComment&&e.comment&&e.comment(t.substring(4,h),c,c+h+3),l(h+3),"continue"}if(Ka.test(t)){var m=t.indexOf("]>");if(m>=0)return l(m+2),"continue"}var g=t.match(za);if(g)return l(g[0].length),"continue";var y=t.match(Ua);if(y){var _=c;return l(y[0].length),f(y[1],_,c),"continue"}var b=function(){var e=t.match(Ha);if(e){var n={tagName:e[1],attrs:[],start:c};l(e[0].length);for(var r=void 0,o=void 0;!(r=t.match(Ba))&&(o=t.match(La)||t.match(Ia));)o.start=c,l(o[0].length),o.end=c,n.attrs.push(o);if(r)return n.unarySlash=r[1],l(r[0].length),n.end=c,n}}();if(b)return function(t){var n=t.tagName,c=t.unarySlash;i&&("p"===r&&Ma(n)&&f(r),s(n)&&r===n&&f(n));for(var u=a(n)||!!c,l=t.attrs.length,d=new Array(l),p=0;p<l;p++){var v=t.attrs[p],h=v[3]||v[4]||v[5]||"",m="a"===n&&"href"===v[1]?e.shouldDecodeNewlinesForHref:e.shouldDecodeNewlines;d[p]={name:v[1],value:Qa(h,m)}}u||(o.push({tag:n,lowerCasedTag:n.toLowerCase(),attrs:d,start:t.start,end:t.end}),r=n);e.start&&e.start(n,d,u,t.start,t.end)}(b),Ya(b.tagName,t)&&l(1),"continue"}var $=void 0,w=void 0,x=void 0;if(v>=0){for(w=t.slice(v);!(Ua.test(w)||Ha.test(w)||Va.test(w)||Ka.test(w)||(x=w.indexOf("<",1))<0);)v+=x,w=t.slice(v);$=t.substring(0,v)}v<0&&($=t),$&&l($.length),e.chars&&$&&e.chars($,c-$.length,c)}if(t===n)return e.chars&&e.chars(t),"break"};t;){if("break"===u())break}function l(e){c+=e,t=t.substring(e)}function f(t,n,i){var a,s;if(null==n&&(n=c),null==i&&(i=c),t)for(s=t.toLowerCase(),a=o.length-1;a>=0&&o[a].lowerCasedTag!==s;a--);else a=0;if(a>=0){for(var u=o.length-1;u>=a;u--)e.end&&e.end(o[u].tag,n,i);o.length=a,r=a&&o[a-1].tag}else"br"===s?e.start&&e.start(t,[],!0,n,i):"p"===s&&(e.start&&e.start(t,[],!1,n,i),e.end&&e.end(t,n,i))}f()}var es,ns,rs,os,is,as,ss,cs,us=/^@|^v-on:/,ls=/^v-|^@|^:|^#/,fs=/([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/,ds=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,ps=/^\(|\)$/g,vs=/^\[.*\]$/,hs=/:(.*)$/,ms=/^:|^\.|^v-bind:/,gs=/\.[^.\]]+(?=[^\]]*$)/g,ys=/^v-slot(:|$)|^#/,_s=/[\r\n]/,bs=/[ \f\t\r\n]+/g,$s=$(Na),ws="_empty_";function xs(t,e,n){return{type:1,tag:t,attrsList:e,attrsMap:js(e),rawAttrsMap:{},parent:n,children:[]}}function Cs(t,e){es=e.warn||Ho,as=e.isPreTag||N,ss=e.mustUseProp||N,cs=e.getTagNamespace||N,e.isReservedTag,rs=Bo(e.modules,"transformNode"),os=Bo(e.modules,"preTransformNode"),is=Bo(e.modules,"postTransformNode"),ns=e.delimiters;var n,r,o=[],i=!1!==e.preserveWhitespace,a=e.whitespace,s=!1,c=!1;function u(t){if(l(t),s||t.processed||(t=ks(t,e)),o.length||t===n||n.if&&(t.elseif||t.else)&&Os(n,{exp:t.elseif,block:t}),r&&!t.forbidden)if(t.elseif||t.else)a=t,u=function(t){for(var e=t.length;e--;){if(1===t[e].type)return t[e];t.pop()}}(r.children),u&&u.if&&Os(u,{exp:a.elseif,block:a});else{if(t.slotScope){var i=t.slotTarget||'"default"';(r.scopedSlots||(r.scopedSlots={}))[i]=t}r.children.push(t),t.parent=r}var a,u;t.children=t.children.filter((function(t){return!t.slotScope})),l(t),t.pre&&(s=!1),as(t.tag)&&(c=!1);for(var f=0;f<is.length;f++)is[f](t,e)}function l(t){if(!c)for(var e=void 0;(e=t.children[t.children.length-1])&&3===e.type&&" "===e.text;)t.children.pop()}return ts(t,{warn:es,expectHTML:e.expectHTML,isUnaryTag:e.isUnaryTag,canBeLeftOpenTag:e.canBeLeftOpenTag,shouldDecodeNewlines:e.shouldDecodeNewlines,shouldDecodeNewlinesForHref:e.shouldDecodeNewlinesForHref,shouldKeepComment:e.comments,outputSourceRange:e.outputSourceRange,start:function(t,i,a,l,f){var d=r&&r.ns||cs(t);Z&&"svg"===d&&(i=function(t){for(var e=[],n=0;n<t.length;n++){var r=t[n];Es.test(r.name)||(r.name=r.name.replace(Ns,""),e.push(r))}return e}(i));var p,v=xs(t,i,r);d&&(v.ns=d),"style"!==(p=v).tag&&("script"!==p.tag||p.attrsMap.type&&"text/javascript"!==p.attrsMap.type)||ot()||(v.forbidden=!0);for(var h=0;h<os.length;h++)v=os[h](v,e)||v;s||(!function(t){null!=Zo(t,"v-pre")&&(t.pre=!0)}(v),v.pre&&(s=!0)),as(v.tag)&&(c=!0),s?function(t){var e=t.attrsList,n=e.length;if(n)for(var r=t.attrs=new Array(n),o=0;o<n;o++)r[o]={name:e[o].name,value:JSON.stringify(e[o].value)},null!=e[o].start&&(r[o].start=e[o].start,r[o].end=e[o].end);else t.pre||(t.plain=!0)}(v):v.processed||(Ss(v),function(t){var e=Zo(t,"v-if");if(e)t.if=e,Os(t,{exp:e,block:t});else{null!=Zo(t,"v-else")&&(t.else=!0);var n=Zo(t,"v-else-if");n&&(t.elseif=n)}}(v),function(t){var e=Zo(t,"v-once");null!=e&&(t.once=!0)}(v)),n||(n=v),a?u(v):(r=v,o.push(v))},end:function(t,e,n){var i=o[o.length-1];o.length-=1,r=o[o.length-1],u(i)},chars:function(t,e,n){if(r&&(!Z||"textarea"!==r.tag||r.attrsMap.placeholder!==t)){var o,u=r.children;if(t=c||t.trim()?"script"===(o=r).tag||"style"===o.tag?t:$s(t):u.length?a?"condense"===a&&_s.test(t)?"":" ":i?" ":"":""){c||"condense"!==a||(t=t.replace(bs," "));var l=void 0,f=void 0;!s&&" "!==t&&(l=function(t,e){var n=e?Ta(e):Sa;if(n.test(t)){for(var r,o,i,a=[],s=[],c=n.lastIndex=0;r=n.exec(t);){(o=r.index)>c&&(s.push(i=t.slice(c,o)),a.push(JSON.stringify(i)));var u=Ro(r[1].trim());a.push("_s(".concat(u,")")),s.push({"@binding":u}),c=o+r[0].length}return c<t.length&&(s.push(i=t.slice(c)),a.push(JSON.stringify(i))),{expression:a.join("+"),tokens:s}}}(t,ns))?f={type:2,expression:l.expression,tokens:l.tokens,text:t}:" "===t&&u.length&&" "===u[u.length-1].text||(f={type:3,text:t}),f&&u.push(f)}}},comment:function(t,e,n){if(r){var o={type:3,text:t,isComment:!0};r.children.push(o)}}}),n}function ks(t,e){var n,r;(r=Wo(n=t,"key"))&&(n.key=r),t.plain=!t.key&&!t.scopedSlots&&!t.attrsList.length,function(t){var e=Wo(t,"ref");e&&(t.ref=e,t.refInFor=function(t){var e=t;for(;e;){if(void 0!==e.for)return!0;e=e.parent}return!1}(t))}(t),function(t){var e;"template"===t.tag?(e=Zo(t,"scope"),t.slotScope=e||Zo(t,"slot-scope")):(e=Zo(t,"slot-scope"))&&(t.slotScope=e);var n=Wo(t,"slot");n&&(t.slotTarget='""'===n?'"default"':n,t.slotTargetDynamic=!(!t.attrsMap[":slot"]&&!t.attrsMap["v-bind:slot"]),"template"===t.tag||t.slotScope||zo(t,"slot",n,function(t,e){return t.rawAttrsMap[":"+e]||t.rawAttrsMap["v-bind:"+e]||t.rawAttrsMap[e]}(t,"slot")));if("template"===t.tag){if(a=Go(t,ys)){var r=Ts(a),o=r.name,i=r.dynamic;t.slotTarget=o,t.slotTargetDynamic=i,t.slotScope=a.value||ws}}else{var a;if(a=Go(t,ys)){var s=t.scopedSlots||(t.scopedSlots={}),c=Ts(a),u=c.name,l=(i=c.dynamic,s[u]=xs("template",[],t));l.slotTarget=u,l.slotTargetDynamic=i,l.children=t.children.filter((function(t){if(!t.slotScope)return t.parent=l,!0})),l.slotScope=a.value||ws,t.children=[],t.plain=!1}}}(t),function(t){"slot"===t.tag&&(t.slotName=Wo(t,"name"))}(t),function(t){var e;(e=Wo(t,"is"))&&(t.component=e);null!=Zo(t,"inline-template")&&(t.inlineTemplate=!0)}(t);for(var o=0;o<rs.length;o++)t=rs[o](t,e)||t;return function(t){var e,n,r,o,i,a,s,c,u=t.attrsList;for(e=0,n=u.length;e<n;e++)if(r=o=u[e].name,i=u[e].value,ls.test(r))if(t.hasBindings=!0,(a=As(r.replace(ls,"")))&&(r=r.replace(gs,"")),ms.test(r))r=r.replace(ms,""),i=Ro(i),(c=vs.test(r))&&(r=r.slice(1,-1)),a&&(a.prop&&!c&&"innerHtml"===(r=x(r))&&(r="innerHTML"),a.camel&&!c&&(r=x(r)),a.sync&&(s=Qo(i,"$event"),c?qo(t,'"update:"+('.concat(r,")"),s,null,!1,0,u[e],!0):(qo(t,"update:".concat(x(r)),s,null,!1,0,u[e]),S(r)!==x(r)&&qo(t,"update:".concat(S(r)),s,null,!1,0,u[e])))),a&&a.prop||!t.component&&ss(t.tag,t.attrsMap.type,r)?Uo(t,r,i,u[e],c):zo(t,r,i,u[e],c);else if(us.test(r))r=r.replace(us,""),(c=vs.test(r))&&(r=r.slice(1,-1)),qo(t,r,i,a,!1,0,u[e],c);else{var l=(r=r.replace(ls,"")).match(hs),f=l&&l[1];c=!1,f&&(r=r.slice(0,-(f.length+1)),vs.test(f)&&(f=f.slice(1,-1),c=!0)),Ko(t,r,o,i,f,c,a,u[e])}else zo(t,r,JSON.stringify(i),u[e]),!t.component&&"muted"===r&&ss(t.tag,t.attrsMap.type,r)&&Uo(t,r,"true",u[e])}(t),t}function Ss(t){var e;if(e=Zo(t,"v-for")){var n=function(t){var e=t.match(fs);if(!e)return;var n={};n.for=e[2].trim();var r=e[1].trim().replace(ps,""),o=r.match(ds);o?(n.alias=r.replace(ds,"").trim(),n.iterator1=o[1].trim(),o[2]&&(n.iterator2=o[2].trim())):n.alias=r;return n}(e);n&&A(t,n)}}function Os(t,e){t.ifConditions||(t.ifConditions=[]),t.ifConditions.push(e)}function Ts(t){var e=t.name.replace(ys,"");return e||"#"!==t.name[0]&&(e="default"),vs.test(e)?{name:e.slice(1,-1),dynamic:!0}:{name:'"'.concat(e,'"'),dynamic:!1}}function As(t){var e=t.match(gs);if(e){var n={};return e.forEach((function(t){n[t.slice(1)]=!0})),n}}function js(t){for(var e={},n=0,r=t.length;n<r;n++)e[t[n].name]=t[n].value;return e}var Es=/^xmlns:NS\d+/,Ns=/^NS\d+:/;function Ps(t){return xs(t.tag,t.attrsList.slice(),t.parent)}var Ds=[Aa,Ea,{preTransformNode:function(t,e){if("input"===t.tag){var n=t.attrsMap;if(!n["v-model"])return;var r=void 0;if((n[":type"]||n["v-bind:type"])&&(r=Wo(t,"type")),n.type||r||!n["v-bind"]||(r="(".concat(n["v-bind"],").type")),r){var o=Zo(t,"v-if",!0),i=o?"&&(".concat(o,")"):"",a=null!=Zo(t,"v-else",!0),s=Zo(t,"v-else-if",!0),c=Ps(t);Ss(c),Vo(c,"type","checkbox"),ks(c,e),c.processed=!0,c.if="(".concat(r,")==='checkbox'")+i,Os(c,{exp:c.if,block:c});var u=Ps(t);Zo(u,"v-for",!0),Vo(u,"type","radio"),ks(u,e),Os(c,{exp:"(".concat(r,")==='radio'")+i,block:u});var l=Ps(t);return Zo(l,"v-for",!0),Vo(l,":type",r),ks(l,e),Os(c,{exp:o,block:l}),a?c.else=!0:s&&(c.elseif=s),c}}}}];var Ms,Is,Ls={model:function(t,e,n){var r=e.value,o=e.modifiers,i=t.tag,a=t.attrsMap.type;if(t.component)return Yo(t,r,o),!1;if("select"===i)!function(t,e,n){var r=n&&n.number,o='Array.prototype.filter.call($event.target.options,function(o){return o.selected}).map(function(o){var val = "_value" in o ? o._value : o.value;'+"return ".concat(r?"_n(val)":"val","})"),i="$event.target.multiple ? $$selectedVal : $$selectedVal[0]",a="var $$selectedVal = ".concat(o,";");a="".concat(a," ").concat(Qo(e,i)),qo(t,"change",a,null,!0)}(t,r,o);else if("input"===i&&"checkbox"===a)!function(t,e,n){var r=n&&n.number,o=Wo(t,"value")||"null",i=Wo(t,"true-value")||"true",a=Wo(t,"false-value")||"false";Uo(t,"checked","Array.isArray(".concat(e,")")+"?_i(".concat(e,",").concat(o,")>-1")+("true"===i?":(".concat(e,")"):":_q(".concat(e,",").concat(i,")"))),qo(t,"change","var $$a=".concat(e,",")+"$$el=$event.target,"+"$$c=$$el.checked?(".concat(i,"):(").concat(a,");")+"if(Array.isArray($$a)){"+"var $$v=".concat(r?"_n("+o+")":o,",")+"$$i=_i($$a,$$v);"+"if($$el.checked){$$i<0&&(".concat(Qo(e,"$$a.concat([$$v])"),")}")+"else{$$i>-1&&(".concat(Qo(e,"$$a.slice(0,$$i).concat($$a.slice($$i+1))"),")}")+"}else{".concat(Qo(e,"$$c"),"}"),null,!0)}(t,r,o);else if("input"===i&&"radio"===a)!function(t,e,n){var r=n&&n.number,o=Wo(t,"value")||"null";o=r?"_n(".concat(o,")"):o,Uo(t,"checked","_q(".concat(e,",").concat(o,")")),qo(t,"change",Qo(e,o),null,!0)}(t,r,o);else if("input"===i||"textarea"===i)!function(t,e,n){var r=t.attrsMap.type,o=n||{},i=o.lazy,a=o.number,s=o.trim,c=!i&&"range"!==r,u=i?"change":"range"===r?ai:"input",l="$event.target.value";s&&(l="$event.target.value.trim()");a&&(l="_n(".concat(l,")"));var f=Qo(e,l);c&&(f="if($event.target.composing)return;".concat(f));Uo(t,"value","(".concat(e,")")),qo(t,u,f,null,!0),(s||a)&&qo(t,"blur","$forceUpdate()")}(t,r,o);else if(!B.isReservedTag(i))return Yo(t,r,o),!1;return!0},text:function(t,e){e.value&&Uo(t,"textContent","_s(".concat(e.value,")"),e)},html:function(t,e){e.value&&Uo(t,"innerHTML","_s(".concat(e.value,")"),e)}},Rs={expectHTML:!0,modules:Ds,directives:Ls,isPreTag:function(t){return"pre"===t},isUnaryTag:Pa,mustUseProp:Ur,canBeLeftOpenTag:Da,isReservedTag:oo,getTagNamespace:io,staticKeys:function(t){return t.reduce((function(t,e){return t.concat(e.staticKeys||[])}),[]).join(",")}(Ds)},Fs=$((function(t){return h("type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap"+(t?","+t:""))}));function Hs(t,e){t&&(Ms=Fs(e.staticKeys||""),Is=e.isReservedTag||N,Bs(t),Us(t,!1))}function Bs(t){if(t.static=function(t){if(2===t.type)return!1;if(3===t.type)return!0;return!(!t.pre&&(t.hasBindings||t.if||t.for||m(t.tag)||!Is(t.tag)||function(t){for(;t.parent;){if("template"!==(t=t.parent).tag)return!1;if(t.for)return!0}return!1}(t)||!Object.keys(t).every(Ms)))}(t),1===t.type){if(!Is(t.tag)&&"slot"!==t.tag&&null==t.attrsMap["inline-template"])return;for(var e=0,n=t.children.length;e<n;e++){var r=t.children[e];Bs(r),r.static||(t.static=!1)}if(t.ifConditions)for(e=1,n=t.ifConditions.length;e<n;e++){var o=t.ifConditions[e].block;Bs(o),o.static||(t.static=!1)}}}function Us(t,e){if(1===t.type){if((t.static||t.once)&&(t.staticInFor=e),t.static&&t.children.length&&(1!==t.children.length||3!==t.children[0].type))return void(t.staticRoot=!0);if(t.staticRoot=!1,t.children)for(var n=0,r=t.children.length;n<r;n++)Us(t.children[n],e||!!t.for);if(t.ifConditions)for(n=1,r=t.ifConditions.length;n<r;n++)Us(t.ifConditions[n].block,e)}}var zs=/^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/,Vs=/\([^)]*?\);*$/,Ks=/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/,Js={esc:27,tab:9,enter:13,space:32,up:38,left:37,right:39,down:40,delete:[8,46]},qs={esc:["Esc","Escape"],tab:"Tab",enter:"Enter",space:[" ","Spacebar"],up:["Up","ArrowUp"],left:["Left","ArrowLeft"],right:["Right","ArrowRight"],down:["Down","ArrowDown"],delete:["Backspace","Delete","Del"]},Ws=function(t){return"if(".concat(t,")return null;")},Zs={stop:"$event.stopPropagation();",prevent:"$event.preventDefault();",self:Ws("$event.target !== $event.currentTarget"),ctrl:Ws("!$event.ctrlKey"),shift:Ws("!$event.shiftKey"),alt:Ws("!$event.altKey"),meta:Ws("!$event.metaKey"),left:Ws("'button' in $event && $event.button !== 0"),middle:Ws("'button' in $event && $event.button !== 1"),right:Ws("'button' in $event && $event.button !== 2")};function Gs(t,e){var n=e?"nativeOn:":"on:",r="",o="";for(var i in t){var a=Xs(t[i]);t[i]&&t[i].dynamic?o+="".concat(i,",").concat(a,","):r+='"'.concat(i,'":').concat(a,",")}return r="{".concat(r.slice(0,-1),"}"),o?n+"_d(".concat(r,",[").concat(o.slice(0,-1),"])"):n+r}function Xs(t){if(!t)return"function(){}";if(Array.isArray(t))return"[".concat(t.map((function(t){return Xs(t)})).join(","),"]");var e=Ks.test(t.value),n=zs.test(t.value),r=Ks.test(t.value.replace(Vs,""));if(t.modifiers){var o="",i="",a=[],s=function(e){if(Zs[e])i+=Zs[e],Js[e]&&a.push(e);else if("exact"===e){var n=t.modifiers;i+=Ws(["ctrl","shift","alt","meta"].filter((function(t){return!n[t]})).map((function(t){return"$event.".concat(t,"Key")})).join("||"))}else a.push(e)};for(var c in t.modifiers)s(c);a.length&&(o+=function(t){return"if(!$event.type.indexOf('key')&&"+"".concat(t.map(Ys).join("&&"),")return null;")}(a)),i&&(o+=i);var u=e?"return ".concat(t.value,".apply(null, arguments)"):n?"return (".concat(t.value,").apply(null, arguments)"):r?"return ".concat(t.value):t.value;return"function($event){".concat(o).concat(u,"}")}return e||n?t.value:"function($event){".concat(r?"return ".concat(t.value):t.value,"}")}function Ys(t){var e=parseInt(t,10);if(e)return"$event.keyCode!==".concat(e);var n=Js[t],r=qs[t];return"_k($event.keyCode,"+"".concat(JSON.stringify(t),",")+"".concat(JSON.stringify(n),",")+"$event.key,"+"".concat(JSON.stringify(r))+")"}var Qs={on:function(t,e){t.wrapListeners=function(t){return"_g(".concat(t,",").concat(e.value,")")}},bind:function(t,e){t.wrapData=function(n){return"_b(".concat(n,",'").concat(t.tag,"',").concat(e.value,",").concat(e.modifiers&&e.modifiers.prop?"true":"false").concat(e.modifiers&&e.modifiers.sync?",true":"",")")}},cloak:E},tc=function(t){this.options=t,this.warn=t.warn||Ho,this.transforms=Bo(t.modules,"transformCode"),this.dataGenFns=Bo(t.modules,"genData"),this.directives=A(A({},Qs),t.directives);var e=t.isReservedTag||N;this.maybeComponent=function(t){return!!t.component||!e(t.tag)},this.onceId=0,this.staticRenderFns=[],this.pre=!1};function ec(t,e){var n=new tc(e),r=t?"script"===t.tag?"null":nc(t,n):'_c("div")';return{render:"with(this){return ".concat(r,"}"),staticRenderFns:n.staticRenderFns}}function nc(t,e){if(t.parent&&(t.pre=t.pre||t.parent.pre),t.staticRoot&&!t.staticProcessed)return rc(t,e);if(t.once&&!t.onceProcessed)return oc(t,e);if(t.for&&!t.forProcessed)return sc(t,e);if(t.if&&!t.ifProcessed)return ic(t,e);if("template"!==t.tag||t.slotTarget||e.pre){if("slot"===t.tag)return function(t,e){var n=t.slotName||'"default"',r=fc(t,e),o="_t(".concat(n).concat(r?",function(){return ".concat(r,"}"):""),i=t.attrs||t.dynamicAttrs?vc((t.attrs||[]).concat(t.dynamicAttrs||[]).map((function(t){return{name:x(t.name),value:t.value,dynamic:t.dynamic}}))):null,a=t.attrsMap["v-bind"];!i&&!a||r||(o+=",null");i&&(o+=",".concat(i));a&&(o+="".concat(i?"":",null",",").concat(a));return o+")"}(t,e);var n=void 0;if(t.component)n=function(t,e,n){var r=e.inlineTemplate?null:fc(e,n,!0);return"_c(".concat(t,",").concat(cc(e,n)).concat(r?",".concat(r):"",")")}(t.component,t,e);else{var r=void 0,o=e.maybeComponent(t);(!t.plain||t.pre&&o)&&(r=cc(t,e));var i=void 0,a=e.options.bindings;o&&a&&!1!==a.__isScriptSetup&&(i=function(t,e){var n=x(e),r=C(n),o=function(o){return t[e]===o?e:t[n]===o?n:t[r]===o?r:void 0},i=o("setup-const")||o("setup-reactive-const");if(i)return i;var a=o("setup-let")||o("setup-ref")||o("setup-maybe-ref");if(a)return a}(a,t.tag)),i||(i="'".concat(t.tag,"'"));var s=t.inlineTemplate?null:fc(t,e,!0);n="_c(".concat(i).concat(r?",".concat(r):"").concat(s?",".concat(s):"",")")}for(var c=0;c<e.transforms.length;c++)n=e.transforms[c](t,n);return n}return fc(t,e)||"void 0"}function rc(t,e){t.staticProcessed=!0;var n=e.pre;return t.pre&&(e.pre=t.pre),e.staticRenderFns.push("with(this){return ".concat(nc(t,e),"}")),e.pre=n,"_m(".concat(e.staticRenderFns.length-1).concat(t.staticInFor?",true":"",")")}function oc(t,e){if(t.onceProcessed=!0,t.if&&!t.ifProcessed)return ic(t,e);if(t.staticInFor){for(var n="",r=t.parent;r;){if(r.for){n=r.key;break}r=r.parent}return n?"_o(".concat(nc(t,e),",").concat(e.onceId++,",").concat(n,")"):nc(t,e)}return rc(t,e)}function ic(t,e,n,r){return t.ifProcessed=!0,ac(t.ifConditions.slice(),e,n,r)}function ac(t,e,n,r){if(!t.length)return r||"_e()";var o=t.shift();return o.exp?"(".concat(o.exp,")?").concat(i(o.block),":").concat(ac(t,e,n,r)):"".concat(i(o.block));function i(t){return n?n(t,e):t.once?oc(t,e):nc(t,e)}}function sc(t,e,n,r){var o=t.for,i=t.alias,a=t.iterator1?",".concat(t.iterator1):"",s=t.iterator2?",".concat(t.iterator2):"";return t.forProcessed=!0,"".concat(r||"_l","((").concat(o,"),")+"function(".concat(i).concat(a).concat(s,"){")+"return ".concat((n||nc)(t,e))+"})"}function cc(t,e){var n="{",r=function(t,e){var n=t.directives;if(!n)return;var r,o,i,a,s="directives:[",c=!1;for(r=0,o=n.length;r<o;r++){i=n[r],a=!0;var u=e.directives[i.name];u&&(a=!!u(t,i,e.warn)),a&&(c=!0,s+='{name:"'.concat(i.name,'",rawName:"').concat(i.rawName,'"').concat(i.value?",value:(".concat(i.value,"),expression:").concat(JSON.stringify(i.value)):"").concat(i.arg?",arg:".concat(i.isDynamicArg?i.arg:'"'.concat(i.arg,'"')):"").concat(i.modifiers?",modifiers:".concat(JSON.stringify(i.modifiers)):"","},"))}if(c)return s.slice(0,-1)+"]"}(t,e);r&&(n+=r+","),t.key&&(n+="key:".concat(t.key,",")),t.ref&&(n+="ref:".concat(t.ref,",")),t.refInFor&&(n+="refInFor:true,"),t.pre&&(n+="pre:true,"),t.component&&(n+='tag:"'.concat(t.tag,'",'));for(var o=0;o<e.dataGenFns.length;o++)n+=e.dataGenFns[o](t);if(t.attrs&&(n+="attrs:".concat(vc(t.attrs),",")),t.props&&(n+="domProps:".concat(vc(t.props),",")),t.events&&(n+="".concat(Gs(t.events,!1),",")),t.nativeEvents&&(n+="".concat(Gs(t.nativeEvents,!0),",")),t.slotTarget&&!t.slotScope&&(n+="slot:".concat(t.slotTarget,",")),t.scopedSlots&&(n+="".concat(function(t,e,n){var r=t.for||Object.keys(e).some((function(t){var n=e[t];return n.slotTargetDynamic||n.if||n.for||uc(n)})),o=!!t.if;if(!r)for(var i=t.parent;i;){if(i.slotScope&&i.slotScope!==ws||i.for){r=!0;break}i.if&&(o=!0),i=i.parent}var a=Object.keys(e).map((function(t){return lc(e[t],n)})).join(",");return"scopedSlots:_u([".concat(a,"]").concat(r?",null,true":"").concat(!r&&o?",null,false,".concat(function(t){var e=5381,n=t.length;for(;n;)e=33*e^t.charCodeAt(--n);return e>>>0}(a)):"",")")}(t,t.scopedSlots,e),",")),t.model&&(n+="model:{value:".concat(t.model.value,",callback:").concat(t.model.callback,",expression:").concat(t.model.expression,"},")),t.inlineTemplate){var i=function(t,e){var n=t.children[0];if(n&&1===n.type){var r=ec(n,e.options);return"inlineTemplate:{render:function(){".concat(r.render,"},staticRenderFns:[").concat(r.staticRenderFns.map((function(t){return"function(){".concat(t,"}")})).join(","),"]}")}}(t,e);i&&(n+="".concat(i,","))}return n=n.replace(/,$/,"")+"}",t.dynamicAttrs&&(n="_b(".concat(n,',"').concat(t.tag,'",').concat(vc(t.dynamicAttrs),")")),t.wrapData&&(n=t.wrapData(n)),t.wrapListeners&&(n=t.wrapListeners(n)),n}function uc(t){return 1===t.type&&("slot"===t.tag||t.children.some(uc))}function lc(t,e){var n=t.attrsMap["slot-scope"];if(t.if&&!t.ifProcessed&&!n)return ic(t,e,lc,"null");if(t.for&&!t.forProcessed)return sc(t,e,lc);var r=t.slotScope===ws?"":String(t.slotScope),o="function(".concat(r,"){")+"return ".concat("template"===t.tag?t.if&&n?"(".concat(t.if,")?").concat(fc(t,e)||"undefined",":undefined"):fc(t,e)||"undefined":nc(t,e),"}"),i=r?"":",proxy:true";return"{key:".concat(t.slotTarget||'"default"',",fn:").concat(o).concat(i,"}")}function fc(t,e,n,r,o){var i=t.children;if(i.length){var a=i[0];if(1===i.length&&a.for&&"template"!==a.tag&&"slot"!==a.tag){var s=n?e.maybeComponent(a)?",1":",0":"";return"".concat((r||nc)(a,e)).concat(s)}var c=n?function(t,e){for(var n=0,r=0;r<t.length;r++){var o=t[r];if(1===o.type){if(dc(o)||o.ifConditions&&o.ifConditions.some((function(t){return dc(t.block)}))){n=2;break}(e(o)||o.ifConditions&&o.ifConditions.some((function(t){return e(t.block)})))&&(n=1)}}return n}(i,e.maybeComponent):0,u=o||pc;return"[".concat(i.map((function(t){return u(t,e)})).join(","),"]").concat(c?",".concat(c):"")}}function dc(t){return void 0!==t.for||"template"===t.tag||"slot"===t.tag}function pc(t,e){return 1===t.type?nc(t,e):3===t.type&&t.isComment?function(t){return"_e(".concat(JSON.stringify(t.text),")")}(t):function(t){return"_v(".concat(2===t.type?t.expression:hc(JSON.stringify(t.text)),")")}(t)}function vc(t){for(var e="",n="",r=0;r<t.length;r++){var o=t[r],i=hc(o.value);o.dynamic?n+="".concat(o.name,",").concat(i,","):e+='"'.concat(o.name,'":').concat(i,",")}return e="{".concat(e.slice(0,-1),"}"),n?"_d(".concat(e,",[").concat(n.slice(0,-1),"])"):e}function hc(t){return t.replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")}function mc(t,e){try{return new Function(t)}catch(n){return e.push({err:n,code:t}),E}}function gc(t){var e=Object.create(null);return function(n,r,o){(r=A({},r)).warn,delete r.warn;var i=r.delimiters?String(r.delimiters)+n:n;if(e[i])return e[i];var a=t(n,r),s={},c=[];return s.render=mc(a.render,c),s.staticRenderFns=a.staticRenderFns.map((function(t){return mc(t,c)})),e[i]=s}}new RegExp("\\b"+"do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,super,throw,while,yield,delete,export,import,return,switch,default,extends,finally,continue,debugger,function,arguments".split(",").join("\\b|\\b")+"\\b"),new RegExp("\\b"+"delete,typeof,void".split(",").join("\\s*\\([^\\)]*\\)|\\b")+"\\s*\\([^\\)]*\\)");var yc,_c,bc=(yc=function(t,e){var n=Cs(t.trim(),e);!1!==e.optimize&&Hs(n,e);var r=ec(n,e);return{ast:n,render:r.render,staticRenderFns:r.staticRenderFns}},function(t){function e(e,n){var r=Object.create(t),o=[],i=[];if(n)for(var a in n.modules&&(r.modules=(t.modules||[]).concat(n.modules)),n.directives&&(r.directives=A(Object.create(t.directives||null),n.directives)),n)"modules"!==a&&"directives"!==a&&(r[a]=n[a]);r.warn=function(t,e,n){(n?i:o).push(t)};var s=yc(e.trim(),r);return s.errors=o,s.tips=i,s}return{compile:e,compileToFunctions:gc(e)}}),$c=bc(Rs).compileToFunctions;function wc(t){return(_c=_c||document.createElement("div")).innerHTML=t?'<a href="\n"/>':'<div a="\n"/>',_c.innerHTML.indexOf("&#10;")>0}var xc=!!q&&wc(!1),Cc=!!q&&wc(!0),kc=$((function(t){var e=co(t);return e&&e.innerHTML})),Sc=Er.prototype.$mount;return Er.prototype.$mount=function(t,e){if((t=t&&co(t))===document.body||t===document.documentElement)return this;var n=this.$options;if(!n.render){var r=n.template;if(r)if("string"==typeof r)"#"===r.charAt(0)&&(r=kc(r));else{if(!r.nodeType)return this;r=r.innerHTML}else t&&(r=function(t){if(t.outerHTML)return t.outerHTML;var e=document.createElement("div");return e.appendChild(t.cloneNode(!0)),e.innerHTML}(t));if(r){var o=$c(r,{outputSourceRange:!1,shouldDecodeNewlines:xc,shouldDecodeNewlinesForHref:Cc,delimiters:n.delimiters,comments:n.comments},this),i=o.render,a=o.staticRenderFns;n.render=i,n.staticRenderFns=a}}return Sc.call(this,t,e)},Er.compile=$c,A(Er,Jn),Er.effect=function(t,e){var n=new Xn(ut,t,E,{sync:!0});e&&(n.update=function(){e((function(){return n.run()}))})},Er}));
const EventBus = {
    _listeners: {},

    $on(eventName, callback) {
        if (!this._listeners[eventName]) {
            this._listeners[eventName] = [];
        }
        this._listeners[eventName].push(callback);
    },

    $emit(eventName, ...args) {
        const callbacks = this._listeners[eventName];
        if (callbacks) {
            callbacks.forEach(callback => {
                callback(...args);
            });
        }
    },

    $off(eventName, callback) {
        const callbacks = this._listeners[eventName];
        if (callbacks) {
            this._listeners[eventName] = callbacks.filter(cb => cb !== callback);
        }
    }
};
    // 设置 cookie
    function setCookie(cname, cvalue, exdays) {
        let d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
        let expires = "expires=" + d.toUTCString();
        // 使用 encodeURIComponent 对 cookie 名称和值进行编码
        document.cookie = encodeURIComponent(cname) + "=" + encodeURIComponent(cvalue) + "; " + expires + "; path=/; SameSite=Lax;";
    }

    // 获取 cookie
    function getCookie(cname) {
        let name = encodeURIComponent(cname) + "=";
        let ca = document.cookie.split(';');
        for (const element of ca) {
            let c = element.trim();
            if (c.indexOf(name) == 0) {
                // 使用 decodeURIComponent 对 cookie 值进行解码
                return decodeURIComponent(c.substring(name.length, c.length));
            }
        }
        return "";
    }
    let csrfTokenCache = null;  // 缓存 CSRF token
    let tokenFetchPromise = null;  // 避免重复请求 CSRF token

    // 获取 CSRF token 的函数，带缓存机制
    function getCsrfToken() {
        // 如果已经缓存了 CSRF token，直接返回 Promise.resolve
        if (csrfTokenCache) {
            return Promise.resolve(csrfTokenCache);
        }

        // 如果当前正在获取 CSRF token，返回同一个 Promise，避免并发请求
        if (tokenFetchPromise) {
            return tokenFetchPromise;
        }

        // 发起请求获取 CSRF token，并缓存结果
        tokenFetchPromise = fetch('/libs/granite/csrf/token.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch CSRF token');
                }
                return response.json();
            })
            .then(data => {
                csrfTokenCache = data.token;  // 缓存 token
                return csrfTokenCache;
            })
            .catch(error => {
                console.error('Error fetching CSRF token:', error);
                throw error;
            })
            .finally(() => {
                // 无论成功或失败，重置 tokenFetchPromise
                tokenFetchPromise = null;
            });

        return tokenFetchPromise;
    }

    // 处理请求的方法GET、POST
    function csrfFetch(url, options = {}) {
        // 如果请求不需要 headers，初始化为空对象
        const headers = options.headers || {};

        // 在 headers 中添加 CSRF token
        headers['Content-Type'] = 'application/json';

        // 检查是否使用 FormData
        if (options.body instanceof FormData) {
            // 不需要设置 Content-Type，因为 FormData 会自动设置
            delete headers['Content-Type']; 
        } else {
            // 如果不是 FormData，设置为 JSON
            headers['Content-Type'] = 'application/json'; 
            options.body = JSON.stringify(options.body);
        }

        // 构造新的请求参数
        const fetchOptions = {
            ...options,
            headers: headers
        };

        return fetch(url, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    // 如果请求失败，可能是因为 token 失效，清除缓存
                    csrfTokenCache = null;
                    throw new Error(`Request failed with status ${response.status}`);
                }
                return response;
            })
            .catch(error => {
                console.error('Error in csrfFetch:', error);
                throw error;
            });
    }



    // 获取页面参数
    function getQueryParam(url, key) {
        const params = new URLSearchParams(new URL(url).search);
        return params.get(key);
    }

    // 设置--vh 参数值，防止editor模式页面无限加载
    !(function (n,e) {
        var i = 'orientationchange' in window ? 'orientationchange' : 'resize';
        var timeout = null;
        var num = 0;
        function setViewHeight() {
            var windowH = e.innerHeight / 100;
            n.documentElement.style.setProperty('--vh', windowH+ 'px');
        }
        function setVhListener(){
            if (window.isPublish == 'true') {
                e.addEventListener(i,setViewHeight);
                clearTimeout(timeout);
            }else {
                num ++;
                // 防止author端一直调用
                if (num < 5) {
                    timeout = setTimeout(setVhListener,3000);
                }
            }
        }
        function initVh() {
            setViewHeight();
            setVhListener();
        }
        n.addEventListener('DOMContentLoaded',initVh());
        
    })(document,window)

    // 短链接
    !(function (n,e) {
        function setAtag() {
            var aTags = document.querySelectorAll("a");
            aTags.forEach(item =>{
                var currentLink = item.getAttribute("href");
                if (currentLink != null && currentLink.includes('/content/segway-ninebot')
                    && (location.href.includes('stg.ninebot.com')
                    || location.href.includes('stg.segway.com')
                    || location.href.includes('www.ninebot.com')
                    || location.href.includes('stg-press.ninebot.com')
                    || location.href.includes('stg-press.segway.com')
                    || location.href.includes('www.segway.com')
                    || location.href.includes('us-en.segway.com'))) {
                    var modifiedLink = currentLink.replace('/content/segway-ninebot', '');
                    if (modifiedLink.includes('/cn/zh_cn/ninebot.html')) {
                        modifiedLink = modifiedLink.replace('/cn/zh_cn/ninebot.html', '');
                        if (modifiedLink == '') {
                            modifiedLink = "https://" + window.location.host;
                        }
                        item.setAttribute('href', modifiedLink);
                    }else if (modifiedLink.includes('/cn/zh_cn/ninebot')) {
                        modifiedLink = modifiedLink.replace('/cn/zh_cn/ninebot', '');
                        item.setAttribute('href', modifiedLink);
                    }
                    else if (modifiedLink.includes('/cn/zh_cn')) {
                        modifiedLink = modifiedLink.replace('/cn/zh_cn', '');
                        item.setAttribute('href', modifiedLink);
                    }else if (modifiedLink.includes('/us/en/segway.html')) {
                        modifiedLink = modifiedLink.replace('/us/en/segway.html', '');
                        if (modifiedLink == '') {
                            modifiedLink = "https://" + window.location.host;
                        }
                        item.setAttribute('href', modifiedLink);
                    }
                    else if (modifiedLink.includes('/us/en/segway')) {
                        modifiedLink = modifiedLink.replace('/us/en/segway', '');
                        item.setAttribute('href', modifiedLink);
                    }
                }
            })
        }
        n.addEventListener('DOMContentLoaded',function (){setTimeout(function (){setAtag()},2000)});
    })(document,window)
    // 视频标签添加属性
    !(function (n,e) {
        function setVideoAttribute() {
            let $video = document.querySelectorAll("video")
            if($video.length > 0 ){
                $video.forEach(item =>{
                    if(item.getAttribute("autoplay") === "autoplay" || item.getAttribute("autoplay") == ""){
                        item.setAttribute("playsinline","");
                        item.setAttribute("x5-playsinline","");
                        item.setAttribute("webkit-playsinline","");
                        item.setAttribute("x-webkit-airplay","allow");
                        item.setAttribute("preload","auto");
                    }
                })
            }
        }
        n.addEventListener('DOMContentLoaded',setVideoAttribute);
    })(document,window)
    // 动态修改favicon
    !(function (n,e) {
        function updateFavicon() {
            const favicon = document.getElementById('favicon');
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                favicon.href = '/etc.clientlibs/segway-ninebot/clientlibs/clientlib-base/img/resources/favicon_white.svg'; // 深色模式图标
            } else {
                favicon.href = '/etc.clientlibs/segway-ninebot/clientlibs/clientlib-base/img/resources/favicon_black.svg'; // 亮色模式图标
            }
        }
        // 初始调用
        updateFavicon();
        // 监听主题变化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateFavicon);
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', updateFavicon);
        n.addEventListener('DOMContentLoaded',updateFavicon);
    })(document,window)
/*! jQuery v2.1.4 | (c) 2005, 2015 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l=a.document,m="2.1.4",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return n.each(this,a,b)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(n.isPlainObject(d)||(e=n.isArray(d)))?(e?(e=!1,f=c&&n.isArray(c)?c:[]):f=c&&n.isPlainObject(c)?c:{},g[b]=n.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray,isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){return!n.isArray(a)&&a-parseFloat(a)+1>=0},isPlainObject:function(a){return"object"!==n.type(a)||a.nodeType||n.isWindow(a)?!1:a.constructor&&!j.call(a.constructor.prototype,"isPrototypeOf")?!1:!0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(a){var b,c=eval;a=n.trim(a),a&&(1===a.indexOf("use strict")?(b=l.createElement("script"),b.text=a,l.head.appendChild(b).parentNode.removeChild(b)):c(a))},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=s(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:g.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;c>d;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=s(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(c=a[b],b=a,a=c),n.isFunction(a)?(e=d.call(arguments,2),f=function(){return a.apply(b||this,e.concat(d.call(arguments)))},f.guid=a.guid=a.guid||n.guid++,f):void 0},now:Date.now,support:k}),n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function s(a){var b="length"in a&&a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=ha(),z=ha(),A=ha(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N=M.replace("w","w#"),O="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+N+"))|)"+L+"*\\]",P=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+O+")*)|.*)\\)|)",Q=new RegExp(L+"+","g"),R=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),S=new RegExp("^"+L+"*,"+L+"*"),T=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),U=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),V=new RegExp(P),W=new RegExp("^"+N+"$"),X={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M.replace("w","w*")+")"),ATTR:new RegExp("^"+O),PSEUDO:new RegExp("^"+P),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,aa=/[+~]/,ba=/'|\\/g,ca=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),da=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},ea=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(fa){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function ga(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],k=b.nodeType,"string"!=typeof a||!a||1!==k&&9!==k&&11!==k)return d;if(!e&&p){if(11!==k&&(f=_.exec(a)))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return H.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName)return H.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=1!==k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(ba,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+ra(o[l]);w=aa.test(a)&&pa(b.parentNode)||b,x=o.join(",")}if(x)try{return H.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function ha(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ia(a){return a[u]=!0,a}function ja(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function ka(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function la(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function ma(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function na(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function oa(a){return ia(function(b){return b=+b,ia(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function pa(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=ga.support={},f=ga.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=ga.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=g.documentElement,e=g.defaultView,e&&e!==e.top&&(e.addEventListener?e.addEventListener("unload",ea,!1):e.attachEvent&&e.attachEvent("onunload",ea)),p=!f(g),c.attributes=ja(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ja(function(a){return a.appendChild(g.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(g.getElementsByClassName),c.getById=ja(function(a){return o.appendChild(a).id=u,!g.getElementsByName||!g.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(ca,da);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(ca,da);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(g.querySelectorAll))&&(ja(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\f]' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),ja(function(a){var b=g.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ja(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",P)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===g||a.ownerDocument===v&&t(v,a)?-1:b===g||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,h=[a],i=[b];if(!e||!f)return a===g?-1:b===g?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return la(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?la(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},g):n},ga.matches=function(a,b){return ga(a,null,null,b)},ga.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return ga(b,n,null,[a]).length>0},ga.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},ga.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},ga.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},ga.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=ga.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=ga.selectors={cacheLength:50,createPseudo:ia,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(ca,da),a[3]=(a[3]||a[4]||a[5]||"").replace(ca,da),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||ga.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&ga.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(ca,da).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=ga.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(Q," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||ga.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ia(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ia(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?ia(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ia(function(a){return function(b){return ga(a,b).length>0}}),contains:ia(function(a){return a=a.replace(ca,da),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ia(function(a){return W.test(a||"")||ga.error("unsupported lang: "+a),a=a.replace(ca,da).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:oa(function(){return[0]}),last:oa(function(a,b){return[b-1]}),eq:oa(function(a,b,c){return[0>c?c+b:c]}),even:oa(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:oa(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:oa(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:oa(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=ma(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=na(b);function qa(){}qa.prototype=d.filters=d.pseudos,d.setFilters=new qa,g=ga.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?ga.error(a):z(a,i).slice(0)};function ra(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function sa(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function ta(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ua(a,b,c){for(var d=0,e=b.length;e>d;d++)ga(a,b[d],c);return c}function va(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function wa(a,b,c,d,e,f){return d&&!d[u]&&(d=wa(d)),e&&!e[u]&&(e=wa(e,f)),ia(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ua(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:va(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=va(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=va(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function xa(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=sa(function(a){return a===b},h,!0),l=sa(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[sa(ta(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return wa(i>1&&ta(m),i>1&&ra(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&xa(a.slice(i,e)),f>e&&xa(a=a.slice(e)),f>e&&ra(a))}m.push(c)}return ta(m)}function ya(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=F.call(i));s=va(s)}H.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&ga.uniqueSort(i)}return k&&(w=v,j=t),r};return c?ia(f):f}return h=ga.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=xa(b[c]),f[u]?d.push(f):e.push(f);f=A(a,ya(e,d)),f.selector=a}return f},i=ga.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(ca,da),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(ca,da),aa.test(j[0].type)&&pa(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&ra(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,aa.test(a)&&pa(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ja(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ja(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||ka("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ja(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||ka("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ja(function(a){return null==a.getAttribute("disabled")})||ka(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),ga}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=n.expr.match.needsContext,v=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,w=/^.[^:#\[\.,]*$/;function x(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(w.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return g.call(b,a)>=0!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=this.length,d=[],e=this;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;c>b;b++)if(n.contains(e[b],this))return!0}));for(b=0;c>b;b++)n.find(a,e[b],d);return d=this.pushStack(c>1?n.unique(d):d),d.selector=this.selector?this.selector+" "+a:a,d},filter:function(a){return this.pushStack(x(this,a||[],!1))},not:function(a){return this.pushStack(x(this,a||[],!0))},is:function(a){return!!x(this,"string"==typeof a&&u.test(a)?n(a):a||[],!1).length}});var y,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=n.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||y).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:l,!0)),v.test(c[1])&&n.isPlainObject(b))for(c in b)n.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}return d=l.getElementById(c[2]),d&&d.parentNode&&(this.length=1,this[0]=d),this.context=l,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?"undefined"!=typeof y.ready?y.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};A.prototype=n.fn,y=n(l);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};n.extend({dir:function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),n.fn.extend({has:function(a){var b=n(a,this),c=b.length;return this.filter(function(){for(var a=0;c>a;a++)if(n.contains(this,b[a]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=u.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.unique(f):f)},index:function(a){return a?"string"==typeof a?g.call(n(a),this[0]):g.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.unique(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){while((a=a[b])&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return n.dir(a,"parentNode")},parentsUntil:function(a,b,c){return n.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return n.dir(a,"nextSibling")},prevAll:function(a){return n.dir(a,"previousSibling")},nextUntil:function(a,b,c){return n.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return n.dir(a,"previousSibling",c)},siblings:function(a){return n.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return n.sibling(a.firstChild)},contents:function(a){return a.contentDocument||n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(C[a]||n.unique(e),B.test(a)&&e.reverse()),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return n.each(a.match(E)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):n.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(b=a.memory&&l,c=!0,g=e||0,e=0,f=h.length,d=!0;h&&f>g;g++)if(h[g].apply(l[0],l[1])===!1&&a.stopOnFalse){b=!1;break}d=!1,h&&(i?i.length&&j(i.shift()):b?h=[]:k.disable())},k={add:function(){if(h){var c=h.length;!function g(b){n.each(b,function(b,c){var d=n.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&g(c)})}(arguments),d?f=h.length:b&&(e=c,j(b))}return this},remove:function(){return h&&n.each(arguments,function(a,b){var c;while((c=n.inArray(b,h,c))>-1)h.splice(c,1),d&&(f>=c&&f--,g>=c&&g--)}),this},has:function(a){return a?n.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],f=0,this},disable:function(){return h=i=b=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,b||k.disable(),this},locked:function(){return!i},fireWith:function(a,b){return!h||c&&!i||(b=b||[],b=[a,b.slice?b.slice():b],d?i.push(b):j(b)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!c}};return k},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&n.isFunction(a.promise)?e:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(H.resolveWith(l,[n]),n.fn.triggerHandler&&(n(l).triggerHandler("ready"),n(l).off("ready"))))}});function I(){l.removeEventListener("DOMContentLoaded",I,!1),a.removeEventListener("load",I,!1),n.ready()}n.ready.promise=function(b){return H||(H=n.Deferred(),"complete"===l.readyState?setTimeout(n.ready):(l.addEventListener("DOMContentLoaded",I,!1),a.addEventListener("load",I,!1))),H.promise(b)},n.ready.promise();var J=n.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)n.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f};n.acceptData=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function K(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=n.expando+K.uid++}K.uid=1,K.accepts=n.acceptData,K.prototype={key:function(a){if(!K.accepts(a))return 0;var b={},c=a[this.expando];if(!c){c=K.uid++;try{b[this.expando]={value:c},Object.defineProperties(a,b)}catch(d){b[this.expando]=c,n.extend(a,b)}}return this.cache[c]||(this.cache[c]={}),c},set:function(a,b,c){var d,e=this.key(a),f=this.cache[e];if("string"==typeof b)f[b]=c;else if(n.isEmptyObject(f))n.extend(this.cache[e],b);else for(d in b)f[d]=b[d];return f},get:function(a,b){var c=this.cache[this.key(a)];return void 0===b?c:c[b]},access:function(a,b,c){var d;return void 0===b||b&&"string"==typeof b&&void 0===c?(d=this.get(a,b),void 0!==d?d:this.get(a,n.camelCase(b))):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d,e,f=this.key(a),g=this.cache[f];if(void 0===b)this.cache[f]={};else{n.isArray(b)?d=b.concat(b.map(n.camelCase)):(e=n.camelCase(b),b in g?d=[b,e]:(d=e,d=d in g?[d]:d.match(E)||[])),c=d.length;while(c--)delete g[d[c]]}},hasData:function(a){return!n.isEmptyObject(this.cache[a[this.expando]]||{})},discard:function(a){a[this.expando]&&delete this.cache[a[this.expando]]}};var L=new K,M=new K,N=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,O=/([A-Z])/g;function P(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(O,"-$1").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:N.test(c)?n.parseJSON(c):c}catch(e){}M.set(a,b,c)}else c=void 0;return c}n.extend({hasData:function(a){return M.hasData(a)||L.hasData(a)},data:function(a,b,c){
return M.access(a,b,c)},removeData:function(a,b){M.remove(a,b)},_data:function(a,b,c){return L.access(a,b,c)},_removeData:function(a,b){L.remove(a,b)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=M.get(f),1===f.nodeType&&!L.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),P(f,d,e[d])));L.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){M.set(this,a)}):J(this,function(b){var c,d=n.camelCase(a);if(f&&void 0===b){if(c=M.get(f,a),void 0!==c)return c;if(c=M.get(f,d),void 0!==c)return c;if(c=P(f,d,void 0),void 0!==c)return c}else this.each(function(){var c=M.get(this,d);M.set(this,d,b),-1!==a.indexOf("-")&&void 0!==c&&M.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){M.remove(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=L.get(a,b),c&&(!d||n.isArray(c)?d=L.access(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return L.get(a,c)||L.access(a,c,{empty:n.Callbacks("once memory").add(function(){L.remove(a,[b+"queue",c])})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=L.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var Q=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,R=["Top","Right","Bottom","Left"],S=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)},T=/^(?:checkbox|radio)$/i;!function(){var a=l.createDocumentFragment(),b=a.appendChild(l.createElement("div")),c=l.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var U="undefined";k.focusinBubbles="onfocusin"in a;var V=/^key/,W=/^(?:mouse|pointer|contextmenu)|click/,X=/^(?:focusinfocus|focusoutblur)$/,Y=/^([^.]*)(?:\.(.+)|)$/;function Z(){return!0}function $(){return!1}function _(){try{return l.activeElement}catch(a){}}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.get(a);if(r){c.handler&&(f=c,c=f.handler,e=f.selector),c.guid||(c.guid=n.guid++),(i=r.events)||(i=r.events={}),(g=r.handle)||(g=r.handle=function(b){return typeof n!==U&&n.event.triggered!==b.type?n.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(E)||[""],j=b.length;while(j--)h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o&&(l=n.event.special[o]||{},o=(e?l.delegateType:l.bindType)||o,l=n.event.special[o]||{},k=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},f),(m=i[o])||(m=i[o]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,p,g)!==!1||a.addEventListener&&a.addEventListener(o,g,!1)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),n.event.global[o]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=L.hasData(a)&&L.get(a);if(r&&(i=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=Y.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=i[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&q!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete i[o])}else for(o in i)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(i)&&(delete r.handle,L.remove(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,m,o,p=[d||l],q=j.call(b,"type")?b.type:b,r=j.call(b,"namespace")?b.namespace.split("."):[];if(g=h=d=d||l,3!==d.nodeType&&8!==d.nodeType&&!X.test(q+n.event.triggered)&&(q.indexOf(".")>=0&&(r=q.split("."),q=r.shift(),r.sort()),k=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=r.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:n.makeArray(c,[b]),o=n.event.special[q]||{},e||!o.trigger||o.trigger.apply(d,c)!==!1)){if(!e&&!o.noBubble&&!n.isWindow(d)){for(i=o.delegateType||q,X.test(i+q)||(g=g.parentNode);g;g=g.parentNode)p.push(g),h=g;h===(d.ownerDocument||l)&&p.push(h.defaultView||h.parentWindow||a)}f=0;while((g=p[f++])&&!b.isPropagationStopped())b.type=f>1?i:o.bindType||q,m=(L.get(g,"events")||{})[b.type]&&L.get(g,"handle"),m&&m.apply(g,c),m=k&&g[k],m&&m.apply&&n.acceptData(g)&&(b.result=m.apply(g,c),b.result===!1&&b.preventDefault());return b.type=q,e||b.isDefaultPrevented()||o._default&&o._default.apply(p.pop(),c)!==!1||!n.acceptData(d)||k&&n.isFunction(d[q])&&!n.isWindow(d)&&(h=d[k],h&&(d[k]=null),n.event.triggered=q,d[q](),n.event.triggered=void 0,h&&(d[k]=h)),b.result}},dispatch:function(a){a=n.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(L.get(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(g.namespace))&&(a.handleObj=g,a.data=g.data,e=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==e&&(a.result=e)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!==this;i=i.parentNode||this)if(i.disabled!==!0||"click"!==a.type){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>=0:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button;return null==a.pageX&&null!=b.clientX&&(c=a.target.ownerDocument||l,d=c.documentElement,e=c.body,a.pageX=b.clientX+(d&&d.scrollLeft||e&&e.scrollLeft||0)-(d&&d.clientLeft||e&&e.clientLeft||0),a.pageY=b.clientY+(d&&d.scrollTop||e&&e.scrollTop||0)-(d&&d.clientTop||e&&e.clientTop||0)),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=W.test(e)?this.mouseHooks:V.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new n.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=l),3===a.target.nodeType&&(a.target=a.target.parentNode),g.filter?g.filter(a,f):a},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==_()&&this.focus?(this.focus(),!1):void 0},delegateType:"focusin"},blur:{trigger:function(){return this===_()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&n.nodeName(this,"input")?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=n.extend(new n.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?n.event.trigger(e,null,b):n.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},n.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?Z:$):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={isDefaultPrevented:$,isPropagationStopped:$,isImmediatePropagationStopped:$,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=Z,a&&a.preventDefault&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=Z,a&&a.stopPropagation&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=Z,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!n.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.focusinBubbles||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a),!0)};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=L.access(d,b);e||d.addEventListener(a,c,!0),L.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=L.access(d,b)-1;e?L.access(d,b,e):(d.removeEventListener(a,c,!0),L.remove(d,b))}}}),n.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(g in a)this.on(g,b,c,a[g],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=$;else if(!d)return this;return 1===e&&(f=d,d=function(a){return n().off(a),f.apply(this,arguments)},d.guid=f.guid||(f.guid=n.guid++)),this.each(function(){n.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=$),this.each(function(){n.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}});var aa=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,ba=/<([\w:]+)/,ca=/<|&#?\w+;/,da=/<(?:script|style|link)/i,ea=/checked\s*(?:[^=]|=\s*.checked.)/i,fa=/^$|\/(?:java|ecma)script/i,ga=/^true\/(.*)/,ha=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,ia={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};ia.optgroup=ia.option,ia.tbody=ia.tfoot=ia.colgroup=ia.caption=ia.thead,ia.th=ia.td;function ja(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function ka(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function la(a){var b=ga.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function ma(a,b){for(var c=0,d=a.length;d>c;c++)L.set(a[c],"globalEval",!b||L.get(b[c],"globalEval"))}function na(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(L.hasData(a)&&(f=L.access(a),g=L.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;d>c;c++)n.event.add(b,e,j[e][c])}M.hasData(a)&&(h=M.access(a),i=n.extend({},h),M.set(b,i))}}function oa(a,b){var c=a.getElementsByTagName?a.getElementsByTagName(b||"*"):a.querySelectorAll?a.querySelectorAll(b||"*"):[];return void 0===b||b&&n.nodeName(a,b)?n.merge([a],c):c}function pa(a,b){var c=b.nodeName.toLowerCase();"input"===c&&T.test(a.type)?b.checked=a.checked:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}n.extend({clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=n.contains(a.ownerDocument,a);if(!(k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(g=oa(h),f=oa(a),d=0,e=f.length;e>d;d++)pa(f[d],g[d]);if(b)if(c)for(f=f||oa(a),g=g||oa(h),d=0,e=f.length;e>d;d++)na(f[d],g[d]);else na(a,h);return g=oa(h,"script"),g.length>0&&ma(g,!i&&oa(a,"script")),h},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,k=b.createDocumentFragment(),l=[],m=0,o=a.length;o>m;m++)if(e=a[m],e||0===e)if("object"===n.type(e))n.merge(l,e.nodeType?[e]:e);else if(ca.test(e)){f=f||k.appendChild(b.createElement("div")),g=(ba.exec(e)||["",""])[1].toLowerCase(),h=ia[g]||ia._default,f.innerHTML=h[1]+e.replace(aa,"<$1></$2>")+h[2],j=h[0];while(j--)f=f.lastChild;n.merge(l,f.childNodes),f=k.firstChild,f.textContent=""}else l.push(b.createTextNode(e));k.textContent="",m=0;while(e=l[m++])if((!d||-1===n.inArray(e,d))&&(i=n.contains(e.ownerDocument,e),f=oa(k.appendChild(e),"script"),i&&ma(f),c)){j=0;while(e=f[j++])fa.test(e.type||"")&&c.push(e)}return k},cleanData:function(a){for(var b,c,d,e,f=n.event.special,g=0;void 0!==(c=a[g]);g++){if(n.acceptData(c)&&(e=c[L.expando],e&&(b=L.cache[e]))){if(b.events)for(d in b.events)f[d]?n.event.remove(c,d):n.removeEvent(c,d,b.handle);L.cache[e]&&delete L.cache[e]}delete M.cache[c[M.expando]]}}}),n.fn.extend({text:function(a){return J(this,function(a){return void 0===a?n.text(this):this.empty().each(function(){(1===this.nodeType||11===this.nodeType||9===this.nodeType)&&(this.textContent=a)})},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=ja(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=ja(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?n.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||n.cleanData(oa(c)),c.parentNode&&(b&&n.contains(c.ownerDocument,c)&&ma(oa(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(n.cleanData(oa(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return J(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!da.test(a)&&!ia[(ba.exec(a)||["",""])[1].toLowerCase()]){a=a.replace(aa,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(oa(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,n.cleanData(oa(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,m=this,o=l-1,p=a[0],q=n.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&ea.test(p))return this.each(function(c){var d=m.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(c=n.buildFragment(a,this[0].ownerDocument,!1,this),d=c.firstChild,1===c.childNodes.length&&(c=d),d)){for(f=n.map(oa(c,"script"),ka),g=f.length;l>j;j++)h=c,j!==o&&(h=n.clone(h,!0,!0),g&&n.merge(f,oa(h,"script"))),b.call(this[j],h,j);if(g)for(i=f[f.length-1].ownerDocument,n.map(f,la),j=0;g>j;j++)h=f[j],fa.test(h.type||"")&&!L.access(h,"globalEval")&&n.contains(i,h)&&(h.src?n._evalUrl&&n._evalUrl(h.src):n.globalEval(h.textContent.replace(ha,"")))}return this}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=[],e=n(a),g=e.length-1,h=0;g>=h;h++)c=h===g?this:this.clone(!0),n(e[h])[b](c),f.apply(d,c.get());return this.pushStack(d)}});var qa,ra={};function sa(b,c){var d,e=n(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:n.css(e[0],"display");return e.detach(),f}function ta(a){var b=l,c=ra[a];return c||(c=sa(a,b),"none"!==c&&c||(qa=(qa||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=qa[0].contentDocument,b.write(),b.close(),c=sa(a,b),qa.detach()),ra[a]=c),c}var ua=/^margin/,va=new RegExp("^("+Q+")(?!px)[a-z%]+$","i"),wa=function(b){return b.ownerDocument.defaultView.opener?b.ownerDocument.defaultView.getComputedStyle(b,null):a.getComputedStyle(b,null)};function xa(a,b,c){var d,e,f,g,h=a.style;return c=c||wa(a),c&&(g=c.getPropertyValue(b)||c[b]),c&&(""!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),va.test(g)&&ua.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0!==g?g+"":g}function ya(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d=l.documentElement,e=l.createElement("div"),f=l.createElement("div");if(f.style){f.style.backgroundClip="content-box",f.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===f.style.backgroundClip,e.style.cssText="border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;position:absolute",e.appendChild(f);function g(){f.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",f.innerHTML="",d.appendChild(e);var g=a.getComputedStyle(f,null);b="1%"!==g.top,c="4px"===g.width,d.removeChild(e)}a.getComputedStyle&&n.extend(k,{pixelPosition:function(){return g(),b},boxSizingReliable:function(){return null==c&&g(),c},reliableMarginRight:function(){var b,c=f.appendChild(l.createElement("div"));return c.style.cssText=f.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",c.style.marginRight=c.style.width="0",f.style.width="1px",d.appendChild(e),b=!parseFloat(a.getComputedStyle(c,null).marginRight),d.removeChild(e),f.removeChild(c),b}})}}(),n.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var za=/^(none|table(?!-c[ea]).+)/,Aa=new RegExp("^("+Q+")(.*)$","i"),Ba=new RegExp("^([+-])=("+Q+")","i"),Ca={position:"absolute",visibility:"hidden",display:"block"},Da={letterSpacing:"0",fontWeight:"400"},Ea=["Webkit","O","Moz","ms"];function Fa(a,b){if(b in a)return b;var c=b[0].toUpperCase()+b.slice(1),d=b,e=Ea.length;while(e--)if(b=Ea[e]+c,b in a)return b;return d}function Ga(a,b,c){var d=Aa.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Ha(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+R[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+R[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+R[f]+"Width",!0,e))):(g+=n.css(a,"padding"+R[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+R[f]+"Width",!0,e)));return g}function Ia(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=wa(a),g="border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=xa(a,b,f),(0>e||null==e)&&(e=a.style[b]),va.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Ha(a,b,c||(g?"border":"content"),d,f)+"px"}function Ja(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=L.get(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&S(d)&&(f[g]=L.access(d,"olddisplay",ta(d.nodeName)))):(e=S(d),"none"===c&&e||L.set(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=xa(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;return b=n.cssProps[h]||(n.cssProps[h]=Fa(i,h)),g=n.cssHooks[b]||n.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b]:(f=typeof c,"string"===f&&(e=Ba.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(n.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||n.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=Fa(a.style,h)),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=xa(a,b,d)),"normal"===e&&b in Da&&(e=Da[b]),""===c||c?(f=parseFloat(e),c===!0||n.isNumeric(f)?f||0:e):e}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?za.test(n.css(a,"display"))&&0===a.offsetWidth?n.swap(a,Ca,function(){return Ia(a,b,d)}):Ia(a,b,d):void 0},set:function(a,c,d){var e=d&&wa(a);return Ga(a,c,d?Ha(a,b,d,"border-box"===n.css(a,"boxSizing",!1,e),e):0)}}}),n.cssHooks.marginRight=ya(k.reliableMarginRight,function(a,b){return b?n.swap(a,{display:"inline-block"},xa,[a,"marginRight"]):void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+R[d]+b]=f[d]||f[d-2]||f[0];return e}},ua.test(a)||(n.cssHooks[a+b].set=Ga)}),n.fn.extend({css:function(a,b){return J(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=wa(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return Ja(this,!0)},hide:function(){return Ja(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){S(this)?n(this).show():n(this).hide()})}});function Ka(a,b,c,d,e){return new Ka.prototype.init(a,b,c,d,e)}n.Tween=Ka,Ka.prototype={constructor:Ka,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Ka.propHooks[this.prop];return a&&a.get?a.get(this):Ka.propHooks._default.get(this)},run:function(a){var b,c=Ka.propHooks[this.prop];return this.options.duration?this.pos=b=n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):this.pos=b=a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Ka.propHooks._default.set(this),this}},Ka.prototype.init.prototype=Ka.prototype,Ka.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[n.cssProps[a.prop]]||n.cssHooks[a.prop])?n.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Ka.propHooks.scrollTop=Ka.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},n.fx=Ka.prototype.init,n.fx.step={};var La,Ma,Na=/^(?:toggle|show|hide)$/,Oa=new RegExp("^(?:([+-])=|)("+Q+")([a-z%]*)$","i"),Pa=/queueHooks$/,Qa=[Va],Ra={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=Oa.exec(b),f=e&&e[3]||(n.cssNumber[a]?"":"px"),g=(n.cssNumber[a]||"px"!==f&&+d)&&Oa.exec(n.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,n.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function Sa(){return setTimeout(function(){La=void 0}),La=n.now()}function Ta(a,b){var c,d=0,e={height:a};for(b=b?1:0;4>d;d+=2-b)c=R[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function Ua(a,b,c){for(var d,e=(Ra[b]||[]).concat(Ra["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function Va(a,b,c){var d,e,f,g,h,i,j,k,l=this,m={},o=a.style,p=a.nodeType&&S(a),q=L.get(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,l.always(function(){l.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=n.css(a,"display"),k="none"===j?L.get(a,"olddisplay")||ta(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(o.display="inline-block")),c.overflow&&(o.overflow="hidden",l.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],Na.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}m[d]=q&&q[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(m))"inline"===("none"===j?ta(a.nodeName):j)&&(o.display=j);else{q?"hidden"in q&&(p=q.hidden):q=L.access(a,"fxshow",{}),f&&(q.hidden=!p),p?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;L.remove(a,"fxshow");for(b in m)n.style(a,b,m[b])});for(d in m)g=Ua(p?q[d]:0,d,l),d in q||(q[d]=g.start,p&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function Wa(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function Xa(a,b,c){var d,e,f=0,g=Qa.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=La||Sa(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:La||Sa(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(Wa(k,j.opts.specialEasing);g>f;f++)if(d=Qa[f].call(j,a,k,j.opts))return d;return n.map(k,Ua,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(Xa,{tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],Ra[c]=Ra[c]||[],Ra[c].unshift(b)},prefilter:function(a,b){b?Qa.unshift(a):Qa.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(S).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=Xa(this,n.extend({},a),f);(e||L.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=L.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&Pa.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=L.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(Ta(b,!0),a,d,e)}}),n.each({slideDown:Ta("show"),slideUp:Ta("hide"),slideToggle:Ta("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=0,c=n.timers;for(La=n.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||n.fx.stop(),La=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){Ma||(Ma=setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){clearInterval(Ma),Ma=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(a,b){return a=n.fx?n.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a=l.createElement("input"),b=l.createElement("select"),c=b.appendChild(l.createElement("option"));a.type="checkbox",k.checkOn=""!==a.value,k.optSelected=c.selected,b.disabled=!0,k.optDisabled=!c.disabled,a=l.createElement("input"),a.value="t",a.type="radio",k.radioValue="t"===a.value}();var Ya,Za,$a=n.expr.attrHandle;n.fn.extend({attr:function(a,b){return J(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===U?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),d=n.attrHooks[b]||(n.expr.match.bool.test(b)?Za:Ya)),
void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=n.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void n.removeAttr(a,b))},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)&&(a[d]=!1),a.removeAttribute(c)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),Za={set:function(a,b,c){return b===!1?n.removeAttr(a,c):a.setAttribute(c,c),c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=$a[b]||n.find.attr;$a[b]=function(a,b,d){var e,f;return d||(f=$a[b],$a[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,$a[b]=f),e}});var _a=/^(?:input|select|textarea|button)$/i;n.fn.extend({prop:function(a,b){return J(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[n.propFix[a]||a]})}}),n.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!n.isXMLDoc(a),f&&(b=n.propFix[b]||b,e=n.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){return a.hasAttribute("tabindex")||_a.test(a.nodeName)||a.href?a.tabIndex:-1}}}}),k.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this});var ab=/[\t\r\n\f]/g;n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h="string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ab," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=n.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0===arguments.length||"string"==typeof a&&a,i=0,j=this.length;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,this.className))});if(h)for(b=(a||"").match(E)||[];j>i;i++)if(c=this[i],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(ab," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?n.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(n.isFunction(a)?function(c){n(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=n(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===U||"boolean"===c)&&(this.className&&L.set(this,"__className__",this.className),this.className=this.className||a===!1?"":L.get(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(ab," ").indexOf(b)>=0)return!0;return!1}});var bb=/\r/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(bb,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=n.inArray(d.value,f)>=0)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>=0:void 0}},k.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var cb=n.now(),db=/\?/;n.parseJSON=function(a){return JSON.parse(a+"")},n.parseXML=function(a){var b,c;if(!a||"string"!=typeof a)return null;try{c=new DOMParser,b=c.parseFromString(a,"text/xml")}catch(d){b=void 0}return(!b||b.getElementsByTagName("parsererror").length)&&n.error("Invalid XML: "+a),b};var eb=/#.*$/,fb=/([?&])_=[^&]*/,gb=/^(.*?):[ \t]*([^\r\n]*)$/gm,hb=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,ib=/^(?:GET|HEAD)$/,jb=/^\/\//,kb=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,lb={},mb={},nb="*/".concat("*"),ob=a.location.href,pb=kb.exec(ob.toLowerCase())||[];function qb(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(n.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function rb(a,b,c,d){var e={},f=a===mb;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function sb(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&n.extend(!0,a,d),a}function tb(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function ub(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:ob,type:"GET",isLocal:hb.test(pb[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":nb,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?sb(sb(a,n.ajaxSettings),b):sb(n.ajaxSettings,a)},ajaxPrefilter:qb(lb),ajaxTransport:qb(mb),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=n.ajaxSetup({},b),l=k.context||k,m=k.context&&(l.nodeType||l.jquery)?n(l):n.event,o=n.Deferred(),p=n.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!f){f={};while(b=gb.exec(e))f[b[1].toLowerCase()]=b[2]}b=f[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?e:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return c&&c.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||ob)+"").replace(eb,"").replace(jb,pb[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=n.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(h=kb.exec(k.url.toLowerCase()),k.crossDomain=!(!h||h[1]===pb[1]&&h[2]===pb[2]&&(h[3]||("http:"===h[1]?"80":"443"))===(pb[3]||("http:"===pb[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=n.param(k.data,k.traditional)),rb(lb,k,b,v),2===t)return v;i=n.event&&k.global,i&&0===n.active++&&n.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!ib.test(k.type),d=k.url,k.hasContent||(k.data&&(d=k.url+=(db.test(d)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=fb.test(d)?d.replace(fb,"$1_="+cb++):d+(db.test(d)?"&":"?")+"_="+cb++)),k.ifModified&&(n.lastModified[d]&&v.setRequestHeader("If-Modified-Since",n.lastModified[d]),n.etag[d]&&v.setRequestHeader("If-None-Match",n.etag[d])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+nb+"; q=0.01":""):k.accepts["*"]);for(j in k.headers)v.setRequestHeader(j,k.headers[j]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(j in{success:1,error:1,complete:1})v[j](k[j]);if(c=rb(mb,k,b,v)){v.readyState=1,i&&m.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,c.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,f,h){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),c=void 0,e=h||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,f&&(u=tb(k,v,f)),u=ub(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(n.lastModified[d]=w),w=v.getResponseHeader("etag"),w&&(n.etag[d]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,i&&m.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),i&&(m.trigger("ajaxComplete",[v,k]),--n.active||n.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){var b;return n.isFunction(a)?this.each(function(b){n(this).wrapAll(a.call(this,b))}):(this[0]&&(b=n(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this)},wrapInner:function(a){return this.each(n.isFunction(a)?function(b){n(this).wrapInner(a.call(this,b))}:function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}}),n.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0},n.expr.filters.visible=function(a){return!n.expr.filters.hidden(a)};var vb=/%20/g,wb=/\[\]$/,xb=/\r?\n/g,yb=/^(?:submit|button|image|reset|file)$/i,zb=/^(?:input|select|textarea|keygen)/i;function Ab(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||wb.test(a)?d(a,e):Ab(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)Ab(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)Ab(c,a[c],b,e);return d.join("&").replace(vb,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&zb.test(this.nodeName)&&!yb.test(a)&&(this.checked||!T.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(xb,"\r\n")}}):{name:b.name,value:c.replace(xb,"\r\n")}}).get()}}),n.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(a){}};var Bb=0,Cb={},Db={0:200,1223:204},Eb=n.ajaxSettings.xhr();a.attachEvent&&a.attachEvent("onunload",function(){for(var a in Cb)Cb[a]()}),k.cors=!!Eb&&"withCredentials"in Eb,k.ajax=Eb=!!Eb,n.ajaxTransport(function(a){var b;return k.cors||Eb&&!a.crossDomain?{send:function(c,d){var e,f=a.xhr(),g=++Bb;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)f.setRequestHeader(e,c[e]);b=function(a){return function(){b&&(delete Cb[g],b=f.onload=f.onerror=null,"abort"===a?f.abort():"error"===a?d(f.status,f.statusText):d(Db[f.status]||f.status,f.statusText,"string"==typeof f.responseText?{text:f.responseText}:void 0,f.getAllResponseHeaders()))}},f.onload=b(),f.onerror=b("error"),b=Cb[g]=b("abort");try{f.send(a.hasContent&&a.data||null)}catch(h){if(b)throw h}},abort:function(){b&&b()}}:void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(d,e){b=n("<script>").prop({async:!0,charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&e("error"===a.type?404:200,a.type)}),l.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Fb=[],Gb=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Fb.pop()||n.expando+"_"+cb++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Gb.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Gb.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Gb,"$1"+e):b.jsonp!==!1&&(b.url+=(db.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Fb.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||l;var d=v.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=n.buildFragment([a],b,e),e&&e.length&&n(e).remove(),n.merge([],d.childNodes))};var Hb=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&Hb)return Hb.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=n.trim(a.slice(h)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e,dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,f||[a.responseText,b,a])}),this},n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};var Ib=a.document.documentElement;function Jb(a){return n.isWindow(a)?a:9===a.nodeType&&a.defaultView}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d=this[0],e={top:0,left:0},f=d&&d.ownerDocument;if(f)return b=f.documentElement,n.contains(b,d)?(typeof d.getBoundingClientRect!==U&&(e=d.getBoundingClientRect()),c=Jb(f),{top:e.top+c.pageYOffset-b.clientTop,left:e.left+c.pageXOffset-b.clientLeft}):e},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===n.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(d=a.offset()),d.top+=n.css(a[0],"borderTopWidth",!0),d.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-d.top-n.css(c,"marginTop",!0),left:b.left-d.left-n.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||Ib;while(a&&!n.nodeName(a,"html")&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Ib})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(b,c){var d="pageYOffset"===c;n.fn[b]=function(e){return J(this,function(b,e,f){var g=Jb(b);return void 0===f?g?g[c]:b[e]:void(g?g.scrollTo(d?a.pageXOffset:f,d?f:a.pageYOffset):b[e]=f)},b,e,arguments.length,null)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=ya(k.pixelPosition,function(a,c){return c?(c=xa(a,b),va.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return J(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.size=function(){return this.length},n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var Kb=a.jQuery,Lb=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=Lb),b&&a.jQuery===n&&(a.jQuery=Kb),n},typeof b===U&&(a.jQuery=a.$=n),n});
/**
 * Swiper 5.4.5
 * Most modern mobile touch slider and framework with hardware accelerated transitions
 * http://swiperjs.com
 *
 * Copyright 2014-2020 Vladimir Kharlampidi
 *
 * Released under the MIT License
 *
 * Released on: June 16, 2020
 */

!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?module.exports=t():"function"==typeof define&&define.amd?define(t):(e=e||self).Swiper=t()}(this,(function(){"use strict";function e(e){return null!==e&&"object"==typeof e&&"constructor"in e&&e.constructor===Object}function t(i,s){void 0===i&&(i={}),void 0===s&&(s={}),Object.keys(s).forEach((function(a){void 0===i[a]?i[a]=s[a]:e(s[a])&&e(i[a])&&Object.keys(s[a]).length>0&&t(i[a],s[a])}))}var i="undefined"!=typeof document?document:{},s={body:{},addEventListener:function(){},removeEventListener:function(){},activeElement:{blur:function(){},nodeName:""},querySelector:function(){return null},querySelectorAll:function(){return[]},getElementById:function(){return null},createEvent:function(){return{initEvent:function(){}}},createElement:function(){return{children:[],childNodes:[],style:{},setAttribute:function(){},getElementsByTagName:function(){return[]}}},createElementNS:function(){return{}},importNode:function(){return null},location:{hash:"",host:"",hostname:"",href:"",origin:"",pathname:"",protocol:"",search:""}};t(i,s);var a="undefined"!=typeof window?window:{};t(a,{document:s,navigator:{userAgent:""},location:{hash:"",host:"",hostname:"",href:"",origin:"",pathname:"",protocol:"",search:""},history:{replaceState:function(){},pushState:function(){},go:function(){},back:function(){}},CustomEvent:function(){return this},addEventListener:function(){},removeEventListener:function(){},getComputedStyle:function(){return{getPropertyValue:function(){return""}}},Image:function(){},Date:function(){},screen:{},setTimeout:function(){},clearTimeout:function(){},matchMedia:function(){return{}}});var r=function(e){for(var t=0;t<e.length;t+=1)this[t]=e[t];return this.length=e.length,this};function n(e,t){var s=[],n=0;if(e&&!t&&e instanceof r)return e;if(e)if("string"==typeof e){var o,l,d=e.trim();if(d.indexOf("<")>=0&&d.indexOf(">")>=0){var h="div";for(0===d.indexOf("<li")&&(h="ul"),0===d.indexOf("<tr")&&(h="tbody"),0!==d.indexOf("<td")&&0!==d.indexOf("<th")||(h="tr"),0===d.indexOf("<tbody")&&(h="table"),0===d.indexOf("<option")&&(h="select"),(l=i.createElement(h)).innerHTML=d,n=0;n<l.childNodes.length;n+=1)s.push(l.childNodes[n])}else for(o=t||"#"!==e[0]||e.match(/[ .<>:~]/)?(t||i).querySelectorAll(e.trim()):[i.getElementById(e.trim().split("#")[1])],n=0;n<o.length;n+=1)o[n]&&s.push(o[n])}else if(e.nodeType||e===a||e===i)s.push(e);else if(e.length>0&&e[0].nodeType)for(n=0;n<e.length;n+=1)s.push(e[n]);return new r(s)}function o(e){for(var t=[],i=0;i<e.length;i+=1)-1===t.indexOf(e[i])&&t.push(e[i]);return t}n.fn=r.prototype,n.Class=r,n.Dom7=r;var l={addClass:function(e){if(void 0===e)return this;for(var t=e.split(" "),i=0;i<t.length;i+=1)for(var s=0;s<this.length;s+=1)void 0!==this[s]&&void 0!==this[s].classList&&this[s].classList.add(t[i]);return this},removeClass:function(e){for(var t=e.split(" "),i=0;i<t.length;i+=1)for(var s=0;s<this.length;s+=1)void 0!==this[s]&&void 0!==this[s].classList&&this[s].classList.remove(t[i]);return this},hasClass:function(e){return!!this[0]&&this[0].classList.contains(e)},toggleClass:function(e){for(var t=e.split(" "),i=0;i<t.length;i+=1)for(var s=0;s<this.length;s+=1)void 0!==this[s]&&void 0!==this[s].classList&&this[s].classList.toggle(t[i]);return this},attr:function(e,t){var i=arguments;if(1===arguments.length&&"string"==typeof e)return this[0]?this[0].getAttribute(e):void 0;for(var s=0;s<this.length;s+=1)if(2===i.length)this[s].setAttribute(e,t);else for(var a in e)this[s][a]=e[a],this[s].setAttribute(a,e[a]);return this},removeAttr:function(e){for(var t=0;t<this.length;t+=1)this[t].removeAttribute(e);return this},data:function(e,t){var i;if(void 0!==t){for(var s=0;s<this.length;s+=1)(i=this[s]).dom7ElementDataStorage||(i.dom7ElementDataStorage={}),i.dom7ElementDataStorage[e]=t;return this}if(i=this[0]){if(i.dom7ElementDataStorage&&e in i.dom7ElementDataStorage)return i.dom7ElementDataStorage[e];var a=i.getAttribute("data-"+e);return a||void 0}},transform:function(e){for(var t=0;t<this.length;t+=1){var i=this[t].style;i.webkitTransform=e,i.transform=e}return this},transition:function(e){"string"!=typeof e&&(e+="ms");for(var t=0;t<this.length;t+=1){var i=this[t].style;i.webkitTransitionDuration=e,i.transitionDuration=e}return this},on:function(){for(var e,t=[],i=arguments.length;i--;)t[i]=arguments[i];var s=t[0],a=t[1],r=t[2],o=t[3];function l(e){var t=e.target;if(t){var i=e.target.dom7EventData||[];if(i.indexOf(e)<0&&i.unshift(e),n(t).is(a))r.apply(t,i);else for(var s=n(t).parents(),o=0;o<s.length;o+=1)n(s[o]).is(a)&&r.apply(s[o],i)}}function d(e){var t=e&&e.target&&e.target.dom7EventData||[];t.indexOf(e)<0&&t.unshift(e),r.apply(this,t)}"function"==typeof t[1]&&(s=(e=t)[0],r=e[1],o=e[2],a=void 0),o||(o=!1);for(var h,p=s.split(" "),c=0;c<this.length;c+=1){var u=this[c];if(a)for(h=0;h<p.length;h+=1){var v=p[h];u.dom7LiveListeners||(u.dom7LiveListeners={}),u.dom7LiveListeners[v]||(u.dom7LiveListeners[v]=[]),u.dom7LiveListeners[v].push({listener:r,proxyListener:l}),u.addEventListener(v,l,o)}else for(h=0;h<p.length;h+=1){var f=p[h];u.dom7Listeners||(u.dom7Listeners={}),u.dom7Listeners[f]||(u.dom7Listeners[f]=[]),u.dom7Listeners[f].push({listener:r,proxyListener:d}),u.addEventListener(f,d,o)}}return this},off:function(){for(var e,t=[],i=arguments.length;i--;)t[i]=arguments[i];var s=t[0],a=t[1],r=t[2],n=t[3];"function"==typeof t[1]&&(s=(e=t)[0],r=e[1],n=e[2],a=void 0),n||(n=!1);for(var o=s.split(" "),l=0;l<o.length;l+=1)for(var d=o[l],h=0;h<this.length;h+=1){var p=this[h],c=void 0;if(!a&&p.dom7Listeners?c=p.dom7Listeners[d]:a&&p.dom7LiveListeners&&(c=p.dom7LiveListeners[d]),c&&c.length)for(var u=c.length-1;u>=0;u-=1){var v=c[u];r&&v.listener===r||r&&v.listener&&v.listener.dom7proxy&&v.listener.dom7proxy===r?(p.removeEventListener(d,v.proxyListener,n),c.splice(u,1)):r||(p.removeEventListener(d,v.proxyListener,n),c.splice(u,1))}}return this},trigger:function(){for(var e=[],t=arguments.length;t--;)e[t]=arguments[t];for(var s=e[0].split(" "),r=e[1],n=0;n<s.length;n+=1)for(var o=s[n],l=0;l<this.length;l+=1){var d=this[l],h=void 0;try{h=new a.CustomEvent(o,{detail:r,bubbles:!0,cancelable:!0})}catch(e){(h=i.createEvent("Event")).initEvent(o,!0,!0),h.detail=r}d.dom7EventData=e.filter((function(e,t){return t>0})),d.dispatchEvent(h),d.dom7EventData=[],delete d.dom7EventData}return this},transitionEnd:function(e){var t,i=["webkitTransitionEnd","transitionend"],s=this;function a(r){if(r.target===this)for(e.call(this,r),t=0;t<i.length;t+=1)s.off(i[t],a)}if(e)for(t=0;t<i.length;t+=1)s.on(i[t],a);return this},outerWidth:function(e){if(this.length>0){if(e){var t=this.styles();return this[0].offsetWidth+parseFloat(t.getPropertyValue("margin-right"))+parseFloat(t.getPropertyValue("margin-left"))}return this[0].offsetWidth}return null},outerHeight:function(e){if(this.length>0){if(e){var t=this.styles();return this[0].offsetHeight+parseFloat(t.getPropertyValue("margin-top"))+parseFloat(t.getPropertyValue("margin-bottom"))}return this[0].offsetHeight}return null},offset:function(){if(this.length>0){var e=this[0],t=e.getBoundingClientRect(),s=i.body,r=e.clientTop||s.clientTop||0,n=e.clientLeft||s.clientLeft||0,o=e===a?a.scrollY:e.scrollTop,l=e===a?a.scrollX:e.scrollLeft;return{top:t.top+o-r,left:t.left+l-n}}return null},css:function(e,t){var i;if(1===arguments.length){if("string"!=typeof e){for(i=0;i<this.length;i+=1)for(var s in e)this[i].style[s]=e[s];return this}if(this[0])return a.getComputedStyle(this[0],null).getPropertyValue(e)}if(2===arguments.length&&"string"==typeof e){for(i=0;i<this.length;i+=1)this[i].style[e]=t;return this}return this},each:function(e){if(!e)return this;for(var t=0;t<this.length;t+=1)if(!1===e.call(this[t],t,this[t]))return this;return this},html:function(e){if(void 0===e)return this[0]?this[0].innerHTML:void 0;for(var t=0;t<this.length;t+=1)this[t].innerHTML=e;return this},text:function(e){if(void 0===e)return this[0]?this[0].textContent.trim():null;for(var t=0;t<this.length;t+=1)this[t].textContent=e;return this},is:function(e){var t,s,o=this[0];if(!o||void 0===e)return!1;if("string"==typeof e){if(o.matches)return o.matches(e);if(o.webkitMatchesSelector)return o.webkitMatchesSelector(e);if(o.msMatchesSelector)return o.msMatchesSelector(e);for(t=n(e),s=0;s<t.length;s+=1)if(t[s]===o)return!0;return!1}if(e===i)return o===i;if(e===a)return o===a;if(e.nodeType||e instanceof r){for(t=e.nodeType?[e]:e,s=0;s<t.length;s+=1)if(t[s]===o)return!0;return!1}return!1},index:function(){var e,t=this[0];if(t){for(e=0;null!==(t=t.previousSibling);)1===t.nodeType&&(e+=1);return e}},eq:function(e){if(void 0===e)return this;var t,i=this.length;return new r(e>i-1?[]:e<0?(t=i+e)<0?[]:[this[t]]:[this[e]])},append:function(){for(var e,t=[],s=arguments.length;s--;)t[s]=arguments[s];for(var a=0;a<t.length;a+=1){e=t[a];for(var n=0;n<this.length;n+=1)if("string"==typeof e){var o=i.createElement("div");for(o.innerHTML=e;o.firstChild;)this[n].appendChild(o.firstChild)}else if(e instanceof r)for(var l=0;l<e.length;l+=1)this[n].appendChild(e[l]);else this[n].appendChild(e)}return this},prepend:function(e){var t,s;for(t=0;t<this.length;t+=1)if("string"==typeof e){var a=i.createElement("div");for(a.innerHTML=e,s=a.childNodes.length-1;s>=0;s-=1)this[t].insertBefore(a.childNodes[s],this[t].childNodes[0])}else if(e instanceof r)for(s=0;s<e.length;s+=1)this[t].insertBefore(e[s],this[t].childNodes[0]);else this[t].insertBefore(e,this[t].childNodes[0]);return this},next:function(e){return this.length>0?e?this[0].nextElementSibling&&n(this[0].nextElementSibling).is(e)?new r([this[0].nextElementSibling]):new r([]):this[0].nextElementSibling?new r([this[0].nextElementSibling]):new r([]):new r([])},nextAll:function(e){var t=[],i=this[0];if(!i)return new r([]);for(;i.nextElementSibling;){var s=i.nextElementSibling;e?n(s).is(e)&&t.push(s):t.push(s),i=s}return new r(t)},prev:function(e){if(this.length>0){var t=this[0];return e?t.previousElementSibling&&n(t.previousElementSibling).is(e)?new r([t.previousElementSibling]):new r([]):t.previousElementSibling?new r([t.previousElementSibling]):new r([])}return new r([])},prevAll:function(e){var t=[],i=this[0];if(!i)return new r([]);for(;i.previousElementSibling;){var s=i.previousElementSibling;e?n(s).is(e)&&t.push(s):t.push(s),i=s}return new r(t)},parent:function(e){for(var t=[],i=0;i<this.length;i+=1)null!==this[i].parentNode&&(e?n(this[i].parentNode).is(e)&&t.push(this[i].parentNode):t.push(this[i].parentNode));return n(o(t))},parents:function(e){for(var t=[],i=0;i<this.length;i+=1)for(var s=this[i].parentNode;s;)e?n(s).is(e)&&t.push(s):t.push(s),s=s.parentNode;return n(o(t))},closest:function(e){var t=this;return void 0===e?new r([]):(t.is(e)||(t=t.parents(e).eq(0)),t)},find:function(e){for(var t=[],i=0;i<this.length;i+=1)for(var s=this[i].querySelectorAll(e),a=0;a<s.length;a+=1)t.push(s[a]);return new r(t)},children:function(e){for(var t=[],i=0;i<this.length;i+=1)for(var s=this[i].childNodes,a=0;a<s.length;a+=1)e?1===s[a].nodeType&&n(s[a]).is(e)&&t.push(s[a]):1===s[a].nodeType&&t.push(s[a]);return new r(o(t))},filter:function(e){for(var t=[],i=0;i<this.length;i+=1)e.call(this[i],i,this[i])&&t.push(this[i]);return new r(t)},remove:function(){for(var e=0;e<this.length;e+=1)this[e].parentNode&&this[e].parentNode.removeChild(this[e]);return this},add:function(){for(var e=[],t=arguments.length;t--;)e[t]=arguments[t];var i,s,a=this;for(i=0;i<e.length;i+=1){var r=n(e[i]);for(s=0;s<r.length;s+=1)a[a.length]=r[s],a.length+=1}return a},styles:function(){return this[0]?a.getComputedStyle(this[0],null):{}}};Object.keys(l).forEach((function(e){n.fn[e]=n.fn[e]||l[e]}));var d={deleteProps:function(e){var t=e;Object.keys(t).forEach((function(e){try{t[e]=null}catch(e){}try{delete t[e]}catch(e){}}))},nextTick:function(e,t){return void 0===t&&(t=0),setTimeout(e,t)},now:function(){return Date.now()},getTranslate:function(e,t){var i,s,r;void 0===t&&(t="x");var n=a.getComputedStyle(e,null);return a.WebKitCSSMatrix?((s=n.transform||n.webkitTransform).split(",").length>6&&(s=s.split(", ").map((function(e){return e.replace(",",".")})).join(", ")),r=new a.WebKitCSSMatrix("none"===s?"":s)):i=(r=n.MozTransform||n.OTransform||n.MsTransform||n.msTransform||n.transform||n.getPropertyValue("transform").replace("translate(","matrix(1, 0, 0, 1,")).toString().split(","),"x"===t&&(s=a.WebKitCSSMatrix?r.m41:16===i.length?parseFloat(i[12]):parseFloat(i[4])),"y"===t&&(s=a.WebKitCSSMatrix?r.m42:16===i.length?parseFloat(i[13]):parseFloat(i[5])),s||0},parseUrlQuery:function(e){var t,i,s,r,n={},o=e||a.location.href;if("string"==typeof o&&o.length)for(r=(i=(o=o.indexOf("?")>-1?o.replace(/\S*\?/,""):"").split("&").filter((function(e){return""!==e}))).length,t=0;t<r;t+=1)s=i[t].replace(/#\S+/g,"").split("="),n[decodeURIComponent(s[0])]=void 0===s[1]?void 0:decodeURIComponent(s[1])||"";return n},isObject:function(e){return"object"==typeof e&&null!==e&&e.constructor&&e.constructor===Object},extend:function(){for(var e=[],t=arguments.length;t--;)e[t]=arguments[t];for(var i=Object(e[0]),s=1;s<e.length;s+=1){var a=e[s];if(null!=a)for(var r=Object.keys(Object(a)),n=0,o=r.length;n<o;n+=1){var l=r[n],h=Object.getOwnPropertyDescriptor(a,l);void 0!==h&&h.enumerable&&(d.isObject(i[l])&&d.isObject(a[l])?d.extend(i[l],a[l]):!d.isObject(i[l])&&d.isObject(a[l])?(i[l]={},d.extend(i[l],a[l])):i[l]=a[l])}}return i}},h={touch:!!("ontouchstart"in a||a.DocumentTouch&&i instanceof a.DocumentTouch),pointerEvents:!!a.PointerEvent&&"maxTouchPoints"in a.navigator&&a.navigator.maxTouchPoints>=0,observer:"MutationObserver"in a||"WebkitMutationObserver"in a,passiveListener:function(){var e=!1;try{var t=Object.defineProperty({},"passive",{get:function(){e=!0}});a.addEventListener("testPassiveListener",null,t)}catch(e){}return e}(),gestures:"ongesturestart"in a},p=function(e){void 0===e&&(e={});var t=this;t.params=e,t.eventsListeners={},t.params&&t.params.on&&Object.keys(t.params.on).forEach((function(e){t.on(e,t.params.on[e])}))},c={components:{configurable:!0}};p.prototype.on=function(e,t,i){var s=this;if("function"!=typeof t)return s;var a=i?"unshift":"push";return e.split(" ").forEach((function(e){s.eventsListeners[e]||(s.eventsListeners[e]=[]),s.eventsListeners[e][a](t)})),s},p.prototype.once=function(e,t,i){var s=this;if("function"!=typeof t)return s;function a(){for(var i=[],r=arguments.length;r--;)i[r]=arguments[r];s.off(e,a),a.f7proxy&&delete a.f7proxy,t.apply(s,i)}return a.f7proxy=t,s.on(e,a,i)},p.prototype.off=function(e,t){var i=this;return i.eventsListeners?(e.split(" ").forEach((function(e){void 0===t?i.eventsListeners[e]=[]:i.eventsListeners[e]&&i.eventsListeners[e].length&&i.eventsListeners[e].forEach((function(s,a){(s===t||s.f7proxy&&s.f7proxy===t)&&i.eventsListeners[e].splice(a,1)}))})),i):i},p.prototype.emit=function(){for(var e=[],t=arguments.length;t--;)e[t]=arguments[t];var i,s,a,r=this;if(!r.eventsListeners)return r;"string"==typeof e[0]||Array.isArray(e[0])?(i=e[0],s=e.slice(1,e.length),a=r):(i=e[0].events,s=e[0].data,a=e[0].context||r);var n=Array.isArray(i)?i:i.split(" ");return n.forEach((function(e){if(r.eventsListeners&&r.eventsListeners[e]){var t=[];r.eventsListeners[e].forEach((function(e){t.push(e)})),t.forEach((function(e){e.apply(a,s)}))}})),r},p.prototype.useModulesParams=function(e){var t=this;t.modules&&Object.keys(t.modules).forEach((function(i){var s=t.modules[i];s.params&&d.extend(e,s.params)}))},p.prototype.useModules=function(e){void 0===e&&(e={});var t=this;t.modules&&Object.keys(t.modules).forEach((function(i){var s=t.modules[i],a=e[i]||{};s.instance&&Object.keys(s.instance).forEach((function(e){var i=s.instance[e];t[e]="function"==typeof i?i.bind(t):i})),s.on&&t.on&&Object.keys(s.on).forEach((function(e){t.on(e,s.on[e])})),s.create&&s.create.bind(t)(a)}))},c.components.set=function(e){this.use&&this.use(e)},p.installModule=function(e){for(var t=[],i=arguments.length-1;i-- >0;)t[i]=arguments[i+1];var s=this;s.prototype.modules||(s.prototype.modules={});var a=e.name||Object.keys(s.prototype.modules).length+"_"+d.now();return s.prototype.modules[a]=e,e.proto&&Object.keys(e.proto).forEach((function(t){s.prototype[t]=e.proto[t]})),e.static&&Object.keys(e.static).forEach((function(t){s[t]=e.static[t]})),e.install&&e.install.apply(s,t),s},p.use=function(e){for(var t=[],i=arguments.length-1;i-- >0;)t[i]=arguments[i+1];var s=this;return Array.isArray(e)?(e.forEach((function(e){return s.installModule(e)})),s):s.installModule.apply(s,[e].concat(t))},Object.defineProperties(p,c);var u={updateSize:function(){var e,t,i=this.$el;e=void 0!==this.params.width?this.params.width:i[0].clientWidth,t=void 0!==this.params.height?this.params.height:i[0].clientHeight,0===e&&this.isHorizontal()||0===t&&this.isVertical()||(e=e-parseInt(i.css("padding-left"),10)-parseInt(i.css("padding-right"),10),t=t-parseInt(i.css("padding-top"),10)-parseInt(i.css("padding-bottom"),10),d.extend(this,{width:e,height:t,size:this.isHorizontal()?e:t}))},updateSlides:function(){var e=this.params,t=this.$wrapperEl,i=this.size,s=this.rtlTranslate,r=this.wrongRTL,n=this.virtual&&e.virtual.enabled,o=n?this.virtual.slides.length:this.slides.length,l=t.children("."+this.params.slideClass),h=n?this.virtual.slides.length:l.length,p=[],c=[],u=[];function v(t){return!e.cssMode||t!==l.length-1}var f=e.slidesOffsetBefore;"function"==typeof f&&(f=e.slidesOffsetBefore.call(this));var m=e.slidesOffsetAfter;"function"==typeof m&&(m=e.slidesOffsetAfter.call(this));var g=this.snapGrid.length,b=this.snapGrid.length,w=e.spaceBetween,y=-f,x=0,E=0;if(void 0!==i){var T,S;"string"==typeof w&&w.indexOf("%")>=0&&(w=parseFloat(w.replace("%",""))/100*i),this.virtualSize=-w,s?l.css({marginLeft:"",marginTop:""}):l.css({marginRight:"",marginBottom:""}),e.slidesPerColumn>1&&(T=Math.floor(h/e.slidesPerColumn)===h/this.params.slidesPerColumn?h:Math.ceil(h/e.slidesPerColumn)*e.slidesPerColumn,"auto"!==e.slidesPerView&&"row"===e.slidesPerColumnFill&&(T=Math.max(T,e.slidesPerView*e.slidesPerColumn)));for(var C,M=e.slidesPerColumn,P=T/M,z=Math.floor(h/e.slidesPerColumn),k=0;k<h;k+=1){S=0;var $=l.eq(k);if(e.slidesPerColumn>1){var L=void 0,I=void 0,D=void 0;if("row"===e.slidesPerColumnFill&&e.slidesPerGroup>1){var O=Math.floor(k/(e.slidesPerGroup*e.slidesPerColumn)),A=k-e.slidesPerColumn*e.slidesPerGroup*O,G=0===O?e.slidesPerGroup:Math.min(Math.ceil((h-O*M*e.slidesPerGroup)/M),e.slidesPerGroup);L=(I=A-(D=Math.floor(A/G))*G+O*e.slidesPerGroup)+D*T/M,$.css({"-webkit-box-ordinal-group":L,"-moz-box-ordinal-group":L,"-ms-flex-order":L,"-webkit-order":L,order:L})}else"column"===e.slidesPerColumnFill?(D=k-(I=Math.floor(k/M))*M,(I>z||I===z&&D===M-1)&&(D+=1)>=M&&(D=0,I+=1)):I=k-(D=Math.floor(k/P))*P;$.css("margin-"+(this.isHorizontal()?"top":"left"),0!==D&&e.spaceBetween&&e.spaceBetween+"px")}if("none"!==$.css("display")){if("auto"===e.slidesPerView){var H=a.getComputedStyle($[0],null),B=$[0].style.transform,N=$[0].style.webkitTransform;if(B&&($[0].style.transform="none"),N&&($[0].style.webkitTransform="none"),e.roundLengths)S=this.isHorizontal()?$.outerWidth(!0):$.outerHeight(!0);else if(this.isHorizontal()){var X=parseFloat(H.getPropertyValue("width")),V=parseFloat(H.getPropertyValue("padding-left")),Y=parseFloat(H.getPropertyValue("padding-right")),F=parseFloat(H.getPropertyValue("margin-left")),W=parseFloat(H.getPropertyValue("margin-right")),R=H.getPropertyValue("box-sizing");S=R&&"border-box"===R?X+F+W:X+V+Y+F+W}else{var q=parseFloat(H.getPropertyValue("height")),j=parseFloat(H.getPropertyValue("padding-top")),K=parseFloat(H.getPropertyValue("padding-bottom")),U=parseFloat(H.getPropertyValue("margin-top")),_=parseFloat(H.getPropertyValue("margin-bottom")),Z=H.getPropertyValue("box-sizing");S=Z&&"border-box"===Z?q+U+_:q+j+K+U+_}B&&($[0].style.transform=B),N&&($[0].style.webkitTransform=N),e.roundLengths&&(S=Math.floor(S))}else S=(i-(e.slidesPerView-1)*w)/e.slidesPerView,e.roundLengths&&(S=Math.floor(S)),l[k]&&(this.isHorizontal()?l[k].style.width=S+"px":l[k].style.height=S+"px");l[k]&&(l[k].swiperSlideSize=S),u.push(S),e.centeredSlides?(y=y+S/2+x/2+w,0===x&&0!==k&&(y=y-i/2-w),0===k&&(y=y-i/2-w),Math.abs(y)<.001&&(y=0),e.roundLengths&&(y=Math.floor(y)),E%e.slidesPerGroup==0&&p.push(y),c.push(y)):(e.roundLengths&&(y=Math.floor(y)),(E-Math.min(this.params.slidesPerGroupSkip,E))%this.params.slidesPerGroup==0&&p.push(y),c.push(y),y=y+S+w),this.virtualSize+=S+w,x=S,E+=1}}if(this.virtualSize=Math.max(this.virtualSize,i)+m,s&&r&&("slide"===e.effect||"coverflow"===e.effect)&&t.css({width:this.virtualSize+e.spaceBetween+"px"}),e.setWrapperSize&&(this.isHorizontal()?t.css({width:this.virtualSize+e.spaceBetween+"px"}):t.css({height:this.virtualSize+e.spaceBetween+"px"})),e.slidesPerColumn>1&&(this.virtualSize=(S+e.spaceBetween)*T,this.virtualSize=Math.ceil(this.virtualSize/e.slidesPerColumn)-e.spaceBetween,this.isHorizontal()?t.css({width:this.virtualSize+e.spaceBetween+"px"}):t.css({height:this.virtualSize+e.spaceBetween+"px"}),e.centeredSlides)){C=[];for(var Q=0;Q<p.length;Q+=1){var J=p[Q];e.roundLengths&&(J=Math.floor(J)),p[Q]<this.virtualSize+p[0]&&C.push(J)}p=C}if(!e.centeredSlides){C=[];for(var ee=0;ee<p.length;ee+=1){var te=p[ee];e.roundLengths&&(te=Math.floor(te)),p[ee]<=this.virtualSize-i&&C.push(te)}p=C,Math.floor(this.virtualSize-i)-Math.floor(p[p.length-1])>1&&p.push(this.virtualSize-i)}if(0===p.length&&(p=[0]),0!==e.spaceBetween&&(this.isHorizontal()?s?l.filter(v).css({marginLeft:w+"px"}):l.filter(v).css({marginRight:w+"px"}):l.filter(v).css({marginBottom:w+"px"})),e.centeredSlides&&e.centeredSlidesBounds){var ie=0;u.forEach((function(t){ie+=t+(e.spaceBetween?e.spaceBetween:0)}));var se=(ie-=e.spaceBetween)-i;p=p.map((function(e){return e<0?-f:e>se?se+m:e}))}if(e.centerInsufficientSlides){var ae=0;if(u.forEach((function(t){ae+=t+(e.spaceBetween?e.spaceBetween:0)})),(ae-=e.spaceBetween)<i){var re=(i-ae)/2;p.forEach((function(e,t){p[t]=e-re})),c.forEach((function(e,t){c[t]=e+re}))}}d.extend(this,{slides:l,snapGrid:p,slidesGrid:c,slidesSizesGrid:u}),h!==o&&this.emit("slidesLengthChange"),p.length!==g&&(this.params.watchOverflow&&this.checkOverflow(),this.emit("snapGridLengthChange")),c.length!==b&&this.emit("slidesGridLengthChange"),(e.watchSlidesProgress||e.watchSlidesVisibility)&&this.updateSlidesOffset()}},updateAutoHeight:function(e){var t,i=[],s=0;if("number"==typeof e?this.setTransition(e):!0===e&&this.setTransition(this.params.speed),"auto"!==this.params.slidesPerView&&this.params.slidesPerView>1)if(this.params.centeredSlides)this.visibleSlides.each((function(e,t){i.push(t)}));else for(t=0;t<Math.ceil(this.params.slidesPerView);t+=1){var a=this.activeIndex+t;if(a>this.slides.length)break;i.push(this.slides.eq(a)[0])}else i.push(this.slides.eq(this.activeIndex)[0]);for(t=0;t<i.length;t+=1)if(void 0!==i[t]){var r=i[t].offsetHeight;s=r>s?r:s}s&&this.$wrapperEl.css("height",s+"px")},updateSlidesOffset:function(){for(var e=this.slides,t=0;t<e.length;t+=1)e[t].swiperSlideOffset=this.isHorizontal()?e[t].offsetLeft:e[t].offsetTop},updateSlidesProgress:function(e){void 0===e&&(e=this&&this.translate||0);var t=this.params,i=this.slides,s=this.rtlTranslate;if(0!==i.length){void 0===i[0].swiperSlideOffset&&this.updateSlidesOffset();var a=-e;s&&(a=e),i.removeClass(t.slideVisibleClass),this.visibleSlidesIndexes=[],this.visibleSlides=[];for(var r=0;r<i.length;r+=1){var o=i[r],l=(a+(t.centeredSlides?this.minTranslate():0)-o.swiperSlideOffset)/(o.swiperSlideSize+t.spaceBetween);if(t.watchSlidesVisibility||t.centeredSlides&&t.autoHeight){var d=-(a-o.swiperSlideOffset),h=d+this.slidesSizesGrid[r];(d>=0&&d<this.size-1||h>1&&h<=this.size||d<=0&&h>=this.size)&&(this.visibleSlides.push(o),this.visibleSlidesIndexes.push(r),i.eq(r).addClass(t.slideVisibleClass))}o.progress=s?-l:l}this.visibleSlides=n(this.visibleSlides)}},updateProgress:function(e){if(void 0===e){var t=this.rtlTranslate?-1:1;e=this&&this.translate&&this.translate*t||0}var i=this.params,s=this.maxTranslate()-this.minTranslate(),a=this.progress,r=this.isBeginning,n=this.isEnd,o=r,l=n;0===s?(a=0,r=!0,n=!0):(r=(a=(e-this.minTranslate())/s)<=0,n=a>=1),d.extend(this,{progress:a,isBeginning:r,isEnd:n}),(i.watchSlidesProgress||i.watchSlidesVisibility||i.centeredSlides&&i.autoHeight)&&this.updateSlidesProgress(e),r&&!o&&this.emit("reachBeginning toEdge"),n&&!l&&this.emit("reachEnd toEdge"),(o&&!r||l&&!n)&&this.emit("fromEdge"),this.emit("progress",a)},updateSlidesClasses:function(){var e,t=this.slides,i=this.params,s=this.$wrapperEl,a=this.activeIndex,r=this.realIndex,n=this.virtual&&i.virtual.enabled;t.removeClass(i.slideActiveClass+" "+i.slideNextClass+" "+i.slidePrevClass+" "+i.slideDuplicateActiveClass+" "+i.slideDuplicateNextClass+" "+i.slideDuplicatePrevClass),(e=n?this.$wrapperEl.find("."+i.slideClass+'[data-swiper-slide-index="'+a+'"]'):t.eq(a)).addClass(i.slideActiveClass),i.loop&&(e.hasClass(i.slideDuplicateClass)?s.children("."+i.slideClass+":not(."+i.slideDuplicateClass+')[data-swiper-slide-index="'+r+'"]').addClass(i.slideDuplicateActiveClass):s.children("."+i.slideClass+"."+i.slideDuplicateClass+'[data-swiper-slide-index="'+r+'"]').addClass(i.slideDuplicateActiveClass));var o=e.nextAll("."+i.slideClass).eq(0).addClass(i.slideNextClass);i.loop&&0===o.length&&(o=t.eq(0)).addClass(i.slideNextClass);var l=e.prevAll("."+i.slideClass).eq(0).addClass(i.slidePrevClass);i.loop&&0===l.length&&(l=t.eq(-1)).addClass(i.slidePrevClass),i.loop&&(o.hasClass(i.slideDuplicateClass)?s.children("."+i.slideClass+":not(."+i.slideDuplicateClass+')[data-swiper-slide-index="'+o.attr("data-swiper-slide-index")+'"]').addClass(i.slideDuplicateNextClass):s.children("."+i.slideClass+"."+i.slideDuplicateClass+'[data-swiper-slide-index="'+o.attr("data-swiper-slide-index")+'"]').addClass(i.slideDuplicateNextClass),l.hasClass(i.slideDuplicateClass)?s.children("."+i.slideClass+":not(."+i.slideDuplicateClass+')[data-swiper-slide-index="'+l.attr("data-swiper-slide-index")+'"]').addClass(i.slideDuplicatePrevClass):s.children("."+i.slideClass+"."+i.slideDuplicateClass+'[data-swiper-slide-index="'+l.attr("data-swiper-slide-index")+'"]').addClass(i.slideDuplicatePrevClass))},updateActiveIndex:function(e){var t,i=this.rtlTranslate?this.translate:-this.translate,s=this.slidesGrid,a=this.snapGrid,r=this.params,n=this.activeIndex,o=this.realIndex,l=this.snapIndex,h=e;if(void 0===h){for(var p=0;p<s.length;p+=1)void 0!==s[p+1]?i>=s[p]&&i<s[p+1]-(s[p+1]-s[p])/2?h=p:i>=s[p]&&i<s[p+1]&&(h=p+1):i>=s[p]&&(h=p);r.normalizeSlideIndex&&(h<0||void 0===h)&&(h=0)}if(a.indexOf(i)>=0)t=a.indexOf(i);else{var c=Math.min(r.slidesPerGroupSkip,h);t=c+Math.floor((h-c)/r.slidesPerGroup)}if(t>=a.length&&(t=a.length-1),h!==n){var u=parseInt(this.slides.eq(h).attr("data-swiper-slide-index")||h,10);d.extend(this,{snapIndex:t,realIndex:u,previousIndex:n,activeIndex:h}),this.emit("activeIndexChange"),this.emit("snapIndexChange"),o!==u&&this.emit("realIndexChange"),(this.initialized||this.params.runCallbacksOnInit)&&this.emit("slideChange")}else t!==l&&(this.snapIndex=t,this.emit("snapIndexChange"))},updateClickedSlide:function(e){var t=this.params,i=n(e.target).closest("."+t.slideClass)[0],s=!1;if(i)for(var a=0;a<this.slides.length;a+=1)this.slides[a]===i&&(s=!0);if(!i||!s)return this.clickedSlide=void 0,void(this.clickedIndex=void 0);this.clickedSlide=i,this.virtual&&this.params.virtual.enabled?this.clickedIndex=parseInt(n(i).attr("data-swiper-slide-index"),10):this.clickedIndex=n(i).index(),t.slideToClickedSlide&&void 0!==this.clickedIndex&&this.clickedIndex!==this.activeIndex&&this.slideToClickedSlide()}};var v={getTranslate:function(e){void 0===e&&(e=this.isHorizontal()?"x":"y");var t=this.params,i=this.rtlTranslate,s=this.translate,a=this.$wrapperEl;if(t.virtualTranslate)return i?-s:s;if(t.cssMode)return s;var r=d.getTranslate(a[0],e);return i&&(r=-r),r||0},setTranslate:function(e,t){var i=this.rtlTranslate,s=this.params,a=this.$wrapperEl,r=this.wrapperEl,n=this.progress,o=0,l=0;this.isHorizontal()?o=i?-e:e:l=e,s.roundLengths&&(o=Math.floor(o),l=Math.floor(l)),s.cssMode?r[this.isHorizontal()?"scrollLeft":"scrollTop"]=this.isHorizontal()?-o:-l:s.virtualTranslate||a.transform("translate3d("+o+"px, "+l+"px, 0px)"),this.previousTranslate=this.translate,this.translate=this.isHorizontal()?o:l;var d=this.maxTranslate()-this.minTranslate();(0===d?0:(e-this.minTranslate())/d)!==n&&this.updateProgress(e),this.emit("setTranslate",this.translate,t)},minTranslate:function(){return-this.snapGrid[0]},maxTranslate:function(){return-this.snapGrid[this.snapGrid.length-1]},translateTo:function(e,t,i,s,a){var r;void 0===e&&(e=0),void 0===t&&(t=this.params.speed),void 0===i&&(i=!0),void 0===s&&(s=!0);var n=this,o=n.params,l=n.wrapperEl;if(n.animating&&o.preventInteractionOnTransition)return!1;var d,h=n.minTranslate(),p=n.maxTranslate();if(d=s&&e>h?h:s&&e<p?p:e,n.updateProgress(d),o.cssMode){var c=n.isHorizontal();return 0===t?l[c?"scrollLeft":"scrollTop"]=-d:l.scrollTo?l.scrollTo(((r={})[c?"left":"top"]=-d,r.behavior="smooth",r)):l[c?"scrollLeft":"scrollTop"]=-d,!0}return 0===t?(n.setTransition(0),n.setTranslate(d),i&&(n.emit("beforeTransitionStart",t,a),n.emit("transitionEnd"))):(n.setTransition(t),n.setTranslate(d),i&&(n.emit("beforeTransitionStart",t,a),n.emit("transitionStart")),n.animating||(n.animating=!0,n.onTranslateToWrapperTransitionEnd||(n.onTranslateToWrapperTransitionEnd=function(e){n&&!n.destroyed&&e.target===this&&(n.$wrapperEl[0].removeEventListener("transitionend",n.onTranslateToWrapperTransitionEnd),n.$wrapperEl[0].removeEventListener("webkitTransitionEnd",n.onTranslateToWrapperTransitionEnd),n.onTranslateToWrapperTransitionEnd=null,delete n.onTranslateToWrapperTransitionEnd,i&&n.emit("transitionEnd"))}),n.$wrapperEl[0].addEventListener("transitionend",n.onTranslateToWrapperTransitionEnd),n.$wrapperEl[0].addEventListener("webkitTransitionEnd",n.onTranslateToWrapperTransitionEnd))),!0}};var f={setTransition:function(e,t){this.params.cssMode||this.$wrapperEl.transition(e),this.emit("setTransition",e,t)},transitionStart:function(e,t){void 0===e&&(e=!0);var i=this.activeIndex,s=this.params,a=this.previousIndex;if(!s.cssMode){s.autoHeight&&this.updateAutoHeight();var r=t;if(r||(r=i>a?"next":i<a?"prev":"reset"),this.emit("transitionStart"),e&&i!==a){if("reset"===r)return void this.emit("slideResetTransitionStart");this.emit("slideChangeTransitionStart"),"next"===r?this.emit("slideNextTransitionStart"):this.emit("slidePrevTransitionStart")}}},transitionEnd:function(e,t){void 0===e&&(e=!0);var i=this.activeIndex,s=this.previousIndex,a=this.params;if(this.animating=!1,!a.cssMode){this.setTransition(0);var r=t;if(r||(r=i>s?"next":i<s?"prev":"reset"),this.emit("transitionEnd"),e&&i!==s){if("reset"===r)return void this.emit("slideResetTransitionEnd");this.emit("slideChangeTransitionEnd"),"next"===r?this.emit("slideNextTransitionEnd"):this.emit("slidePrevTransitionEnd")}}}};var m={slideTo:function(e,t,i,s){var a;void 0===e&&(e=0),void 0===t&&(t=this.params.speed),void 0===i&&(i=!0);var r=this,n=e;n<0&&(n=0);var o=r.params,l=r.snapGrid,d=r.slidesGrid,h=r.previousIndex,p=r.activeIndex,c=r.rtlTranslate,u=r.wrapperEl;if(r.animating&&o.preventInteractionOnTransition)return!1;var v=Math.min(r.params.slidesPerGroupSkip,n),f=v+Math.floor((n-v)/r.params.slidesPerGroup);f>=l.length&&(f=l.length-1),(p||o.initialSlide||0)===(h||0)&&i&&r.emit("beforeSlideChangeStart");var m,g=-l[f];if(r.updateProgress(g),o.normalizeSlideIndex)for(var b=0;b<d.length;b+=1)-Math.floor(100*g)>=Math.floor(100*d[b])&&(n=b);if(r.initialized&&n!==p){if(!r.allowSlideNext&&g<r.translate&&g<r.minTranslate())return!1;if(!r.allowSlidePrev&&g>r.translate&&g>r.maxTranslate()&&(p||0)!==n)return!1}if(m=n>p?"next":n<p?"prev":"reset",c&&-g===r.translate||!c&&g===r.translate)return r.updateActiveIndex(n),o.autoHeight&&r.updateAutoHeight(),r.updateSlidesClasses(),"slide"!==o.effect&&r.setTranslate(g),"reset"!==m&&(r.transitionStart(i,m),r.transitionEnd(i,m)),!1;if(o.cssMode){var w=r.isHorizontal(),y=-g;return c&&(y=u.scrollWidth-u.offsetWidth-y),0===t?u[w?"scrollLeft":"scrollTop"]=y:u.scrollTo?u.scrollTo(((a={})[w?"left":"top"]=y,a.behavior="smooth",a)):u[w?"scrollLeft":"scrollTop"]=y,!0}return 0===t?(r.setTransition(0),r.setTranslate(g),r.updateActiveIndex(n),r.updateSlidesClasses(),r.emit("beforeTransitionStart",t,s),r.transitionStart(i,m),r.transitionEnd(i,m)):(r.setTransition(t),r.setTranslate(g),r.updateActiveIndex(n),r.updateSlidesClasses(),r.emit("beforeTransitionStart",t,s),r.transitionStart(i,m),r.animating||(r.animating=!0,r.onSlideToWrapperTransitionEnd||(r.onSlideToWrapperTransitionEnd=function(e){r&&!r.destroyed&&e.target===this&&(r.$wrapperEl[0].removeEventListener("transitionend",r.onSlideToWrapperTransitionEnd),r.$wrapperEl[0].removeEventListener("webkitTransitionEnd",r.onSlideToWrapperTransitionEnd),r.onSlideToWrapperTransitionEnd=null,delete r.onSlideToWrapperTransitionEnd,r.transitionEnd(i,m))}),r.$wrapperEl[0].addEventListener("transitionend",r.onSlideToWrapperTransitionEnd),r.$wrapperEl[0].addEventListener("webkitTransitionEnd",r.onSlideToWrapperTransitionEnd))),!0},slideToLoop:function(e,t,i,s){void 0===e&&(e=0),void 0===t&&(t=this.params.speed),void 0===i&&(i=!0);var a=e;return this.params.loop&&(a+=this.loopedSlides),this.slideTo(a,t,i,s)},slideNext:function(e,t,i){void 0===e&&(e=this.params.speed),void 0===t&&(t=!0);var s=this.params,a=this.animating,r=this.activeIndex<s.slidesPerGroupSkip?1:s.slidesPerGroup;if(s.loop){if(a)return!1;this.loopFix(),this._clientLeft=this.$wrapperEl[0].clientLeft}return this.slideTo(this.activeIndex+r,e,t,i)},slidePrev:function(e,t,i){void 0===e&&(e=this.params.speed),void 0===t&&(t=!0);var s=this.params,a=this.animating,r=this.snapGrid,n=this.slidesGrid,o=this.rtlTranslate;if(s.loop){if(a)return!1;this.loopFix(),this._clientLeft=this.$wrapperEl[0].clientLeft}function l(e){return e<0?-Math.floor(Math.abs(e)):Math.floor(e)}var d,h=l(o?this.translate:-this.translate),p=r.map((function(e){return l(e)})),c=(n.map((function(e){return l(e)})),r[p.indexOf(h)],r[p.indexOf(h)-1]);return void 0===c&&s.cssMode&&r.forEach((function(e){!c&&h>=e&&(c=e)})),void 0!==c&&(d=n.indexOf(c))<0&&(d=this.activeIndex-1),this.slideTo(d,e,t,i)},slideReset:function(e,t,i){return void 0===e&&(e=this.params.speed),void 0===t&&(t=!0),this.slideTo(this.activeIndex,e,t,i)},slideToClosest:function(e,t,i,s){void 0===e&&(e=this.params.speed),void 0===t&&(t=!0),void 0===s&&(s=.5);var a=this.activeIndex,r=Math.min(this.params.slidesPerGroupSkip,a),n=r+Math.floor((a-r)/this.params.slidesPerGroup),o=this.rtlTranslate?this.translate:-this.translate;if(o>=this.snapGrid[n]){var l=this.snapGrid[n];o-l>(this.snapGrid[n+1]-l)*s&&(a+=this.params.slidesPerGroup)}else{var d=this.snapGrid[n-1];o-d<=(this.snapGrid[n]-d)*s&&(a-=this.params.slidesPerGroup)}return a=Math.max(a,0),a=Math.min(a,this.slidesGrid.length-1),this.slideTo(a,e,t,i)},slideToClickedSlide:function(){var e,t=this,i=t.params,s=t.$wrapperEl,a="auto"===i.slidesPerView?t.slidesPerViewDynamic():i.slidesPerView,r=t.clickedIndex;if(i.loop){if(t.animating)return;e=parseInt(n(t.clickedSlide).attr("data-swiper-slide-index"),10),i.centeredSlides?r<t.loopedSlides-a/2||r>t.slides.length-t.loopedSlides+a/2?(t.loopFix(),r=s.children("."+i.slideClass+'[data-swiper-slide-index="'+e+'"]:not(.'+i.slideDuplicateClass+")").eq(0).index(),d.nextTick((function(){t.slideTo(r)}))):t.slideTo(r):r>t.slides.length-a?(t.loopFix(),r=s.children("."+i.slideClass+'[data-swiper-slide-index="'+e+'"]:not(.'+i.slideDuplicateClass+")").eq(0).index(),d.nextTick((function(){t.slideTo(r)}))):t.slideTo(r)}else t.slideTo(r)}};var g={loopCreate:function(){var e=this,t=e.params,s=e.$wrapperEl;s.children("."+t.slideClass+"."+t.slideDuplicateClass).remove();var a=s.children("."+t.slideClass);if(t.loopFillGroupWithBlank){var r=t.slidesPerGroup-a.length%t.slidesPerGroup;if(r!==t.slidesPerGroup){for(var o=0;o<r;o+=1){var l=n(i.createElement("div")).addClass(t.slideClass+" "+t.slideBlankClass);s.append(l)}a=s.children("."+t.slideClass)}}"auto"!==t.slidesPerView||t.loopedSlides||(t.loopedSlides=a.length),e.loopedSlides=Math.ceil(parseFloat(t.loopedSlides||t.slidesPerView,10)),e.loopedSlides+=t.loopAdditionalSlides,e.loopedSlides>a.length&&(e.loopedSlides=a.length);var d=[],h=[];a.each((function(t,i){var s=n(i);t<e.loopedSlides&&h.push(i),t<a.length&&t>=a.length-e.loopedSlides&&d.push(i),s.attr("data-swiper-slide-index",t)}));for(var p=0;p<h.length;p+=1)s.append(n(h[p].cloneNode(!0)).addClass(t.slideDuplicateClass));for(var c=d.length-1;c>=0;c-=1)s.prepend(n(d[c].cloneNode(!0)).addClass(t.slideDuplicateClass))},loopFix:function(){this.emit("beforeLoopFix");var e,t=this.activeIndex,i=this.slides,s=this.loopedSlides,a=this.allowSlidePrev,r=this.allowSlideNext,n=this.snapGrid,o=this.rtlTranslate;this.allowSlidePrev=!0,this.allowSlideNext=!0;var l=-n[t]-this.getTranslate();if(t<s)e=i.length-3*s+t,e+=s,this.slideTo(e,0,!1,!0)&&0!==l&&this.setTranslate((o?-this.translate:this.translate)-l);else if(t>=i.length-s){e=-i.length+t+s,e+=s,this.slideTo(e,0,!1,!0)&&0!==l&&this.setTranslate((o?-this.translate:this.translate)-l)}this.allowSlidePrev=a,this.allowSlideNext=r,this.emit("loopFix")},loopDestroy:function(){var e=this.$wrapperEl,t=this.params,i=this.slides;e.children("."+t.slideClass+"."+t.slideDuplicateClass+",."+t.slideClass+"."+t.slideBlankClass).remove(),i.removeAttr("data-swiper-slide-index")}};var b={setGrabCursor:function(e){if(!(h.touch||!this.params.simulateTouch||this.params.watchOverflow&&this.isLocked||this.params.cssMode)){var t=this.el;t.style.cursor="move",t.style.cursor=e?"-webkit-grabbing":"-webkit-grab",t.style.cursor=e?"-moz-grabbin":"-moz-grab",t.style.cursor=e?"grabbing":"grab"}},unsetGrabCursor:function(){h.touch||this.params.watchOverflow&&this.isLocked||this.params.cssMode||(this.el.style.cursor="")}};var w,y,x,E,T,S,C,M,P,z,k,$,L,I,D,O={appendSlide:function(e){var t=this.$wrapperEl,i=this.params;if(i.loop&&this.loopDestroy(),"object"==typeof e&&"length"in e)for(var s=0;s<e.length;s+=1)e[s]&&t.append(e[s]);else t.append(e);i.loop&&this.loopCreate(),i.observer&&h.observer||this.update()},prependSlide:function(e){var t=this.params,i=this.$wrapperEl,s=this.activeIndex;t.loop&&this.loopDestroy();var a=s+1;if("object"==typeof e&&"length"in e){for(var r=0;r<e.length;r+=1)e[r]&&i.prepend(e[r]);a=s+e.length}else i.prepend(e);t.loop&&this.loopCreate(),t.observer&&h.observer||this.update(),this.slideTo(a,0,!1)},addSlide:function(e,t){var i=this.$wrapperEl,s=this.params,a=this.activeIndex;s.loop&&(a-=this.loopedSlides,this.loopDestroy(),this.slides=i.children("."+s.slideClass));var r=this.slides.length;if(e<=0)this.prependSlide(t);else if(e>=r)this.appendSlide(t);else{for(var n=a>e?a+1:a,o=[],l=r-1;l>=e;l-=1){var d=this.slides.eq(l);d.remove(),o.unshift(d)}if("object"==typeof t&&"length"in t){for(var p=0;p<t.length;p+=1)t[p]&&i.append(t[p]);n=a>e?a+t.length:a}else i.append(t);for(var c=0;c<o.length;c+=1)i.append(o[c]);s.loop&&this.loopCreate(),s.observer&&h.observer||this.update(),s.loop?this.slideTo(n+this.loopedSlides,0,!1):this.slideTo(n,0,!1)}},removeSlide:function(e){var t=this.params,i=this.$wrapperEl,s=this.activeIndex;t.loop&&(s-=this.loopedSlides,this.loopDestroy(),this.slides=i.children("."+t.slideClass));var a,r=s;if("object"==typeof e&&"length"in e){for(var n=0;n<e.length;n+=1)a=e[n],this.slides[a]&&this.slides.eq(a).remove(),a<r&&(r-=1);r=Math.max(r,0)}else a=e,this.slides[a]&&this.slides.eq(a).remove(),a<r&&(r-=1),r=Math.max(r,0);t.loop&&this.loopCreate(),t.observer&&h.observer||this.update(),t.loop?this.slideTo(r+this.loopedSlides,0,!1):this.slideTo(r,0,!1)},removeAllSlides:function(){for(var e=[],t=0;t<this.slides.length;t+=1)e.push(t);this.removeSlide(e)}},A=(w=a.navigator.platform,y=a.navigator.userAgent,x={ios:!1,android:!1,androidChrome:!1,desktop:!1,iphone:!1,ipod:!1,ipad:!1,edge:!1,ie:!1,firefox:!1,macos:!1,windows:!1,cordova:!(!a.cordova&&!a.phonegap),phonegap:!(!a.cordova&&!a.phonegap),electron:!1},E=a.screen.width,T=a.screen.height,S=y.match(/(Android);?[\s\/]+([\d.]+)?/),C=y.match(/(iPad).*OS\s([\d_]+)/),M=y.match(/(iPod)(.*OS\s([\d_]+))?/),P=!C&&y.match(/(iPhone\sOS|iOS)\s([\d_]+)/),z=y.indexOf("MSIE ")>=0||y.indexOf("Trident/")>=0,k=y.indexOf("Edge/")>=0,$=y.indexOf("Gecko/")>=0&&y.indexOf("Firefox/")>=0,L="Win32"===w,I=y.toLowerCase().indexOf("electron")>=0,D="MacIntel"===w,!C&&D&&h.touch&&(1024===E&&1366===T||834===E&&1194===T||834===E&&1112===T||768===E&&1024===T)&&(C=y.match(/(Version)\/([\d.]+)/),D=!1),x.ie=z,x.edge=k,x.firefox=$,S&&!L&&(x.os="android",x.osVersion=S[2],x.android=!0,x.androidChrome=y.toLowerCase().indexOf("chrome")>=0),(C||P||M)&&(x.os="ios",x.ios=!0),P&&!M&&(x.osVersion=P[2].replace(/_/g,"."),x.iphone=!0),C&&(x.osVersion=C[2].replace(/_/g,"."),x.ipad=!0),M&&(x.osVersion=M[3]?M[3].replace(/_/g,"."):null,x.ipod=!0),x.ios&&x.osVersion&&y.indexOf("Version/")>=0&&"10"===x.osVersion.split(".")[0]&&(x.osVersion=y.toLowerCase().split("version/")[1].split(" ")[0]),x.webView=!(!(P||C||M)||!y.match(/.*AppleWebKit(?!.*Safari)/i)&&!a.navigator.standalone)||a.matchMedia&&a.matchMedia("(display-mode: standalone)").matches,x.webview=x.webView,x.standalone=x.webView,x.desktop=!(x.ios||x.android)||I,x.desktop&&(x.electron=I,x.macos=D,x.windows=L,x.macos&&(x.os="macos"),x.windows&&(x.os="windows")),x.pixelRatio=a.devicePixelRatio||1,x);function G(e){var t=this.touchEventsData,s=this.params,r=this.touches;if(!this.animating||!s.preventInteractionOnTransition){var o=e;o.originalEvent&&(o=o.originalEvent);var l=n(o.target);if(("wrapper"!==s.touchEventsTarget||l.closest(this.wrapperEl).length)&&(t.isTouchEvent="touchstart"===o.type,(t.isTouchEvent||!("which"in o)||3!==o.which)&&!(!t.isTouchEvent&&"button"in o&&o.button>0||t.isTouched&&t.isMoved)))if(s.noSwiping&&l.closest(s.noSwipingSelector?s.noSwipingSelector:"."+s.noSwipingClass)[0])this.allowClick=!0;else if(!s.swipeHandler||l.closest(s.swipeHandler)[0]){r.currentX="touchstart"===o.type?o.targetTouches[0].pageX:o.pageX,r.currentY="touchstart"===o.type?o.targetTouches[0].pageY:o.pageY;var h=r.currentX,p=r.currentY,c=s.edgeSwipeDetection||s.iOSEdgeSwipeDetection,u=s.edgeSwipeThreshold||s.iOSEdgeSwipeThreshold;if(!c||!(h<=u||h>=a.screen.width-u)){if(d.extend(t,{isTouched:!0,isMoved:!1,allowTouchCallbacks:!0,isScrolling:void 0,startMoving:void 0}),r.startX=h,r.startY=p,t.touchStartTime=d.now(),this.allowClick=!0,this.updateSize(),this.swipeDirection=void 0,s.threshold>0&&(t.allowThresholdMove=!1),"touchstart"!==o.type){var v=!0;l.is(t.formElements)&&(v=!1),i.activeElement&&n(i.activeElement).is(t.formElements)&&i.activeElement!==l[0]&&i.activeElement.blur();var f=v&&this.allowTouchMove&&s.touchStartPreventDefault;(s.touchStartForcePreventDefault||f)&&o.preventDefault()}this.emit("touchStart",o)}}}}function H(e){var t=this.touchEventsData,s=this.params,a=this.touches,r=this.rtlTranslate,o=e;if(o.originalEvent&&(o=o.originalEvent),t.isTouched){if(!t.isTouchEvent||"touchmove"===o.type){var l="touchmove"===o.type&&o.targetTouches&&(o.targetTouches[0]||o.changedTouches[0]),h="touchmove"===o.type?l.pageX:o.pageX,p="touchmove"===o.type?l.pageY:o.pageY;if(o.preventedByNestedSwiper)return a.startX=h,void(a.startY=p);if(!this.allowTouchMove)return this.allowClick=!1,void(t.isTouched&&(d.extend(a,{startX:h,startY:p,currentX:h,currentY:p}),t.touchStartTime=d.now()));if(t.isTouchEvent&&s.touchReleaseOnEdges&&!s.loop)if(this.isVertical()){if(p<a.startY&&this.translate<=this.maxTranslate()||p>a.startY&&this.translate>=this.minTranslate())return t.isTouched=!1,void(t.isMoved=!1)}else if(h<a.startX&&this.translate<=this.maxTranslate()||h>a.startX&&this.translate>=this.minTranslate())return;if(t.isTouchEvent&&i.activeElement&&o.target===i.activeElement&&n(o.target).is(t.formElements))return t.isMoved=!0,void(this.allowClick=!1);if(t.allowTouchCallbacks&&this.emit("touchMove",o),!(o.targetTouches&&o.targetTouches.length>1)){a.currentX=h,a.currentY=p;var c=a.currentX-a.startX,u=a.currentY-a.startY;if(!(this.params.threshold&&Math.sqrt(Math.pow(c,2)+Math.pow(u,2))<this.params.threshold)){var v;if(void 0===t.isScrolling)this.isHorizontal()&&a.currentY===a.startY||this.isVertical()&&a.currentX===a.startX?t.isScrolling=!1:c*c+u*u>=25&&(v=180*Math.atan2(Math.abs(u),Math.abs(c))/Math.PI,t.isScrolling=this.isHorizontal()?v>s.touchAngle:90-v>s.touchAngle);if(t.isScrolling&&this.emit("touchMoveOpposite",o),void 0===t.startMoving&&(a.currentX===a.startX&&a.currentY===a.startY||(t.startMoving=!0)),t.isScrolling)t.isTouched=!1;else if(t.startMoving){this.allowClick=!1,!s.cssMode&&o.cancelable&&o.preventDefault(),s.touchMoveStopPropagation&&!s.nested&&o.stopPropagation(),t.isMoved||(s.loop&&this.loopFix(),t.startTranslate=this.getTranslate(),this.setTransition(0),this.animating&&this.$wrapperEl.trigger("webkitTransitionEnd transitionend"),t.allowMomentumBounce=!1,!s.grabCursor||!0!==this.allowSlideNext&&!0!==this.allowSlidePrev||this.setGrabCursor(!0),this.emit("sliderFirstMove",o)),this.emit("sliderMove",o),t.isMoved=!0;var f=this.isHorizontal()?c:u;a.diff=f,f*=s.touchRatio,r&&(f=-f),this.swipeDirection=f>0?"prev":"next",t.currentTranslate=f+t.startTranslate;var m=!0,g=s.resistanceRatio;if(s.touchReleaseOnEdges&&(g=0),f>0&&t.currentTranslate>this.minTranslate()?(m=!1,s.resistance&&(t.currentTranslate=this.minTranslate()-1+Math.pow(-this.minTranslate()+t.startTranslate+f,g))):f<0&&t.currentTranslate<this.maxTranslate()&&(m=!1,s.resistance&&(t.currentTranslate=this.maxTranslate()+1-Math.pow(this.maxTranslate()-t.startTranslate-f,g))),m&&(o.preventedByNestedSwiper=!0),!this.allowSlideNext&&"next"===this.swipeDirection&&t.currentTranslate<t.startTranslate&&(t.currentTranslate=t.startTranslate),!this.allowSlidePrev&&"prev"===this.swipeDirection&&t.currentTranslate>t.startTranslate&&(t.currentTranslate=t.startTranslate),s.threshold>0){if(!(Math.abs(f)>s.threshold||t.allowThresholdMove))return void(t.currentTranslate=t.startTranslate);if(!t.allowThresholdMove)return t.allowThresholdMove=!0,a.startX=a.currentX,a.startY=a.currentY,t.currentTranslate=t.startTranslate,void(a.diff=this.isHorizontal()?a.currentX-a.startX:a.currentY-a.startY)}s.followFinger&&!s.cssMode&&((s.freeMode||s.watchSlidesProgress||s.watchSlidesVisibility)&&(this.updateActiveIndex(),this.updateSlidesClasses()),s.freeMode&&(0===t.velocities.length&&t.velocities.push({position:a[this.isHorizontal()?"startX":"startY"],time:t.touchStartTime}),t.velocities.push({position:a[this.isHorizontal()?"currentX":"currentY"],time:d.now()})),this.updateProgress(t.currentTranslate),this.setTranslate(t.currentTranslate))}}}}}else t.startMoving&&t.isScrolling&&this.emit("touchMoveOpposite",o)}function B(e){var t=this,i=t.touchEventsData,s=t.params,a=t.touches,r=t.rtlTranslate,n=t.$wrapperEl,o=t.slidesGrid,l=t.snapGrid,h=e;if(h.originalEvent&&(h=h.originalEvent),i.allowTouchCallbacks&&t.emit("touchEnd",h),i.allowTouchCallbacks=!1,!i.isTouched)return i.isMoved&&s.grabCursor&&t.setGrabCursor(!1),i.isMoved=!1,void(i.startMoving=!1);s.grabCursor&&i.isMoved&&i.isTouched&&(!0===t.allowSlideNext||!0===t.allowSlidePrev)&&t.setGrabCursor(!1);var p,c=d.now(),u=c-i.touchStartTime;if(t.allowClick&&(t.updateClickedSlide(h),t.emit("tap click",h),u<300&&c-i.lastClickTime<300&&t.emit("doubleTap doubleClick",h)),i.lastClickTime=d.now(),d.nextTick((function(){t.destroyed||(t.allowClick=!0)})),!i.isTouched||!i.isMoved||!t.swipeDirection||0===a.diff||i.currentTranslate===i.startTranslate)return i.isTouched=!1,i.isMoved=!1,void(i.startMoving=!1);if(i.isTouched=!1,i.isMoved=!1,i.startMoving=!1,p=s.followFinger?r?t.translate:-t.translate:-i.currentTranslate,!s.cssMode)if(s.freeMode){if(p<-t.minTranslate())return void t.slideTo(t.activeIndex);if(p>-t.maxTranslate())return void(t.slides.length<l.length?t.slideTo(l.length-1):t.slideTo(t.slides.length-1));if(s.freeModeMomentum){if(i.velocities.length>1){var v=i.velocities.pop(),f=i.velocities.pop(),m=v.position-f.position,g=v.time-f.time;t.velocity=m/g,t.velocity/=2,Math.abs(t.velocity)<s.freeModeMinimumVelocity&&(t.velocity=0),(g>150||d.now()-v.time>300)&&(t.velocity=0)}else t.velocity=0;t.velocity*=s.freeModeMomentumVelocityRatio,i.velocities.length=0;var b=1e3*s.freeModeMomentumRatio,w=t.velocity*b,y=t.translate+w;r&&(y=-y);var x,E,T=!1,S=20*Math.abs(t.velocity)*s.freeModeMomentumBounceRatio;if(y<t.maxTranslate())s.freeModeMomentumBounce?(y+t.maxTranslate()<-S&&(y=t.maxTranslate()-S),x=t.maxTranslate(),T=!0,i.allowMomentumBounce=!0):y=t.maxTranslate(),s.loop&&s.centeredSlides&&(E=!0);else if(y>t.minTranslate())s.freeModeMomentumBounce?(y-t.minTranslate()>S&&(y=t.minTranslate()+S),x=t.minTranslate(),T=!0,i.allowMomentumBounce=!0):y=t.minTranslate(),s.loop&&s.centeredSlides&&(E=!0);else if(s.freeModeSticky){for(var C,M=0;M<l.length;M+=1)if(l[M]>-y){C=M;break}y=-(y=Math.abs(l[C]-y)<Math.abs(l[C-1]-y)||"next"===t.swipeDirection?l[C]:l[C-1])}if(E&&t.once("transitionEnd",(function(){t.loopFix()})),0!==t.velocity){if(b=r?Math.abs((-y-t.translate)/t.velocity):Math.abs((y-t.translate)/t.velocity),s.freeModeSticky){var P=Math.abs((r?-y:y)-t.translate),z=t.slidesSizesGrid[t.activeIndex];b=P<z?s.speed:P<2*z?1.5*s.speed:2.5*s.speed}}else if(s.freeModeSticky)return void t.slideToClosest();s.freeModeMomentumBounce&&T?(t.updateProgress(x),t.setTransition(b),t.setTranslate(y),t.transitionStart(!0,t.swipeDirection),t.animating=!0,n.transitionEnd((function(){t&&!t.destroyed&&i.allowMomentumBounce&&(t.emit("momentumBounce"),t.setTransition(s.speed),setTimeout((function(){t.setTranslate(x),n.transitionEnd((function(){t&&!t.destroyed&&t.transitionEnd()}))}),0))}))):t.velocity?(t.updateProgress(y),t.setTransition(b),t.setTranslate(y),t.transitionStart(!0,t.swipeDirection),t.animating||(t.animating=!0,n.transitionEnd((function(){t&&!t.destroyed&&t.transitionEnd()})))):t.updateProgress(y),t.updateActiveIndex(),t.updateSlidesClasses()}else if(s.freeModeSticky)return void t.slideToClosest();(!s.freeModeMomentum||u>=s.longSwipesMs)&&(t.updateProgress(),t.updateActiveIndex(),t.updateSlidesClasses())}else{for(var k=0,$=t.slidesSizesGrid[0],L=0;L<o.length;L+=L<s.slidesPerGroupSkip?1:s.slidesPerGroup){var I=L<s.slidesPerGroupSkip-1?1:s.slidesPerGroup;void 0!==o[L+I]?p>=o[L]&&p<o[L+I]&&(k=L,$=o[L+I]-o[L]):p>=o[L]&&(k=L,$=o[o.length-1]-o[o.length-2])}var D=(p-o[k])/$,O=k<s.slidesPerGroupSkip-1?1:s.slidesPerGroup;if(u>s.longSwipesMs){if(!s.longSwipes)return void t.slideTo(t.activeIndex);"next"===t.swipeDirection&&(D>=s.longSwipesRatio?t.slideTo(k+O):t.slideTo(k)),"prev"===t.swipeDirection&&(D>1-s.longSwipesRatio?t.slideTo(k+O):t.slideTo(k))}else{if(!s.shortSwipes)return void t.slideTo(t.activeIndex);t.navigation&&(h.target===t.navigation.nextEl||h.target===t.navigation.prevEl)?h.target===t.navigation.nextEl?t.slideTo(k+O):t.slideTo(k):("next"===t.swipeDirection&&t.slideTo(k+O),"prev"===t.swipeDirection&&t.slideTo(k))}}}function N(){var e=this.params,t=this.el;if(!t||0!==t.offsetWidth){e.breakpoints&&this.setBreakpoint();var i=this.allowSlideNext,s=this.allowSlidePrev,a=this.snapGrid;this.allowSlideNext=!0,this.allowSlidePrev=!0,this.updateSize(),this.updateSlides(),this.updateSlidesClasses(),("auto"===e.slidesPerView||e.slidesPerView>1)&&this.isEnd&&!this.isBeginning&&!this.params.centeredSlides?this.slideTo(this.slides.length-1,0,!1,!0):this.slideTo(this.activeIndex,0,!1,!0),this.autoplay&&this.autoplay.running&&this.autoplay.paused&&this.autoplay.run(),this.allowSlidePrev=s,this.allowSlideNext=i,this.params.watchOverflow&&a!==this.snapGrid&&this.checkOverflow()}}function X(e){this.allowClick||(this.params.preventClicks&&e.preventDefault(),this.params.preventClicksPropagation&&this.animating&&(e.stopPropagation(),e.stopImmediatePropagation()))}function V(){var e=this.wrapperEl,t=this.rtlTranslate;this.previousTranslate=this.translate,this.isHorizontal()?this.translate=t?e.scrollWidth-e.offsetWidth-e.scrollLeft:-e.scrollLeft:this.translate=-e.scrollTop,-0===this.translate&&(this.translate=0),this.updateActiveIndex(),this.updateSlidesClasses();var i=this.maxTranslate()-this.minTranslate();(0===i?0:(this.translate-this.minTranslate())/i)!==this.progress&&this.updateProgress(t?-this.translate:this.translate),this.emit("setTranslate",this.translate,!1)}var Y=!1;function F(){}var W={init:!0,direction:"horizontal",touchEventsTarget:"container",initialSlide:0,speed:300,cssMode:!1,updateOnWindowResize:!0,preventInteractionOnTransition:!1,edgeSwipeDetection:!1,edgeSwipeThreshold:20,freeMode:!1,freeModeMomentum:!0,freeModeMomentumRatio:1,freeModeMomentumBounce:!0,freeModeMomentumBounceRatio:1,freeModeMomentumVelocityRatio:1,freeModeSticky:!1,freeModeMinimumVelocity:.02,autoHeight:!1,setWrapperSize:!1,virtualTranslate:!1,effect:"slide",breakpoints:void 0,spaceBetween:0,slidesPerView:1,slidesPerColumn:1,slidesPerColumnFill:"column",slidesPerGroup:1,slidesPerGroupSkip:0,centeredSlides:!1,centeredSlidesBounds:!1,slidesOffsetBefore:0,slidesOffsetAfter:0,normalizeSlideIndex:!0,centerInsufficientSlides:!1,watchOverflow:!1,roundLengths:!1,touchRatio:1,touchAngle:45,simulateTouch:!0,shortSwipes:!0,longSwipes:!0,longSwipesRatio:.5,longSwipesMs:300,followFinger:!0,allowTouchMove:!0,threshold:0,touchMoveStopPropagation:!1,touchStartPreventDefault:!0,touchStartForcePreventDefault:!1,touchReleaseOnEdges:!1,uniqueNavElements:!0,resistance:!0,resistanceRatio:.85,watchSlidesProgress:!1,watchSlidesVisibility:!1,grabCursor:!1,preventClicks:!0,preventClicksPropagation:!0,slideToClickedSlide:!1,preloadImages:!0,updateOnImagesReady:!0,loop:!1,loopAdditionalSlides:0,loopedSlides:null,loopFillGroupWithBlank:!1,allowSlidePrev:!0,allowSlideNext:!0,swipeHandler:null,noSwiping:!0,noSwipingClass:"swiper-no-swiping",noSwipingSelector:null,passiveListeners:!0,containerModifierClass:"swiper-container-",slideClass:"swiper-slide",slideBlankClass:"swiper-slide-invisible-blank",slideActiveClass:"swiper-slide-active",slideDuplicateActiveClass:"swiper-slide-duplicate-active",slideVisibleClass:"swiper-slide-visible",slideDuplicateClass:"swiper-slide-duplicate",slideNextClass:"swiper-slide-next",slideDuplicateNextClass:"swiper-slide-duplicate-next",slidePrevClass:"swiper-slide-prev",slideDuplicatePrevClass:"swiper-slide-duplicate-prev",wrapperClass:"swiper-wrapper",runCallbacksOnInit:!0},R={update:u,translate:v,transition:f,slide:m,loop:g,grabCursor:b,manipulation:O,events:{attachEvents:function(){var e=this.params,t=this.touchEvents,s=this.el,a=this.wrapperEl;this.onTouchStart=G.bind(this),this.onTouchMove=H.bind(this),this.onTouchEnd=B.bind(this),e.cssMode&&(this.onScroll=V.bind(this)),this.onClick=X.bind(this);var r=!!e.nested;if(!h.touch&&h.pointerEvents)s.addEventListener(t.start,this.onTouchStart,!1),i.addEventListener(t.move,this.onTouchMove,r),i.addEventListener(t.end,this.onTouchEnd,!1);else{if(h.touch){var n=!("touchstart"!==t.start||!h.passiveListener||!e.passiveListeners)&&{passive:!0,capture:!1};s.addEventListener(t.start,this.onTouchStart,n),s.addEventListener(t.move,this.onTouchMove,h.passiveListener?{passive:!1,capture:r}:r),s.addEventListener(t.end,this.onTouchEnd,n),t.cancel&&s.addEventListener(t.cancel,this.onTouchEnd,n),Y||(i.addEventListener("touchstart",F),Y=!0)}(e.simulateTouch&&!A.ios&&!A.android||e.simulateTouch&&!h.touch&&A.ios)&&(s.addEventListener("mousedown",this.onTouchStart,!1),i.addEventListener("mousemove",this.onTouchMove,r),i.addEventListener("mouseup",this.onTouchEnd,!1))}(e.preventClicks||e.preventClicksPropagation)&&s.addEventListener("click",this.onClick,!0),e.cssMode&&a.addEventListener("scroll",this.onScroll),e.updateOnWindowResize?this.on(A.ios||A.android?"resize orientationchange observerUpdate":"resize observerUpdate",N,!0):this.on("observerUpdate",N,!0)},detachEvents:function(){var e=this.params,t=this.touchEvents,s=this.el,a=this.wrapperEl,r=!!e.nested;if(!h.touch&&h.pointerEvents)s.removeEventListener(t.start,this.onTouchStart,!1),i.removeEventListener(t.move,this.onTouchMove,r),i.removeEventListener(t.end,this.onTouchEnd,!1);else{if(h.touch){var n=!("onTouchStart"!==t.start||!h.passiveListener||!e.passiveListeners)&&{passive:!0,capture:!1};s.removeEventListener(t.start,this.onTouchStart,n),s.removeEventListener(t.move,this.onTouchMove,r),s.removeEventListener(t.end,this.onTouchEnd,n),t.cancel&&s.removeEventListener(t.cancel,this.onTouchEnd,n)}(e.simulateTouch&&!A.ios&&!A.android||e.simulateTouch&&!h.touch&&A.ios)&&(s.removeEventListener("mousedown",this.onTouchStart,!1),i.removeEventListener("mousemove",this.onTouchMove,r),i.removeEventListener("mouseup",this.onTouchEnd,!1))}(e.preventClicks||e.preventClicksPropagation)&&s.removeEventListener("click",this.onClick,!0),e.cssMode&&a.removeEventListener("scroll",this.onScroll),this.off(A.ios||A.android?"resize orientationchange observerUpdate":"resize observerUpdate",N)}},breakpoints:{setBreakpoint:function(){var e=this.activeIndex,t=this.initialized,i=this.loopedSlides;void 0===i&&(i=0);var s=this.params,a=this.$el,r=s.breakpoints;if(r&&(!r||0!==Object.keys(r).length)){var n=this.getBreakpoint(r);if(n&&this.currentBreakpoint!==n){var o=n in r?r[n]:void 0;o&&["slidesPerView","spaceBetween","slidesPerGroup","slidesPerGroupSkip","slidesPerColumn"].forEach((function(e){var t=o[e];void 0!==t&&(o[e]="slidesPerView"!==e||"AUTO"!==t&&"auto"!==t?"slidesPerView"===e?parseFloat(t):parseInt(t,10):"auto")}));var l=o||this.originalParams,h=s.slidesPerColumn>1,p=l.slidesPerColumn>1;h&&!p?a.removeClass(s.containerModifierClass+"multirow "+s.containerModifierClass+"multirow-column"):!h&&p&&(a.addClass(s.containerModifierClass+"multirow"),"column"===l.slidesPerColumnFill&&a.addClass(s.containerModifierClass+"multirow-column"));var c=l.direction&&l.direction!==s.direction,u=s.loop&&(l.slidesPerView!==s.slidesPerView||c);c&&t&&this.changeDirection(),d.extend(this.params,l),d.extend(this,{allowTouchMove:this.params.allowTouchMove,allowSlideNext:this.params.allowSlideNext,allowSlidePrev:this.params.allowSlidePrev}),this.currentBreakpoint=n,u&&t&&(this.loopDestroy(),this.loopCreate(),this.updateSlides(),this.slideTo(e-i+this.loopedSlides,0,!1)),this.emit("breakpoint",l)}}},getBreakpoint:function(e){if(e){var t=!1,i=Object.keys(e).map((function(e){if("string"==typeof e&&0===e.indexOf("@")){var t=parseFloat(e.substr(1));return{value:a.innerHeight*t,point:e}}return{value:e,point:e}}));i.sort((function(e,t){return parseInt(e.value,10)-parseInt(t.value,10)}));for(var s=0;s<i.length;s+=1){var r=i[s],n=r.point;r.value<=a.innerWidth&&(t=n)}return t||"max"}}},checkOverflow:{checkOverflow:function(){var e=this.params,t=this.isLocked,i=this.slides.length>0&&e.slidesOffsetBefore+e.spaceBetween*(this.slides.length-1)+this.slides[0].offsetWidth*this.slides.length;e.slidesOffsetBefore&&e.slidesOffsetAfter&&i?this.isLocked=i<=this.size:this.isLocked=1===this.snapGrid.length,this.allowSlideNext=!this.isLocked,this.allowSlidePrev=!this.isLocked,t!==this.isLocked&&this.emit(this.isLocked?"lock":"unlock"),t&&t!==this.isLocked&&(this.isEnd=!1,this.navigation&&this.navigation.update())}},classes:{addClasses:function(){var e=this.classNames,t=this.params,i=this.rtl,s=this.$el,a=[];a.push("initialized"),a.push(t.direction),t.freeMode&&a.push("free-mode"),t.autoHeight&&a.push("autoheight"),i&&a.push("rtl"),t.slidesPerColumn>1&&(a.push("multirow"),"column"===t.slidesPerColumnFill&&a.push("multirow-column")),A.android&&a.push("android"),A.ios&&a.push("ios"),t.cssMode&&a.push("css-mode"),a.forEach((function(i){e.push(t.containerModifierClass+i)})),s.addClass(e.join(" "))},removeClasses:function(){var e=this.$el,t=this.classNames;e.removeClass(t.join(" "))}},images:{loadImage:function(e,t,i,s,r,o){var l;function d(){o&&o()}n(e).parent("picture")[0]||e.complete&&r?d():t?((l=new a.Image).onload=d,l.onerror=d,s&&(l.sizes=s),i&&(l.srcset=i),t&&(l.src=t)):d()},preloadImages:function(){var e=this;function t(){null!=e&&e&&!e.destroyed&&(void 0!==e.imagesLoaded&&(e.imagesLoaded+=1),e.imagesLoaded===e.imagesToLoad.length&&(e.params.updateOnImagesReady&&e.update(),e.emit("imagesReady")))}e.imagesToLoad=e.$el.find("img");for(var i=0;i<e.imagesToLoad.length;i+=1){var s=e.imagesToLoad[i];e.loadImage(s,s.currentSrc||s.getAttribute("src"),s.srcset||s.getAttribute("srcset"),s.sizes||s.getAttribute("sizes"),!0,t)}}}},q={},j=function(e){function t(){for(var i,s,a,r=[],o=arguments.length;o--;)r[o]=arguments[o];1===r.length&&r[0].constructor&&r[0].constructor===Object?a=r[0]:(s=(i=r)[0],a=i[1]),a||(a={}),a=d.extend({},a),s&&!a.el&&(a.el=s),e.call(this,a),Object.keys(R).forEach((function(e){Object.keys(R[e]).forEach((function(i){t.prototype[i]||(t.prototype[i]=R[e][i])}))}));var l=this;void 0===l.modules&&(l.modules={}),Object.keys(l.modules).forEach((function(e){var t=l.modules[e];if(t.params){var i=Object.keys(t.params)[0],s=t.params[i];if("object"!=typeof s||null===s)return;if(!(i in a)||!("enabled"in s))return;!0===a[i]&&(a[i]={enabled:!0}),"object"!=typeof a[i]||"enabled"in a[i]||(a[i].enabled=!0),a[i]||(a[i]={enabled:!1})}}));var p=d.extend({},W);l.useModulesParams(p),l.params=d.extend({},p,q,a),l.originalParams=d.extend({},l.params),l.passedParams=d.extend({},a),l.$=n;var c=n(l.params.el);if(s=c[0]){if(c.length>1){var u=[];return c.each((function(e,i){var s=d.extend({},a,{el:i});u.push(new t(s))})),u}var v,f,m;return s.swiper=l,c.data("swiper",l),s&&s.shadowRoot&&s.shadowRoot.querySelector?(v=n(s.shadowRoot.querySelector("."+l.params.wrapperClass))).children=function(e){return c.children(e)}:v=c.children("."+l.params.wrapperClass),d.extend(l,{$el:c,el:s,$wrapperEl:v,wrapperEl:v[0],classNames:[],slides:n(),slidesGrid:[],snapGrid:[],slidesSizesGrid:[],isHorizontal:function(){return"horizontal"===l.params.direction},isVertical:function(){return"vertical"===l.params.direction},rtl:"rtl"===s.dir.toLowerCase()||"rtl"===c.css("direction"),rtlTranslate:"horizontal"===l.params.direction&&("rtl"===s.dir.toLowerCase()||"rtl"===c.css("direction")),wrongRTL:"-webkit-box"===v.css("display"),activeIndex:0,realIndex:0,isBeginning:!0,isEnd:!1,translate:0,previousTranslate:0,progress:0,velocity:0,animating:!1,allowSlideNext:l.params.allowSlideNext,allowSlidePrev:l.params.allowSlidePrev,touchEvents:(f=["touchstart","touchmove","touchend","touchcancel"],m=["mousedown","mousemove","mouseup"],h.pointerEvents&&(m=["pointerdown","pointermove","pointerup"]),l.touchEventsTouch={start:f[0],move:f[1],end:f[2],cancel:f[3]},l.touchEventsDesktop={start:m[0],move:m[1],end:m[2]},h.touch||!l.params.simulateTouch?l.touchEventsTouch:l.touchEventsDesktop),touchEventsData:{isTouched:void 0,isMoved:void 0,allowTouchCallbacks:void 0,touchStartTime:void 0,isScrolling:void 0,currentTranslate:void 0,startTranslate:void 0,allowThresholdMove:void 0,formElements:"input, select, option, textarea, button, video, label",lastClickTime:d.now(),clickTimeout:void 0,velocities:[],allowMomentumBounce:void 0,isTouchEvent:void 0,startMoving:void 0},allowClick:!0,allowTouchMove:l.params.allowTouchMove,touches:{startX:0,startY:0,currentX:0,currentY:0,diff:0},imagesToLoad:[],imagesLoaded:0}),l.useModules(),l.params.init&&l.init(),l}}e&&(t.__proto__=e),t.prototype=Object.create(e&&e.prototype),t.prototype.constructor=t;var i={extendedDefaults:{configurable:!0},defaults:{configurable:!0},Class:{configurable:!0},$:{configurable:!0}};return t.prototype.slidesPerViewDynamic=function(){var e=this.params,t=this.slides,i=this.slidesGrid,s=this.size,a=this.activeIndex,r=1;if(e.centeredSlides){for(var n,o=t[a].swiperSlideSize,l=a+1;l<t.length;l+=1)t[l]&&!n&&(r+=1,(o+=t[l].swiperSlideSize)>s&&(n=!0));for(var d=a-1;d>=0;d-=1)t[d]&&!n&&(r+=1,(o+=t[d].swiperSlideSize)>s&&(n=!0))}else for(var h=a+1;h<t.length;h+=1)i[h]-i[a]<s&&(r+=1);return r},t.prototype.update=function(){var e=this;if(e&&!e.destroyed){var t=e.snapGrid,i=e.params;i.breakpoints&&e.setBreakpoint(),e.updateSize(),e.updateSlides(),e.updateProgress(),e.updateSlidesClasses(),e.params.freeMode?(s(),e.params.autoHeight&&e.updateAutoHeight()):(("auto"===e.params.slidesPerView||e.params.slidesPerView>1)&&e.isEnd&&!e.params.centeredSlides?e.slideTo(e.slides.length-1,0,!1,!0):e.slideTo(e.activeIndex,0,!1,!0))||s(),i.watchOverflow&&t!==e.snapGrid&&e.checkOverflow(),e.emit("update")}function s(){var t=e.rtlTranslate?-1*e.translate:e.translate,i=Math.min(Math.max(t,e.maxTranslate()),e.minTranslate());e.setTranslate(i),e.updateActiveIndex(),e.updateSlidesClasses()}},t.prototype.changeDirection=function(e,t){void 0===t&&(t=!0);var i=this.params.direction;return e||(e="horizontal"===i?"vertical":"horizontal"),e===i||"horizontal"!==e&&"vertical"!==e||(this.$el.removeClass(""+this.params.containerModifierClass+i).addClass(""+this.params.containerModifierClass+e),this.params.direction=e,this.slides.each((function(t,i){"vertical"===e?i.style.width="":i.style.height=""})),this.emit("changeDirection"),t&&this.update()),this},t.prototype.init=function(){this.initialized||(this.emit("beforeInit"),this.params.breakpoints&&this.setBreakpoint(),this.addClasses(),this.params.loop&&this.loopCreate(),this.updateSize(),this.updateSlides(),this.params.watchOverflow&&this.checkOverflow(),this.params.grabCursor&&this.setGrabCursor(),this.params.preloadImages&&this.preloadImages(),this.params.loop?this.slideTo(this.params.initialSlide+this.loopedSlides,0,this.params.runCallbacksOnInit):this.slideTo(this.params.initialSlide,0,this.params.runCallbacksOnInit),this.attachEvents(),this.initialized=!0,this.emit("init"))},t.prototype.destroy=function(e,t){void 0===e&&(e=!0),void 0===t&&(t=!0);var i=this,s=i.params,a=i.$el,r=i.$wrapperEl,n=i.slides;return void 0===i.params||i.destroyed||(i.emit("beforeDestroy"),i.initialized=!1,i.detachEvents(),s.loop&&i.loopDestroy(),t&&(i.removeClasses(),a.removeAttr("style"),r.removeAttr("style"),n&&n.length&&n.removeClass([s.slideVisibleClass,s.slideActiveClass,s.slideNextClass,s.slidePrevClass].join(" ")).removeAttr("style").removeAttr("data-swiper-slide-index")),i.emit("destroy"),Object.keys(i.eventsListeners).forEach((function(e){i.off(e)})),!1!==e&&(i.$el[0].swiper=null,i.$el.data("swiper",null),d.deleteProps(i)),i.destroyed=!0),null},t.extendDefaults=function(e){d.extend(q,e)},i.extendedDefaults.get=function(){return q},i.defaults.get=function(){return W},i.Class.get=function(){return e},i.$.get=function(){return n},Object.defineProperties(t,i),t}(p),K={name:"device",proto:{device:A},static:{device:A}},U={name:"support",proto:{support:h},static:{support:h}},_={isEdge:!!a.navigator.userAgent.match(/Edge/g),isSafari:function(){var e=a.navigator.userAgent.toLowerCase();return e.indexOf("safari")>=0&&e.indexOf("chrome")<0&&e.indexOf("android")<0}(),isWebView:/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(a.navigator.userAgent)},Z={name:"browser",proto:{browser:_},static:{browser:_}},Q={name:"resize",create:function(){var e=this;d.extend(e,{resize:{resizeHandler:function(){e&&!e.destroyed&&e.initialized&&(e.emit("beforeResize"),e.emit("resize"))},orientationChangeHandler:function(){e&&!e.destroyed&&e.initialized&&e.emit("orientationchange")}}})},on:{init:function(){a.addEventListener("resize",this.resize.resizeHandler),a.addEventListener("orientationchange",this.resize.orientationChangeHandler)},destroy:function(){a.removeEventListener("resize",this.resize.resizeHandler),a.removeEventListener("orientationchange",this.resize.orientationChangeHandler)}}},J={func:a.MutationObserver||a.WebkitMutationObserver,attach:function(e,t){void 0===t&&(t={});var i=this,s=new(0,J.func)((function(e){if(1!==e.length){var t=function(){i.emit("observerUpdate",e[0])};a.requestAnimationFrame?a.requestAnimationFrame(t):a.setTimeout(t,0)}else i.emit("observerUpdate",e[0])}));s.observe(e,{attributes:void 0===t.attributes||t.attributes,childList:void 0===t.childList||t.childList,characterData:void 0===t.characterData||t.characterData}),i.observer.observers.push(s)},init:function(){if(h.observer&&this.params.observer){if(this.params.observeParents)for(var e=this.$el.parents(),t=0;t<e.length;t+=1)this.observer.attach(e[t]);this.observer.attach(this.$el[0],{childList:this.params.observeSlideChildren}),this.observer.attach(this.$wrapperEl[0],{attributes:!1})}},destroy:function(){this.observer.observers.forEach((function(e){e.disconnect()})),this.observer.observers=[]}},ee={name:"observer",params:{observer:!1,observeParents:!1,observeSlideChildren:!1},create:function(){d.extend(this,{observer:{init:J.init.bind(this),attach:J.attach.bind(this),destroy:J.destroy.bind(this),observers:[]}})},on:{init:function(){this.observer.init()},destroy:function(){this.observer.destroy()}}},te={update:function(e){var t=this,i=t.params,s=i.slidesPerView,a=i.slidesPerGroup,r=i.centeredSlides,n=t.params.virtual,o=n.addSlidesBefore,l=n.addSlidesAfter,h=t.virtual,p=h.from,c=h.to,u=h.slides,v=h.slidesGrid,f=h.renderSlide,m=h.offset;t.updateActiveIndex();var g,b,w,y=t.activeIndex||0;g=t.rtlTranslate?"right":t.isHorizontal()?"left":"top",r?(b=Math.floor(s/2)+a+o,w=Math.floor(s/2)+a+l):(b=s+(a-1)+o,w=a+l);var x=Math.max((y||0)-w,0),E=Math.min((y||0)+b,u.length-1),T=(t.slidesGrid[x]||0)-(t.slidesGrid[0]||0);function S(){t.updateSlides(),t.updateProgress(),t.updateSlidesClasses(),t.lazy&&t.params.lazy.enabled&&t.lazy.load()}if(d.extend(t.virtual,{from:x,to:E,offset:T,slidesGrid:t.slidesGrid}),p===x&&c===E&&!e)return t.slidesGrid!==v&&T!==m&&t.slides.css(g,T+"px"),void t.updateProgress();if(t.params.virtual.renderExternal)return t.params.virtual.renderExternal.call(t,{offset:T,from:x,to:E,slides:function(){for(var e=[],t=x;t<=E;t+=1)e.push(u[t]);return e}()}),void S();var C=[],M=[];if(e)t.$wrapperEl.find("."+t.params.slideClass).remove();else for(var P=p;P<=c;P+=1)(P<x||P>E)&&t.$wrapperEl.find("."+t.params.slideClass+'[data-swiper-slide-index="'+P+'"]').remove();for(var z=0;z<u.length;z+=1)z>=x&&z<=E&&(void 0===c||e?M.push(z):(z>c&&M.push(z),z<p&&C.push(z)));M.forEach((function(e){t.$wrapperEl.append(f(u[e],e))})),C.sort((function(e,t){return t-e})).forEach((function(e){t.$wrapperEl.prepend(f(u[e],e))})),t.$wrapperEl.children(".swiper-slide").css(g,T+"px"),S()},renderSlide:function(e,t){var i=this.params.virtual;if(i.cache&&this.virtual.cache[t])return this.virtual.cache[t];var s=i.renderSlide?n(i.renderSlide.call(this,e,t)):n('<div class="'+this.params.slideClass+'" data-swiper-slide-index="'+t+'">'+e+"</div>");return s.attr("data-swiper-slide-index")||s.attr("data-swiper-slide-index",t),i.cache&&(this.virtual.cache[t]=s),s},appendSlide:function(e){if("object"==typeof e&&"length"in e)for(var t=0;t<e.length;t+=1)e[t]&&this.virtual.slides.push(e[t]);else this.virtual.slides.push(e);this.virtual.update(!0)},prependSlide:function(e){var t=this.activeIndex,i=t+1,s=1;if(Array.isArray(e)){for(var a=0;a<e.length;a+=1)e[a]&&this.virtual.slides.unshift(e[a]);i=t+e.length,s=e.length}else this.virtual.slides.unshift(e);if(this.params.virtual.cache){var r=this.virtual.cache,n={};Object.keys(r).forEach((function(e){var t=r[e],i=t.attr("data-swiper-slide-index");i&&t.attr("data-swiper-slide-index",parseInt(i,10)+1),n[parseInt(e,10)+s]=t})),this.virtual.cache=n}this.virtual.update(!0),this.slideTo(i,0)},removeSlide:function(e){if(null!=e){var t=this.activeIndex;if(Array.isArray(e))for(var i=e.length-1;i>=0;i-=1)this.virtual.slides.splice(e[i],1),this.params.virtual.cache&&delete this.virtual.cache[e[i]],e[i]<t&&(t-=1),t=Math.max(t,0);else this.virtual.slides.splice(e,1),this.params.virtual.cache&&delete this.virtual.cache[e],e<t&&(t-=1),t=Math.max(t,0);this.virtual.update(!0),this.slideTo(t,0)}},removeAllSlides:function(){this.virtual.slides=[],this.params.virtual.cache&&(this.virtual.cache={}),this.virtual.update(!0),this.slideTo(0,0)}},ie={name:"virtual",params:{virtual:{enabled:!1,slides:[],cache:!0,renderSlide:null,renderExternal:null,addSlidesBefore:0,addSlidesAfter:0}},create:function(){d.extend(this,{virtual:{update:te.update.bind(this),appendSlide:te.appendSlide.bind(this),prependSlide:te.prependSlide.bind(this),removeSlide:te.removeSlide.bind(this),removeAllSlides:te.removeAllSlides.bind(this),renderSlide:te.renderSlide.bind(this),slides:this.params.virtual.slides,cache:{}}})},on:{beforeInit:function(){if(this.params.virtual.enabled){this.classNames.push(this.params.containerModifierClass+"virtual");var e={watchSlidesProgress:!0};d.extend(this.params,e),d.extend(this.originalParams,e),this.params.initialSlide||this.virtual.update()}},setTranslate:function(){this.params.virtual.enabled&&this.virtual.update()}}},se={handle:function(e){var t=this.rtlTranslate,s=e;s.originalEvent&&(s=s.originalEvent);var r=s.keyCode||s.charCode,n=this.params.keyboard.pageUpDown,o=n&&33===r,l=n&&34===r,d=37===r,h=39===r,p=38===r,c=40===r;if(!this.allowSlideNext&&(this.isHorizontal()&&h||this.isVertical()&&c||l))return!1;if(!this.allowSlidePrev&&(this.isHorizontal()&&d||this.isVertical()&&p||o))return!1;if(!(s.shiftKey||s.altKey||s.ctrlKey||s.metaKey||i.activeElement&&i.activeElement.nodeName&&("input"===i.activeElement.nodeName.toLowerCase()||"textarea"===i.activeElement.nodeName.toLowerCase()))){if(this.params.keyboard.onlyInViewport&&(o||l||d||h||p||c)){var u=!1;if(this.$el.parents("."+this.params.slideClass).length>0&&0===this.$el.parents("."+this.params.slideActiveClass).length)return;var v=a.innerWidth,f=a.innerHeight,m=this.$el.offset();t&&(m.left-=this.$el[0].scrollLeft);for(var g=[[m.left,m.top],[m.left+this.width,m.top],[m.left,m.top+this.height],[m.left+this.width,m.top+this.height]],b=0;b<g.length;b+=1){var w=g[b];w[0]>=0&&w[0]<=v&&w[1]>=0&&w[1]<=f&&(u=!0)}if(!u)return}this.isHorizontal()?((o||l||d||h)&&(s.preventDefault?s.preventDefault():s.returnValue=!1),((l||h)&&!t||(o||d)&&t)&&this.slideNext(),((o||d)&&!t||(l||h)&&t)&&this.slidePrev()):((o||l||p||c)&&(s.preventDefault?s.preventDefault():s.returnValue=!1),(l||c)&&this.slideNext(),(o||p)&&this.slidePrev()),this.emit("keyPress",r)}},enable:function(){this.keyboard.enabled||(n(i).on("keydown",this.keyboard.handle),this.keyboard.enabled=!0)},disable:function(){this.keyboard.enabled&&(n(i).off("keydown",this.keyboard.handle),this.keyboard.enabled=!1)}},ae={name:"keyboard",params:{keyboard:{enabled:!1,onlyInViewport:!0,pageUpDown:!0}},create:function(){d.extend(this,{keyboard:{enabled:!1,enable:se.enable.bind(this),disable:se.disable.bind(this),handle:se.handle.bind(this)}})},on:{init:function(){this.params.keyboard.enabled&&this.keyboard.enable()},destroy:function(){this.keyboard.enabled&&this.keyboard.disable()}}};var re={lastScrollTime:d.now(),lastEventBeforeSnap:void 0,recentWheelEvents:[],event:function(){return a.navigator.userAgent.indexOf("firefox")>-1?"DOMMouseScroll":function(){var e="onwheel"in i;if(!e){var t=i.createElement("div");t.setAttribute("onwheel","return;"),e="function"==typeof t.onwheel}return!e&&i.implementation&&i.implementation.hasFeature&&!0!==i.implementation.hasFeature("","")&&(e=i.implementation.hasFeature("Events.wheel","3.0")),e}()?"wheel":"mousewheel"},normalize:function(e){var t=0,i=0,s=0,a=0;return"detail"in e&&(i=e.detail),"wheelDelta"in e&&(i=-e.wheelDelta/120),"wheelDeltaY"in e&&(i=-e.wheelDeltaY/120),"wheelDeltaX"in e&&(t=-e.wheelDeltaX/120),"axis"in e&&e.axis===e.HORIZONTAL_AXIS&&(t=i,i=0),s=10*t,a=10*i,"deltaY"in e&&(a=e.deltaY),"deltaX"in e&&(s=e.deltaX),e.shiftKey&&!s&&(s=a,a=0),(s||a)&&e.deltaMode&&(1===e.deltaMode?(s*=40,a*=40):(s*=800,a*=800)),s&&!t&&(t=s<1?-1:1),a&&!i&&(i=a<1?-1:1),{spinX:t,spinY:i,pixelX:s,pixelY:a}},handleMouseEnter:function(){this.mouseEntered=!0},handleMouseLeave:function(){this.mouseEntered=!1},handle:function(e){var t=e,i=this,s=i.params.mousewheel;i.params.cssMode&&t.preventDefault();var a=i.$el;if("container"!==i.params.mousewheel.eventsTarged&&(a=n(i.params.mousewheel.eventsTarged)),!i.mouseEntered&&!a[0].contains(t.target)&&!s.releaseOnEdges)return!0;t.originalEvent&&(t=t.originalEvent);var r=0,o=i.rtlTranslate?-1:1,l=re.normalize(t);if(s.forceToAxis)if(i.isHorizontal()){if(!(Math.abs(l.pixelX)>Math.abs(l.pixelY)))return!0;r=-l.pixelX*o}else{if(!(Math.abs(l.pixelY)>Math.abs(l.pixelX)))return!0;r=-l.pixelY}else r=Math.abs(l.pixelX)>Math.abs(l.pixelY)?-l.pixelX*o:-l.pixelY;if(0===r)return!0;if(s.invert&&(r=-r),i.params.freeMode){var h={time:d.now(),delta:Math.abs(r),direction:Math.sign(r)},p=i.mousewheel.lastEventBeforeSnap,c=p&&h.time<p.time+500&&h.delta<=p.delta&&h.direction===p.direction;if(!c){i.mousewheel.lastEventBeforeSnap=void 0,i.params.loop&&i.loopFix();var u=i.getTranslate()+r*s.sensitivity,v=i.isBeginning,f=i.isEnd;if(u>=i.minTranslate()&&(u=i.minTranslate()),u<=i.maxTranslate()&&(u=i.maxTranslate()),i.setTransition(0),i.setTranslate(u),i.updateProgress(),i.updateActiveIndex(),i.updateSlidesClasses(),(!v&&i.isBeginning||!f&&i.isEnd)&&i.updateSlidesClasses(),i.params.freeModeSticky){clearTimeout(i.mousewheel.timeout),i.mousewheel.timeout=void 0;var m=i.mousewheel.recentWheelEvents;m.length>=15&&m.shift();var g=m.length?m[m.length-1]:void 0,b=m[0];if(m.push(h),g&&(h.delta>g.delta||h.direction!==g.direction))m.splice(0);else if(m.length>=15&&h.time-b.time<500&&b.delta-h.delta>=1&&h.delta<=6){var w=r>0?.8:.2;i.mousewheel.lastEventBeforeSnap=h,m.splice(0),i.mousewheel.timeout=d.nextTick((function(){i.slideToClosest(i.params.speed,!0,void 0,w)}),0)}i.mousewheel.timeout||(i.mousewheel.timeout=d.nextTick((function(){i.mousewheel.lastEventBeforeSnap=h,m.splice(0),i.slideToClosest(i.params.speed,!0,void 0,.5)}),500))}if(c||i.emit("scroll",t),i.params.autoplay&&i.params.autoplayDisableOnInteraction&&i.autoplay.stop(),u===i.minTranslate()||u===i.maxTranslate())return!0}}else{var y={time:d.now(),delta:Math.abs(r),direction:Math.sign(r),raw:e},x=i.mousewheel.recentWheelEvents;x.length>=2&&x.shift();var E=x.length?x[x.length-1]:void 0;if(x.push(y),E?(y.direction!==E.direction||y.delta>E.delta||y.time>E.time+150)&&i.mousewheel.animateSlider(y):i.mousewheel.animateSlider(y),i.mousewheel.releaseScroll(y))return!0}return t.preventDefault?t.preventDefault():t.returnValue=!1,!1},animateSlider:function(e){return e.delta>=6&&d.now()-this.mousewheel.lastScrollTime<60||(e.direction<0?this.isEnd&&!this.params.loop||this.animating||(this.slideNext(),this.emit("scroll",e.raw)):this.isBeginning&&!this.params.loop||this.animating||(this.slidePrev(),this.emit("scroll",e.raw)),this.mousewheel.lastScrollTime=(new a.Date).getTime(),!1)},releaseScroll:function(e){var t=this.params.mousewheel;if(e.direction<0){if(this.isEnd&&!this.params.loop&&t.releaseOnEdges)return!0}else if(this.isBeginning&&!this.params.loop&&t.releaseOnEdges)return!0;return!1},enable:function(){var e=re.event();if(this.params.cssMode)return this.wrapperEl.removeEventListener(e,this.mousewheel.handle),!0;if(!e)return!1;if(this.mousewheel.enabled)return!1;var t=this.$el;return"container"!==this.params.mousewheel.eventsTarged&&(t=n(this.params.mousewheel.eventsTarged)),t.on("mouseenter",this.mousewheel.handleMouseEnter),t.on("mouseleave",this.mousewheel.handleMouseLeave),t.on(e,this.mousewheel.handle),this.mousewheel.enabled=!0,!0},disable:function(){var e=re.event();if(this.params.cssMode)return this.wrapperEl.addEventListener(e,this.mousewheel.handle),!0;if(!e)return!1;if(!this.mousewheel.enabled)return!1;var t=this.$el;return"container"!==this.params.mousewheel.eventsTarged&&(t=n(this.params.mousewheel.eventsTarged)),t.off(e,this.mousewheel.handle),this.mousewheel.enabled=!1,!0}},ne={update:function(){var e=this.params.navigation;if(!this.params.loop){var t=this.navigation,i=t.$nextEl,s=t.$prevEl;s&&s.length>0&&(this.isBeginning?s.addClass(e.disabledClass):s.removeClass(e.disabledClass),s[this.params.watchOverflow&&this.isLocked?"addClass":"removeClass"](e.lockClass)),i&&i.length>0&&(this.isEnd?i.addClass(e.disabledClass):i.removeClass(e.disabledClass),i[this.params.watchOverflow&&this.isLocked?"addClass":"removeClass"](e.lockClass))}},onPrevClick:function(e){e.preventDefault(),this.isBeginning&&!this.params.loop||this.slidePrev()},onNextClick:function(e){e.preventDefault(),this.isEnd&&!this.params.loop||this.slideNext()},init:function(){var e,t,i=this.params.navigation;(i.nextEl||i.prevEl)&&(i.nextEl&&(e=n(i.nextEl),this.params.uniqueNavElements&&"string"==typeof i.nextEl&&e.length>1&&1===this.$el.find(i.nextEl).length&&(e=this.$el.find(i.nextEl))),i.prevEl&&(t=n(i.prevEl),this.params.uniqueNavElements&&"string"==typeof i.prevEl&&t.length>1&&1===this.$el.find(i.prevEl).length&&(t=this.$el.find(i.prevEl))),e&&e.length>0&&e.on("click",this.navigation.onNextClick),t&&t.length>0&&t.on("click",this.navigation.onPrevClick),d.extend(this.navigation,{$nextEl:e,nextEl:e&&e[0],$prevEl:t,prevEl:t&&t[0]}))},destroy:function(){var e=this.navigation,t=e.$nextEl,i=e.$prevEl;t&&t.length&&(t.off("click",this.navigation.onNextClick),t.removeClass(this.params.navigation.disabledClass)),i&&i.length&&(i.off("click",this.navigation.onPrevClick),i.removeClass(this.params.navigation.disabledClass))}},oe={update:function(){var e=this.rtl,t=this.params.pagination;if(t.el&&this.pagination.el&&this.pagination.$el&&0!==this.pagination.$el.length){var i,s=this.virtual&&this.params.virtual.enabled?this.virtual.slides.length:this.slides.length,a=this.pagination.$el,r=this.params.loop?Math.ceil((s-2*this.loopedSlides)/this.params.slidesPerGroup):this.snapGrid.length;if(this.params.loop?((i=Math.ceil((this.activeIndex-this.loopedSlides)/this.params.slidesPerGroup))>s-1-2*this.loopedSlides&&(i-=s-2*this.loopedSlides),i>r-1&&(i-=r),i<0&&"bullets"!==this.params.paginationType&&(i=r+i)):i=void 0!==this.snapIndex?this.snapIndex:this.activeIndex||0,"bullets"===t.type&&this.pagination.bullets&&this.pagination.bullets.length>0){var o,l,d,h=this.pagination.bullets;if(t.dynamicBullets&&(this.pagination.bulletSize=h.eq(0)[this.isHorizontal()?"outerWidth":"outerHeight"](!0),a.css(this.isHorizontal()?"width":"height",this.pagination.bulletSize*(t.dynamicMainBullets+4)+"px"),t.dynamicMainBullets>1&&void 0!==this.previousIndex&&(this.pagination.dynamicBulletIndex+=i-this.previousIndex,this.pagination.dynamicBulletIndex>t.dynamicMainBullets-1?this.pagination.dynamicBulletIndex=t.dynamicMainBullets-1:this.pagination.dynamicBulletIndex<0&&(this.pagination.dynamicBulletIndex=0)),o=i-this.pagination.dynamicBulletIndex,d=((l=o+(Math.min(h.length,t.dynamicMainBullets)-1))+o)/2),h.removeClass(t.bulletActiveClass+" "+t.bulletActiveClass+"-next "+t.bulletActiveClass+"-next-next "+t.bulletActiveClass+"-prev "+t.bulletActiveClass+"-prev-prev "+t.bulletActiveClass+"-main"),a.length>1)h.each((function(e,s){var a=n(s),r=a.index();r===i&&a.addClass(t.bulletActiveClass),t.dynamicBullets&&(r>=o&&r<=l&&a.addClass(t.bulletActiveClass+"-main"),r===o&&a.prev().addClass(t.bulletActiveClass+"-prev").prev().addClass(t.bulletActiveClass+"-prev-prev"),r===l&&a.next().addClass(t.bulletActiveClass+"-next").next().addClass(t.bulletActiveClass+"-next-next"))}));else{var p=h.eq(i),c=p.index();if(p.addClass(t.bulletActiveClass),t.dynamicBullets){for(var u=h.eq(o),v=h.eq(l),f=o;f<=l;f+=1)h.eq(f).addClass(t.bulletActiveClass+"-main");if(this.params.loop)if(c>=h.length-t.dynamicMainBullets){for(var m=t.dynamicMainBullets;m>=0;m-=1)h.eq(h.length-m).addClass(t.bulletActiveClass+"-main");h.eq(h.length-t.dynamicMainBullets-1).addClass(t.bulletActiveClass+"-prev")}else u.prev().addClass(t.bulletActiveClass+"-prev").prev().addClass(t.bulletActiveClass+"-prev-prev"),v.next().addClass(t.bulletActiveClass+"-next").next().addClass(t.bulletActiveClass+"-next-next");else u.prev().addClass(t.bulletActiveClass+"-prev").prev().addClass(t.bulletActiveClass+"-prev-prev"),v.next().addClass(t.bulletActiveClass+"-next").next().addClass(t.bulletActiveClass+"-next-next")}}if(t.dynamicBullets){var g=Math.min(h.length,t.dynamicMainBullets+4),b=(this.pagination.bulletSize*g-this.pagination.bulletSize)/2-d*this.pagination.bulletSize,w=e?"right":"left";h.css(this.isHorizontal()?w:"top",b+"px")}}if("fraction"===t.type&&(a.find("."+t.currentClass).text(t.formatFractionCurrent(i+1)),a.find("."+t.totalClass).text(t.formatFractionTotal(r))),"progressbar"===t.type){var y;y=t.progressbarOpposite?this.isHorizontal()?"vertical":"horizontal":this.isHorizontal()?"horizontal":"vertical";var x=(i+1)/r,E=1,T=1;"horizontal"===y?E=x:T=x,a.find("."+t.progressbarFillClass).transform("translate3d(0,0,0) scaleX("+E+") scaleY("+T+")").transition(this.params.speed)}"custom"===t.type&&t.renderCustom?(a.html(t.renderCustom(this,i+1,r)),this.emit("paginationRender",this,a[0])):this.emit("paginationUpdate",this,a[0]),a[this.params.watchOverflow&&this.isLocked?"addClass":"removeClass"](t.lockClass)}},render:function(){var e=this.params.pagination;if(e.el&&this.pagination.el&&this.pagination.$el&&0!==this.pagination.$el.length){var t=this.virtual&&this.params.virtual.enabled?this.virtual.slides.length:this.slides.length,i=this.pagination.$el,s="";if("bullets"===e.type){for(var a=this.params.loop?Math.ceil((t-2*this.loopedSlides)/this.params.slidesPerGroup):this.snapGrid.length,r=0;r<a;r+=1)e.renderBullet?s+=e.renderBullet.call(this,r,e.bulletClass):s+="<"+e.bulletElement+' class="'+e.bulletClass+'"></'+e.bulletElement+">";i.html(s),this.pagination.bullets=i.find("."+e.bulletClass)}"fraction"===e.type&&(s=e.renderFraction?e.renderFraction.call(this,e.currentClass,e.totalClass):'<span class="'+e.currentClass+'"></span> / <span class="'+e.totalClass+'"></span>',i.html(s)),"progressbar"===e.type&&(s=e.renderProgressbar?e.renderProgressbar.call(this,e.progressbarFillClass):'<span class="'+e.progressbarFillClass+'"></span>',i.html(s)),"custom"!==e.type&&this.emit("paginationRender",this.pagination.$el[0])}},init:function(){var e=this,t=e.params.pagination;if(t.el){var i=n(t.el);0!==i.length&&(e.params.uniqueNavElements&&"string"==typeof t.el&&i.length>1&&(i=e.$el.find(t.el)),"bullets"===t.type&&t.clickable&&i.addClass(t.clickableClass),i.addClass(t.modifierClass+t.type),"bullets"===t.type&&t.dynamicBullets&&(i.addClass(""+t.modifierClass+t.type+"-dynamic"),e.pagination.dynamicBulletIndex=0,t.dynamicMainBullets<1&&(t.dynamicMainBullets=1)),"progressbar"===t.type&&t.progressbarOpposite&&i.addClass(t.progressbarOppositeClass),t.clickable&&i.on("click","."+t.bulletClass,(function(t){t.preventDefault();var i=n(this).index()*e.params.slidesPerGroup;e.params.loop&&(i+=e.loopedSlides),e.slideTo(i)})),d.extend(e.pagination,{$el:i,el:i[0]}))}},destroy:function(){var e=this.params.pagination;if(e.el&&this.pagination.el&&this.pagination.$el&&0!==this.pagination.$el.length){var t=this.pagination.$el;t.removeClass(e.hiddenClass),t.removeClass(e.modifierClass+e.type),this.pagination.bullets&&this.pagination.bullets.removeClass(e.bulletActiveClass),e.clickable&&t.off("click","."+e.bulletClass)}}},le={setTranslate:function(){if(this.params.scrollbar.el&&this.scrollbar.el){var e=this.scrollbar,t=this.rtlTranslate,i=this.progress,s=e.dragSize,a=e.trackSize,r=e.$dragEl,n=e.$el,o=this.params.scrollbar,l=s,d=(a-s)*i;t?(d=-d)>0?(l=s-d,d=0):-d+s>a&&(l=a+d):d<0?(l=s+d,d=0):d+s>a&&(l=a-d),this.isHorizontal()?(r.transform("translate3d("+d+"px, 0, 0)"),r[0].style.width=l+"px"):(r.transform("translate3d(0px, "+d+"px, 0)"),r[0].style.height=l+"px"),o.hide&&(clearTimeout(this.scrollbar.timeout),n[0].style.opacity=1,this.scrollbar.timeout=setTimeout((function(){n[0].style.opacity=0,n.transition(400)}),1e3))}},setTransition:function(e){this.params.scrollbar.el&&this.scrollbar.el&&this.scrollbar.$dragEl.transition(e)},updateSize:function(){if(this.params.scrollbar.el&&this.scrollbar.el){var e=this.scrollbar,t=e.$dragEl,i=e.$el;t[0].style.width="",t[0].style.height="";var s,a=this.isHorizontal()?i[0].offsetWidth:i[0].offsetHeight,r=this.size/this.virtualSize,n=r*(a/this.size);s="auto"===this.params.scrollbar.dragSize?a*r:parseInt(this.params.scrollbar.dragSize,10),this.isHorizontal()?t[0].style.width=s+"px":t[0].style.height=s+"px",i[0].style.display=r>=1?"none":"",this.params.scrollbar.hide&&(i[0].style.opacity=0),d.extend(e,{trackSize:a,divider:r,moveDivider:n,dragSize:s}),e.$el[this.params.watchOverflow&&this.isLocked?"addClass":"removeClass"](this.params.scrollbar.lockClass)}},getPointerPosition:function(e){return this.isHorizontal()?"touchstart"===e.type||"touchmove"===e.type?e.targetTouches[0].clientX:e.clientX:"touchstart"===e.type||"touchmove"===e.type?e.targetTouches[0].clientY:e.clientY},setDragPosition:function(e){var t,i=this.scrollbar,s=this.rtlTranslate,a=i.$el,r=i.dragSize,n=i.trackSize,o=i.dragStartPos;t=(i.getPointerPosition(e)-a.offset()[this.isHorizontal()?"left":"top"]-(null!==o?o:r/2))/(n-r),t=Math.max(Math.min(t,1),0),s&&(t=1-t);var l=this.minTranslate()+(this.maxTranslate()-this.minTranslate())*t;this.updateProgress(l),this.setTranslate(l),this.updateActiveIndex(),this.updateSlidesClasses()},onDragStart:function(e){var t=this.params.scrollbar,i=this.scrollbar,s=this.$wrapperEl,a=i.$el,r=i.$dragEl;this.scrollbar.isTouched=!0,this.scrollbar.dragStartPos=e.target===r[0]||e.target===r?i.getPointerPosition(e)-e.target.getBoundingClientRect()[this.isHorizontal()?"left":"top"]:null,e.preventDefault(),e.stopPropagation(),s.transition(100),r.transition(100),i.setDragPosition(e),clearTimeout(this.scrollbar.dragTimeout),a.transition(0),t.hide&&a.css("opacity",1),this.params.cssMode&&this.$wrapperEl.css("scroll-snap-type","none"),this.emit("scrollbarDragStart",e)},onDragMove:function(e){var t=this.scrollbar,i=this.$wrapperEl,s=t.$el,a=t.$dragEl;this.scrollbar.isTouched&&(e.preventDefault?e.preventDefault():e.returnValue=!1,t.setDragPosition(e),i.transition(0),s.transition(0),a.transition(0),this.emit("scrollbarDragMove",e))},onDragEnd:function(e){var t=this.params.scrollbar,i=this.scrollbar,s=this.$wrapperEl,a=i.$el;this.scrollbar.isTouched&&(this.scrollbar.isTouched=!1,this.params.cssMode&&(this.$wrapperEl.css("scroll-snap-type",""),s.transition("")),t.hide&&(clearTimeout(this.scrollbar.dragTimeout),this.scrollbar.dragTimeout=d.nextTick((function(){a.css("opacity",0),a.transition(400)}),1e3)),this.emit("scrollbarDragEnd",e),t.snapOnRelease&&this.slideToClosest())},enableDraggable:function(){if(this.params.scrollbar.el){var e=this.scrollbar,t=this.touchEventsTouch,s=this.touchEventsDesktop,a=this.params,r=e.$el[0],n=!(!h.passiveListener||!a.passiveListeners)&&{passive:!1,capture:!1},o=!(!h.passiveListener||!a.passiveListeners)&&{passive:!0,capture:!1};h.touch?(r.addEventListener(t.start,this.scrollbar.onDragStart,n),r.addEventListener(t.move,this.scrollbar.onDragMove,n),r.addEventListener(t.end,this.scrollbar.onDragEnd,o)):(r.addEventListener(s.start,this.scrollbar.onDragStart,n),i.addEventListener(s.move,this.scrollbar.onDragMove,n),i.addEventListener(s.end,this.scrollbar.onDragEnd,o))}},disableDraggable:function(){if(this.params.scrollbar.el){var e=this.scrollbar,t=this.touchEventsTouch,s=this.touchEventsDesktop,a=this.params,r=e.$el[0],n=!(!h.passiveListener||!a.passiveListeners)&&{passive:!1,capture:!1},o=!(!h.passiveListener||!a.passiveListeners)&&{passive:!0,capture:!1};h.touch?(r.removeEventListener(t.start,this.scrollbar.onDragStart,n),r.removeEventListener(t.move,this.scrollbar.onDragMove,n),r.removeEventListener(t.end,this.scrollbar.onDragEnd,o)):(r.removeEventListener(s.start,this.scrollbar.onDragStart,n),i.removeEventListener(s.move,this.scrollbar.onDragMove,n),i.removeEventListener(s.end,this.scrollbar.onDragEnd,o))}},init:function(){if(this.params.scrollbar.el){var e=this.scrollbar,t=this.$el,i=this.params.scrollbar,s=n(i.el);this.params.uniqueNavElements&&"string"==typeof i.el&&s.length>1&&1===t.find(i.el).length&&(s=t.find(i.el));var a=s.find("."+this.params.scrollbar.dragClass);0===a.length&&(a=n('<div class="'+this.params.scrollbar.dragClass+'"></div>'),s.append(a)),d.extend(e,{$el:s,el:s[0],$dragEl:a,dragEl:a[0]}),i.draggable&&e.enableDraggable()}},destroy:function(){this.scrollbar.disableDraggable()}},de={setTransform:function(e,t){var i=this.rtl,s=n(e),a=i?-1:1,r=s.attr("data-swiper-parallax")||"0",o=s.attr("data-swiper-parallax-x"),l=s.attr("data-swiper-parallax-y"),d=s.attr("data-swiper-parallax-scale"),h=s.attr("data-swiper-parallax-opacity");if(o||l?(o=o||"0",l=l||"0"):this.isHorizontal()?(o=r,l="0"):(l=r,o="0"),o=o.indexOf("%")>=0?parseInt(o,10)*t*a+"%":o*t*a+"px",l=l.indexOf("%")>=0?parseInt(l,10)*t+"%":l*t+"px",null!=h){var p=h-(h-1)*(1-Math.abs(t));s[0].style.opacity=p}if(null==d)s.transform("translate3d("+o+", "+l+", 0px)");else{var c=d-(d-1)*(1-Math.abs(t));s.transform("translate3d("+o+", "+l+", 0px) scale("+c+")")}},setTranslate:function(){var e=this,t=e.$el,i=e.slides,s=e.progress,a=e.snapGrid;t.children("[data-swiper-parallax], [data-swiper-parallax-x], [data-swiper-parallax-y], [data-swiper-parallax-opacity], [data-swiper-parallax-scale]").each((function(t,i){e.parallax.setTransform(i,s)})),i.each((function(t,i){var r=i.progress;e.params.slidesPerGroup>1&&"auto"!==e.params.slidesPerView&&(r+=Math.ceil(t/2)-s*(a.length-1)),r=Math.min(Math.max(r,-1),1),n(i).find("[data-swiper-parallax], [data-swiper-parallax-x], [data-swiper-parallax-y], [data-swiper-parallax-opacity], [data-swiper-parallax-scale]").each((function(t,i){e.parallax.setTransform(i,r)}))}))},setTransition:function(e){void 0===e&&(e=this.params.speed);this.$el.find("[data-swiper-parallax], [data-swiper-parallax-x], [data-swiper-parallax-y], [data-swiper-parallax-opacity], [data-swiper-parallax-scale]").each((function(t,i){var s=n(i),a=parseInt(s.attr("data-swiper-parallax-duration"),10)||e;0===e&&(a=0),s.transition(a)}))}},he={getDistanceBetweenTouches:function(e){if(e.targetTouches.length<2)return 1;var t=e.targetTouches[0].pageX,i=e.targetTouches[0].pageY,s=e.targetTouches[1].pageX,a=e.targetTouches[1].pageY;return Math.sqrt(Math.pow(s-t,2)+Math.pow(a-i,2))},onGestureStart:function(e){var t=this.params.zoom,i=this.zoom,s=i.gesture;if(i.fakeGestureTouched=!1,i.fakeGestureMoved=!1,!h.gestures){if("touchstart"!==e.type||"touchstart"===e.type&&e.targetTouches.length<2)return;i.fakeGestureTouched=!0,s.scaleStart=he.getDistanceBetweenTouches(e)}s.$slideEl&&s.$slideEl.length||(s.$slideEl=n(e.target).closest("."+this.params.slideClass),0===s.$slideEl.length&&(s.$slideEl=this.slides.eq(this.activeIndex)),s.$imageEl=s.$slideEl.find("img, svg, canvas, picture, .swiper-zoom-target"),s.$imageWrapEl=s.$imageEl.parent("."+t.containerClass),s.maxRatio=s.$imageWrapEl.attr("data-swiper-zoom")||t.maxRatio,0!==s.$imageWrapEl.length)?(s.$imageEl&&s.$imageEl.transition(0),this.zoom.isScaling=!0):s.$imageEl=void 0},onGestureChange:function(e){var t=this.params.zoom,i=this.zoom,s=i.gesture;if(!h.gestures){if("touchmove"!==e.type||"touchmove"===e.type&&e.targetTouches.length<2)return;i.fakeGestureMoved=!0,s.scaleMove=he.getDistanceBetweenTouches(e)}s.$imageEl&&0!==s.$imageEl.length&&(i.scale=h.gestures?e.scale*i.currentScale:s.scaleMove/s.scaleStart*i.currentScale,i.scale>s.maxRatio&&(i.scale=s.maxRatio-1+Math.pow(i.scale-s.maxRatio+1,.5)),i.scale<t.minRatio&&(i.scale=t.minRatio+1-Math.pow(t.minRatio-i.scale+1,.5)),s.$imageEl.transform("translate3d(0,0,0) scale("+i.scale+")"))},onGestureEnd:function(e){var t=this.params.zoom,i=this.zoom,s=i.gesture;if(!h.gestures){if(!i.fakeGestureTouched||!i.fakeGestureMoved)return;if("touchend"!==e.type||"touchend"===e.type&&e.changedTouches.length<2&&!A.android)return;i.fakeGestureTouched=!1,i.fakeGestureMoved=!1}s.$imageEl&&0!==s.$imageEl.length&&(i.scale=Math.max(Math.min(i.scale,s.maxRatio),t.minRatio),s.$imageEl.transition(this.params.speed).transform("translate3d(0,0,0) scale("+i.scale+")"),i.currentScale=i.scale,i.isScaling=!1,1===i.scale&&(s.$slideEl=void 0))},onTouchStart:function(e){var t=this.zoom,i=t.gesture,s=t.image;i.$imageEl&&0!==i.$imageEl.length&&(s.isTouched||(A.android&&e.cancelable&&e.preventDefault(),s.isTouched=!0,s.touchesStart.x="touchstart"===e.type?e.targetTouches[0].pageX:e.pageX,s.touchesStart.y="touchstart"===e.type?e.targetTouches[0].pageY:e.pageY))},onTouchMove:function(e){var t=this.zoom,i=t.gesture,s=t.image,a=t.velocity;if(i.$imageEl&&0!==i.$imageEl.length&&(this.allowClick=!1,s.isTouched&&i.$slideEl)){s.isMoved||(s.width=i.$imageEl[0].offsetWidth,s.height=i.$imageEl[0].offsetHeight,s.startX=d.getTranslate(i.$imageWrapEl[0],"x")||0,s.startY=d.getTranslate(i.$imageWrapEl[0],"y")||0,i.slideWidth=i.$slideEl[0].offsetWidth,i.slideHeight=i.$slideEl[0].offsetHeight,i.$imageWrapEl.transition(0),this.rtl&&(s.startX=-s.startX,s.startY=-s.startY));var r=s.width*t.scale,n=s.height*t.scale;if(!(r<i.slideWidth&&n<i.slideHeight)){if(s.minX=Math.min(i.slideWidth/2-r/2,0),s.maxX=-s.minX,s.minY=Math.min(i.slideHeight/2-n/2,0),s.maxY=-s.minY,s.touchesCurrent.x="touchmove"===e.type?e.targetTouches[0].pageX:e.pageX,s.touchesCurrent.y="touchmove"===e.type?e.targetTouches[0].pageY:e.pageY,!s.isMoved&&!t.isScaling){if(this.isHorizontal()&&(Math.floor(s.minX)===Math.floor(s.startX)&&s.touchesCurrent.x<s.touchesStart.x||Math.floor(s.maxX)===Math.floor(s.startX)&&s.touchesCurrent.x>s.touchesStart.x))return void(s.isTouched=!1);if(!this.isHorizontal()&&(Math.floor(s.minY)===Math.floor(s.startY)&&s.touchesCurrent.y<s.touchesStart.y||Math.floor(s.maxY)===Math.floor(s.startY)&&s.touchesCurrent.y>s.touchesStart.y))return void(s.isTouched=!1)}e.cancelable&&e.preventDefault(),e.stopPropagation(),s.isMoved=!0,s.currentX=s.touchesCurrent.x-s.touchesStart.x+s.startX,s.currentY=s.touchesCurrent.y-s.touchesStart.y+s.startY,s.currentX<s.minX&&(s.currentX=s.minX+1-Math.pow(s.minX-s.currentX+1,.8)),s.currentX>s.maxX&&(s.currentX=s.maxX-1+Math.pow(s.currentX-s.maxX+1,.8)),s.currentY<s.minY&&(s.currentY=s.minY+1-Math.pow(s.minY-s.currentY+1,.8)),s.currentY>s.maxY&&(s.currentY=s.maxY-1+Math.pow(s.currentY-s.maxY+1,.8)),a.prevPositionX||(a.prevPositionX=s.touchesCurrent.x),a.prevPositionY||(a.prevPositionY=s.touchesCurrent.y),a.prevTime||(a.prevTime=Date.now()),a.x=(s.touchesCurrent.x-a.prevPositionX)/(Date.now()-a.prevTime)/2,a.y=(s.touchesCurrent.y-a.prevPositionY)/(Date.now()-a.prevTime)/2,Math.abs(s.touchesCurrent.x-a.prevPositionX)<2&&(a.x=0),Math.abs(s.touchesCurrent.y-a.prevPositionY)<2&&(a.y=0),a.prevPositionX=s.touchesCurrent.x,a.prevPositionY=s.touchesCurrent.y,a.prevTime=Date.now(),i.$imageWrapEl.transform("translate3d("+s.currentX+"px, "+s.currentY+"px,0)")}}},onTouchEnd:function(){var e=this.zoom,t=e.gesture,i=e.image,s=e.velocity;if(t.$imageEl&&0!==t.$imageEl.length){if(!i.isTouched||!i.isMoved)return i.isTouched=!1,void(i.isMoved=!1);i.isTouched=!1,i.isMoved=!1;var a=300,r=300,n=s.x*a,o=i.currentX+n,l=s.y*r,d=i.currentY+l;0!==s.x&&(a=Math.abs((o-i.currentX)/s.x)),0!==s.y&&(r=Math.abs((d-i.currentY)/s.y));var h=Math.max(a,r);i.currentX=o,i.currentY=d;var p=i.width*e.scale,c=i.height*e.scale;i.minX=Math.min(t.slideWidth/2-p/2,0),i.maxX=-i.minX,i.minY=Math.min(t.slideHeight/2-c/2,0),i.maxY=-i.minY,i.currentX=Math.max(Math.min(i.currentX,i.maxX),i.minX),i.currentY=Math.max(Math.min(i.currentY,i.maxY),i.minY),t.$imageWrapEl.transition(h).transform("translate3d("+i.currentX+"px, "+i.currentY+"px,0)")}},onTransitionEnd:function(){var e=this.zoom,t=e.gesture;t.$slideEl&&this.previousIndex!==this.activeIndex&&(t.$imageEl&&t.$imageEl.transform("translate3d(0,0,0) scale(1)"),t.$imageWrapEl&&t.$imageWrapEl.transform("translate3d(0,0,0)"),e.scale=1,e.currentScale=1,t.$slideEl=void 0,t.$imageEl=void 0,t.$imageWrapEl=void 0)},toggle:function(e){var t=this.zoom;t.scale&&1!==t.scale?t.out():t.in(e)},in:function(e){var t,i,s,a,r,n,o,l,d,h,p,c,u,v,f,m,g=this.zoom,b=this.params.zoom,w=g.gesture,y=g.image;(w.$slideEl||(this.params.virtual&&this.params.virtual.enabled&&this.virtual?w.$slideEl=this.$wrapperEl.children("."+this.params.slideActiveClass):w.$slideEl=this.slides.eq(this.activeIndex),w.$imageEl=w.$slideEl.find("img, svg, canvas, picture, .swiper-zoom-target"),w.$imageWrapEl=w.$imageEl.parent("."+b.containerClass)),w.$imageEl&&0!==w.$imageEl.length)&&(w.$slideEl.addClass(""+b.zoomedSlideClass),void 0===y.touchesStart.x&&e?(t="touchend"===e.type?e.changedTouches[0].pageX:e.pageX,i="touchend"===e.type?e.changedTouches[0].pageY:e.pageY):(t=y.touchesStart.x,i=y.touchesStart.y),g.scale=w.$imageWrapEl.attr("data-swiper-zoom")||b.maxRatio,g.currentScale=w.$imageWrapEl.attr("data-swiper-zoom")||b.maxRatio,e?(f=w.$slideEl[0].offsetWidth,m=w.$slideEl[0].offsetHeight,s=w.$slideEl.offset().left+f/2-t,a=w.$slideEl.offset().top+m/2-i,o=w.$imageEl[0].offsetWidth,l=w.$imageEl[0].offsetHeight,d=o*g.scale,h=l*g.scale,u=-(p=Math.min(f/2-d/2,0)),v=-(c=Math.min(m/2-h/2,0)),(r=s*g.scale)<p&&(r=p),r>u&&(r=u),(n=a*g.scale)<c&&(n=c),n>v&&(n=v)):(r=0,n=0),w.$imageWrapEl.transition(300).transform("translate3d("+r+"px, "+n+"px,0)"),w.$imageEl.transition(300).transform("translate3d(0,0,0) scale("+g.scale+")"))},out:function(){var e=this.zoom,t=this.params.zoom,i=e.gesture;i.$slideEl||(this.params.virtual&&this.params.virtual.enabled&&this.virtual?i.$slideEl=this.$wrapperEl.children("."+this.params.slideActiveClass):i.$slideEl=this.slides.eq(this.activeIndex),i.$imageEl=i.$slideEl.find("img, svg, canvas, picture, .swiper-zoom-target"),i.$imageWrapEl=i.$imageEl.parent("."+t.containerClass)),i.$imageEl&&0!==i.$imageEl.length&&(e.scale=1,e.currentScale=1,i.$imageWrapEl.transition(300).transform("translate3d(0,0,0)"),i.$imageEl.transition(300).transform("translate3d(0,0,0) scale(1)"),i.$slideEl.removeClass(""+t.zoomedSlideClass),i.$slideEl=void 0)},enable:function(){var e=this.zoom;if(!e.enabled){e.enabled=!0;var t=!("touchstart"!==this.touchEvents.start||!h.passiveListener||!this.params.passiveListeners)&&{passive:!0,capture:!1},i=!h.passiveListener||{passive:!1,capture:!0},s="."+this.params.slideClass;h.gestures?(this.$wrapperEl.on("gesturestart",s,e.onGestureStart,t),this.$wrapperEl.on("gesturechange",s,e.onGestureChange,t),this.$wrapperEl.on("gestureend",s,e.onGestureEnd,t)):"touchstart"===this.touchEvents.start&&(this.$wrapperEl.on(this.touchEvents.start,s,e.onGestureStart,t),this.$wrapperEl.on(this.touchEvents.move,s,e.onGestureChange,i),this.$wrapperEl.on(this.touchEvents.end,s,e.onGestureEnd,t),this.touchEvents.cancel&&this.$wrapperEl.on(this.touchEvents.cancel,s,e.onGestureEnd,t)),this.$wrapperEl.on(this.touchEvents.move,"."+this.params.zoom.containerClass,e.onTouchMove,i)}},disable:function(){var e=this.zoom;if(e.enabled){this.zoom.enabled=!1;var t=!("touchstart"!==this.touchEvents.start||!h.passiveListener||!this.params.passiveListeners)&&{passive:!0,capture:!1},i=!h.passiveListener||{passive:!1,capture:!0},s="."+this.params.slideClass;h.gestures?(this.$wrapperEl.off("gesturestart",s,e.onGestureStart,t),this.$wrapperEl.off("gesturechange",s,e.onGestureChange,t),this.$wrapperEl.off("gestureend",s,e.onGestureEnd,t)):"touchstart"===this.touchEvents.start&&(this.$wrapperEl.off(this.touchEvents.start,s,e.onGestureStart,t),this.$wrapperEl.off(this.touchEvents.move,s,e.onGestureChange,i),this.$wrapperEl.off(this.touchEvents.end,s,e.onGestureEnd,t),this.touchEvents.cancel&&this.$wrapperEl.off(this.touchEvents.cancel,s,e.onGestureEnd,t)),this.$wrapperEl.off(this.touchEvents.move,"."+this.params.zoom.containerClass,e.onTouchMove,i)}}},pe={loadInSlide:function(e,t){void 0===t&&(t=!0);var i=this,s=i.params.lazy;if(void 0!==e&&0!==i.slides.length){var a=i.virtual&&i.params.virtual.enabled?i.$wrapperEl.children("."+i.params.slideClass+'[data-swiper-slide-index="'+e+'"]'):i.slides.eq(e),r=a.find("."+s.elementClass+":not(."+s.loadedClass+"):not(."+s.loadingClass+")");!a.hasClass(s.elementClass)||a.hasClass(s.loadedClass)||a.hasClass(s.loadingClass)||(r=r.add(a[0])),0!==r.length&&r.each((function(e,r){var o=n(r);o.addClass(s.loadingClass);var l=o.attr("data-background"),d=o.attr("data-src"),h=o.attr("data-srcset"),p=o.attr("data-sizes"),c=o.parent("picture");i.loadImage(o[0],d||l,h,p,!1,(function(){if(null!=i&&i&&(!i||i.params)&&!i.destroyed){if(l?(o.css("background-image",'url("'+l+'")'),o.removeAttr("data-background")):(h&&(o.attr("srcset",h),o.removeAttr("data-srcset")),p&&(o.attr("sizes",p),o.removeAttr("data-sizes")),c.length&&c.children("source").each((function(e,t){var i=n(t);i.attr("data-srcset")&&(i.attr("srcset",i.attr("data-srcset")),i.removeAttr("data-srcset"))})),d&&(o.attr("src",d),o.removeAttr("data-src"))),o.addClass(s.loadedClass).removeClass(s.loadingClass),a.find("."+s.preloaderClass).remove(),i.params.loop&&t){var e=a.attr("data-swiper-slide-index");if(a.hasClass(i.params.slideDuplicateClass)){var r=i.$wrapperEl.children('[data-swiper-slide-index="'+e+'"]:not(.'+i.params.slideDuplicateClass+")");i.lazy.loadInSlide(r.index(),!1)}else{var u=i.$wrapperEl.children("."+i.params.slideDuplicateClass+'[data-swiper-slide-index="'+e+'"]');i.lazy.loadInSlide(u.index(),!1)}}i.emit("lazyImageReady",a[0],o[0]),i.params.autoHeight&&i.updateAutoHeight()}})),i.emit("lazyImageLoad",a[0],o[0])}))}},load:function(){var e=this,t=e.$wrapperEl,i=e.params,s=e.slides,a=e.activeIndex,r=e.virtual&&i.virtual.enabled,o=i.lazy,l=i.slidesPerView;function d(e){if(r){if(t.children("."+i.slideClass+'[data-swiper-slide-index="'+e+'"]').length)return!0}else if(s[e])return!0;return!1}function h(e){return r?n(e).attr("data-swiper-slide-index"):n(e).index()}if("auto"===l&&(l=0),e.lazy.initialImageLoaded||(e.lazy.initialImageLoaded=!0),e.params.watchSlidesVisibility)t.children("."+i.slideVisibleClass).each((function(t,i){var s=r?n(i).attr("data-swiper-slide-index"):n(i).index();e.lazy.loadInSlide(s)}));else if(l>1)for(var p=a;p<a+l;p+=1)d(p)&&e.lazy.loadInSlide(p);else e.lazy.loadInSlide(a);if(o.loadPrevNext)if(l>1||o.loadPrevNextAmount&&o.loadPrevNextAmount>1){for(var c=o.loadPrevNextAmount,u=l,v=Math.min(a+u+Math.max(c,u),s.length),f=Math.max(a-Math.max(u,c),0),m=a+l;m<v;m+=1)d(m)&&e.lazy.loadInSlide(m);for(var g=f;g<a;g+=1)d(g)&&e.lazy.loadInSlide(g)}else{var b=t.children("."+i.slideNextClass);b.length>0&&e.lazy.loadInSlide(h(b));var w=t.children("."+i.slidePrevClass);w.length>0&&e.lazy.loadInSlide(h(w))}}},ce={LinearSpline:function(e,t){var i,s,a,r,n,o=function(e,t){for(s=-1,i=e.length;i-s>1;)e[a=i+s>>1]<=t?s=a:i=a;return i};return this.x=e,this.y=t,this.lastIndex=e.length-1,this.interpolate=function(e){return e?(n=o(this.x,e),r=n-1,(e-this.x[r])*(this.y[n]-this.y[r])/(this.x[n]-this.x[r])+this.y[r]):0},this},getInterpolateFunction:function(e){this.controller.spline||(this.controller.spline=this.params.loop?new ce.LinearSpline(this.slidesGrid,e.slidesGrid):new ce.LinearSpline(this.snapGrid,e.snapGrid))},setTranslate:function(e,t){var i,s,a=this,r=a.controller.control;function n(e){var t=a.rtlTranslate?-a.translate:a.translate;"slide"===a.params.controller.by&&(a.controller.getInterpolateFunction(e),s=-a.controller.spline.interpolate(-t)),s&&"container"!==a.params.controller.by||(i=(e.maxTranslate()-e.minTranslate())/(a.maxTranslate()-a.minTranslate()),s=(t-a.minTranslate())*i+e.minTranslate()),a.params.controller.inverse&&(s=e.maxTranslate()-s),e.updateProgress(s),e.setTranslate(s,a),e.updateActiveIndex(),e.updateSlidesClasses()}if(Array.isArray(r))for(var o=0;o<r.length;o+=1)r[o]!==t&&r[o]instanceof j&&n(r[o]);else r instanceof j&&t!==r&&n(r)},setTransition:function(e,t){var i,s=this,a=s.controller.control;function r(t){t.setTransition(e,s),0!==e&&(t.transitionStart(),t.params.autoHeight&&d.nextTick((function(){t.updateAutoHeight()})),t.$wrapperEl.transitionEnd((function(){a&&(t.params.loop&&"slide"===s.params.controller.by&&t.loopFix(),t.transitionEnd())})))}if(Array.isArray(a))for(i=0;i<a.length;i+=1)a[i]!==t&&a[i]instanceof j&&r(a[i]);else a instanceof j&&t!==a&&r(a)}},ue={makeElFocusable:function(e){return e.attr("tabIndex","0"),e},makeElNotFocusable:function(e){return e.attr("tabIndex","-1"),e},addElRole:function(e,t){return e.attr("role",t),e},addElLabel:function(e,t){return e.attr("aria-label",t),e},disableEl:function(e){return e.attr("aria-disabled",!0),e},enableEl:function(e){return e.attr("aria-disabled",!1),e},onEnterKey:function(e){var t=this.params.a11y;if(13===e.keyCode){var i=n(e.target);this.navigation&&this.navigation.$nextEl&&i.is(this.navigation.$nextEl)&&(this.isEnd&&!this.params.loop||this.slideNext(),this.isEnd?this.a11y.notify(t.lastSlideMessage):this.a11y.notify(t.nextSlideMessage)),this.navigation&&this.navigation.$prevEl&&i.is(this.navigation.$prevEl)&&(this.isBeginning&&!this.params.loop||this.slidePrev(),this.isBeginning?this.a11y.notify(t.firstSlideMessage):this.a11y.notify(t.prevSlideMessage)),this.pagination&&i.is("."+this.params.pagination.bulletClass)&&i[0].click()}},notify:function(e){var t=this.a11y.liveRegion;0!==t.length&&(t.html(""),t.html(e))},updateNavigation:function(){if(!this.params.loop&&this.navigation){var e=this.navigation,t=e.$nextEl,i=e.$prevEl;i&&i.length>0&&(this.isBeginning?(this.a11y.disableEl(i),this.a11y.makeElNotFocusable(i)):(this.a11y.enableEl(i),this.a11y.makeElFocusable(i))),t&&t.length>0&&(this.isEnd?(this.a11y.disableEl(t),this.a11y.makeElNotFocusable(t)):(this.a11y.enableEl(t),this.a11y.makeElFocusable(t)))}},updatePagination:function(){var e=this,t=e.params.a11y;e.pagination&&e.params.pagination.clickable&&e.pagination.bullets&&e.pagination.bullets.length&&e.pagination.bullets.each((function(i,s){var a=n(s);e.a11y.makeElFocusable(a),e.a11y.addElRole(a,"button"),e.a11y.addElLabel(a,t.paginationBulletMessage.replace(/\{\{index\}\}/,a.index()+1))}))},init:function(){this.$el.append(this.a11y.liveRegion);var e,t,i=this.params.a11y;this.navigation&&this.navigation.$nextEl&&(e=this.navigation.$nextEl),this.navigation&&this.navigation.$prevEl&&(t=this.navigation.$prevEl),e&&(this.a11y.makeElFocusable(e),this.a11y.addElRole(e,"button"),this.a11y.addElLabel(e,i.nextSlideMessage),e.on("keydown",this.a11y.onEnterKey)),t&&(this.a11y.makeElFocusable(t),this.a11y.addElRole(t,"button"),this.a11y.addElLabel(t,i.prevSlideMessage),t.on("keydown",this.a11y.onEnterKey)),this.pagination&&this.params.pagination.clickable&&this.pagination.bullets&&this.pagination.bullets.length&&this.pagination.$el.on("keydown","."+this.params.pagination.bulletClass,this.a11y.onEnterKey)},destroy:function(){var e,t;this.a11y.liveRegion&&this.a11y.liveRegion.length>0&&this.a11y.liveRegion.remove(),this.navigation&&this.navigation.$nextEl&&(e=this.navigation.$nextEl),this.navigation&&this.navigation.$prevEl&&(t=this.navigation.$prevEl),e&&e.off("keydown",this.a11y.onEnterKey),t&&t.off("keydown",this.a11y.onEnterKey),this.pagination&&this.params.pagination.clickable&&this.pagination.bullets&&this.pagination.bullets.length&&this.pagination.$el.off("keydown","."+this.params.pagination.bulletClass,this.a11y.onEnterKey)}},ve={init:function(){if(this.params.history){if(!a.history||!a.history.pushState)return this.params.history.enabled=!1,void(this.params.hashNavigation.enabled=!0);var e=this.history;e.initialized=!0,e.paths=ve.getPathValues(),(e.paths.key||e.paths.value)&&(e.scrollToSlide(0,e.paths.value,this.params.runCallbacksOnInit),this.params.history.replaceState||a.addEventListener("popstate",this.history.setHistoryPopState))}},destroy:function(){this.params.history.replaceState||a.removeEventListener("popstate",this.history.setHistoryPopState)},setHistoryPopState:function(){this.history.paths=ve.getPathValues(),this.history.scrollToSlide(this.params.speed,this.history.paths.value,!1)},getPathValues:function(){var e=a.location.pathname.slice(1).split("/").filter((function(e){return""!==e})),t=e.length;return{key:e[t-2],value:e[t-1]}},setHistory:function(e,t){if(this.history.initialized&&this.params.history.enabled){var i=this.slides.eq(t),s=ve.slugify(i.attr("data-history"));a.location.pathname.includes(e)||(s=e+"/"+s);var r=a.history.state;r&&r.value===s||(this.params.history.replaceState?a.history.replaceState({value:s},null,s):a.history.pushState({value:s},null,s))}},slugify:function(e){return e.toString().replace(/\s+/g,"-").replace(/[^\w-]+/g,"").replace(/--+/g,"-").replace(/^-+/,"").replace(/-+$/,"")},scrollToSlide:function(e,t,i){if(t)for(var s=0,a=this.slides.length;s<a;s+=1){var r=this.slides.eq(s);if(ve.slugify(r.attr("data-history"))===t&&!r.hasClass(this.params.slideDuplicateClass)){var n=r.index();this.slideTo(n,e,i)}}else this.slideTo(0,e,i)}},fe={onHashCange:function(){this.emit("hashChange");var e=i.location.hash.replace("#","");if(e!==this.slides.eq(this.activeIndex).attr("data-hash")){var t=this.$wrapperEl.children("."+this.params.slideClass+'[data-hash="'+e+'"]').index();if(void 0===t)return;this.slideTo(t)}},setHash:function(){if(this.hashNavigation.initialized&&this.params.hashNavigation.enabled)if(this.params.hashNavigation.replaceState&&a.history&&a.history.replaceState)a.history.replaceState(null,null,"#"+this.slides.eq(this.activeIndex).attr("data-hash")||""),this.emit("hashSet");else{var e=this.slides.eq(this.activeIndex),t=e.attr("data-hash")||e.attr("data-history");i.location.hash=t||"",this.emit("hashSet")}},init:function(){if(!(!this.params.hashNavigation.enabled||this.params.history&&this.params.history.enabled)){this.hashNavigation.initialized=!0;var e=i.location.hash.replace("#","");if(e)for(var t=0,s=this.slides.length;t<s;t+=1){var r=this.slides.eq(t);if((r.attr("data-hash")||r.attr("data-history"))===e&&!r.hasClass(this.params.slideDuplicateClass)){var o=r.index();this.slideTo(o,0,this.params.runCallbacksOnInit,!0)}}this.params.hashNavigation.watchState&&n(a).on("hashchange",this.hashNavigation.onHashCange)}},destroy:function(){this.params.hashNavigation.watchState&&n(a).off("hashchange",this.hashNavigation.onHashCange)}},me={run:function(){var e=this,t=e.slides.eq(e.activeIndex),i=e.params.autoplay.delay;t.attr("data-swiper-autoplay")&&(i=t.attr("data-swiper-autoplay")||e.params.autoplay.delay),clearTimeout(e.autoplay.timeout),e.autoplay.timeout=d.nextTick((function(){e.params.autoplay.reverseDirection?e.params.loop?(e.loopFix(),e.slidePrev(e.params.speed,!0,!0),e.emit("autoplay")):e.isBeginning?e.params.autoplay.stopOnLastSlide?e.autoplay.stop():(e.slideTo(e.slides.length-1,e.params.speed,!0,!0),e.emit("autoplay")):(e.slidePrev(e.params.speed,!0,!0),e.emit("autoplay")):e.params.loop?(e.loopFix(),e.slideNext(e.params.speed,!0,!0),e.emit("autoplay")):e.isEnd?e.params.autoplay.stopOnLastSlide?e.autoplay.stop():(e.slideTo(0,e.params.speed,!0,!0),e.emit("autoplay")):(e.slideNext(e.params.speed,!0,!0),e.emit("autoplay")),e.params.cssMode&&e.autoplay.running&&e.autoplay.run()}),i)},start:function(){return void 0===this.autoplay.timeout&&(!this.autoplay.running&&(this.autoplay.running=!0,this.emit("autoplayStart"),this.autoplay.run(),!0))},stop:function(){return!!this.autoplay.running&&(void 0!==this.autoplay.timeout&&(this.autoplay.timeout&&(clearTimeout(this.autoplay.timeout),this.autoplay.timeout=void 0),this.autoplay.running=!1,this.emit("autoplayStop"),!0))},pause:function(e){this.autoplay.running&&(this.autoplay.paused||(this.autoplay.timeout&&clearTimeout(this.autoplay.timeout),this.autoplay.paused=!0,0!==e&&this.params.autoplay.waitForTransition?(this.$wrapperEl[0].addEventListener("transitionend",this.autoplay.onTransitionEnd),this.$wrapperEl[0].addEventListener("webkitTransitionEnd",this.autoplay.onTransitionEnd)):(this.autoplay.paused=!1,this.autoplay.run())))}},ge={setTranslate:function(){for(var e=this.slides,t=0;t<e.length;t+=1){var i=this.slides.eq(t),s=-i[0].swiperSlideOffset;this.params.virtualTranslate||(s-=this.translate);var a=0;this.isHorizontal()||(a=s,s=0);var r=this.params.fadeEffect.crossFade?Math.max(1-Math.abs(i[0].progress),0):1+Math.min(Math.max(i[0].progress,-1),0);i.css({opacity:r}).transform("translate3d("+s+"px, "+a+"px, 0px)")}},setTransition:function(e){var t=this,i=t.slides,s=t.$wrapperEl;if(i.transition(e),t.params.virtualTranslate&&0!==e){var a=!1;i.transitionEnd((function(){if(!a&&t&&!t.destroyed){a=!0,t.animating=!1;for(var e=["webkitTransitionEnd","transitionend"],i=0;i<e.length;i+=1)s.trigger(e[i])}}))}}},be={setTranslate:function(){var e,t=this.$el,i=this.$wrapperEl,s=this.slides,a=this.width,r=this.height,o=this.rtlTranslate,l=this.size,d=this.params.cubeEffect,h=this.isHorizontal(),p=this.virtual&&this.params.virtual.enabled,c=0;d.shadow&&(h?(0===(e=i.find(".swiper-cube-shadow")).length&&(e=n('<div class="swiper-cube-shadow"></div>'),i.append(e)),e.css({height:a+"px"})):0===(e=t.find(".swiper-cube-shadow")).length&&(e=n('<div class="swiper-cube-shadow"></div>'),t.append(e)));for(var u=0;u<s.length;u+=1){var v=s.eq(u),f=u;p&&(f=parseInt(v.attr("data-swiper-slide-index"),10));var m=90*f,g=Math.floor(m/360);o&&(m=-m,g=Math.floor(-m/360));var b=Math.max(Math.min(v[0].progress,1),-1),w=0,y=0,x=0;f%4==0?(w=4*-g*l,x=0):(f-1)%4==0?(w=0,x=4*-g*l):(f-2)%4==0?(w=l+4*g*l,x=l):(f-3)%4==0&&(w=-l,x=3*l+4*l*g),o&&(w=-w),h||(y=w,w=0);var E="rotateX("+(h?0:-m)+"deg) rotateY("+(h?m:0)+"deg) translate3d("+w+"px, "+y+"px, "+x+"px)";if(b<=1&&b>-1&&(c=90*f+90*b,o&&(c=90*-f-90*b)),v.transform(E),d.slideShadows){var T=h?v.find(".swiper-slide-shadow-left"):v.find(".swiper-slide-shadow-top"),S=h?v.find(".swiper-slide-shadow-right"):v.find(".swiper-slide-shadow-bottom");0===T.length&&(T=n('<div class="swiper-slide-shadow-'+(h?"left":"top")+'"></div>'),v.append(T)),0===S.length&&(S=n('<div class="swiper-slide-shadow-'+(h?"right":"bottom")+'"></div>'),v.append(S)),T.length&&(T[0].style.opacity=Math.max(-b,0)),S.length&&(S[0].style.opacity=Math.max(b,0))}}if(i.css({"-webkit-transform-origin":"50% 50% -"+l/2+"px","-moz-transform-origin":"50% 50% -"+l/2+"px","-ms-transform-origin":"50% 50% -"+l/2+"px","transform-origin":"50% 50% -"+l/2+"px"}),d.shadow)if(h)e.transform("translate3d(0px, "+(a/2+d.shadowOffset)+"px, "+-a/2+"px) rotateX(90deg) rotateZ(0deg) scale("+d.shadowScale+")");else{var C=Math.abs(c)-90*Math.floor(Math.abs(c)/90),M=1.5-(Math.sin(2*C*Math.PI/360)/2+Math.cos(2*C*Math.PI/360)/2),P=d.shadowScale,z=d.shadowScale/M,k=d.shadowOffset;e.transform("scale3d("+P+", 1, "+z+") translate3d(0px, "+(r/2+k)+"px, "+-r/2/z+"px) rotateX(-90deg)")}var $=_.isSafari||_.isWebView?-l/2:0;i.transform("translate3d(0px,0,"+$+"px) rotateX("+(this.isHorizontal()?0:c)+"deg) rotateY("+(this.isHorizontal()?-c:0)+"deg)")},setTransition:function(e){var t=this.$el;this.slides.transition(e).find(".swiper-slide-shadow-top, .swiper-slide-shadow-right, .swiper-slide-shadow-bottom, .swiper-slide-shadow-left").transition(e),this.params.cubeEffect.shadow&&!this.isHorizontal()&&t.find(".swiper-cube-shadow").transition(e)}},we={setTranslate:function(){for(var e=this.slides,t=this.rtlTranslate,i=0;i<e.length;i+=1){var s=e.eq(i),a=s[0].progress;this.params.flipEffect.limitRotation&&(a=Math.max(Math.min(s[0].progress,1),-1));var r=-180*a,o=0,l=-s[0].swiperSlideOffset,d=0;if(this.isHorizontal()?t&&(r=-r):(d=l,l=0,o=-r,r=0),s[0].style.zIndex=-Math.abs(Math.round(a))+e.length,this.params.flipEffect.slideShadows){var h=this.isHorizontal()?s.find(".swiper-slide-shadow-left"):s.find(".swiper-slide-shadow-top"),p=this.isHorizontal()?s.find(".swiper-slide-shadow-right"):s.find(".swiper-slide-shadow-bottom");0===h.length&&(h=n('<div class="swiper-slide-shadow-'+(this.isHorizontal()?"left":"top")+'"></div>'),s.append(h)),0===p.length&&(p=n('<div class="swiper-slide-shadow-'+(this.isHorizontal()?"right":"bottom")+'"></div>'),s.append(p)),h.length&&(h[0].style.opacity=Math.max(-a,0)),p.length&&(p[0].style.opacity=Math.max(a,0))}s.transform("translate3d("+l+"px, "+d+"px, 0px) rotateX("+o+"deg) rotateY("+r+"deg)")}},setTransition:function(e){var t=this,i=t.slides,s=t.activeIndex,a=t.$wrapperEl;if(i.transition(e).find(".swiper-slide-shadow-top, .swiper-slide-shadow-right, .swiper-slide-shadow-bottom, .swiper-slide-shadow-left").transition(e),t.params.virtualTranslate&&0!==e){var r=!1;i.eq(s).transitionEnd((function(){if(!r&&t&&!t.destroyed){r=!0,t.animating=!1;for(var e=["webkitTransitionEnd","transitionend"],i=0;i<e.length;i+=1)a.trigger(e[i])}}))}}},ye={setTranslate:function(){for(var e=this.width,t=this.height,i=this.slides,s=this.$wrapperEl,a=this.slidesSizesGrid,r=this.params.coverflowEffect,o=this.isHorizontal(),l=this.translate,d=o?e/2-l:t/2-l,p=o?r.rotate:-r.rotate,c=r.depth,u=0,v=i.length;u<v;u+=1){var f=i.eq(u),m=a[u],g=(d-f[0].swiperSlideOffset-m/2)/m*r.modifier,b=o?p*g:0,w=o?0:p*g,y=-c*Math.abs(g),x=r.stretch;"string"==typeof x&&-1!==x.indexOf("%")&&(x=parseFloat(r.stretch)/100*m);var E=o?0:x*g,T=o?x*g:0,S=1-(1-r.scale)*Math.abs(g);Math.abs(T)<.001&&(T=0),Math.abs(E)<.001&&(E=0),Math.abs(y)<.001&&(y=0),Math.abs(b)<.001&&(b=0),Math.abs(w)<.001&&(w=0),Math.abs(S)<.001&&(S=0);var C="translate3d("+T+"px,"+E+"px,"+y+"px)  rotateX("+w+"deg) rotateY("+b+"deg) scale("+S+")";if(f.transform(C),f[0].style.zIndex=1-Math.abs(Math.round(g)),r.slideShadows){var M=o?f.find(".swiper-slide-shadow-left"):f.find(".swiper-slide-shadow-top"),P=o?f.find(".swiper-slide-shadow-right"):f.find(".swiper-slide-shadow-bottom");0===M.length&&(M=n('<div class="swiper-slide-shadow-'+(o?"left":"top")+'"></div>'),f.append(M)),0===P.length&&(P=n('<div class="swiper-slide-shadow-'+(o?"right":"bottom")+'"></div>'),f.append(P)),M.length&&(M[0].style.opacity=g>0?g:0),P.length&&(P[0].style.opacity=-g>0?-g:0)}}(h.pointerEvents||h.prefixedPointerEvents)&&(s[0].style.perspectiveOrigin=d+"px 50%")},setTransition:function(e){this.slides.transition(e).find(".swiper-slide-shadow-top, .swiper-slide-shadow-right, .swiper-slide-shadow-bottom, .swiper-slide-shadow-left").transition(e)}},xe={init:function(){var e=this.params.thumbs,t=this.constructor;e.swiper instanceof t?(this.thumbs.swiper=e.swiper,d.extend(this.thumbs.swiper.originalParams,{watchSlidesProgress:!0,slideToClickedSlide:!1}),d.extend(this.thumbs.swiper.params,{watchSlidesProgress:!0,slideToClickedSlide:!1})):d.isObject(e.swiper)&&(this.thumbs.swiper=new t(d.extend({},e.swiper,{watchSlidesVisibility:!0,watchSlidesProgress:!0,slideToClickedSlide:!1})),this.thumbs.swiperCreated=!0),this.thumbs.swiper.$el.addClass(this.params.thumbs.thumbsContainerClass),this.thumbs.swiper.on("tap",this.thumbs.onThumbClick)},onThumbClick:function(){var e=this.thumbs.swiper;if(e){var t=e.clickedIndex,i=e.clickedSlide;if(!(i&&n(i).hasClass(this.params.thumbs.slideThumbActiveClass)||null==t)){var s;if(s=e.params.loop?parseInt(n(e.clickedSlide).attr("data-swiper-slide-index"),10):t,this.params.loop){var a=this.activeIndex;this.slides.eq(a).hasClass(this.params.slideDuplicateClass)&&(this.loopFix(),this._clientLeft=this.$wrapperEl[0].clientLeft,a=this.activeIndex);var r=this.slides.eq(a).prevAll('[data-swiper-slide-index="'+s+'"]').eq(0).index(),o=this.slides.eq(a).nextAll('[data-swiper-slide-index="'+s+'"]').eq(0).index();s=void 0===r?o:void 0===o?r:o-a<a-r?o:r}this.slideTo(s)}}},update:function(e){var t=this.thumbs.swiper;if(t){var i="auto"===t.params.slidesPerView?t.slidesPerViewDynamic():t.params.slidesPerView,s=this.params.thumbs.autoScrollOffset,a=s&&!t.params.loop;if(this.realIndex!==t.realIndex||a){var r,n,o=t.activeIndex;if(t.params.loop){t.slides.eq(o).hasClass(t.params.slideDuplicateClass)&&(t.loopFix(),t._clientLeft=t.$wrapperEl[0].clientLeft,o=t.activeIndex);var l=t.slides.eq(o).prevAll('[data-swiper-slide-index="'+this.realIndex+'"]').eq(0).index(),d=t.slides.eq(o).nextAll('[data-swiper-slide-index="'+this.realIndex+'"]').eq(0).index();r=void 0===l?d:void 0===d?l:d-o==o-l?o:d-o<o-l?d:l,n=this.activeIndex>this.previousIndex?"next":"prev"}else n=(r=this.realIndex)>this.previousIndex?"next":"prev";a&&(r+="next"===n?s:-1*s),t.visibleSlidesIndexes&&t.visibleSlidesIndexes.indexOf(r)<0&&(t.params.centeredSlides?r=r>o?r-Math.floor(i/2)+1:r+Math.floor(i/2)-1:r>o&&(r=r-i+1),t.slideTo(r,e?0:void 0))}var h=1,p=this.params.thumbs.slideThumbActiveClass;if(this.params.slidesPerView>1&&!this.params.centeredSlides&&(h=this.params.slidesPerView),this.params.thumbs.multipleActiveThumbs||(h=1),h=Math.floor(h),t.slides.removeClass(p),t.params.loop||t.params.virtual&&t.params.virtual.enabled)for(var c=0;c<h;c+=1)t.$wrapperEl.children('[data-swiper-slide-index="'+(this.realIndex+c)+'"]').addClass(p);else for(var u=0;u<h;u+=1)t.slides.eq(this.realIndex+u).addClass(p)}}},Ee=[K,U,Z,Q,ee,ie,ae,{name:"mousewheel",params:{mousewheel:{enabled:!1,releaseOnEdges:!1,invert:!1,forceToAxis:!1,sensitivity:1,eventsTarged:"container"}},create:function(){d.extend(this,{mousewheel:{enabled:!1,enable:re.enable.bind(this),disable:re.disable.bind(this),handle:re.handle.bind(this),handleMouseEnter:re.handleMouseEnter.bind(this),handleMouseLeave:re.handleMouseLeave.bind(this),animateSlider:re.animateSlider.bind(this),releaseScroll:re.releaseScroll.bind(this),lastScrollTime:d.now(),lastEventBeforeSnap:void 0,recentWheelEvents:[]}})},on:{init:function(){!this.params.mousewheel.enabled&&this.params.cssMode&&this.mousewheel.disable(),this.params.mousewheel.enabled&&this.mousewheel.enable()},destroy:function(){this.params.cssMode&&this.mousewheel.enable(),this.mousewheel.enabled&&this.mousewheel.disable()}}},{name:"navigation",params:{navigation:{nextEl:null,prevEl:null,hideOnClick:!1,disabledClass:"swiper-button-disabled",hiddenClass:"swiper-button-hidden",lockClass:"swiper-button-lock"}},create:function(){d.extend(this,{navigation:{init:ne.init.bind(this),update:ne.update.bind(this),destroy:ne.destroy.bind(this),onNextClick:ne.onNextClick.bind(this),onPrevClick:ne.onPrevClick.bind(this)}})},on:{init:function(){this.navigation.init(),this.navigation.update()},toEdge:function(){this.navigation.update()},fromEdge:function(){this.navigation.update()},destroy:function(){this.navigation.destroy()},click:function(e){var t,i=this.navigation,s=i.$nextEl,a=i.$prevEl;!this.params.navigation.hideOnClick||n(e.target).is(a)||n(e.target).is(s)||(s?t=s.hasClass(this.params.navigation.hiddenClass):a&&(t=a.hasClass(this.params.navigation.hiddenClass)),!0===t?this.emit("navigationShow",this):this.emit("navigationHide",this),s&&s.toggleClass(this.params.navigation.hiddenClass),a&&a.toggleClass(this.params.navigation.hiddenClass))}}},{name:"pagination",params:{pagination:{el:null,bulletElement:"span",clickable:!1,hideOnClick:!1,renderBullet:null,renderProgressbar:null,renderFraction:null,renderCustom:null,progressbarOpposite:!1,type:"bullets",dynamicBullets:!1,dynamicMainBullets:1,formatFractionCurrent:function(e){return e},formatFractionTotal:function(e){return e},bulletClass:"swiper-pagination-bullet",bulletActiveClass:"swiper-pagination-bullet-active",modifierClass:"swiper-pagination-",currentClass:"swiper-pagination-current",totalClass:"swiper-pagination-total",hiddenClass:"swiper-pagination-hidden",progressbarFillClass:"swiper-pagination-progressbar-fill",progressbarOppositeClass:"swiper-pagination-progressbar-opposite",clickableClass:"swiper-pagination-clickable",lockClass:"swiper-pagination-lock"}},create:function(){d.extend(this,{pagination:{init:oe.init.bind(this),render:oe.render.bind(this),update:oe.update.bind(this),destroy:oe.destroy.bind(this),dynamicBulletIndex:0}})},on:{init:function(){this.pagination.init(),this.pagination.render(),this.pagination.update()},activeIndexChange:function(){(this.params.loop||void 0===this.snapIndex)&&this.pagination.update()},snapIndexChange:function(){this.params.loop||this.pagination.update()},slidesLengthChange:function(){this.params.loop&&(this.pagination.render(),this.pagination.update())},snapGridLengthChange:function(){this.params.loop||(this.pagination.render(),this.pagination.update())},destroy:function(){this.pagination.destroy()},click:function(e){this.params.pagination.el&&this.params.pagination.hideOnClick&&this.pagination.$el.length>0&&!n(e.target).hasClass(this.params.pagination.bulletClass)&&(!0===this.pagination.$el.hasClass(this.params.pagination.hiddenClass)?this.emit("paginationShow",this):this.emit("paginationHide",this),this.pagination.$el.toggleClass(this.params.pagination.hiddenClass))}}},{name:"scrollbar",params:{scrollbar:{el:null,dragSize:"auto",hide:!1,draggable:!1,snapOnRelease:!0,lockClass:"swiper-scrollbar-lock",dragClass:"swiper-scrollbar-drag"}},create:function(){d.extend(this,{scrollbar:{init:le.init.bind(this),destroy:le.destroy.bind(this),updateSize:le.updateSize.bind(this),setTranslate:le.setTranslate.bind(this),setTransition:le.setTransition.bind(this),enableDraggable:le.enableDraggable.bind(this),disableDraggable:le.disableDraggable.bind(this),setDragPosition:le.setDragPosition.bind(this),getPointerPosition:le.getPointerPosition.bind(this),onDragStart:le.onDragStart.bind(this),onDragMove:le.onDragMove.bind(this),onDragEnd:le.onDragEnd.bind(this),isTouched:!1,timeout:null,dragTimeout:null}})},on:{init:function(){this.scrollbar.init(),this.scrollbar.updateSize(),this.scrollbar.setTranslate()},update:function(){this.scrollbar.updateSize()},resize:function(){this.scrollbar.updateSize()},observerUpdate:function(){this.scrollbar.updateSize()},setTranslate:function(){this.scrollbar.setTranslate()},setTransition:function(e){this.scrollbar.setTransition(e)},destroy:function(){this.scrollbar.destroy()}}},{name:"parallax",params:{parallax:{enabled:!1}},create:function(){d.extend(this,{parallax:{setTransform:de.setTransform.bind(this),setTranslate:de.setTranslate.bind(this),setTransition:de.setTransition.bind(this)}})},on:{beforeInit:function(){this.params.parallax.enabled&&(this.params.watchSlidesProgress=!0,this.originalParams.watchSlidesProgress=!0)},init:function(){this.params.parallax.enabled&&this.parallax.setTranslate()},setTranslate:function(){this.params.parallax.enabled&&this.parallax.setTranslate()},setTransition:function(e){this.params.parallax.enabled&&this.parallax.setTransition(e)}}},{name:"zoom",params:{zoom:{enabled:!1,maxRatio:3,minRatio:1,toggle:!0,containerClass:"swiper-zoom-container",zoomedSlideClass:"swiper-slide-zoomed"}},create:function(){var e=this,t={enabled:!1,scale:1,currentScale:1,isScaling:!1,gesture:{$slideEl:void 0,slideWidth:void 0,slideHeight:void 0,$imageEl:void 0,$imageWrapEl:void 0,maxRatio:3},image:{isTouched:void 0,isMoved:void 0,currentX:void 0,currentY:void 0,minX:void 0,minY:void 0,maxX:void 0,maxY:void 0,width:void 0,height:void 0,startX:void 0,startY:void 0,touchesStart:{},touchesCurrent:{}},velocity:{x:void 0,y:void 0,prevPositionX:void 0,prevPositionY:void 0,prevTime:void 0}};"onGestureStart onGestureChange onGestureEnd onTouchStart onTouchMove onTouchEnd onTransitionEnd toggle enable disable in out".split(" ").forEach((function(i){t[i]=he[i].bind(e)})),d.extend(e,{zoom:t});var i=1;Object.defineProperty(e.zoom,"scale",{get:function(){return i},set:function(t){if(i!==t){var s=e.zoom.gesture.$imageEl?e.zoom.gesture.$imageEl[0]:void 0,a=e.zoom.gesture.$slideEl?e.zoom.gesture.$slideEl[0]:void 0;e.emit("zoomChange",t,s,a)}i=t}})},on:{init:function(){this.params.zoom.enabled&&this.zoom.enable()},destroy:function(){this.zoom.disable()},touchStart:function(e){this.zoom.enabled&&this.zoom.onTouchStart(e)},touchEnd:function(e){this.zoom.enabled&&this.zoom.onTouchEnd(e)},doubleTap:function(e){this.params.zoom.enabled&&this.zoom.enabled&&this.params.zoom.toggle&&this.zoom.toggle(e)},transitionEnd:function(){this.zoom.enabled&&this.params.zoom.enabled&&this.zoom.onTransitionEnd()},slideChange:function(){this.zoom.enabled&&this.params.zoom.enabled&&this.params.cssMode&&this.zoom.onTransitionEnd()}}},{name:"lazy",params:{lazy:{enabled:!1,loadPrevNext:!1,loadPrevNextAmount:1,loadOnTransitionStart:!1,elementClass:"swiper-lazy",loadingClass:"swiper-lazy-loading",loadedClass:"swiper-lazy-loaded",preloaderClass:"swiper-lazy-preloader"}},create:function(){d.extend(this,{lazy:{initialImageLoaded:!1,load:pe.load.bind(this),loadInSlide:pe.loadInSlide.bind(this)}})},on:{beforeInit:function(){this.params.lazy.enabled&&this.params.preloadImages&&(this.params.preloadImages=!1)},init:function(){this.params.lazy.enabled&&!this.params.loop&&0===this.params.initialSlide&&this.lazy.load()},scroll:function(){this.params.freeMode&&!this.params.freeModeSticky&&this.lazy.load()},resize:function(){this.params.lazy.enabled&&this.lazy.load()},scrollbarDragMove:function(){this.params.lazy.enabled&&this.lazy.load()},transitionStart:function(){this.params.lazy.enabled&&(this.params.lazy.loadOnTransitionStart||!this.params.lazy.loadOnTransitionStart&&!this.lazy.initialImageLoaded)&&this.lazy.load()},transitionEnd:function(){this.params.lazy.enabled&&!this.params.lazy.loadOnTransitionStart&&this.lazy.load()},slideChange:function(){this.params.lazy.enabled&&this.params.cssMode&&this.lazy.load()}}},{name:"controller",params:{controller:{control:void 0,inverse:!1,by:"slide"}},create:function(){d.extend(this,{controller:{control:this.params.controller.control,getInterpolateFunction:ce.getInterpolateFunction.bind(this),setTranslate:ce.setTranslate.bind(this),setTransition:ce.setTransition.bind(this)}})},on:{update:function(){this.controller.control&&this.controller.spline&&(this.controller.spline=void 0,delete this.controller.spline)},resize:function(){this.controller.control&&this.controller.spline&&(this.controller.spline=void 0,delete this.controller.spline)},observerUpdate:function(){this.controller.control&&this.controller.spline&&(this.controller.spline=void 0,delete this.controller.spline)},setTranslate:function(e,t){this.controller.control&&this.controller.setTranslate(e,t)},setTransition:function(e,t){this.controller.control&&this.controller.setTransition(e,t)}}},{name:"a11y",params:{a11y:{enabled:!0,notificationClass:"swiper-notification",prevSlideMessage:"Previous slide",nextSlideMessage:"Next slide",firstSlideMessage:"This is the first slide",lastSlideMessage:"This is the last slide",paginationBulletMessage:"Go to slide {{index}}"}},create:function(){var e=this;d.extend(e,{a11y:{liveRegion:n('<span class="'+e.params.a11y.notificationClass+'" aria-live="assertive" aria-atomic="true"></span>')}}),Object.keys(ue).forEach((function(t){e.a11y[t]=ue[t].bind(e)}))},on:{init:function(){this.params.a11y.enabled&&(this.a11y.init(),this.a11y.updateNavigation())},toEdge:function(){this.params.a11y.enabled&&this.a11y.updateNavigation()},fromEdge:function(){this.params.a11y.enabled&&this.a11y.updateNavigation()},paginationUpdate:function(){this.params.a11y.enabled&&this.a11y.updatePagination()},destroy:function(){this.params.a11y.enabled&&this.a11y.destroy()}}},{name:"history",params:{history:{enabled:!1,replaceState:!1,key:"slides"}},create:function(){d.extend(this,{history:{init:ve.init.bind(this),setHistory:ve.setHistory.bind(this),setHistoryPopState:ve.setHistoryPopState.bind(this),scrollToSlide:ve.scrollToSlide.bind(this),destroy:ve.destroy.bind(this)}})},on:{init:function(){this.params.history.enabled&&this.history.init()},destroy:function(){this.params.history.enabled&&this.history.destroy()},transitionEnd:function(){this.history.initialized&&this.history.setHistory(this.params.history.key,this.activeIndex)},slideChange:function(){this.history.initialized&&this.params.cssMode&&this.history.setHistory(this.params.history.key,this.activeIndex)}}},{name:"hash-navigation",params:{hashNavigation:{enabled:!1,replaceState:!1,watchState:!1}},create:function(){d.extend(this,{hashNavigation:{initialized:!1,init:fe.init.bind(this),destroy:fe.destroy.bind(this),setHash:fe.setHash.bind(this),onHashCange:fe.onHashCange.bind(this)}})},on:{init:function(){this.params.hashNavigation.enabled&&this.hashNavigation.init()},destroy:function(){this.params.hashNavigation.enabled&&this.hashNavigation.destroy()},transitionEnd:function(){this.hashNavigation.initialized&&this.hashNavigation.setHash()},slideChange:function(){this.hashNavigation.initialized&&this.params.cssMode&&this.hashNavigation.setHash()}}},{name:"autoplay",params:{autoplay:{enabled:!1,delay:3e3,waitForTransition:!0,disableOnInteraction:!0,stopOnLastSlide:!1,reverseDirection:!1}},create:function(){var e=this;d.extend(e,{autoplay:{running:!1,paused:!1,run:me.run.bind(e),start:me.start.bind(e),stop:me.stop.bind(e),pause:me.pause.bind(e),onVisibilityChange:function(){"hidden"===document.visibilityState&&e.autoplay.running&&e.autoplay.pause(),"visible"===document.visibilityState&&e.autoplay.paused&&(e.autoplay.run(),e.autoplay.paused=!1)},onTransitionEnd:function(t){e&&!e.destroyed&&e.$wrapperEl&&t.target===this&&(e.$wrapperEl[0].removeEventListener("transitionend",e.autoplay.onTransitionEnd),e.$wrapperEl[0].removeEventListener("webkitTransitionEnd",e.autoplay.onTransitionEnd),e.autoplay.paused=!1,e.autoplay.running?e.autoplay.run():e.autoplay.stop())}}})},on:{init:function(){this.params.autoplay.enabled&&(this.autoplay.start(),document.addEventListener("visibilitychange",this.autoplay.onVisibilityChange))},beforeTransitionStart:function(e,t){this.autoplay.running&&(t||!this.params.autoplay.disableOnInteraction?this.autoplay.pause(e):this.autoplay.stop())},sliderFirstMove:function(){this.autoplay.running&&(this.params.autoplay.disableOnInteraction?this.autoplay.stop():this.autoplay.pause())},touchEnd:function(){this.params.cssMode&&this.autoplay.paused&&!this.params.autoplay.disableOnInteraction&&this.autoplay.run()},destroy:function(){this.autoplay.running&&this.autoplay.stop(),document.removeEventListener("visibilitychange",this.autoplay.onVisibilityChange)}}},{name:"effect-fade",params:{fadeEffect:{crossFade:!1}},create:function(){d.extend(this,{fadeEffect:{setTranslate:ge.setTranslate.bind(this),setTransition:ge.setTransition.bind(this)}})},on:{beforeInit:function(){if("fade"===this.params.effect){this.classNames.push(this.params.containerModifierClass+"fade");var e={slidesPerView:1,slidesPerColumn:1,slidesPerGroup:1,watchSlidesProgress:!0,spaceBetween:0,virtualTranslate:!0};d.extend(this.params,e),d.extend(this.originalParams,e)}},setTranslate:function(){"fade"===this.params.effect&&this.fadeEffect.setTranslate()},setTransition:function(e){"fade"===this.params.effect&&this.fadeEffect.setTransition(e)}}},{name:"effect-cube",params:{cubeEffect:{slideShadows:!0,shadow:!0,shadowOffset:20,shadowScale:.94}},create:function(){d.extend(this,{cubeEffect:{setTranslate:be.setTranslate.bind(this),setTransition:be.setTransition.bind(this)}})},on:{beforeInit:function(){if("cube"===this.params.effect){this.classNames.push(this.params.containerModifierClass+"cube"),this.classNames.push(this.params.containerModifierClass+"3d");var e={slidesPerView:1,slidesPerColumn:1,slidesPerGroup:1,watchSlidesProgress:!0,resistanceRatio:0,spaceBetween:0,centeredSlides:!1,virtualTranslate:!0};d.extend(this.params,e),d.extend(this.originalParams,e)}},setTranslate:function(){"cube"===this.params.effect&&this.cubeEffect.setTranslate()},setTransition:function(e){"cube"===this.params.effect&&this.cubeEffect.setTransition(e)}}},{name:"effect-flip",params:{flipEffect:{slideShadows:!0,limitRotation:!0}},create:function(){d.extend(this,{flipEffect:{setTranslate:we.setTranslate.bind(this),setTransition:we.setTransition.bind(this)}})},on:{beforeInit:function(){if("flip"===this.params.effect){this.classNames.push(this.params.containerModifierClass+"flip"),this.classNames.push(this.params.containerModifierClass+"3d");var e={slidesPerView:1,slidesPerColumn:1,slidesPerGroup:1,watchSlidesProgress:!0,spaceBetween:0,virtualTranslate:!0};d.extend(this.params,e),d.extend(this.originalParams,e)}},setTranslate:function(){"flip"===this.params.effect&&this.flipEffect.setTranslate()},setTransition:function(e){"flip"===this.params.effect&&this.flipEffect.setTransition(e)}}},{name:"effect-coverflow",params:{coverflowEffect:{rotate:50,stretch:0,depth:100,scale:1,modifier:1,slideShadows:!0}},create:function(){d.extend(this,{coverflowEffect:{setTranslate:ye.setTranslate.bind(this),setTransition:ye.setTransition.bind(this)}})},on:{beforeInit:function(){"coverflow"===this.params.effect&&(this.classNames.push(this.params.containerModifierClass+"coverflow"),this.classNames.push(this.params.containerModifierClass+"3d"),this.params.watchSlidesProgress=!0,this.originalParams.watchSlidesProgress=!0)},setTranslate:function(){"coverflow"===this.params.effect&&this.coverflowEffect.setTranslate()},setTransition:function(e){"coverflow"===this.params.effect&&this.coverflowEffect.setTransition(e)}}},{name:"thumbs",params:{thumbs:{swiper:null,multipleActiveThumbs:!0,autoScrollOffset:0,slideThumbActiveClass:"swiper-slide-thumb-active",thumbsContainerClass:"swiper-container-thumbs"}},create:function(){d.extend(this,{thumbs:{swiper:null,init:xe.init.bind(this),update:xe.update.bind(this),onThumbClick:xe.onThumbClick.bind(this)}})},on:{beforeInit:function(){var e=this.params.thumbs;e&&e.swiper&&(this.thumbs.init(),this.thumbs.update(!0))},slideChange:function(){this.thumbs.swiper&&this.thumbs.update()},update:function(){this.thumbs.swiper&&this.thumbs.update()},resize:function(){this.thumbs.swiper&&this.thumbs.update()},observerUpdate:function(){this.thumbs.swiper&&this.thumbs.update()},setTransition:function(e){var t=this.thumbs.swiper;t&&t.setTransition(e)},beforeDestroy:function(){var e=this.thumbs.swiper;e&&this.thumbs.swiperCreated&&e&&e.destroy()}}}];return void 0===j.use&&(j.use=j.Class.use,j.installModule=j.Class.installModule),j.use(Ee),j}));
//# sourceMappingURL=swiper.min.js.map
(function () {
    var generalTracking = function () {
        this.trackingAttrs = {
            "comPath":"data-component-path",
            "comName":"data-component-name"};
        this.tracking_elements = [
            'a',
            'button'
        ];
        this.trackingLock = false;
        this.trackLabelMapping = {
            A:"LINk",
            INPUT:"BUTTON"
        }
        this.init();
    }
    generalTracking.prototype = {
        init:function () {
            var _this = this;
            $(window).on('load scroll',function () {
                for(var i = 0;i<_this.tracking_elements.length;i++){
                    $(_this.tracking_elements[i]).each(function () {
                        if(($(this).parents("["+_this.trackingAttrs.comPath+"]").length>0 || $(this).parents("["+_this.trackingAttrs.comTracking+"]").length>0 || $(this).parents("["+_this.trackingAttrs.comName+"]").length>0) &&
                            !$(this).hasClass('catchTrack') && $(this).closest(".no-general-mz-tracking").length === 0){
                            $(this).addClass('catchTrack').on('click',clickEvent);
                            $(this).attr("aria-label",$(this).text());
                        }
                    })
                }
            })
            //function
            function clickEvent(event){
                if(_this.trackingLock){return};
                _this.trackingLock = true;
                // event.stopPropagation();
                var $target = $(event.target);
                var targetName = event.target.nodeName;
                var _el,el

                //no track ele
                if($target.hasClass("no-tracking-ele") || $target.parents().hasClass("no-tracking-ele") ||  $target.closest(".no-general-mz-tracking").length > 0){
                    _this.trackingLock = false;
                    return;
                }
                //general
                switch (targetName){
                    case 'A':
                        if ($target.css('cursor') == "pointer"){
                            if($target.find("span,i,bold,p").length > 0){
                                _el =  $target.find("span,i,bold,p").text().trim() || $target.attr('href');
                            }else{
                                _el =  $target.attr('aria-label') || $target.text().trim() || $target.attr('href');
                            }
                            el = _this.trackLabelMapping.A  + ' - ' + _el;
                            trackDone(el,$(this));
                        }
                        break;
                    case 'SPAN':
                            //A标签下span
                            if ($target.css('cursor') == "pointer"){
                                _el = $target.text().trim() || $target.attr('title') || $target.closest('[title]').attr('title') || $target.closest("a,button").text().trim() || $target.siblings("span").text().trim();
                                el = targetName  + ' - ' + _el;
                                trackDone(el,$(this));
                            }
                            break;
                    case 'BUTTON':
                        if ($target.css('cursor') == "pointer"){
                            _el = $target.text().trim() ||  $target.attr('title') || $target.attr("class").replace(" catchTrack","").replace(/ /g, "_");
                            el = targetName  + ' - ' + _el;
                            trackDone(el,$(this));
                        }
                        break;
                    case 'LI':

                        if ($target.css('cursor') == "pointer"){
                            _el = $target.text().trim() || $target.attr('title');
                            el = targetName  + ' - ' + _el;
                            trackDone(el,$(this));
                        }

                        break;
                    default:
                        if ($target.css('cursor') == "pointer"){
                            var ele = $target.find('img, a').eq(0);
                            if (ele.length>0) {
                                switch(ele[0].nodeName) {
                                    case 'A':
                                        if ($target.css('cursor') == "pointer"){
                                            if($target.find("span,i,bold,p").length > 0){
                                                _el =  $target.find("span,i,bold,p").text().trim() || $target.attr('href');
                                            }else{
                                                _el =  $target.text().trim() || $target.attr('href');
                                            }
                                            el = _this.trackLabelMapping.A  + ' - ' + _el;
                                            trackDone(el,$(this));
                                        }
                                        break;

                                    default:
                                        el = targetName + ' - ' + $target.text().trim();
                                }
                            } else{
                                _el = $target.text().trim() || $target.attr("class").replace(" catchTrack","").replace(/ /g, "_");;
                                el = targetName  + ' - ' + _el;
                                trackDone(el,$(this));
                            }
                        }
                        break;
                }
                setTimeout(function () {
                    _this.trackingLock = false;
                },600)
            };
            function trackDone(el,_thisTarget) {
                var eventType = "button_click";
                if ($(_thisTarget).attr('data-button-type') || $(_thisTarget).closest("[data-button-type]").length > 0) {
                    eventType = $(_thisTarget).closest("[data-button-type]").attr('data-button-type')+"_click";
                }
                var componentName = $(_thisTarget).closest("[data-component-name]").attr('data-component-name');
                var componentPath = $(_thisTarget).closest("[data-component-path]").attr('data-component-path');
                if (!componentName) {
                    componentName = componentPath.split("/")[componentPath.split("/").length-1];
                }
                var trackingData = {
                    "path": window.location.href,
                    "trackingName": el,
                    "product_name": $(_thisTarget).closest("[data-button-type]").attr('data-product-name') || "",
                    "componentName": componentName,
                    "componentPath":componentPath,
                    "linksTo":$(_thisTarget).attr('href') || $(_thisTarget).closest("a").attr('href') || ""
                }
                // 火山引擎埋点
                if(typeof(window.collectEvent) == 'function'){
                    window.collectEvent(
                        eventType,
                        trackingData
                    );
                }
                // Gtag埋点
                if (typeof (gtag) == "function") {
                    gtag('event',eventType,trackingData);
                }
            };
        }
    }

    window.generalTracking = generalTracking;
})();
new generalTracking();
