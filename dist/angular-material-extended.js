/*!
 * Angular Material Design
 * https://github.com/angular/material
 * @license MIT
 * v1.1.0-rc.5
 */
(function( window, angular, undefined ){
"use strict";

(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.datepicker
 * @description Module for the datepicker component.
 */

angular.module('material.components.datepicker', [
  'material.core',
  'material.components.icon',
  'material.components.virtualRepeat'
]);

})();
(function(){
"use strict";

(function() {
  'use strict';

  /**
   * @ngdoc directive
   * @name mdCalendar
   * @module material.components.datepicker
   *
   * @param {Date} ng-model The component's model. Should be a Date object.
   * @param {Date=} md-min-date Expression representing the minimum date.
   * @param {Date=} md-max-date Expression representing the maximum date.
   * @param {(function(Date): boolean)=} md-date-filter Function expecting a date and returning a boolean whether it can be selected or not.
   *
   * @description
   * `<md-calendar>` is a component that renders a calendar that can be used to select a date.
   * It is a part of the `<md-datepicker` pane, however it can also be used on it's own.
   *
   * @usage
   *
   * <hljs lang="html">
   *   <md-calendar ng-model="birthday"></md-calendar>
   * </hljs>
   */
  angular.module('material.components.datepicker')
    .directive('mdCalendar', calendarDirective);

  // POST RELEASE
  // TODO(jelbourn): Mac Cmd + left / right == Home / End
  // TODO(jelbourn): Refactor month element creation to use cloneNode (performance).
  // TODO(jelbourn): Define virtual scrolling constants (compactness) users can override.
  // TODO(jelbourn): Animated month transition on ng-model change (virtual-repeat)
  // TODO(jelbourn): Scroll snapping (virtual repeat)
  // TODO(jelbourn): Remove superfluous row from short months (virtual-repeat)
  // TODO(jelbourn): Month headers stick to top when scrolling.
  // TODO(jelbourn): Previous month opacity is lowered when partially scrolled out of view.
  // TODO(jelbourn): Support md-calendar standalone on a page (as a tabstop w/ aria-live
  //     announcement and key handling).
  // Read-only calendar (not just date-picker).

  function calendarDirective() {
    return {
      template: function(tElement, tAttr) {
        // TODO(crisbeto): This is a workaround that allows the calendar to work, without
        // a datepicker, until issue #8585 gets resolved. It can safely be removed
        // afterwards. This ensures that the virtual repeater scrolls to the proper place on load by
        // deferring the execution until the next digest. It's necessary only if the calendar is used
        // without a datepicker, otherwise it's already wrapped in an ngIf.
        var extraAttrs = tAttr.hasOwnProperty('ngIf') ? '' : 'ng-if="calendarCtrl.isInitialized"';
        var template = '' +
          '<div ng-switch="calendarCtrl.currentView" ' + extraAttrs + '>' +
            '<md-calendar-year ng-switch-when="year"></md-calendar-year>' +
            '<md-calendar-month ng-switch-default></md-calendar-month>' +
          '</div>';

        return template;
      },
      scope: {
        minDate: '=mdMinDate',
        maxDate: '=mdMaxDate',
        dateFilter: '=mdDateFilter'
      },
      require: ['ngModel', 'mdCalendar'],
      controller: CalendarCtrl,
      controllerAs: 'calendarCtrl',
      bindToController: true,
      link: function(scope, element, attrs, controllers) {
        var ngModelCtrl = controllers[0];
        var mdCalendarCtrl = controllers[1];
        mdCalendarCtrl.configureNgModel(ngModelCtrl);
      }
    };
  }

  /**
   * Occasionally the hideVerticalScrollbar method might read an element's
   * width as 0, because it hasn't been laid out yet. This value will be used
   * as a fallback, in order to prevent scenarios where the element's width
   * would otherwise have been set to 0. This value is the "usual" width of a
   * calendar within a floating calendar pane.
   */
  var FALLBACK_WIDTH = 340;

  /** Next identifier for calendar instance. */
  var nextUniqueId = 0;

  /**
   * Controller for the mdCalendar component.
   * @ngInject @constructor
   */
  function CalendarCtrl($element, $scope, $$mdDateUtil, $mdUtil,
    $mdConstant, $mdTheming, $$rAF, $attrs) {

    $mdTheming($element);

    /** @final {!angular.JQLite} */
    this.$element = $element;

    /** @final {!angular.Scope} */
    this.$scope = $scope;

    /** @final */
    this.dateUtil = $$mdDateUtil;

    /** @final */
    this.$mdUtil = $mdUtil;

    /** @final */
    this.keyCode = $mdConstant.KEY_CODE;

    /** @final */
    this.$$rAF = $$rAF;

    /** @final {Date} */
    this.today = this.dateUtil.createDateAtMidnight();

    /** @type {!angular.NgModelController} */
    this.ngModelCtrl = null;

    /** @type {String} The currently visible calendar view. */
    this.currentView = 'month';

    /** @type {String} Class applied to the selected date cell. */
    this.SELECTED_DATE_CLASS = 'md-calendar-selected-date';

    /** @type {String} Class applied to the cell for today. */
    this.TODAY_CLASS = 'md-calendar-date-today';

    /** @type {String} Class applied to the focused cell. */
    this.FOCUSED_DATE_CLASS = 'md-focus';

    /** @final {number} Unique ID for this calendar instance. */
    this.id = nextUniqueId++;

    /**
     * The date that is currently focused or showing in the calendar. This will initially be set
     * to the ng-model value if set, otherwise to today. It will be updated as the user navigates
     * to other months. The cell corresponding to the displayDate does not necesarily always have
     * focus in the document (such as for cases when the user is scrolling the calendar).
     * @type {Date}
     */
    this.displayDate = null;

    /**
     * The selected date. Keep track of this separately from the ng-model value so that we
     * can know, when the ng-model value changes, what the previous value was before it's updated
     * in the component's UI.
     *
     * @type {Date}
     */
    this.selectedDate = null;

    /**
     * Used to toggle initialize the root element in the next digest.
     * @type {Boolean}
     */
    this.isInitialized = false;

    /**
     * Cache for the  width of the element without a scrollbar. Used to hide the scrollbar later on
     * and to avoid extra reflows when switching between views.
     * @type {Number}
     */
    this.width = 0;

    /**
     * Caches the width of the scrollbar in order to be used when hiding it and to avoid extra reflows.
     * @type {Number}
     */
    this.scrollbarWidth = 0;

    // Unless the user specifies so, the calendar should not be a tab stop.
    // This is necessary because ngAria might add a tabindex to anything with an ng-model
    // (based on whether or not the user has turned that particular feature on/off).
    if (!$attrs.tabindex) {
      $element.attr('tabindex', '-1');
    }

    $element.on('keydown', angular.bind(this, this.handleKeyEvent));
  }
  CalendarCtrl.$inject = ["$element", "$scope", "$$mdDateUtil", "$mdUtil", "$mdConstant", "$mdTheming", "$$rAF", "$attrs"];

  /**
   * Sets up the controller's reference to ngModelController.
   * @param {!angular.NgModelController} ngModelCtrl
   */
  CalendarCtrl.prototype.configureNgModel = function(ngModelCtrl) {
    var self = this;

    self.ngModelCtrl = ngModelCtrl;

    self.$mdUtil.nextTick(function() {
      self.isInitialized = true;
    });

    ngModelCtrl.$render = function() {
      var value = this.$viewValue;

      // Notify the child scopes of any changes.
      self.$scope.$broadcast('md-calendar-parent-changed', value);

      // Set up the selectedDate if it hasn't been already.
      if (!self.selectedDate) {
        self.selectedDate = value;
      }

      // Also set up the displayDate.
      if (!self.displayDate) {
        self.displayDate = self.selectedDate || self.today;
      }
    };
  };

  /**
   * Sets the ng-model value for the calendar and emits a change event.
   * @param {Date} date
   */
  CalendarCtrl.prototype.setNgModelValue = function(date) {
    var value = this.dateUtil.createDateAtMidnight(date);
    this.focus(value);
    this.$scope.$emit('md-calendar-change', value);
    this.ngModelCtrl.$setViewValue(value);
    this.ngModelCtrl.$render();
    return value;
  };

  /**
   * Sets the current view that should be visible in the calendar
   * @param {string} newView View name to be set.
   * @param {number|Date} time Date object or a timestamp for the new display date.
   */
  CalendarCtrl.prototype.setCurrentView = function(newView, time) {
    var self = this;

    self.$mdUtil.nextTick(function() {
      self.currentView = newView;

      if (time) {
        self.displayDate = angular.isDate(time) ? time : new Date(time);
      }
    });
  };

  /**
   * Focus the cell corresponding to the given date.
   * @param {Date} date The date to be focused.
   */
  CalendarCtrl.prototype.focus = function(date) {
    if (this.dateUtil.isValidDate(date)) {
      var previousFocus = this.$element[0].querySelector('.md-focus');
      if (previousFocus) {
        previousFocus.classList.remove(this.FOCUSED_DATE_CLASS);
      }

      var cellId = this.getDateId(date, this.currentView);
      var cell = document.getElementById(cellId);
      if (cell) {
        cell.classList.add(this.FOCUSED_DATE_CLASS);
        cell.focus();
        this.displayDate = date;
      }
    } else {
      var rootElement = this.$element[0].querySelector('[ng-switch]');

      if (rootElement) {
        rootElement.focus();
      }
    }
  };

  /**
   * Normalizes the key event into an action name. The action will be broadcast
   * to the child controllers.
   * @param {KeyboardEvent} event
   * @returns {String} The action that should be taken, or null if the key
   * does not match a calendar shortcut.
   */
  CalendarCtrl.prototype.getActionFromKeyEvent = function(event) {
    var keyCode = this.keyCode;

    switch (event.which) {
      case keyCode.ENTER: return 'select';

      case keyCode.RIGHT_ARROW: return 'move-right';
      case keyCode.LEFT_ARROW: return 'move-left';

      // TODO(crisbeto): Might want to reconsider using metaKey, because it maps
      // to the "Windows" key on PC, which opens the start menu or resizes the browser.
      case keyCode.DOWN_ARROW: return event.metaKey ? 'move-page-down' : 'move-row-down';
      case keyCode.UP_ARROW: return event.metaKey ? 'move-page-up' : 'move-row-up';

      case keyCode.PAGE_DOWN: return 'move-page-down';
      case keyCode.PAGE_UP: return 'move-page-up';

      case keyCode.HOME: return 'start';
      case keyCode.END: return 'end';

      default: return null;
    }
  };

  /**
   * Handles a key event in the calendar with the appropriate action. The action will either
   * be to select the focused date or to navigate to focus a new date.
   * @param {KeyboardEvent} event
   */
  CalendarCtrl.prototype.handleKeyEvent = function(event) {
    var self = this;

    this.$scope.$apply(function() {
      // Capture escape and emit back up so that a wrapping component
      // (such as a date-picker) can decide to close.
      if (event.which == self.keyCode.ESCAPE || event.which == self.keyCode.TAB) {
        self.$scope.$emit('md-calendar-close');

        if (event.which == self.keyCode.TAB) {
          event.preventDefault();
        }

        return;
      }

      // Broadcast the action that any child controllers should take.
      var action = self.getActionFromKeyEvent(event);
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        self.$scope.$broadcast('md-calendar-parent-action', action);
      }
    });
  };

  /**
   * Hides the vertical scrollbar on the calendar scroller of a child controller by
   * setting the width on the calendar scroller and the `overflow: hidden` wrapper
   * around the scroller, and then setting a padding-right on the scroller equal
   * to the width of the browser's scrollbar.
   *
   * This will cause a reflow.
   *
   * @param {object} childCtrl The child controller whose scrollbar should be hidden.
   */
  CalendarCtrl.prototype.hideVerticalScrollbar = function(childCtrl) {
    var self = this;
    var element = childCtrl.$element[0];
    var scrollMask = element.querySelector('.md-calendar-scroll-mask');

    if (self.width > 0) {
      setWidth();
    } else {
      self.$$rAF(function() {
        var scroller = childCtrl.calendarScroller;

        self.scrollbarWidth = scroller.offsetWidth - scroller.clientWidth;
        self.width = element.querySelector('table').offsetWidth;
        setWidth();
      });
    }

    function setWidth() {
      var width = self.width || FALLBACK_WIDTH;
      var scrollbarWidth = self.scrollbarWidth;
      var scroller = childCtrl.calendarScroller;

      scrollMask.style.width = width + 'px';
      scroller.style.width = (width + scrollbarWidth) + 'px';
      scroller.style.paddingRight = scrollbarWidth + 'px';
    }
  };

  /**
   * Gets an identifier for a date unique to the calendar instance for internal
   * purposes. Not to be displayed.
   * @param {Date} date The date for which the id is being generated
   * @param {string} namespace Namespace for the id. (month, year etc.)
   * @returns {string}
   */
  CalendarCtrl.prototype.getDateId = function(date, namespace) {
    if (!namespace) {
      throw new Error('A namespace for the date id has to be specified.');
    }

    return [
      'md',
      this.id,
      namespace,
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ].join('-');
  };
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  angular.module('material.components.datepicker')
    .directive('mdCalendarMonth', calendarDirective);

  /**
   * Height of one calendar month tbody. This must be made known to the virtual-repeat and is
   * subsequently used for scrolling to specific months.
   */
  var TBODY_HEIGHT = 265;

  /**
   * Height of a calendar month with a single row. This is needed to calculate the offset for
   * rendering an extra month in virtual-repeat that only contains one row.
   */
  var TBODY_SINGLE_ROW_HEIGHT = 45;

  /** Private directive that represents a list of months inside the calendar. */
  function calendarDirective() {
    return {
      template:
        '<table aria-hidden="true" class="md-calendar-day-header"><thead></thead></table>' +
        '<div class="md-calendar-scroll-mask">' +
        '<md-virtual-repeat-container class="md-calendar-scroll-container" ' +
              'md-offset-size="' + (TBODY_SINGLE_ROW_HEIGHT - TBODY_HEIGHT) + '">' +
            '<table role="grid" tabindex="0" class="md-calendar" aria-readonly="true">' +
              '<tbody ' +
                  'md-calendar-month-body ' +
                  'role="rowgroup" ' +
                  'md-virtual-repeat="i in monthCtrl.items" ' +
                  'md-month-offset="$index" ' +
                  'class="md-calendar-month" ' +
                  'md-start-index="monthCtrl.getSelectedMonthIndex()" ' +
                  'md-item-size="' + TBODY_HEIGHT + '"></tbody>' +
            '</table>' +
          '</md-virtual-repeat-container>' +
        '</div>',
      require: ['^^mdCalendar', 'mdCalendarMonth'],
      controller: CalendarMonthCtrl,
      controllerAs: 'monthCtrl',
      bindToController: true,
      link: function(scope, element, attrs, controllers) {
        var calendarCtrl = controllers[0];
        var monthCtrl = controllers[1];
        monthCtrl.initialize(calendarCtrl);
      }
    };
  }

  /**
   * Controller for the calendar month component.
   * @ngInject @constructor
   */
  function CalendarMonthCtrl($element, $scope, $animate, $q,
    $$mdDateUtil, $mdDateLocale) {

    /** @final {!angular.JQLite} */
    this.$element = $element;

    /** @final {!angular.Scope} */
    this.$scope = $scope;

    /** @final {!angular.$animate} */
    this.$animate = $animate;

    /** @final {!angular.$q} */
    this.$q = $q;

    /** @final */
    this.dateUtil = $$mdDateUtil;

    /** @final */
    this.dateLocale = $mdDateLocale;

    /** @final {HTMLElement} */
    this.calendarScroller = $element[0].querySelector('.md-virtual-repeat-scroller');

    /** @type {Date} */
    this.firstRenderableDate = null;

    /** @type {boolean} */
    this.isInitialized = false;

    /** @type {boolean} */
    this.isMonthTransitionInProgress = false;

    var self = this;

    /**
     * Handles a click event on a date cell.
     * Created here so that every cell can use the same function instance.
     * @this {HTMLTableCellElement} The cell that was clicked.
     */
    this.cellClickHandler = function() {
      var timestamp = $$mdDateUtil.getTimestampFromNode(this);
      self.$scope.$apply(function() {
        self.calendarCtrl.setNgModelValue(timestamp);
      });
    };

    /**
     * Handles click events on the month headers. Switches
     * the calendar to the year view.
     * @this {HTMLTableCellElement} The cell that was clicked.
     */
    this.headerClickHandler = function() {
      self.calendarCtrl.setCurrentView('year', $$mdDateUtil.getTimestampFromNode(this));
    };
  }
  CalendarMonthCtrl.$inject = ["$element", "$scope", "$animate", "$q", "$$mdDateUtil", "$mdDateLocale"];

  /*** Initialization ***/

  /**
   * Initialize the controller by saving a reference to the calendar and
   * setting up the object that will be iterated by the virtual repeater.
   */
  CalendarMonthCtrl.prototype.initialize = function(calendarCtrl) {
    var minDate = calendarCtrl.minDate;
    var maxDate = calendarCtrl.maxDate;
    this.calendarCtrl = calendarCtrl;

    /**
     * Dummy array-like object for virtual-repeat to iterate over. The length is the total
     * number of months that can be viewed. This is shorter than ideal because of (potential)
     * Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=1181658.
     */
    this.items = { length: 2000 };

    if (maxDate && minDate) {
      // Limit the number of months if min and max dates are set.
      var numMonths = this.dateUtil.getMonthDistance(minDate, maxDate) + 1;
      numMonths = Math.max(numMonths, 1);
      // Add an additional month as the final dummy month for rendering purposes.
      numMonths += 1;
      this.items.length = numMonths;
    }

    this.firstRenderableDate = this.dateUtil.incrementMonths(calendarCtrl.today, -this.items.length / 2);

    if (minDate && minDate > this.firstRenderableDate) {
      this.firstRenderableDate = minDate;
    } else if (maxDate) {
      // Calculate the difference between the start date and max date.
      // Subtract 1 because it's an inclusive difference and 1 for the final dummy month.
      var monthDifference = this.items.length - 2;
      this.firstRenderableDate = this.dateUtil.incrementMonths(maxDate, -(this.items.length - 2));
    }

    this.attachScopeListeners();

    // Fire the initial render, since we might have missed it the first time it fired.
    calendarCtrl.ngModelCtrl && calendarCtrl.ngModelCtrl.$render();
  };

  /**
   * Gets the "index" of the currently selected date as it would be in the virtual-repeat.
   * @returns {number}
   */
  CalendarMonthCtrl.prototype.getSelectedMonthIndex = function() {
    var calendarCtrl = this.calendarCtrl;
    return this.dateUtil.getMonthDistance(this.firstRenderableDate,
        calendarCtrl.displayDate || calendarCtrl.selectedDate || calendarCtrl.today);
  };

  /**
   * Change the selected date in the calendar (ngModel value has already been changed).
   * @param {Date} date
   */
  CalendarMonthCtrl.prototype.changeSelectedDate = function(date) {
    var self = this;
    var calendarCtrl = self.calendarCtrl;
    var previousSelectedDate = calendarCtrl.selectedDate;
    calendarCtrl.selectedDate = date;

    this.changeDisplayDate(date).then(function() {
      var selectedDateClass = calendarCtrl.SELECTED_DATE_CLASS;
      var namespace = 'month';

      // Remove the selected class from the previously selected date, if any.
      if (previousSelectedDate) {
        var prevDateCell = document.getElementById(calendarCtrl.getDateId(previousSelectedDate, namespace));
        if (prevDateCell) {
          prevDateCell.classList.remove(selectedDateClass);
          prevDateCell.setAttribute('aria-selected', 'false');
        }
      }

      // Apply the select class to the new selected date if it is set.
      if (date) {
        var dateCell = document.getElementById(calendarCtrl.getDateId(date, namespace));
        if (dateCell) {
          dateCell.classList.add(selectedDateClass);
          dateCell.setAttribute('aria-selected', 'true');
        }
      }
    });
  };

  /**
   * Change the date that is being shown in the calendar. If the given date is in a different
   * month, the displayed month will be transitioned.
   * @param {Date} date
   */
  CalendarMonthCtrl.prototype.changeDisplayDate = function(date) {
    // Initialization is deferred until this function is called because we want to reflect
    // the starting value of ngModel.
    if (!this.isInitialized) {
      this.buildWeekHeader();
      this.calendarCtrl.hideVerticalScrollbar(this);
      this.isInitialized = true;
      return this.$q.when();
    }

    // If trying to show an invalid date or a transition is in progress, do nothing.
    if (!this.dateUtil.isValidDate(date) || this.isMonthTransitionInProgress) {
      return this.$q.when();
    }

    this.isMonthTransitionInProgress = true;
    var animationPromise = this.animateDateChange(date);

    this.calendarCtrl.displayDate = date;

    var self = this;
    animationPromise.then(function() {
      self.isMonthTransitionInProgress = false;
    });

    return animationPromise;
  };

  /**
   * Animates the transition from the calendar's current month to the given month.
   * @param {Date} date
   * @returns {angular.$q.Promise} The animation promise.
   */
  CalendarMonthCtrl.prototype.animateDateChange = function(date) {
    if (this.dateUtil.isValidDate(date)) {
      var monthDistance = this.dateUtil.getMonthDistance(this.firstRenderableDate, date);
      this.calendarScroller.scrollTop = monthDistance * TBODY_HEIGHT;
    }

    return this.$q.when();
  };

  /**
   * Builds and appends a day-of-the-week header to the calendar.
   * This should only need to be called once during initialization.
   */
  CalendarMonthCtrl.prototype.buildWeekHeader = function() {
    var firstDayOfWeek = this.dateLocale.firstDayOfWeek;
    var shortDays = this.dateLocale.shortDays;

    var row = document.createElement('tr');
    for (var i = 0; i < 7; i++) {
      var th = document.createElement('th');
      th.textContent = shortDays[(i + firstDayOfWeek) % 7];
      row.appendChild(th);
    }

    this.$element.find('thead').append(row);
  };

  /**
   * Attaches listeners for the scope events that are broadcast by the calendar.
   */
  CalendarMonthCtrl.prototype.attachScopeListeners = function() {
    var self = this;

    self.$scope.$on('md-calendar-parent-changed', function(event, value) {
      self.changeSelectedDate(value);
    });

    self.$scope.$on('md-calendar-parent-action', angular.bind(this, this.handleKeyEvent));
  };

  /**
   * Handles the month-specific keyboard interactions.
   * @param {Object} event Scope event object passed by the calendar.
   * @param {String} action Action, corresponding to the key that was pressed.
   */
  CalendarMonthCtrl.prototype.handleKeyEvent = function(event, action) {
    var calendarCtrl = this.calendarCtrl;
    var displayDate = calendarCtrl.displayDate;

    if (action === 'select') {
      calendarCtrl.setNgModelValue(displayDate);
    } else {
      var date = null;
      var dateUtil = this.dateUtil;

      switch (action) {
        case 'move-right': date = dateUtil.incrementDays(displayDate, 1); break;
        case 'move-left': date = dateUtil.incrementDays(displayDate, -1); break;

        case 'move-page-down': date = dateUtil.incrementMonths(displayDate, 1); break;
        case 'move-page-up': date = dateUtil.incrementMonths(displayDate, -1); break;

        case 'move-row-down': date = dateUtil.incrementDays(displayDate, 7); break;
        case 'move-row-up': date = dateUtil.incrementDays(displayDate, -7); break;

        case 'start': date = dateUtil.getFirstDateOfMonth(displayDate); break;
        case 'end': date = dateUtil.getLastDateOfMonth(displayDate); break;
      }

      if (date) {
        date = this.dateUtil.clampDate(date, calendarCtrl.minDate, calendarCtrl.maxDate);

        this.changeDisplayDate(date).then(function() {
          calendarCtrl.focus(date);
        });
      }
    }
  };
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  angular.module('material.components.datepicker')
      .directive('mdCalendarMonthBody', mdCalendarMonthBodyDirective);

  /**
   * Private directive consumed by md-calendar-month. Having this directive lets the calender use
   * md-virtual-repeat and also cleanly separates the month DOM construction functions from
   * the rest of the calendar controller logic.
   */
  function mdCalendarMonthBodyDirective() {
    return {
      require: ['^^mdCalendar', '^^mdCalendarMonth', 'mdCalendarMonthBody'],
      scope: { offset: '=mdMonthOffset' },
      controller: CalendarMonthBodyCtrl,
      controllerAs: 'mdMonthBodyCtrl',
      bindToController: true,
      link: function(scope, element, attrs, controllers) {
        var calendarCtrl = controllers[0];
        var monthCtrl = controllers[1];
        var monthBodyCtrl = controllers[2];

        monthBodyCtrl.calendarCtrl = calendarCtrl;
        monthBodyCtrl.monthCtrl = monthCtrl;
        monthBodyCtrl.generateContent();

        // The virtual-repeat re-uses the same DOM elements, so there are only a limited number
        // of repeated items that are linked, and then those elements have their bindings updataed.
        // Since the months are not generated by bindings, we simply regenerate the entire thing
        // when the binding (offset) changes.
        scope.$watch(function() { return monthBodyCtrl.offset; }, function(offset, oldOffset) {
          if (offset != oldOffset) {
            monthBodyCtrl.generateContent();
          }
        });
      }
    };
  }

  /**
   * Controller for a single calendar month.
   * @ngInject @constructor
   */
  function CalendarMonthBodyCtrl($element, $$mdDateUtil, $mdDateLocale) {
    /** @final {!angular.JQLite} */
    this.$element = $element;

    /** @final */
    this.dateUtil = $$mdDateUtil;

    /** @final */
    this.dateLocale = $mdDateLocale;

    /** @type {Object} Reference to the month view. */
    this.monthCtrl = null;

    /** @type {Object} Reference to the calendar. */
    this.calendarCtrl = null;

    /**
     * Number of months from the start of the month "items" that the currently rendered month
     * occurs. Set via angular data binding.
     * @type {number}
     */
    this.offset = null;

    /**
     * Date cell to focus after appending the month to the document.
     * @type {HTMLElement}
     */
    this.focusAfterAppend = null;
  }
  CalendarMonthBodyCtrl.$inject = ["$element", "$$mdDateUtil", "$mdDateLocale"];

  /** Generate and append the content for this month to the directive element. */
  CalendarMonthBodyCtrl.prototype.generateContent = function() {
    var date = this.dateUtil.incrementMonths(this.monthCtrl.firstRenderableDate, this.offset);

    this.$element.empty();
    this.$element.append(this.buildCalendarForMonth(date));

    if (this.focusAfterAppend) {
      this.focusAfterAppend.classList.add(this.calendarCtrl.FOCUSED_DATE_CLASS);
      this.focusAfterAppend.focus();
      this.focusAfterAppend = null;
    }
  };

  /**
   * Creates a single cell to contain a date in the calendar with all appropriate
   * attributes and classes added. If a date is given, the cell content will be set
   * based on the date.
   * @param {Date=} opt_date
   * @returns {HTMLElement}
   */
  CalendarMonthBodyCtrl.prototype.buildDateCell = function(opt_date) {
    var monthCtrl = this.monthCtrl;
    var calendarCtrl = this.calendarCtrl;

    // TODO(jelbourn): cloneNode is likely a faster way of doing this.
    var cell = document.createElement('td');
    cell.tabIndex = -1;
    cell.classList.add('md-calendar-date');
    cell.setAttribute('role', 'gridcell');

    if (opt_date) {
      cell.setAttribute('tabindex', '-1');
      cell.setAttribute('aria-label', this.dateLocale.longDateFormatter(opt_date));
      cell.id = calendarCtrl.getDateId(opt_date, 'month');

      // Use `data-timestamp` attribute because IE10 does not support the `dataset` property.
      cell.setAttribute('data-timestamp', opt_date.getTime());

      // TODO(jelourn): Doing these comparisons for class addition during generation might be slow.
      // It may be better to finish the construction and then query the node and add the class.
      if (this.dateUtil.isSameDay(opt_date, calendarCtrl.today)) {
        cell.classList.add(calendarCtrl.TODAY_CLASS);
      }

      if (this.dateUtil.isValidDate(calendarCtrl.selectedDate) &&
          this.dateUtil.isSameDay(opt_date, calendarCtrl.selectedDate)) {
        cell.classList.add(calendarCtrl.SELECTED_DATE_CLASS);
        cell.setAttribute('aria-selected', 'true');
      }

      var cellText = this.dateLocale.dates[opt_date.getDate()];

      if (this.isDateEnabled(opt_date)) {
        // Add a indicator for select, hover, and focus states.
        var selectionIndicator = document.createElement('span');
        selectionIndicator.classList.add('md-calendar-date-selection-indicator');
        selectionIndicator.textContent = cellText;
        cell.appendChild(selectionIndicator);
        cell.addEventListener('click', monthCtrl.cellClickHandler);

        if (calendarCtrl.displayDate && this.dateUtil.isSameDay(opt_date, calendarCtrl.displayDate)) {
          this.focusAfterAppend = cell;
        }
      } else {
        cell.classList.add('md-calendar-date-disabled');
        cell.textContent = cellText;
      }
    }

    return cell;
  };

  /**
   * Check whether date is in range and enabled
   * @param {Date=} opt_date
   * @return {boolean} Whether the date is enabled.
   */
  CalendarMonthBodyCtrl.prototype.isDateEnabled = function(opt_date) {
    return this.dateUtil.isDateWithinRange(opt_date,
          this.calendarCtrl.minDate, this.calendarCtrl.maxDate) &&
          (!angular.isFunction(this.calendarCtrl.dateFilter)
           || this.calendarCtrl.dateFilter(opt_date));
  };

  /**
   * Builds a `tr` element for the calendar grid.
   * @param rowNumber The week number within the month.
   * @returns {HTMLElement}
   */
  CalendarMonthBodyCtrl.prototype.buildDateRow = function(rowNumber) {
    var row = document.createElement('tr');
    row.setAttribute('role', 'row');

    // Because of an NVDA bug (with Firefox), the row needs an aria-label in order
    // to prevent the entire row being read aloud when the user moves between rows.
    // See http://community.nvda-project.org/ticket/4643.
    row.setAttribute('aria-label', this.dateLocale.weekNumberFormatter(rowNumber));

    return row;
  };

  /**
   * Builds the <tbody> content for the given date's month.
   * @param {Date=} opt_dateInMonth
   * @returns {DocumentFragment} A document fragment containing the <tr> elements.
   */
  CalendarMonthBodyCtrl.prototype.buildCalendarForMonth = function(opt_dateInMonth) {
    var date = this.dateUtil.isValidDate(opt_dateInMonth) ? opt_dateInMonth : new Date();

    var firstDayOfMonth = this.dateUtil.getFirstDateOfMonth(date);
    var firstDayOfTheWeek = this.getLocaleDay_(firstDayOfMonth);
    var numberOfDaysInMonth = this.dateUtil.getNumberOfDaysInMonth(date);

    // Store rows for the month in a document fragment so that we can append them all at once.
    var monthBody = document.createDocumentFragment();

    var rowNumber = 1;
    var row = this.buildDateRow(rowNumber);
    monthBody.appendChild(row);

    // If this is the final month in the list of items, only the first week should render,
    // so we should return immediately after the first row is complete and has been
    // attached to the body.
    var isFinalMonth = this.offset === this.monthCtrl.items.length - 1;

    // Add a label for the month. If the month starts on a Sun/Mon/Tues, the month label
    // goes on a row above the first of the month. Otherwise, the month label takes up the first
    // two cells of the first row.
    var blankCellOffset = 0;
    var monthLabelCell = document.createElement('td');
    monthLabelCell.textContent = this.dateLocale.monthHeaderFormatter(date);
    monthLabelCell.classList.add('md-calendar-month-label');
    // If the entire month is after the max date, render the label as a disabled state.
    if (this.calendarCtrl.maxDate && firstDayOfMonth > this.calendarCtrl.maxDate) {
      monthLabelCell.classList.add('md-calendar-month-label-disabled');
    } else {
      monthLabelCell.addEventListener('click', this.monthCtrl.headerClickHandler);
      monthLabelCell.setAttribute('data-timestamp', firstDayOfMonth.getTime());
      monthLabelCell.setAttribute('aria-label', this.dateLocale.monthFormatter(date));
    }

    if (firstDayOfTheWeek <= 2) {
      monthLabelCell.setAttribute('colspan', '7');

      var monthLabelRow = this.buildDateRow();
      monthLabelRow.appendChild(monthLabelCell);
      monthBody.insertBefore(monthLabelRow, row);

      if (isFinalMonth) {
        return monthBody;
      }
    } else {
      blankCellOffset = 2;
      monthLabelCell.setAttribute('colspan', '2');
      row.appendChild(monthLabelCell);
    }

    // Add a blank cell for each day of the week that occurs before the first of the month.
    // For example, if the first day of the month is a Tuesday, add blank cells for Sun and Mon.
    // The blankCellOffset is needed in cases where the first N cells are used by the month label.
    for (var i = blankCellOffset; i < firstDayOfTheWeek; i++) {
      row.appendChild(this.buildDateCell());
    }

    // Add a cell for each day of the month, keeping track of the day of the week so that
    // we know when to start a new row.
    var dayOfWeek = firstDayOfTheWeek;
    var iterationDate = firstDayOfMonth;
    for (var d = 1; d <= numberOfDaysInMonth; d++) {
      // If we've reached the end of the week, start a new row.
      if (dayOfWeek === 7) {
        // We've finished the first row, so we're done if this is the final month.
        if (isFinalMonth) {
          return monthBody;
        }
        dayOfWeek = 0;
        rowNumber++;
        row = this.buildDateRow(rowNumber);
        monthBody.appendChild(row);
      }

      iterationDate.setDate(d);
      var cell = this.buildDateCell(iterationDate);
      row.appendChild(cell);

      dayOfWeek++;
    }

    // Ensure that the last row of the month has 7 cells.
    while (row.childNodes.length < 7) {
      row.appendChild(this.buildDateCell());
    }

    // Ensure that all months have 6 rows. This is necessary for now because the virtual-repeat
    // requires that all items have exactly the same height.
    while (monthBody.childNodes.length < 6) {
      var whitespaceRow = this.buildDateRow();
      for (var j = 0; j < 7; j++) {
        whitespaceRow.appendChild(this.buildDateCell());
      }
      monthBody.appendChild(whitespaceRow);
    }

    return monthBody;
  };

  /**
   * Gets the day-of-the-week index for a date for the current locale.
   * @private
   * @param {Date} date
   * @returns {number} The column index of the date in the calendar.
   */
  CalendarMonthBodyCtrl.prototype.getLocaleDay_ = function(date) {
    return (date.getDay() + (7 - this.dateLocale.firstDayOfWeek)) % 7;
  };
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  angular.module('material.components.datepicker')
    .directive('mdCalendarYear', calendarDirective);

  /**
   * Height of one calendar year tbody. This must be made known to the virtual-repeat and is
   * subsequently used for scrolling to specific years.
   */
  var TBODY_HEIGHT = 88;

  /** Private component, representing a list of years in the calendar. */
  function calendarDirective() {
    return {
      template:
        '<div class="md-calendar-scroll-mask">' +
          '<md-virtual-repeat-container class="md-calendar-scroll-container">' +
            '<table role="grid" tabindex="0" class="md-calendar" aria-readonly="true">' +
              '<tbody ' +
                  'md-calendar-year-body ' +
                  'role="rowgroup" ' +
                  'md-virtual-repeat="i in yearCtrl.items" ' +
                  'md-year-offset="$index" class="md-calendar-year" ' +
                  'md-start-index="yearCtrl.getFocusedYearIndex()" ' +
                  'md-item-size="' + TBODY_HEIGHT + '"></tbody>' +
            '</table>' +
          '</md-virtual-repeat-container>' +
        '</div>',
      require: ['^^mdCalendar', 'mdCalendarYear'],
      controller: CalendarYearCtrl,
      controllerAs: 'yearCtrl',
      bindToController: true,
      link: function(scope, element, attrs, controllers) {
        var calendarCtrl = controllers[0];
        var yearCtrl = controllers[1];
        yearCtrl.initialize(calendarCtrl);
      }
    };
  }

  /**
   * Controller for the mdCalendar component.
   * @ngInject @constructor
   */
  function CalendarYearCtrl($element, $scope, $animate, $q, $$mdDateUtil, $timeout) {

    /** @final {!angular.JQLite} */
    this.$element = $element;

    /** @final {!angular.Scope} */
    this.$scope = $scope;

    /** @final {!angular.$animate} */
    this.$animate = $animate;

    /** @final {!angular.$q} */
    this.$q = $q;

    /** @final */
    this.dateUtil = $$mdDateUtil;

    /** @final */
    this.$timeout = $timeout;

    /** @final {HTMLElement} */
    this.calendarScroller = $element[0].querySelector('.md-virtual-repeat-scroller');

    /** @type {Date} */
    this.firstRenderableDate = null;

    /** @type {boolean} */
    this.isInitialized = false;

    /** @type {boolean} */
    this.isMonthTransitionInProgress = false;

    var self = this;

    /**
     * Handles a click event on a date cell.
     * Created here so that every cell can use the same function instance.
     * @this {HTMLTableCellElement} The cell that was clicked.
     */
    this.cellClickHandler = function() {
      self.calendarCtrl.setCurrentView('month', $$mdDateUtil.getTimestampFromNode(this));
    };
  }
  CalendarYearCtrl.$inject = ["$element", "$scope", "$animate", "$q", "$$mdDateUtil", "$timeout"];

  /**
   * Initialize the controller by saving a reference to the calendar and
   * setting up the object that will be iterated by the virtual repeater.
   */
  CalendarYearCtrl.prototype.initialize = function(calendarCtrl) {
    var minDate = calendarCtrl.minDate;
    var maxDate = calendarCtrl.maxDate;
    this.calendarCtrl = calendarCtrl;

    /**
     * Dummy array-like object for virtual-repeat to iterate over. The length is the total
     * number of months that can be viewed. This is shorter than ideal because of (potential)
     * Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=1181658.
     */
    this.items = { length: 400 };

    if (maxDate && minDate) {
      // Limit the number of years if min and max dates are set.
      var numYears = this.dateUtil.getYearDistance(minDate, maxDate) + 1;
      this.items.length = Math.max(numYears, 1);
    }

    this.firstRenderableDate = this.dateUtil.incrementYears(calendarCtrl.today, - (this.items.length / 2));

    if (minDate && minDate > this.firstRenderableDate) {
      this.firstRenderableDate = minDate;
    } else if (maxDate) {
      // Calculate the year difference between the start date and max date.
      // Subtract 1 because it's an inclusive difference.
      this.firstRenderableDate = this.dateUtil.incrementMonths(maxDate, - (this.items.length - 1));
    }

    // Trigger an extra digest to ensure that the virtual repeater has updated. This
    // is necessary, because the virtual repeater doesn't update the $index the first
    // time around since the content isn't in place yet. The case, in which this is an
    // issues, is when the repeater has less than a page of content (e.g. there's a min
    // and max date).
    if (minDate || maxDate) this.$timeout();
    this.attachScopeListeners();

    // Fire the initial render, since we might have missed it the first time it fired.
    calendarCtrl.ngModelCtrl && calendarCtrl.ngModelCtrl.$render();
  };

  /**
   * Gets the "index" of the currently selected date as it would be in the virtual-repeat.
   * @returns {number}
   */
  CalendarYearCtrl.prototype.getFocusedYearIndex = function() {
    var calendarCtrl = this.calendarCtrl;
    return this.dateUtil.getYearDistance(this.firstRenderableDate,
      calendarCtrl.displayDate || calendarCtrl.selectedDate || calendarCtrl.today);
  };

  /**
   * Change the date that is highlighted in the calendar.
   * @param {Date} date
   */
  CalendarYearCtrl.prototype.changeDate = function(date) {
    // Initialization is deferred until this function is called because we want to reflect
    // the starting value of ngModel.
    if (!this.isInitialized) {
      this.calendarCtrl.hideVerticalScrollbar(this);
      this.isInitialized = true;
      return this.$q.when();
    } else if (this.dateUtil.isValidDate(date) && !this.isMonthTransitionInProgress) {
      var self = this;
      var animationPromise = this.animateDateChange(date);

      self.isMonthTransitionInProgress = true;
      self.calendarCtrl.displayDate = date;

      return animationPromise.then(function() {
        self.isMonthTransitionInProgress = false;
      });
    }
  };

  /**
   * Animates the transition from the calendar's current month to the given month.
   * @param {Date} date
   * @returns {angular.$q.Promise} The animation promise.
   */
  CalendarYearCtrl.prototype.animateDateChange = function(date) {
    if (this.dateUtil.isValidDate(date)) {
      var monthDistance = this.dateUtil.getYearDistance(this.firstRenderableDate, date);
      this.calendarScroller.scrollTop = monthDistance * TBODY_HEIGHT;
    }

    return this.$q.when();
  };

  /**
   * Handles the year-view-specific keyboard interactions.
   * @param {Object} event Scope event object passed by the calendar.
   * @param {String} action Action, corresponding to the key that was pressed.
   */
  CalendarYearCtrl.prototype.handleKeyEvent = function(event, action) {
    var calendarCtrl = this.calendarCtrl;
    var displayDate = calendarCtrl.displayDate;

    if (action === 'select') {
      this.changeDate(displayDate).then(function() {
        calendarCtrl.setCurrentView('month', displayDate);
        calendarCtrl.focus(displayDate);
      });
    } else {
      var date = null;
      var dateUtil = this.dateUtil;

      switch (action) {
        case 'move-right': date = dateUtil.incrementMonths(displayDate, 1); break;
        case 'move-left': date = dateUtil.incrementMonths(displayDate, -1); break;

        case 'move-row-down': date = dateUtil.incrementMonths(displayDate, 6); break;
        case 'move-row-up': date = dateUtil.incrementMonths(displayDate, -6); break;
      }

      if (date) {
        var min = calendarCtrl.minDate ? dateUtil.incrementMonths(dateUtil.getFirstDateOfMonth(calendarCtrl.minDate), 1) : null;
        var max = calendarCtrl.maxDate ? dateUtil.getFirstDateOfMonth(calendarCtrl.maxDate) : null;
        date = dateUtil.getFirstDateOfMonth(this.dateUtil.clampDate(date, min, max));

        this.changeDate(date).then(function() {
          calendarCtrl.focus(date);
        });
      }
    }
  };

  /**
   * Attaches listeners for the scope events that are broadcast by the calendar.
   */
  CalendarYearCtrl.prototype.attachScopeListeners = function() {
    var self = this;

    self.$scope.$on('md-calendar-parent-changed', function(event, value) {
      self.changeDate(value);
    });

    self.$scope.$on('md-calendar-parent-action', angular.bind(self, self.handleKeyEvent));
  };
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  angular.module('material.components.datepicker')
      .directive('mdCalendarYearBody', mdCalendarYearDirective);

  /**
   * Private component, consumed by the md-calendar-year, which separates the DOM construction logic
   * and allows for the year view to use md-virtual-repeat.
   */
  function mdCalendarYearDirective() {
    return {
      require: ['^^mdCalendar', '^^mdCalendarYear', 'mdCalendarYearBody'],
      scope: { offset: '=mdYearOffset' },
      controller: CalendarYearBodyCtrl,
      controllerAs: 'mdYearBodyCtrl',
      bindToController: true,
      link: function(scope, element, attrs, controllers) {
        var calendarCtrl = controllers[0];
        var yearCtrl = controllers[1];
        var yearBodyCtrl = controllers[2];

        yearBodyCtrl.calendarCtrl = calendarCtrl;
        yearBodyCtrl.yearCtrl = yearCtrl;
        yearBodyCtrl.generateContent();

        scope.$watch(function() { return yearBodyCtrl.offset; }, function(offset, oldOffset) {
          if (offset != oldOffset) {
            yearBodyCtrl.generateContent();
          }
        });
      }
    };
  }

  /**
   * Controller for a single year.
   * @ngInject @constructor
   */
  function CalendarYearBodyCtrl($element, $$mdDateUtil, $mdDateLocale) {
    /** @final {!angular.JQLite} */
    this.$element = $element;

    /** @final */
    this.dateUtil = $$mdDateUtil;

    /** @final */
    this.dateLocale = $mdDateLocale;

    /** @type {Object} Reference to the calendar. */
    this.calendarCtrl = null;

    /** @type {Object} Reference to the year view. */
    this.yearCtrl = null;

    /**
     * Number of months from the start of the month "items" that the currently rendered month
     * occurs. Set via angular data binding.
     * @type {number}
     */
    this.offset = null;

    /**
     * Date cell to focus after appending the month to the document.
     * @type {HTMLElement}
     */
    this.focusAfterAppend = null;
  }
  CalendarYearBodyCtrl.$inject = ["$element", "$$mdDateUtil", "$mdDateLocale"];

  /** Generate and append the content for this year to the directive element. */
  CalendarYearBodyCtrl.prototype.generateContent = function() {
    var date = this.dateUtil.incrementYears(this.yearCtrl.firstRenderableDate, this.offset);

    this.$element.empty();
    this.$element.append(this.buildCalendarForYear(date));

    if (this.focusAfterAppend) {
      this.focusAfterAppend.classList.add(this.calendarCtrl.FOCUSED_DATE_CLASS);
      this.focusAfterAppend.focus();
      this.focusAfterAppend = null;
    }
  };

  /**
   * Creates a single cell to contain a year in the calendar.
   * @param {number} opt_year Four-digit year.
   * @param {number} opt_month Zero-indexed month.
   * @returns {HTMLElement}
   */
  CalendarYearBodyCtrl.prototype.buildMonthCell = function(year, month) {
    var calendarCtrl = this.calendarCtrl;
    var yearCtrl = this.yearCtrl;
    var cell = this.buildBlankCell();

    // Represent this month/year as a date.
    var firstOfMonth = new Date(year, month, 1);
    cell.setAttribute('aria-label', this.dateLocale.monthFormatter(firstOfMonth));
    cell.id = calendarCtrl.getDateId(firstOfMonth, 'year');

    // Use `data-timestamp` attribute because IE10 does not support the `dataset` property.
    cell.setAttribute('data-timestamp', firstOfMonth.getTime());

    if (this.dateUtil.isSameMonthAndYear(firstOfMonth, calendarCtrl.today)) {
      cell.classList.add(calendarCtrl.TODAY_CLASS);
    }

    if (this.dateUtil.isValidDate(calendarCtrl.selectedDate) &&
        this.dateUtil.isSameMonthAndYear(firstOfMonth, calendarCtrl.selectedDate)) {
      cell.classList.add(calendarCtrl.SELECTED_DATE_CLASS);
      cell.setAttribute('aria-selected', 'true');
    }

    var cellText = this.dateLocale.shortMonths[month];

    if (this.dateUtil.isDateWithinRange(firstOfMonth,
        calendarCtrl.minDate, calendarCtrl.maxDate)) {
      var selectionIndicator = document.createElement('span');
      selectionIndicator.classList.add('md-calendar-date-selection-indicator');
      selectionIndicator.textContent = cellText;
      cell.appendChild(selectionIndicator);
      cell.addEventListener('click', yearCtrl.cellClickHandler);

      if (calendarCtrl.displayDate && this.dateUtil.isSameMonthAndYear(firstOfMonth, calendarCtrl.displayDate)) {
        this.focusAfterAppend = cell;
      }
    } else {
      cell.classList.add('md-calendar-date-disabled');
      cell.textContent = cellText;
    }

    return cell;
  };

  /**
   * Builds a blank cell.
   * @return {HTMLTableCellElement}
   */
  CalendarYearBodyCtrl.prototype.buildBlankCell = function() {
    var cell = document.createElement('td');
    cell.tabIndex = -1;
    cell.classList.add('md-calendar-date');
    cell.setAttribute('role', 'gridcell');

    cell.setAttribute('tabindex', '-1');
    return cell;
  };

  /**
   * Builds the <tbody> content for the given year.
   * @param {Date} date Date for which the content should be built.
   * @returns {DocumentFragment} A document fragment containing the months within the year.
   */
  CalendarYearBodyCtrl.prototype.buildCalendarForYear = function(date) {
    // Store rows for the month in a document fragment so that we can append them all at once.
    var year = date.getFullYear();
    var yearBody = document.createDocumentFragment();

    var monthCell, i;
    // First row contains label and Jan-Jun.
    var firstRow = document.createElement('tr');
    var labelCell = document.createElement('td');
    labelCell.className = 'md-calendar-month-label';
    labelCell.textContent = year;
    firstRow.appendChild(labelCell);

    for (i = 0; i < 6; i++) {
      firstRow.appendChild(this.buildMonthCell(year, i));
    }
    yearBody.appendChild(firstRow);

    // Second row contains a blank cell and Jul-Dec.
    var secondRow = document.createElement('tr');
    secondRow.appendChild(this.buildBlankCell());
    for (i = 6; i < 12; i++) {
      secondRow.appendChild(this.buildMonthCell(year, i));
    }
    yearBody.appendChild(secondRow);

    return yearBody;
  };
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  /**
   * @ngdoc service
   * @name $mdDateLocaleProvider
   * @module material.components.datepicker
   *
   * @description
   * The `$mdDateLocaleProvider` is the provider that creates the `$mdDateLocale` service.
   * This provider that allows the user to specify messages, formatters, and parsers for date
   * internationalization. The `$mdDateLocale` service itself is consumed by Angular Material
   * components that deal with dates.
   *
   * @property {(Array<string>)=} months Array of month names (in order).
   * @property {(Array<string>)=} shortMonths Array of abbreviated month names.
   * @property {(Array<string>)=} days Array of the days of the week (in order).
   * @property {(Array<string>)=} shortDays Array of abbreviated dayes of the week.
   * @property {(Array<string>)=} dates Array of dates of the month. Only necessary for locales
   *     using a numeral system other than [1, 2, 3...].
   * @property {(Array<string>)=} firstDayOfWeek The first day of the week. Sunday = 0, Monday = 1,
   *    etc.
   * @property {(function(string): Date)=} parseDate Function to parse a date object from a string.
   * @property {(function(Date): string)=} formatDate Function to format a date object to a string.
   * @property {(function(Date): string)=} monthHeaderFormatter Function that returns the label for
   *     a month given a date.
   * @property {(function(Date): string)=} monthFormatter Function that returns the full name of a month
   *     for a giben date.
   * @property {(function(number): string)=} weekNumberFormatter Function that returns a label for
   *     a week given the week number.
   * @property {(string)=} msgCalendar Translation of the label "Calendar" for the current locale.
   * @property {(string)=} msgOpenCalendar Translation of the button label "Open calendar" for the
   *     current locale.
   *
   * @usage
   * <hljs lang="js">
   *   myAppModule.config(function($mdDateLocaleProvider) {
   *
   *     // Example of a French localization.
   *     $mdDateLocaleProvider.months = ['janvier', 'février', 'mars', ...];
   *     $mdDateLocaleProvider.shortMonths = ['janv', 'févr', 'mars', ...];
   *     $mdDateLocaleProvider.days = ['dimanche', 'lundi', 'mardi', ...];
   *     $mdDateLocaleProvider.shortDays = ['Di', 'Lu', 'Ma', ...];
   *
   *     // Can change week display to start on Monday.
   *     $mdDateLocaleProvider.firstDayOfWeek = 1;
   *
   *     // Optional.
   *     $mdDateLocaleProvider.dates = [1, 2, 3, 4, 5, 6, ...];
   *
   *     // Example uses moment.js to parse and format dates.
   *     $mdDateLocaleProvider.parseDate = function(dateString) {
   *       var m = moment(dateString, 'L', true);
   *       return m.isValid() ? m.toDate() : new Date(NaN);
   *     };
   *
   *     $mdDateLocaleProvider.formatDate = function(date) {
   *       var m = moment(date);
   *       return m.isValid() ? m.format('L') : '';
   *     };
   *
   *     $mdDateLocaleProvider.monthHeaderFormatter = function(date) {
   *       return myShortMonths[date.getMonth()] + ' ' + date.getFullYear();
   *     };
   *
   *     // In addition to date display, date components also need localized messages
   *     // for aria-labels for screen-reader users.
   *
   *     $mdDateLocaleProvider.weekNumberFormatter = function(weekNumber) {
   *       return 'Semaine ' + weekNumber;
   *     };
   *
   *     $mdDateLocaleProvider.msgCalendar = 'Calendrier';
   *     $mdDateLocaleProvider.msgOpenCalendar = 'Ouvrir le calendrier';
   *
   * });
   * </hljs>
   *
   */

  angular.module('material.components.datepicker').config(["$provide", function($provide) {
    // TODO(jelbourn): Assert provided values are correctly formatted. Need assertions.

    /** @constructor */
    function DateLocaleProvider() {
      /** Array of full month names. E.g., ['January', 'Febuary', ...] */
      this.months = null;

      /** Array of abbreviated month names. E.g., ['Jan', 'Feb', ...] */
      this.shortMonths = null;

      /** Array of full day of the week names. E.g., ['Monday', 'Tuesday', ...] */
      this.days = null;

      /** Array of abbreviated dat of the week names. E.g., ['M', 'T', ...] */
      this.shortDays = null;

      /** Array of dates of a month (1 - 31). Characters might be different in some locales. */
      this.dates = null;

      /** Index of the first day of the week. 0 = Sunday, 1 = Monday, etc. */
      this.firstDayOfWeek = 0;

      /**
       * Function that converts the date portion of a Date to a string.
       * @type {(function(Date): string)}
       */
      this.formatDate = null;

      /**
       * Function that converts a date string to a Date object (the date portion)
       * @type {function(string): Date}
       */
      this.parseDate = null;

      /**
       * Function that formats a Date into a month header string.
       * @type {function(Date): string}
       */
      this.monthHeaderFormatter = null;

      /**
       * Function that formats a week number into a label for the week.
       * @type {function(number): string}
       */
      this.weekNumberFormatter = null;

      /**
       * Function that formats a date into a long aria-label that is read
       * when the focused date changes.
       * @type {function(Date): string}
       */
      this.longDateFormatter = null;

      /**
       * ARIA label for the calendar "dialog" used in the datepicker.
       * @type {string}
       */
      this.msgCalendar = '';

      /**
       * ARIA label for the datepicker's "Open calendar" buttons.
       * @type {string}
       */
      this.msgOpenCalendar = '';
    }

    /**
     * Factory function that returns an instance of the dateLocale service.
     * @ngInject
     * @param $locale
     * @returns {DateLocale}
     */
    DateLocaleProvider.prototype.$get = function($locale, $filter) {
      /**
       * Default date-to-string formatting function.
       * @param {!Date} date
       * @returns {string}
       */
      function defaultFormatDate(date) {
        if (!date) {
          return '';
        }

        // All of the dates created through ng-material *should* be set to midnight.
        // If we encounter a date where the localeTime shows at 11pm instead of midnight,
        // we have run into an issue with DST where we need to increment the hour by one:
        // var d = new Date(1992, 9, 8, 0, 0, 0);
        // d.toLocaleString(); // == "10/7/1992, 11:00:00 PM"
        var localeTime = date.toLocaleTimeString();
        var formatDate = date;
        if (date.getHours() == 0 &&
            (localeTime.indexOf('11:') !== -1 || localeTime.indexOf('23:') !== -1)) {
          formatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 1, 0, 0);
        }

        return $filter('date')(formatDate, 'M/d/yyyy');
      }

      /**
       * Default string-to-date parsing function.
       * @param {string} dateString
       * @returns {!Date}
       */
      function defaultParseDate(dateString) {
        return new Date(dateString);
      }

      /**
       * Default function to determine whether a string makes sense to be
       * parsed to a Date object.
       *
       * This is very permissive and is just a basic sanity check to ensure that
       * things like single integers aren't able to be parsed into dates.
       * @param {string} dateString
       * @returns {boolean}
       */
      function defaultIsDateComplete(dateString) {
        dateString = dateString.trim();

        // Looks for three chunks of content (either numbers or text) separated
        // by delimiters.
        var re = /^(([a-zA-Z]{3,}|[0-9]{1,4})([ \.,]+|[\/\-])){2}([a-zA-Z]{3,}|[0-9]{1,4})$/;
        return re.test(dateString);
      }

      /**
       * Default date-to-string formatter to get a month header.
       * @param {!Date} date
       * @returns {string}
       */
      function defaultMonthHeaderFormatter(date) {
        return service.shortMonths[date.getMonth()] + ' ' + date.getFullYear();
      }

      /**
       * Default formatter for a month.
       * @param {!Date} date
       * @returns {string}
       */
      function defaultMonthFormatter(date) {
        return service.months[date.getMonth()] + ' ' + date.getFullYear();
      }

      /**
       * Default week number formatter.
       * @param number
       * @returns {string}
       */
      function defaultWeekNumberFormatter(number) {
        return 'Week ' + number;
      }

      /**
       * Default formatter for date cell aria-labels.
       * @param {!Date} date
       * @returns {string}
       */
      function defaultLongDateFormatter(date) {
        // Example: 'Thursday June 18 2015'
        return [
          service.days[date.getDay()],
          service.months[date.getMonth()],
          service.dates[date.getDate()],
          date.getFullYear()
        ].join(' ');
      }

      // The default "short" day strings are the first character of each day,
      // e.g., "Monday" => "M".
      var defaultShortDays = $locale.DATETIME_FORMATS.DAY.map(function(day) {
        return day[0];
      });

      // The default dates are simply the numbers 1 through 31.
      var defaultDates = Array(32);
      for (var i = 1; i <= 31; i++) {
        defaultDates[i] = i;
      }

      // Default ARIA messages are in English (US).
      var defaultMsgCalendar = 'Calendar';
      var defaultMsgOpenCalendar = 'Open calendar';

      var service = {
        months: this.months || $locale.DATETIME_FORMATS.MONTH,
        shortMonths: this.shortMonths || $locale.DATETIME_FORMATS.SHORTMONTH,
        days: this.days || $locale.DATETIME_FORMATS.DAY,
        shortDays: this.shortDays || defaultShortDays,
        dates: this.dates || defaultDates,
        firstDayOfWeek: this.firstDayOfWeek || 0,
        formatDate: this.formatDate || defaultFormatDate,
        parseDate: this.parseDate || defaultParseDate,
        isDateComplete: this.isDateComplete || defaultIsDateComplete,
        monthHeaderFormatter: this.monthHeaderFormatter || defaultMonthHeaderFormatter,
        monthFormatter: this.monthFormatter || defaultMonthFormatter,
        weekNumberFormatter: this.weekNumberFormatter || defaultWeekNumberFormatter,
        longDateFormatter: this.longDateFormatter || defaultLongDateFormatter,
        msgCalendar: this.msgCalendar || defaultMsgCalendar,
        msgOpenCalendar: this.msgOpenCalendar || defaultMsgOpenCalendar
      };

      return service;
    };
    DateLocaleProvider.prototype.$get.$inject = ["$locale", "$filter"];

    $provide.provider('$mdDateLocale', new DateLocaleProvider());
  }]);
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  // POST RELEASE
  // TODO(jelbourn): Demo that uses moment.js
  // TODO(jelbourn): make sure this plays well with validation and ngMessages.
  // TODO(jelbourn): calendar pane doesn't open up outside of visible viewport.
  // TODO(jelbourn): forward more attributes to the internal input (required, autofocus, etc.)
  // TODO(jelbourn): something better for mobile (calendar panel takes up entire screen?)
  // TODO(jelbourn): input behavior (masking? auto-complete?)
  // TODO(jelbourn): UTC mode


  angular.module('material.components.datepicker')
      .directive('mdDatepicker', datePickerDirective);

  /**
   * @ngdoc directive
   * @name mdDatepicker
   * @module material.components.datepicker
   *
   * @param {Date} ng-model The component's model. Expects a JavaScript Date object.
   * @param {expression=} ng-change Expression evaluated when the model value changes.
   * @param {Date=} md-min-date Expression representing a min date (inclusive).
   * @param {Date=} md-max-date Expression representing a max date (inclusive).
   * @param {(function(Date): boolean)=} md-date-filter Function expecting a date and returning a boolean whether it can be selected or not.
   * @param {String=} md-placeholder The date input placeholder value.
   * @param {String=} md-open-on-focus When present, the calendar will be opened when the input is focused.
   * @param {Boolean=} md-is-open Expression that can be used to open the datepicker's calendar on-demand.
   * @param {String=} md-hide-icons Determines which datepicker icons should be hidden. Note that this may cause the
   * datepicker to not align properly with other components. **Use at your own risk.** Possible values are:
   * * `"all"` - Hides all icons.
   * * `"calendar"` - Only hides the calendar icon.
   * * `"triangle"` - Only hides the triangle icon.
   * @param {boolean=} ng-disabled Whether the datepicker is disabled.
   * @param {boolean=} ng-required Whether a value is required for the datepicker.
   *
   * @description
   * `<md-datepicker>` is a component used to select a single date.
   * For information on how to configure internationalization for the date picker,
   * see `$mdDateLocaleProvider`.
   *
   * This component supports [ngMessages](https://docs.angularjs.org/api/ngMessages/directive/ngMessages).
   * Supported attributes are:
   * * `required`: whether a required date is not set.
   * * `mindate`: whether the selected date is before the minimum allowed date.
   * * `maxdate`: whether the selected date is after the maximum allowed date.
   *
   * @usage
   * <hljs lang="html">
   *   <md-datepicker ng-model="birthday"></md-datepicker>
   * </hljs>
   *
   */
  function datePickerDirective($$mdSvgRegistry) {
    return {
      template: function(tElement, tAttrs) {
        // Buttons are not in the tab order because users can open the calendar via keyboard
        // interaction on the text input, and multiple tab stops for one component (picker)
        // may be confusing.
        var hiddenIcons = tAttrs.mdHideIcons;

        var calendarButton = (hiddenIcons === 'all' || hiddenIcons === 'calendar') ? '' :
          '<md-button class="md-datepicker-button md-icon-button" type="button" ' +
              'tabindex="-1" aria-hidden="true" ' +
              'ng-click="ctrl.openCalendarPane($event)">' +
            '<md-icon class="md-datepicker-calendar-icon" aria-label="md-calendar" ' +
                     'md-svg-src="' + $$mdSvgRegistry.mdCalendar + '"></md-icon>' +
          '</md-button>';

        var triangleButton = (hiddenIcons === 'all' || hiddenIcons === 'triangle') ? '' :
          '<md-button type="button" md-no-ink ' +
              'class="md-datepicker-triangle-button md-icon-button" ' +
              'ng-click="ctrl.openCalendarPane($event)" ' +
              'aria-label="{{::ctrl.dateLocale.msgOpenCalendar}}">' +
            '<div class="md-datepicker-expand-triangle"></div>' +
          '</md-button>';

        return '' +
        calendarButton +
        '<div class="md-datepicker-input-container" ' +
            'ng-class="{\'md-datepicker-focused\': ctrl.isFocused}">' +
          '<input class="md-datepicker-input" aria-haspopup="true" ' +
              'ng-focus="ctrl.setFocused(true)" ng-blur="ctrl.setFocused(false)">' +
          triangleButton +
        '</div>' +

        // This pane will be detached from here and re-attached to the document body.
        '<div class="md-datepicker-calendar-pane md-whiteframe-z1">' +
          '<div class="md-datepicker-input-mask">' +
            '<div class="md-datepicker-input-mask-opaque"></div>' +
          '</div>' +
          '<div class="md-datepicker-calendar">' +
            '<md-calendar role="dialog" aria-label="{{::ctrl.dateLocale.msgCalendar}}" ' +
                'md-min-date="ctrl.minDate" md-max-date="ctrl.maxDate"' +
                'md-date-filter="ctrl.dateFilter"' +
                'ng-model="ctrl.date" ng-if="ctrl.isCalendarOpen">' +
            '</md-calendar>' +
          '</div>' +
        '</div>';
      },
      require: ['ngModel', 'mdDatepicker', '?^mdInputContainer'],
      scope: {
        minDate: '=mdMinDate',
        maxDate: '=mdMaxDate',
        placeholder: '@mdPlaceholder',
        dateFilter: '=mdDateFilter',
        isOpen: '=?mdIsOpen'
      },
      controller: DatePickerCtrl,
      controllerAs: 'ctrl',
      bindToController: true,
      link: function(scope, element, attr, controllers) {
        var ngModelCtrl = controllers[0];
        var mdDatePickerCtrl = controllers[1];
        var mdInputContainer = controllers[2];

        mdDatePickerCtrl.configureNgModel(ngModelCtrl, mdInputContainer);

        if (mdInputContainer) {
          // We need to move the spacer after the datepicker itself,
          // because md-input-container adds it after the
          // md-datepicker-input by default. The spacer gets wrapped in a
          // div, because it floats and gets aligned next to the datepicker.
          // There are easier ways of working around this with CSS (making the
          // datepicker 100% wide, change the `display` etc.), however they
          // break the alignment with any other form controls.
          var spacer = element[0].querySelector('.md-errors-spacer');

          if (spacer) {
            element.after(angular.element('<div>').append(spacer));
          }

          mdInputContainer.setHasPlaceholder(attr.mdPlaceholder);
          mdInputContainer.element.addClass(INPUT_CONTAINER_CLASS);
          mdInputContainer.input = element;

          if (!mdInputContainer.label) {
            $mdAria.expect(element, 'aria-label', attr.mdPlaceholder);
          }

          scope.$watch(mdInputContainer.isErrorGetter || function() {
            return ngModelCtrl.$invalid && ngModelCtrl.$touched;
          }, mdInputContainer.setInvalid);
        }
      }
    };
  }
  datePickerDirective.$inject = ["$$mdSvgRegistry"];

  /** Additional offset for the input's `size` attribute, which is updated based on its content. */
  var EXTRA_INPUT_SIZE = 3;

  /** Class applied to the container if the date is invalid. */
  var INVALID_CLASS = 'md-datepicker-invalid';

  /** Class applied to the datepicker when it's open. */
  var OPEN_CLASS = 'md-datepicker-open';

  /** Class applied to the md-input-container, if a datepicker is placed inside it */
  var INPUT_CONTAINER_CLASS = '_md-datepicker-floating-label';

  /** Default time in ms to debounce input event by. */
  var DEFAULT_DEBOUNCE_INTERVAL = 500;

  /**
   * Height of the calendar pane used to check if the pane is going outside the boundary of
   * the viewport. See calendar.scss for how $md-calendar-height is computed; an extra 20px is
   * also added to space the pane away from the exact edge of the screen.
   *
   *  This is computed statically now, but can be changed to be measured if the circumstances
   *  of calendar sizing are changed.
   */
  var CALENDAR_PANE_HEIGHT = 368;

  /**
   * Width of the calendar pane used to check if the pane is going outside the boundary of
   * the viewport. See calendar.scss for how $md-calendar-width is computed; an extra 20px is
   * also added to space the pane away from the exact edge of the screen.
   *
   *  This is computed statically now, but can be changed to be measured if the circumstances
   *  of calendar sizing are changed.
   */
  var CALENDAR_PANE_WIDTH = 360;

  /**
   * Controller for md-datepicker.
   *
   * @ngInject @constructor
   */
  function DatePickerCtrl($scope, $element, $attrs, $compile, $timeout, $window,
      $mdConstant, $mdTheming, $mdUtil, $mdDateLocale, $$mdDateUtil, $$rAF) {
    /** @final */
    this.$compile = $compile;

    /** @final */
    this.$timeout = $timeout;

    /** @final */
    this.$window = $window;

    /** @final */
    this.dateLocale = $mdDateLocale;

    /** @final */
    this.dateUtil = $$mdDateUtil;

    /** @final */
    this.$mdConstant = $mdConstant;

    /* @final */
    this.$mdUtil = $mdUtil;

    /** @final */
    this.$$rAF = $$rAF;

    /**
     * The root document element. This is used for attaching a top-level click handler to
     * close the calendar panel when a click outside said panel occurs. We use `documentElement`
     * instead of body because, when scrolling is disabled, some browsers consider the body element
     * to be completely off the screen and propagate events directly to the html element.
     * @type {!angular.JQLite}
     */
    this.documentElement = angular.element(document.documentElement);

    /** @type {!angular.NgModelController} */
    this.ngModelCtrl = null;

    /** @type {HTMLInputElement} */
    this.inputElement = $element[0].querySelector('input');

    /** @final {!angular.JQLite} */
    this.ngInputElement = angular.element(this.inputElement);

    /** @type {HTMLElement} */
    this.inputContainer = $element[0].querySelector('.md-datepicker-input-container');

    /** @type {HTMLElement} Floating calendar pane. */
    this.calendarPane = $element[0].querySelector('.md-datepicker-calendar-pane');

    /** @type {HTMLElement} Calendar icon button. */
    this.calendarButton = $element[0].querySelector('.md-datepicker-button');

    /**
     * Element covering everything but the input in the top of the floating calendar pane.
     * @type {HTMLElement}
     */
    this.inputMask = $element[0].querySelector('.md-datepicker-input-mask-opaque');

    /** @final {!angular.JQLite} */
    this.$element = $element;

    /** @final {!angular.Attributes} */
    this.$attrs = $attrs;

    /** @final {!angular.Scope} */
    this.$scope = $scope;

    /** @type {Date} */
    this.date = null;

    /** @type {boolean} */
    this.isFocused = false;

    /** @type {boolean} */
    this.isDisabled;
    this.setDisabled($element[0].disabled || angular.isString($attrs.disabled));

    /** @type {boolean} Whether the date-picker's calendar pane is open. */
    this.isCalendarOpen = false;

    /** @type {boolean} Whether the calendar should open when the input is focused. */
    this.openOnFocus = $attrs.hasOwnProperty('mdOpenOnFocus');

    /** @final */
    this.mdInputContainer = null;

    /**
     * Element from which the calendar pane was opened. Keep track of this so that we can return
     * focus to it when the pane is closed.
     * @type {HTMLElement}
     */
    this.calendarPaneOpenedFrom = null;

    this.calendarPane.id = 'md-date-pane' + $mdUtil.nextUid();

    $mdTheming($element);
    $mdTheming(angular.element(this.calendarPane));

    /** Pre-bound click handler is saved so that the event listener can be removed. */
    this.bodyClickHandler = angular.bind(this, this.handleBodyClick);

    /** Pre-bound resize handler so that the event listener can be removed. */
    this.windowResizeHandler = $mdUtil.debounce(angular.bind(this, this.closeCalendarPane), 100);

    // Unless the user specifies so, the datepicker should not be a tab stop.
    // This is necessary because ngAria might add a tabindex to anything with an ng-model
    // (based on whether or not the user has turned that particular feature on/off).
    if (!$attrs.tabindex) {
      $element.attr('tabindex', '-1');
    }

    this.installPropertyInterceptors();
    this.attachChangeListeners();
    this.attachInteractionListeners();

    var self = this;

    $scope.$on('$destroy', function() {
      self.detachCalendarPane();
    });

    if ($attrs.mdIsOpen) {
      $scope.$watch('ctrl.isOpen', function(shouldBeOpen) {
        if (shouldBeOpen) {
          self.openCalendarPane({
            target: self.inputElement
          });
        } else {
          self.closeCalendarPane();
        }
      });
    }
  }
  DatePickerCtrl.$inject = ["$scope", "$element", "$attrs", "$compile", "$timeout", "$window", "$mdConstant", "$mdTheming", "$mdUtil", "$mdDateLocale", "$$mdDateUtil", "$$rAF"];

  /**
   * Sets up the controller's reference to ngModelController.
   * @param {!angular.NgModelController} ngModelCtrl
   */
  DatePickerCtrl.prototype.configureNgModel = function(ngModelCtrl, mdInputContainer) {
    this.ngModelCtrl = ngModelCtrl;
    this.mdInputContainer = mdInputContainer;

    var self = this;
    ngModelCtrl.$render = function() {
      var value = self.ngModelCtrl.$viewValue;

      if (value && !(value instanceof Date)) {
        throw Error('The ng-model for md-datepicker must be a Date instance. ' +
            'Currently the model is a: ' + (typeof value));
      }

      self.date = value;
      self.inputElement.value = self.dateLocale.formatDate(value);
      self.mdInputContainer && self.mdInputContainer.setHasValue(!!value);
      self.resizeInputElement();
      self.updateErrorState();
    };
  };

  /**
   * Attach event listeners for both the text input and the md-calendar.
   * Events are used instead of ng-model so that updates don't infinitely update the other
   * on a change. This should also be more performant than using a $watch.
   */
  DatePickerCtrl.prototype.attachChangeListeners = function() {
    var self = this;

    self.$scope.$on('md-calendar-change', function(event, date) {
      self.ngModelCtrl.$setViewValue(date);
      self.date = date;
      self.inputElement.value = self.dateLocale.formatDate(date);
      self.mdInputContainer && self.mdInputContainer.setHasValue(!!date);
      self.closeCalendarPane();
      self.resizeInputElement();
      self.updateErrorState();
    });

    self.ngInputElement.on('input', angular.bind(self, self.resizeInputElement));
    // TODO(chenmike): Add ability for users to specify this interval.
    self.ngInputElement.on('input', self.$mdUtil.debounce(self.handleInputEvent,
        DEFAULT_DEBOUNCE_INTERVAL, self));
  };

  /** Attach event listeners for user interaction. */
  DatePickerCtrl.prototype.attachInteractionListeners = function() {
    var self = this;
    var $scope = this.$scope;
    var keyCodes = this.$mdConstant.KEY_CODE;

    // Add event listener through angular so that we can triggerHandler in unit tests.
    self.ngInputElement.on('keydown', function(event) {
      if (event.altKey && event.keyCode == keyCodes.DOWN_ARROW) {
        self.openCalendarPane(event);
        $scope.$digest();
      }
    });

    if (self.openOnFocus) {
      self.ngInputElement.on('focus', angular.bind(self, self.openCalendarPane));
    }

    $scope.$on('md-calendar-close', function() {
      self.closeCalendarPane();
    });
  };

  /**
   * Capture properties set to the date-picker and imperitively handle internal changes.
   * This is done to avoid setting up additional $watches.
   */
  DatePickerCtrl.prototype.installPropertyInterceptors = function() {
    var self = this;

    if (this.$attrs.ngDisabled) {
      // The expression is to be evaluated against the directive element's scope and not
      // the directive's isolate scope.
      var scope = this.$scope.$parent;

      if (scope) {
        scope.$watch(this.$attrs.ngDisabled, function(isDisabled) {
          self.setDisabled(isDisabled);
        });
      }
    }

    Object.defineProperty(this, 'placeholder', {
      get: function() { return self.inputElement.placeholder; },
      set: function(value) { self.inputElement.placeholder = value || ''; }
    });
  };

  /**
   * Sets whether the date-picker is disabled.
   * @param {boolean} isDisabled
   */
  DatePickerCtrl.prototype.setDisabled = function(isDisabled) {
    this.isDisabled = isDisabled;
    this.inputElement.disabled = isDisabled;

    if (this.calendarButton) {
      this.calendarButton.disabled = isDisabled;
    }
  };

  /**
   * Sets the custom ngModel.$error flags to be consumed by ngMessages. Flags are:
   *   - mindate: whether the selected date is before the minimum date.
   *   - maxdate: whether the selected flag is after the maximum date.
   *   - filtered: whether the selected date is allowed by the custom filtering function.
   *   - valid: whether the entered text input is a valid date
   *
   * The 'required' flag is handled automatically by ngModel.
   *
   * @param {Date=} opt_date Date to check. If not given, defaults to the datepicker's model value.
   */
  DatePickerCtrl.prototype.updateErrorState = function(opt_date) {
    var date = opt_date || this.date;

    // Clear any existing errors to get rid of anything that's no longer relevant.
    this.clearErrorState();

    if (this.dateUtil.isValidDate(date)) {
      // Force all dates to midnight in order to ignore the time portion.
      date = this.dateUtil.createDateAtMidnight(date);

      if (this.dateUtil.isValidDate(this.minDate)) {
        var minDate = this.dateUtil.createDateAtMidnight(this.minDate);
        this.ngModelCtrl.$setValidity('mindate', date >= minDate);
      }

      if (this.dateUtil.isValidDate(this.maxDate)) {
        var maxDate = this.dateUtil.createDateAtMidnight(this.maxDate);
        this.ngModelCtrl.$setValidity('maxdate', date <= maxDate);
      }

      if (angular.isFunction(this.dateFilter)) {
        this.ngModelCtrl.$setValidity('filtered', this.dateFilter(date));
      }
    } else {
      // The date is seen as "not a valid date" if there is *something* set
      // (i.e.., not null or undefined), but that something isn't a valid date.
      this.ngModelCtrl.$setValidity('valid', date == null);
    }

    // TODO(jelbourn): Change this to classList.toggle when we stop using PhantomJS in unit tests
    // because it doesn't conform to the DOMTokenList spec.
    // See https://github.com/ariya/phantomjs/issues/12782.
    if (!this.ngModelCtrl.$valid) {
      this.inputContainer.classList.add(INVALID_CLASS);
    }
  };

  /** Clears any error flags set by `updateErrorState`. */
  DatePickerCtrl.prototype.clearErrorState = function() {
    this.inputContainer.classList.remove(INVALID_CLASS);
    ['mindate', 'maxdate', 'filtered', 'valid'].forEach(function(field) {
      this.ngModelCtrl.$setValidity(field, true);
    }, this);
  };

  /** Resizes the input element based on the size of its content. */
  DatePickerCtrl.prototype.resizeInputElement = function() {
    this.inputElement.size = this.inputElement.value.length + EXTRA_INPUT_SIZE;
  };

  /**
   * Sets the model value if the user input is a valid date.
   * Adds an invalid class to the input element if not.
   */
  DatePickerCtrl.prototype.handleInputEvent = function() {
    var inputString = this.inputElement.value;
    var parsedDate = inputString ? this.dateLocale.parseDate(inputString) : null;
    this.dateUtil.setDateTimeToMidnight(parsedDate);

    // An input string is valid if it is either empty (representing no date)
    // or if it parses to a valid date that the user is allowed to select.
    var isValidInput = inputString == '' || (
      this.dateUtil.isValidDate(parsedDate) &&
      this.dateLocale.isDateComplete(inputString) &&
      this.isDateEnabled(parsedDate)
    );

    // The datepicker's model is only updated when there is a valid input.
    if (isValidInput) {
      this.ngModelCtrl.$setViewValue(parsedDate);
      this.date = parsedDate;
    }

    this.updateErrorState(parsedDate);
  };

  /**
   * Check whether date is in range and enabled
   * @param {Date=} opt_date
   * @return {boolean} Whether the date is enabled.
   */
  DatePickerCtrl.prototype.isDateEnabled = function(opt_date) {
    return this.dateUtil.isDateWithinRange(opt_date, this.minDate, this.maxDate) &&
          (!angular.isFunction(this.dateFilter) || this.dateFilter(opt_date));
  };

  /** Position and attach the floating calendar to the document. */
  DatePickerCtrl.prototype.attachCalendarPane = function() {
    var calendarPane = this.calendarPane;
    var body = document.body;

    calendarPane.style.transform = '';
    this.$element.addClass(OPEN_CLASS);
    this.mdInputContainer && this.mdInputContainer.element.addClass(OPEN_CLASS);
    angular.element(body).addClass('md-datepicker-is-showing');

    var elementRect = this.inputContainer.getBoundingClientRect();
    var bodyRect = body.getBoundingClientRect();

    // Check to see if the calendar pane would go off the screen. If so, adjust position
    // accordingly to keep it within the viewport.
    var paneTop = elementRect.top - bodyRect.top;
    var paneLeft = elementRect.left - bodyRect.left;

    // If ng-material has disabled body scrolling (for example, if a dialog is open),
    // then it's possible that the already-scrolled body has a negative top/left. In this case,
    // we want to treat the "real" top as (0 - bodyRect.top). In a normal scrolling situation,
    // though, the top of the viewport should just be the body's scroll position.
    var viewportTop = (bodyRect.top < 0 && document.body.scrollTop == 0) ?
        -bodyRect.top :
        document.body.scrollTop;

    var viewportLeft = (bodyRect.left < 0 && document.body.scrollLeft == 0) ?
        -bodyRect.left :
        document.body.scrollLeft;

    var viewportBottom = viewportTop + this.$window.innerHeight;
    var viewportRight = viewportLeft + this.$window.innerWidth;

    // If the right edge of the pane would be off the screen and shifting it left by the
    // difference would not go past the left edge of the screen. If the calendar pane is too
    // big to fit on the screen at all, move it to the left of the screen and scale the entire
    // element down to fit.
    if (paneLeft + CALENDAR_PANE_WIDTH > viewportRight) {
      if (viewportRight - CALENDAR_PANE_WIDTH > 0) {
        paneLeft = viewportRight - CALENDAR_PANE_WIDTH;
      } else {
        paneLeft = viewportLeft;
        var scale = this.$window.innerWidth / CALENDAR_PANE_WIDTH;
        calendarPane.style.transform = 'scale(' + scale + ')';
      }

      calendarPane.classList.add('md-datepicker-pos-adjusted');
    }

    // If the bottom edge of the pane would be off the screen and shifting it up by the
    // difference would not go past the top edge of the screen.
    if (paneTop + CALENDAR_PANE_HEIGHT > viewportBottom &&
        viewportBottom - CALENDAR_PANE_HEIGHT > viewportTop) {
      paneTop = viewportBottom - CALENDAR_PANE_HEIGHT;
      calendarPane.classList.add('md-datepicker-pos-adjusted');
    }

    calendarPane.style.left = paneLeft + 'px';
    calendarPane.style.top = paneTop + 'px';
    document.body.appendChild(calendarPane);

    // The top of the calendar pane is a transparent box that shows the text input underneath.
    // Since the pane is floating, though, the page underneath the pane *adjacent* to the input is
    // also shown unless we cover it up. The inputMask does this by filling up the remaining space
    // based on the width of the input.
    this.inputMask.style.left = elementRect.width + 'px';

    // Add CSS class after one frame to trigger open animation.
    this.$$rAF(function() {
      calendarPane.classList.add('md-pane-open');
    });
  };

  /** Detach the floating calendar pane from the document. */
  DatePickerCtrl.prototype.detachCalendarPane = function() {
    this.$element.removeClass(OPEN_CLASS);
    this.mdInputContainer && this.mdInputContainer.element.removeClass(OPEN_CLASS);
    angular.element(document.body).removeClass('md-datepicker-is-showing');
    this.calendarPane.classList.remove('md-pane-open');
    this.calendarPane.classList.remove('md-datepicker-pos-adjusted');

    if (this.isCalendarOpen) {
      this.$mdUtil.enableScrolling();
    }

    if (this.calendarPane.parentNode) {
      // Use native DOM removal because we do not want any of the angular state of this element
      // to be disposed.
      this.calendarPane.parentNode.removeChild(this.calendarPane);
    }
  };

  /**
   * Open the floating calendar pane.
   * @param {Event} event
   */
  DatePickerCtrl.prototype.openCalendarPane = function(event) {
    if (!this.isCalendarOpen && !this.isDisabled) {
      this.isCalendarOpen = this.isOpen = true;
      this.calendarPaneOpenedFrom = event.target;

      // Because the calendar pane is attached directly to the body, it is possible that the
      // rest of the component (input, etc) is in a different scrolling container, such as
      // an md-content. This means that, if the container is scrolled, the pane would remain
      // stationary. To remedy this, we disable scrolling while the calendar pane is open, which
      // also matches the native behavior for things like `<select>` on Mac and Windows.
      this.$mdUtil.disableScrollAround(this.calendarPane);

      this.attachCalendarPane();
      this.focusCalendar();

      // Attach click listener inside of a timeout because, if this open call was triggered by a
      // click, we don't want it to be immediately propogated up to the body and handled.
      var self = this;
      this.$mdUtil.nextTick(function() {
        // Use 'touchstart` in addition to click in order to work on iOS Safari, where click
        // events aren't propogated under most circumstances.
        // See http://www.quirksmode.org/blog/archives/2014/02/mouse_event_bub.html
        self.documentElement.on('click touchstart', self.bodyClickHandler);
      }, false);

      window.addEventListener('resize', this.windowResizeHandler);
    }
  };

  /** Close the floating calendar pane. */
  DatePickerCtrl.prototype.closeCalendarPane = function() {
    if (this.isCalendarOpen) {
      var self = this;

      self.calendarPaneOpenedFrom.focus();
      self.calendarPaneOpenedFrom = null;

      if (self.openOnFocus) {
        // Ensures that all focus events have fired before detaching
        // the calendar. Prevents the calendar from reopening immediately
        // in IE when md-open-on-focus is set. Also it needs to trigger
        // a digest, in order to prevent issues where the calendar wasn't
        // showing up on the next open.
        this.$mdUtil.nextTick(detach);
      } else {
        detach();
      }
    }

    function detach() {
      self.detachCalendarPane();
      self.isCalendarOpen = self.isOpen = false;
      self.ngModelCtrl.$setTouched();

      self.documentElement.off('click touchstart', self.bodyClickHandler);
      window.removeEventListener('resize', self.windowResizeHandler);
    }
  };

  /** Gets the controller instance for the calendar in the floating pane. */
  DatePickerCtrl.prototype.getCalendarCtrl = function() {
    return angular.element(this.calendarPane.querySelector('md-calendar')).controller('mdCalendar');
  };

  /** Focus the calendar in the floating pane. */
  DatePickerCtrl.prototype.focusCalendar = function() {
    // Use a timeout in order to allow the calendar to be rendered, as it is gated behind an ng-if.
    var self = this;
    this.$mdUtil.nextTick(function() {
      self.getCalendarCtrl().focus();
    }, false);
  };

  /**
   * Sets whether the input is currently focused.
   * @param {boolean} isFocused
   */
  DatePickerCtrl.prototype.setFocused = function(isFocused) {
    if (!isFocused) {
      this.ngModelCtrl.$setTouched();
    }
    this.isFocused = isFocused;
  };

  /**
   * Handles a click on the document body when the floating calendar pane is open.
   * Closes the floating calendar pane if the click is not inside of it.
   * @param {MouseEvent} event
   */
  DatePickerCtrl.prototype.handleBodyClick = function(event) {
    if (this.isCalendarOpen) {
      var isInCalendar = this.$mdUtil.getClosest(event.target, 'md-calendar');

      if (!isInCalendar) {
        this.closeCalendarPane();
      }

      this.$scope.$digest();
    }
  };
})();

})();
(function(){
"use strict";

(function() {
  'use strict';

  /**
   * Utility for performing date calculations to facilitate operation of the calendar and
   * datepicker.
   */
  angular.module('material.components.datepicker').factory('$$mdDateUtil', function() {
    return {
      getFirstDateOfMonth: getFirstDateOfMonth,
      getNumberOfDaysInMonth: getNumberOfDaysInMonth,
      getDateInNextMonth: getDateInNextMonth,
      getDateInPreviousMonth: getDateInPreviousMonth,
      isInNextMonth: isInNextMonth,
      isInPreviousMonth: isInPreviousMonth,
      getDateMidpoint: getDateMidpoint,
      isSameMonthAndYear: isSameMonthAndYear,
      getWeekOfMonth: getWeekOfMonth,
      incrementDays: incrementDays,
      incrementMonths: incrementMonths,
      getLastDateOfMonth: getLastDateOfMonth,
      isSameDay: isSameDay,
      getMonthDistance: getMonthDistance,
      isValidDate: isValidDate,
      setDateTimeToMidnight: setDateTimeToMidnight,
      createDateAtMidnight: createDateAtMidnight,
      isDateWithinRange: isDateWithinRange,
      incrementYears: incrementYears,
      getYearDistance: getYearDistance,
      clampDate: clampDate,
      getTimestampFromNode: getTimestampFromNode
    };

    /**
     * Gets the first day of the month for the given date's month.
     * @param {Date} date
     * @returns {Date}
     */
    function getFirstDateOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    /**
     * Gets the number of days in the month for the given date's month.
     * @param date
     * @returns {number}
     */
    function getNumberOfDaysInMonth(date) {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }

    /**
     * Get an arbitrary date in the month after the given date's month.
     * @param date
     * @returns {Date}
     */
    function getDateInNextMonth(date) {
      return new Date(date.getFullYear(), date.getMonth() + 1, 1);
    }

    /**
     * Get an arbitrary date in the month before the given date's month.
     * @param date
     * @returns {Date}
     */
    function getDateInPreviousMonth(date) {
      return new Date(date.getFullYear(), date.getMonth() - 1, 1);
    }

    /**
     * Gets whether two dates have the same month and year.
     * @param {Date} d1
     * @param {Date} d2
     * @returns {boolean}
     */
    function isSameMonthAndYear(d1, d2) {
      return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
    }

    /**
     * Gets whether two dates are the same day (not not necesarily the same time).
     * @param {Date} d1
     * @param {Date} d2
     * @returns {boolean}
     */
    function isSameDay(d1, d2) {
      return d1.getDate() == d2.getDate() && isSameMonthAndYear(d1, d2);
    }

    /**
     * Gets whether a date is in the month immediately after some date.
     * @param {Date} startDate The date from which to compare.
     * @param {Date} endDate The date to check.
     * @returns {boolean}
     */
    function isInNextMonth(startDate, endDate) {
      var nextMonth = getDateInNextMonth(startDate);
      return isSameMonthAndYear(nextMonth, endDate);
    }

    /**
     * Gets whether a date is in the month immediately before some date.
     * @param {Date} startDate The date from which to compare.
     * @param {Date} endDate The date to check.
     * @returns {boolean}
     */
    function isInPreviousMonth(startDate, endDate) {
      var previousMonth = getDateInPreviousMonth(startDate);
      return isSameMonthAndYear(endDate, previousMonth);
    }

    /**
     * Gets the midpoint between two dates.
     * @param {Date} d1
     * @param {Date} d2
     * @returns {Date}
     */
    function getDateMidpoint(d1, d2) {
      return createDateAtMidnight((d1.getTime() + d2.getTime()) / 2);
    }

    /**
     * Gets the week of the month that a given date occurs in.
     * @param {Date} date
     * @returns {number} Index of the week of the month (zero-based).
     */
    function getWeekOfMonth(date) {
      var firstDayOfMonth = getFirstDateOfMonth(date);
      return Math.floor((firstDayOfMonth.getDay() + date.getDate() - 1) / 7);
    }

    /**
     * Gets a new date incremented by the given number of days. Number of days can be negative.
     * @param {Date} date
     * @param {number} numberOfDays
     * @returns {Date}
     */
    function incrementDays(date, numberOfDays) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + numberOfDays);
    }

    /**
     * Gets a new date incremented by the given number of months. Number of months can be negative.
     * If the date of the given month does not match the target month, the date will be set to the
     * last day of the month.
     * @param {Date} date
     * @param {number} numberOfMonths
     * @returns {Date}
     */
    function incrementMonths(date, numberOfMonths) {
      // If the same date in the target month does not actually exist, the Date object will
      // automatically advance *another* month by the number of missing days.
      // For example, if you try to go from Jan. 30 to Feb. 30, you'll end up on March 2.
      // So, we check if the month overflowed and go to the last day of the target month instead.
      var dateInTargetMonth = new Date(date.getFullYear(), date.getMonth() + numberOfMonths, 1);
      var numberOfDaysInMonth = getNumberOfDaysInMonth(dateInTargetMonth);
      if (numberOfDaysInMonth < date.getDate()) {
        dateInTargetMonth.setDate(numberOfDaysInMonth);
      } else {
        dateInTargetMonth.setDate(date.getDate());
      }

      return dateInTargetMonth;
    }

    /**
     * Get the integer distance between two months. This *only* considers the month and year
     * portion of the Date instances.
     *
     * @param {Date} start
     * @param {Date} end
     * @returns {number} Number of months between `start` and `end`. If `end` is before `start`
     *     chronologically, this number will be negative.
     */
    function getMonthDistance(start, end) {
      return (12 * (end.getFullYear() - start.getFullYear())) + (end.getMonth() - start.getMonth());
    }

    /**
     * Gets the last day of the month for the given date.
     * @param {Date} date
     * @returns {Date}
     */
    function getLastDateOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth(), getNumberOfDaysInMonth(date));
    }

    /**
     * Checks whether a date is valid.
     * @param {Date} date
     * @return {boolean} Whether the date is a valid Date.
     */
    function isValidDate(date) {
      return date != null && date.getTime && !isNaN(date.getTime());
    }

    /**
     * Sets a date's time to midnight.
     * @param {Date} date
     */
    function setDateTimeToMidnight(date) {
      if (isValidDate(date)) {
        date.setHours(0, 0, 0, 0);
      }
    }

    /**
     * Creates a date with the time set to midnight.
     * Drop-in replacement for two forms of the Date constructor:
     * 1. No argument for Date representing now.
     * 2. Single-argument value representing number of seconds since Unix Epoch
     * or a Date object.
     * @param {number|Date=} opt_value
     * @return {Date} New date with time set to midnight.
     */
    function createDateAtMidnight(opt_value) {
      var date;
      if (angular.isUndefined(opt_value)) {
        date = new Date();
      } else {
        date = new Date(opt_value);
      }
      setDateTimeToMidnight(date);
      return date;
    }

     /**
      * Checks if a date is within a min and max range, ignoring the time component.
      * If minDate or maxDate are not dates, they are ignored.
      * @param {Date} date
      * @param {Date} minDate
      * @param {Date} maxDate
      */
     function isDateWithinRange(date, minDate, maxDate) {
       var dateAtMidnight = createDateAtMidnight(date);
       var minDateAtMidnight = isValidDate(minDate) ? createDateAtMidnight(minDate) : null;
       var maxDateAtMidnight = isValidDate(maxDate) ? createDateAtMidnight(maxDate) : null;
       return (!minDateAtMidnight || minDateAtMidnight <= dateAtMidnight) &&
           (!maxDateAtMidnight || maxDateAtMidnight >= dateAtMidnight);
     }

    /**
     * Gets a new date incremented by the given number of years. Number of years can be negative.
     * See `incrementMonths` for notes on overflow for specific dates.
     * @param {Date} date
     * @param {number} numberOfYears
     * @returns {Date}
     */
     function incrementYears(date, numberOfYears) {
       return incrementMonths(date, numberOfYears * 12);
     }

     /**
      * Get the integer distance between two years. This *only* considers the year portion of the
      * Date instances.
      *
      * @param {Date} start
      * @param {Date} end
      * @returns {number} Number of months between `start` and `end`. If `end` is before `start`
      *     chronologically, this number will be negative.
      */
     function getYearDistance(start, end) {
       return end.getFullYear() - start.getFullYear();
     }

     /**
      * Clamps a date between a minimum and a maximum date.
      * @param {Date} date Date to be clamped
      * @param {Date=} minDate Minimum date
      * @param {Date=} maxDate Maximum date
      * @return {Date}
      */
     function clampDate(date, minDate, maxDate) {
       var boundDate = date;
       if (minDate && date < minDate) {
         boundDate = new Date(minDate.getTime());
       }
       if (maxDate && date > maxDate) {
         boundDate = new Date(maxDate.getTime());
       }
       return boundDate;
     }

     /**
      * Extracts and parses the timestamp from a DOM node.
      * @param  {HTMLElement} node Node from which the timestamp will be extracted.
      * @return {number} Time since epoch.
      */
     function getTimestampFromNode(node) {
       if (node && node.hasAttribute('data-timestamp')) {
         return Number(node.getAttribute('data-timestamp'));
       }
     }

  });
})();

})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.dialog
 */
angular
  .module('material.components.dialog', [
    'material.core',
    'material.components.backdrop'
  ])
  .directive('mdDialog', MdDialogDirective)
  .provider('$mdDialog', MdDialogProvider);

/**
 * @ngdoc directive
 * @name mdDialog
 * @module material.components.dialog
 *
 * @restrict E
 *
 * @description
 * `<md-dialog>` - The dialog's template must be inside this element.
 *
 * Inside, use an `<md-dialog-content>` element for the dialog's content, and use
 * an `<md-dialog-actions>` element for the dialog's actions.
 *
 * ## CSS
 * - `.md-dialog-content` - class that sets the padding on the content as the spec file
 *
 * ## Notes
 * - If you specify an `id` for the `<md-dialog>`, the `<md-dialog-content>` will have the same `id`
 * prefixed with `dialogContent_`.
 *
 * @usage
 * ### Dialog template
 * <hljs lang="html">
 * <md-dialog aria-label="List dialog">
 *   <md-dialog-content>
 *     <md-list>
 *       <md-list-item ng-repeat="item in items">
 *         <p>Number {{item}}</p>
 *       </md-list-item>
 *     </md-list>
 *   </md-dialog-content>
 *   <md-dialog-actions>
 *     <md-button ng-click="closeDialog()" class="md-primary">Close Dialog</md-button>
 *   </md-dialog-actions>
 * </md-dialog>
 * </hljs>
 */
function MdDialogDirective($$rAF, $mdTheming, $mdDialog) {
  return {
    restrict: 'E',
    link: function(scope, element) {
      element.addClass('_md');     // private md component indicator for styling

      $mdTheming(element);
      $$rAF(function() {
        var images;
        var content = element[0].querySelector('md-dialog-content');

        if (content) {
          images = content.getElementsByTagName('img');
          addOverflowClass();
          //-- delayed image loading may impact scroll height, check after images are loaded
          angular.element(images).on('load', addOverflowClass);
        }

        scope.$on('$destroy', function() {
          $mdDialog.destroy(element);
        });

        /**
         *
         */
        function addOverflowClass() {
          element.toggleClass('md-content-overflow', content.scrollHeight > content.clientHeight);
        }


      });
    }
  };
}
MdDialogDirective.$inject = ["$$rAF", "$mdTheming", "$mdDialog"];

/**
 * @ngdoc service
 * @name $mdDialog
 * @module material.components.dialog
 *
 * @description
 * `$mdDialog` opens a dialog over the app to inform users about critical information or require
 *  them to make decisions. There are two approaches for setup: a simple promise API
 *  and regular object syntax.
 *
 * ## Restrictions
 *
 * - The dialog is always given an isolate scope.
 * - The dialog's template must have an outer `<md-dialog>` element.
 *   Inside, use an `<md-dialog-content>` element for the dialog's content, and use
 *   an `<md-dialog-actions>` element for the dialog's actions.
 * - Dialogs must cover the entire application to keep interactions inside of them.
 * Use the `parent` option to change where dialogs are appended.
 *
 * ## Sizing
 * - Complex dialogs can be sized with `flex="percentage"`, i.e. `flex="66"`.
 * - Default max-width is 80% of the `rootElement` or `parent`.
 *
 * ## CSS
 * - `.md-dialog-content` - class that sets the padding on the content as the spec file
 *
 * @usage
 * <hljs lang="html">
 * <div  ng-app="demoApp" ng-controller="EmployeeController">
 *   <div>
 *     <md-button ng-click="showAlert()" class="md-raised md-warn">
 *       Employee Alert!
 *       </md-button>
 *   </div>
 *   <div>
 *     <md-button ng-click="showDialog($event)" class="md-raised">
 *       Custom Dialog
 *       </md-button>
 *   </div>
 *   <div>
 *     <md-button ng-click="closeAlert()" ng-disabled="!hasAlert()" class="md-raised">
 *       Close Alert
 *     </md-button>
 *   </div>
 *   <div>
 *     <md-button ng-click="showGreeting($event)" class="md-raised md-primary" >
 *       Greet Employee
 *       </md-button>
 *   </div>
 * </div>
 * </hljs>
 *
 * ### JavaScript: object syntax
 * <hljs lang="js">
 * (function(angular, undefined){
 *   "use strict";
 *
 *   angular
 *    .module('demoApp', ['ngMaterial'])
 *    .controller('AppCtrl', AppController);
 *
 *   function AppController($scope, $mdDialog) {
 *     var alert;
 *     $scope.showAlert = showAlert;
 *     $scope.showDialog = showDialog;
 *     $scope.items = [1, 2, 3];
 *
 *     // Internal method
 *     function showAlert() {
 *       alert = $mdDialog.alert({
 *         title: 'Attention',
 *         textContent: 'This is an example of how easy dialogs can be!',
 *         ok: 'Close'
 *       });
 *
 *       $mdDialog
 *         .show( alert )
 *         .finally(function() {
 *           alert = undefined;
 *         });
 *     }
 *
 *     function showDialog($event) {
 *        var parentEl = angular.element(document.body);
 *        $mdDialog.show({
 *          parent: parentEl,
 *          targetEvent: $event,
 *          template:
 *            '<md-dialog aria-label="List dialog">' +
 *            '  <md-dialog-content>'+
 *            '    <md-list>'+
 *            '      <md-list-item ng-repeat="item in items">'+
 *            '       <p>Number {{item}}</p>' +
 *            '      </md-item>'+
 *            '    </md-list>'+
 *            '  </md-dialog-content>' +
 *            '  <md-dialog-actions>' +
 *            '    <md-button ng-click="closeDialog()" class="md-primary">' +
 *            '      Close Dialog' +
 *            '    </md-button>' +
 *            '  </md-dialog-actions>' +
 *            '</md-dialog>',
 *          locals: {
 *            items: $scope.items
 *          },
 *          controller: DialogController
 *       });
 *       function DialogController($scope, $mdDialog, items) {
 *         $scope.items = items;
 *         $scope.closeDialog = function() {
 *           $mdDialog.hide();
 *         }
 *       }
 *     }
 *   }
 * })(angular);
 * </hljs>
 *
 * ### Pre-Rendered Dialogs
 * By using the `contentElement` option, it is possible to use an already existing element in the DOM.
 *
 * <hljs lang="js">
 *   $scope.showPrerenderedDialog = function() {
 *     $mdDialog.show({
 *       contentElement: '#myStaticDialog'
 *       parent: angular.element(document.body)
 *     });
 *   };
 * </hljs>
 *
 * When using a string as value, `$mdDialog` will automatically query the DOM for the specified CSS selector.
 *
 * <hljs lang="html">
 *   <div style="visibility: hidden">
 *     <div class="md-dialog-container" id="myStaticDialog">
 *       <md-dialog>
 *         This is a pre-rendered dialog.
 *       </md-dialog>
 *     </div>
 *   </div>
 * </hljs>
 *
 * **Notice**: It is important, to use the `.md-dialog-container` as the content element, otherwise the dialog
 * will not show up.
 *
 * It also possible to use a DOM element for the `contentElement` option.
 * - `contentElement: document.querySelector('#myStaticDialog')`
 * - `contentElement: angular.element(TEMPLATE)`
 *
 * When using a `template` as content element, it will be not compiled upon open.
 * This allows you to compile the element yourself and use it each time the dialog opens.
 *
 * ### JavaScript: promise API syntax, custom dialog template
 * <hljs lang="js">
 * (function(angular, undefined){
 *   "use strict";
 *
 *   angular
 *     .module('demoApp', ['ngMaterial'])
 *     .controller('EmployeeController', EmployeeEditor)
 *     .controller('GreetingController', GreetingController);
 *
 *   // Fictitious Employee Editor to show how to use simple and complex dialogs.
 *
 *   function EmployeeEditor($scope, $mdDialog) {
 *     var alert;
 *
 *     $scope.showAlert = showAlert;
 *     $scope.closeAlert = closeAlert;
 *     $scope.showGreeting = showCustomGreeting;
 *
 *     $scope.hasAlert = function() { return !!alert };
 *     $scope.userName = $scope.userName || 'Bobby';
 *
 *     // Dialog #1 - Show simple alert dialog and cache
 *     // reference to dialog instance
 *
 *     function showAlert() {
 *       alert = $mdDialog.alert()
 *         .title('Attention, ' + $scope.userName)
 *         .textContent('This is an example of how easy dialogs can be!')
 *         .ok('Close');
 *
 *       $mdDialog
 *           .show( alert )
 *           .finally(function() {
 *             alert = undefined;
 *           });
 *     }
 *
 *     // Close the specified dialog instance and resolve with 'finished' flag
 *     // Normally this is not needed, just use '$mdDialog.hide()' to close
 *     // the most recent dialog popup.
 *
 *     function closeAlert() {
 *       $mdDialog.hide( alert, "finished" );
 *       alert = undefined;
 *     }
 *
 *     // Dialog #2 - Demonstrate more complex dialogs construction and popup.
 *
 *     function showCustomGreeting($event) {
 *         $mdDialog.show({
 *           targetEvent: $event,
 *           template:
 *             '<md-dialog>' +
 *
 *             '  <md-dialog-content>Hello {{ employee }}!</md-dialog-content>' +
 *
 *             '  <md-dialog-actions>' +
 *             '    <md-button ng-click="closeDialog()" class="md-primary">' +
 *             '      Close Greeting' +
 *             '    </md-button>' +
 *             '  </md-dialog-actions>' +
 *             '</md-dialog>',
 *           controller: 'GreetingController',
 *           onComplete: afterShowAnimation,
 *           locals: { employee: $scope.userName }
 *         });
 *
 *         // When the 'enter' animation finishes...
 *
 *         function afterShowAnimation(scope, element, options) {
 *            // post-show code here: DOM element focus, etc.
 *         }
 *     }
 *
 *     // Dialog #3 - Demonstrate use of ControllerAs and passing $scope to dialog
 *     //             Here we used ng-controller="GreetingController as vm" and
 *     //             $scope.vm === <controller instance>
 *
 *     function showCustomGreeting() {
 *
 *        $mdDialog.show({
 *           clickOutsideToClose: true,
 *
 *           scope: $scope,        // use parent scope in template
 *           preserveScope: true,  // do not forget this if use parent scope

 *           // Since GreetingController is instantiated with ControllerAs syntax
 *           // AND we are passing the parent '$scope' to the dialog, we MUST
 *           // use 'vm.<xxx>' in the template markup
 *
 *           template: '<md-dialog>' +
 *                     '  <md-dialog-content>' +
 *                     '     Hi There {{vm.employee}}' +
 *                     '  </md-dialog-content>' +
 *                     '</md-dialog>',
 *
 *           controller: function DialogController($scope, $mdDialog) {
 *             $scope.closeDialog = function() {
 *               $mdDialog.hide();
 *             }
 *           }
 *        });
 *     }
 *
 *   }
 *
 *   // Greeting controller used with the more complex 'showCustomGreeting()' custom dialog
 *
 *   function GreetingController($scope, $mdDialog, employee) {
 *     // Assigned from construction <code>locals</code> options...
 *     $scope.employee = employee;
 *
 *     $scope.closeDialog = function() {
 *       // Easily hides most recent dialog shown...
 *       // no specific instance reference is needed.
 *       $mdDialog.hide();
 *     };
 *   }
 *
 * })(angular);
 * </hljs>
 */

/**
 * @ngdoc method
 * @name $mdDialog#alert
 *
 * @description
 * Builds a preconfigured dialog with the specified message.
 *
 * @returns {obj} an `$mdDialogPreset` with the chainable configuration methods:
 *
 * - $mdDialogPreset#title(string) - Sets the alert title.
 * - $mdDialogPreset#textContent(string) - Sets the alert message.
 * - $mdDialogPreset#htmlContent(string) - Sets the alert message as HTML. Requires ngSanitize
 *     module to be loaded. HTML is not run through Angular's compiler.
 * - $mdDialogPreset#ok(string) - Sets the alert "Okay" button text.
 * - $mdDialogPreset#theme(string) - Sets the theme of the alert dialog.
 * - $mdDialogPreset#targetEvent(DOMClickEvent=) - A click's event object. When passed in as an option,
 *     the location of the click will be used as the starting point for the opening animation
 *     of the the dialog.
 *
 */

/**
 * @ngdoc method
 * @name $mdDialog#confirm
 *
 * @description
 * Builds a preconfigured dialog with the specified message. You can call show and the promise returned
 * will be resolved only if the user clicks the confirm action on the dialog.
 *
 * @returns {obj} an `$mdDialogPreset` with the chainable configuration methods:
 *
 * Additionally, it supports the following methods:
 *
 * - $mdDialogPreset#title(string) - Sets the confirm title.
 * - $mdDialogPreset#textContent(string) - Sets the confirm message.
 * - $mdDialogPreset#htmlContent(string) - Sets the confirm message as HTML. Requires ngSanitize
 *     module to be loaded. HTML is not run through Angular's compiler.
 * - $mdDialogPreset#ok(string) - Sets the confirm "Okay" button text.
 * - $mdDialogPreset#cancel(string) - Sets the confirm "Cancel" button text.
 * - $mdDialogPreset#theme(string) - Sets the theme of the confirm dialog.
 * - $mdDialogPreset#targetEvent(DOMClickEvent=) - A click's event object. When passed in as an option,
 *     the location of the click will be used as the starting point for the opening animation
 *     of the the dialog.
 *
 */

/**
 * @ngdoc method
 * @name $mdDialog#prompt
 *
 * @description
 * Builds a preconfigured dialog with the specified message and input box. You can call show and the promise returned
 * will be resolved only if the user clicks the prompt action on the dialog, passing the input value as the first argument.
 *
 * @returns {obj} an `$mdDialogPreset` with the chainable configuration methods:
 *
 * Additionally, it supports the following methods:
 *
 * - $mdDialogPreset#title(string) - Sets the prompt title.
 * - $mdDialogPreset#textContent(string) - Sets the prompt message.
 * - $mdDialogPreset#htmlContent(string) - Sets the prompt message as HTML. Requires ngSanitize
 *     module to be loaded. HTML is not run through Angular's compiler.
 * - $mdDialogPreset#placeholder(string) - Sets the placeholder text for the input.
 * - $mdDialogPreset#initialValue(string) - Sets the initial value for the prompt input.
 * - $mdDialogPreset#ok(string) - Sets the prompt "Okay" button text.
 * - $mdDialogPreset#cancel(string) - Sets the prompt "Cancel" button text.
 * - $mdDialogPreset#theme(string) - Sets the theme of the prompt dialog.
 * - $mdDialogPreset#targetEvent(DOMClickEvent=) - A click's event object. When passed in as an option,
 *     the location of the click will be used as the starting point for the opening animation
 *     of the the dialog.
 *
 */

/**
 * @ngdoc method
 * @name $mdDialog#show
 *
 * @description
 * Show a dialog with the specified options.
 *
 * @param {object} optionsOrPreset Either provide an `$mdDialogPreset` returned from `alert()`, and
 * `confirm()`, or an options object with the following properties:
 *   - `templateUrl` - `{string=}`: The url of a template that will be used as the content
 *   of the dialog.
 *   - `template` - `{string=}`: HTML template to show in the dialog. This **must** be trusted HTML
 *      with respect to Angular's [$sce service](https://docs.angularjs.org/api/ng/service/$sce).
 *      This template should **never** be constructed with any kind of user input or user data.
 *   - `contentElement` - `{string|Element}`: Instead of using a template, which will be compiled each time a
 *     dialog opens, you can also use a DOM element.<br/>
 *     * When specifying an element, which is present on the DOM, `$mdDialog` will temporary fetch the element into
 *       the dialog and restores it at the old DOM position upon close.
 *     * When specifying a string, the string be used as a CSS selector, to lookup for the element in the DOM.
 *   - `autoWrap` - `{boolean=}`: Whether or not to automatically wrap the template with a
 *     `<md-dialog>` tag if one is not provided. Defaults to true. Can be disabled if you provide a
 *     custom dialog directive.
 *   - `targetEvent` - `{DOMClickEvent=}`: A click's event object. When passed in as an option,
 *     the location of the click will be used as the starting point for the opening animation
 *     of the the dialog.
 *   - `openFrom` - `{string|Element|object}`: The query selector, DOM element or the Rect object
 *     that is used to determine the bounds (top, left, height, width) from which the Dialog will
 *     originate.
 *   - `closeTo` - `{string|Element|object}`: The query selector, DOM element or the Rect object
 *     that is used to determine the bounds (top, left, height, width) to which the Dialog will
 *     target.
 *   - `scope` - `{object=}`: the scope to link the template / controller to. If none is specified,
 *     it will create a new isolate scope.
 *     This scope will be destroyed when the dialog is removed unless `preserveScope` is set to true.
 *   - `preserveScope` - `{boolean=}`: whether to preserve the scope when the element is removed. Default is false
 *   - `disableParentScroll` - `{boolean=}`: Whether to disable scrolling while the dialog is open.
 *     Default true.
 *   - `hasBackdrop` - `{boolean=}`: Whether there should be an opaque backdrop behind the dialog.
 *     Default true.
 *   - `clickOutsideToClose` - `{boolean=}`: Whether the user can click outside the dialog to
 *     close it. Default false.
 *   - `escapeToClose` - `{boolean=}`: Whether the user can press escape to close the dialog.
 *     Default true.
 *   - `focusOnOpen` - `{boolean=}`: An option to override focus behavior on open. Only disable if
 *     focusing some other way, as focus management is required for dialogs to be accessible.
 *     Defaults to true.
 *   - `controller` - `{function|string=}`: The controller to associate with the dialog. The controller
 *     will be injected with the local `$mdDialog`, which passes along a scope for the dialog.
 *   - `locals` - `{object=}`: An object containing key/value pairs. The keys will be used as names
 *     of values to inject into the controller. For example, `locals: {three: 3}` would inject
 *     `three` into the controller, with the value 3. If `bindToController` is true, they will be
 *     copied to the controller instead.
 *   - `bindToController` - `bool`: bind the locals to the controller, instead of passing them in.
 *   - `resolve` - `{object=}`: Similar to locals, except it takes promises as values, and the
 *     dialog will not open until all of the promises resolve.
 *   - `controllerAs` - `{string=}`: An alias to assign the controller to on the scope.
 *   - `parent` - `{element=}`: The element to append the dialog to. Defaults to appending
 *     to the root element of the application.
 *   - `onShowing` `{function=} Callback function used to announce the show() action is
 *     starting.
 *   - `onComplete` `{function=}`: Callback function used to announce when the show() action is
 *     finished.
 *   - `onRemoving` `{function=}`: Callback function used to announce the close/hide() action is
 *     starting. This allows developers to run custom animations in parallel the close animations.
 *   - `fullscreen` `{boolean=}`: An option to apply `.md-dialog-fullscreen` class on open.
 * @returns {promise} A promise that can be resolved with `$mdDialog.hide()` or
 * rejected with `$mdDialog.cancel()`.
 */

/**
 * @ngdoc method
 * @name $mdDialog#hide
 *
 * @description
 * Hide an existing dialog and resolve the promise returned from `$mdDialog.show()`.
 *
 * @param {*=} response An argument for the resolved promise.
 *
 * @returns {promise} A promise that is resolved when the dialog has been closed.
 */

/**
 * @ngdoc method
 * @name $mdDialog#cancel
 *
 * @description
 * Hide an existing dialog and reject the promise returned from `$mdDialog.show()`.
 *
 * @param {*=} response An argument for the rejected promise.
 *
 * @returns {promise} A promise that is resolved when the dialog has been closed.
 */

function MdDialogProvider($$interimElementProvider) {
  // Elements to capture and redirect focus when the user presses tab at the dialog boundary.
  var topFocusTrap, bottomFocusTrap;

  advancedDialogOptions.$inject = ["$mdDialog", "$mdConstant"];
  dialogDefaultOptions.$inject = ["$mdDialog", "$mdAria", "$mdUtil", "$mdConstant", "$animate", "$document", "$window", "$rootElement", "$log", "$injector", "$mdTheming"];
  return $$interimElementProvider('$mdDialog')
    .setDefaults({
      methods: ['disableParentScroll', 'hasBackdrop', 'clickOutsideToClose', 'escapeToClose',
          'targetEvent', 'closeTo', 'openFrom', 'parent', 'fullscreen', 'contentElement'],
      options: dialogDefaultOptions
    })
    .addPreset('alert', {
      methods: ['title', 'htmlContent', 'textContent', 'content', 'ariaLabel', 'ok', 'theme',
          'css'],
      options: advancedDialogOptions
    })
    .addPreset('confirm', {
      methods: ['title', 'htmlContent', 'textContent', 'content', 'ariaLabel', 'ok', 'cancel',
          'theme', 'css'],
      options: advancedDialogOptions
    })
    .addPreset('prompt', {
      methods: ['title', 'htmlContent', 'textContent', 'initialValue', 'content', 'placeholder', 'ariaLabel',
          'ok', 'cancel', 'theme', 'css'],
      options: advancedDialogOptions
    });

  /* @ngInject */
  function advancedDialogOptions($mdDialog, $mdConstant) {
    return {
      template: [
        '<md-dialog md-theme="{{ dialog.theme }}" aria-label="{{ dialog.ariaLabel }}" ng-class="dialog.css">',
        '  <md-dialog-content class="md-dialog-content" role="document" tabIndex="-1">',
        '    <h2 class="md-title">{{ dialog.title }}</h2>',
        '    <div ng-if="::dialog.mdHtmlContent" class="_md-dialog-content-body" ',
        '        ng-bind-html="::dialog.mdHtmlContent"></div>',
        '    <div ng-if="::!dialog.mdHtmlContent" class="_md-dialog-content-body">',
        '      <p>{{::dialog.mdTextContent}}</p>',
        '    </div>',
        '    <md-input-container md-no-float ng-if="::dialog.$type == \'prompt\'" class="md-prompt-input-container">',
        '      <input ng-keypress="dialog.keypress($event)" md-autofocus ng-model="dialog.result" ' +
        '             placeholder="{{::dialog.placeholder}}">',
        '    </md-input-container>',
        '  </md-dialog-content>',
        '  <md-dialog-actions>',
        '    <md-button ng-if="dialog.$type === \'confirm\' || dialog.$type === \'prompt\'"' +
        '               ng-click="dialog.abort()" class="md-primary">',
        '      {{ dialog.cancel }}',
        '    </md-button>',
        '    <md-button ng-click="dialog.hide()" class="md-primary" md-autofocus="dialog.$type===\'alert\'">',
        '      {{ dialog.ok }}',
        '    </md-button>',
        '  </md-dialog-actions>',
        '</md-dialog>'
      ].join('').replace(/\s\s+/g, ''),
      controller: function mdDialogCtrl() {
        var isPrompt = this.$type == 'prompt';

        if (isPrompt && this.initialValue) {
          this.result = this.initialValue;
        }

        this.hide = function() {
          $mdDialog.hide(isPrompt ? this.result : true);
        };
        this.abort = function() {
          $mdDialog.cancel();
        };
        this.keypress = function($event) {
          if ($event.keyCode === $mdConstant.KEY_CODE.ENTER) {
            $mdDialog.hide(this.result)
          }
        }
      },
      controllerAs: 'dialog',
      bindToController: true,
    };
  }

  /* @ngInject */
  function dialogDefaultOptions($mdDialog, $mdAria, $mdUtil, $mdConstant, $animate, $document, $window, $rootElement,
                                $log, $injector, $mdTheming) {

    return {
      hasBackdrop: true,
      isolateScope: true,
      onCompiling: beforeCompile,
      onShow: onShow,
      onShowing: beforeShow,
      onRemove: onRemove,
      clickOutsideToClose: false,
      escapeToClose: true,
      targetEvent: null,
      contentElement: null,
      closeTo: null,
      openFrom: null,
      focusOnOpen: true,
      disableParentScroll: true,
      autoWrap: true,
      fullscreen: false,
      transformTemplate: function(template, options) {
        // Make the dialog container focusable, because otherwise the focus will be always redirected to
        // an element outside of the container, and the focus trap won't work probably..
        // Also the tabindex is needed for the `escapeToClose` functionality, because
        // the keyDown event can't be triggered when the focus is outside of the container.
        return '<div class="md-dialog-container" tabindex="-1">' + validatedTemplate(template) + '</div>';

        /**
         * The specified template should contain a <md-dialog> wrapper element....
         */
        function validatedTemplate(template) {
          if (options.autoWrap && !/<\/md-dialog>/g.test(template)) {
            return '<md-dialog>' + (template || '') + '</md-dialog>';
          } else {
            return template || '';
          }
        }
      }
    };

    function beforeCompile(options) {
      // Automatically apply the theme, if the user didn't specify a theme explicitly.
      // Those option changes need to be done, before the compilation has started, because otherwise
      // the option changes will be not available in the $mdCompilers locales.
      detectTheming(options);
    }

    function beforeShow(scope, element, options, controller) {

      if (controller) {
        controller.mdHtmlContent = controller.htmlContent || options.htmlContent || '';
        controller.mdTextContent = controller.textContent || options.textContent ||
            controller.content || options.content || '';

        if (controller.mdHtmlContent && !$injector.has('$sanitize')) {
          throw Error('The ngSanitize module must be loaded in order to use htmlContent.');
        }

        if (controller.mdHtmlContent && controller.mdTextContent) {
          throw Error('md-dialog cannot have both `htmlContent` and `textContent`');
        }
      }
    }

    /** Show method for dialogs */
    function onShow(scope, element, options, controller) {
      angular.element($document[0].body).addClass('md-dialog-is-showing');

      if (options.contentElement) {
        var contentEl = options.contentElement;

        if (angular.isString(contentEl)) {
          contentEl = document.querySelector(contentEl);
          options.elementInsertionSibling = contentEl.nextElementSibling;
          options.elementInsertionParent = contentEl.parentNode;
        } else {
          contentEl = contentEl[0] || contentEl;
          // When the element is not visible in the DOM, then we can treat is as same
          // as a normal dialog would do. Removing it at close etc.
          // ---
          // When the element is visible in the DOM, then we restore it at close of the dialog.
          if (document.contains(contentEl)) {
            options.elementInsertionSibling = contentEl.nextElementSibling;
            options.elementInsertionParent = contentEl.parentNode;
          }
        }

        options.elementInsertionEntry = contentEl;
        element = angular.element(contentEl);
      }

      var dialogElement = element.find('md-dialog');

      // Once a dialog has `ng-cloak` applied on his template the dialog animation will not work properly.
      // This is a very common problem, so we have to notify the developer about this.
      if (dialogElement.hasClass('ng-cloak')) {
        var message = '$mdDialog: using `<md-dialog ng-cloak >` will affect the dialog opening animations.';
        $log.warn( message, element[0] );
      }

      captureParentAndFromToElements(options);
      configureAria(dialogElement, options);
      showBackdrop(scope, element, options);

      return dialogPopIn(element, options)
        .then(function() {
          activateListeners(element, options);
          lockScreenReader(element, options);
          warnDeprecatedActions();
          focusOnOpen();
        });

      /**
       * Check to see if they used the deprecated .md-actions class and log a warning
       */
      function warnDeprecatedActions() {
        if (element[0].querySelector('.md-actions')) {
          $log.warn('Using a class of md-actions is deprecated, please use <md-dialog-actions>.');
        }
      }

      /**
       * For alerts, focus on content... otherwise focus on
       * the close button (or equivalent)
       */
      function focusOnOpen() {
        if (options.focusOnOpen) {
          var target = $mdUtil.findFocusTarget(element) || findCloseButton();
          target.focus();
        }

        /**
         * If no element with class dialog-close, try to find the last
         * button child in md-actions and assume it is a close button.
         *
         * If we find no actions at all, log a warning to the console.
         */
        function findCloseButton() {
          var closeButton = element[0].querySelector('.dialog-close');
          if (!closeButton) {
            var actionButtons = element[0].querySelectorAll('.md-actions button, md-dialog-actions button');
            closeButton = actionButtons[actionButtons.length - 1];
          }
          return angular.element(closeButton);
        }
      }
    }

    /**
     * Remove function for all dialogs
     */
    function onRemove(scope, element, options) {
      options.deactivateListeners();
      options.unlockScreenReader();
      options.hideBackdrop(options.$destroy);

      // Remove the focus traps that we added earlier for keeping focus within the dialog.
      if (topFocusTrap && topFocusTrap.parentNode) {
        topFocusTrap.parentNode.removeChild(topFocusTrap);
      }

      if (bottomFocusTrap && bottomFocusTrap.parentNode) {
        bottomFocusTrap.parentNode.removeChild(bottomFocusTrap);
      }

      // For navigation $destroy events, do a quick, non-animated removal,
      // but for normal closes (from clicks, etc) animate the removal
      return !!options.$destroy ? detachAndClean() : animateRemoval().then( detachAndClean );

      /**
       * For normal closes, animate the removal.
       * For forced closes (like $destroy events), skip the animations
       */
      function animateRemoval() {
        return dialogPopOut(element, options);
      }

      function removeContentElement() {
        if (!options.contentElement) return;

        options.reverseContainerStretch();

        if (!options.elementInsertionParent) {
          // When the contentElement has no parent, then it's a virtual DOM element, which should
          // be removed at close, as same as normal templates inside of a dialog.
          options.elementInsertionEntry.parentNode.removeChild(options.elementInsertionEntry);
        } else if (!options.elementInsertionSibling) {
          // When the contentElement doesn't have any sibling, then it can be simply appended to the
          // parent, because it plays no role, which index it had before.
          options.elementInsertionParent.appendChild(options.elementInsertionEntry);
        } else {
          // When the contentElement has a sibling, which marks the previous position of the contentElement
          // in the DOM, we insert it correctly before the sibling, to have the same index as before.
          options.elementInsertionParent.insertBefore(options.elementInsertionEntry, options.elementInsertionSibling);
        }
      }

      /**
       * Detach the element
       */
      function detachAndClean() {
        angular.element($document[0].body).removeClass('md-dialog-is-showing');
        // Only remove the element, if it's not provided through the contentElement option.
        if (!options.contentElement) {
          element.remove();
        } else {
          removeContentElement();
        }

        if (!options.$destroy) options.origin.focus();
      }
    }

    function detectTheming(options) {
      // Only detect the theming, if the developer didn't specify the theme specifically.
      if (options.theme) return;

      options.theme = $mdTheming.defaultTheme();

      if (options.targetEvent && options.targetEvent.target) {
        var targetEl = angular.element(options.targetEvent.target);

        // Once the user specifies a targetEvent, we will automatically try to find the correct
        // nested theme.
        options.theme = (targetEl.controller('mdTheme') || {}).$mdTheme || options.theme;
      }

    }

    /**
     * Capture originator/trigger/from/to element information (if available)
     * and the parent container for the dialog; defaults to the $rootElement
     * unless overridden in the options.parent
     */
    function captureParentAndFromToElements(options) {
          options.origin = angular.extend({
            element: null,
            bounds: null,
            focus: angular.noop
          }, options.origin || {});

          options.parent   = getDomElement(options.parent, $rootElement);
          options.closeTo  = getBoundingClientRect(getDomElement(options.closeTo));
          options.openFrom = getBoundingClientRect(getDomElement(options.openFrom));

          if ( options.targetEvent ) {
            options.origin   = getBoundingClientRect(options.targetEvent.target, options.origin);
          }


          /**
           * Identify the bounding RECT for the target element
           *
           */
          function getBoundingClientRect (element, orig) {
            var source = angular.element((element || {}));
            if (source && source.length) {
              // Compute and save the target element's bounding rect, so that if the
              // element is hidden when the dialog closes, we can shrink the dialog
              // back to the same position it expanded from.
              //
              // Checking if the source is a rect object or a DOM element
              var bounds = {top:0,left:0,height:0,width:0};
              var hasFn = angular.isFunction(source[0].getBoundingClientRect);

              return angular.extend(orig || {}, {
                  element : hasFn ? source : undefined,
                  bounds  : hasFn ? source[0].getBoundingClientRect() : angular.extend({}, bounds, source[0]),
                  focus   : angular.bind(source, source.focus),
              });
            }
          }

          /**
           * If the specifier is a simple string selector, then query for
           * the DOM element.
           */
          function getDomElement(element, defaultElement) {
            if (angular.isString(element)) {
              element = $document[0].querySelector(element);
            }

            // If we have a reference to a raw dom element, always wrap it in jqLite
            return angular.element(element || defaultElement);
          }

        }

    /**
     * Listen for escape keys and outside clicks to auto close
     */
    function activateListeners(element, options) {
      var window = angular.element($window);
      var onWindowResize = $mdUtil.debounce(function() {
        stretchDialogContainerToViewport(element, options);
      }, 60);

      var removeListeners = [];
      var smartClose = function() {
        // Only 'confirm' dialogs have a cancel button... escape/clickOutside will
        // cancel or fallback to hide.
        var closeFn = ( options.$type == 'alert' ) ? $mdDialog.hide : $mdDialog.cancel;
        $mdUtil.nextTick(closeFn, true);
      };

      if (options.escapeToClose) {
        var parentTarget = options.parent;
        var keyHandlerFn = function(ev) {
          if (ev.keyCode === $mdConstant.KEY_CODE.ESCAPE) {
            ev.stopPropagation();
            ev.preventDefault();

            smartClose();
          }
        };

        // Add keydown listeners
        element.on('keydown', keyHandlerFn);
        parentTarget.on('keydown', keyHandlerFn);

        // Queue remove listeners function
        removeListeners.push(function() {

          element.off('keydown', keyHandlerFn);
          parentTarget.off('keydown', keyHandlerFn);

        });
      }

      // Register listener to update dialog on window resize
      window.on('resize', onWindowResize);

      removeListeners.push(function() {
        window.off('resize', onWindowResize);
      });

      if (options.clickOutsideToClose) {
        var target = element;
        var sourceElem;

        // Keep track of the element on which the mouse originally went down
        // so that we can only close the backdrop when the 'click' started on it.
        // A simple 'click' handler does not work,
        // it sets the target object as the element the mouse went down on.
        var mousedownHandler = function(ev) {
          sourceElem = ev.target;
        };

        // We check if our original element and the target is the backdrop
        // because if the original was the backdrop and the target was inside the dialog
        // we don't want to dialog to close.
        var mouseupHandler = function(ev) {
          if (sourceElem === target[0] && ev.target === target[0]) {
            ev.stopPropagation();
            ev.preventDefault();

            smartClose();
          }
        };

        // Add listeners
        target.on('mousedown', mousedownHandler);
        target.on('mouseup', mouseupHandler);

        // Queue remove listeners function
        removeListeners.push(function() {
          target.off('mousedown', mousedownHandler);
          target.off('mouseup', mouseupHandler);
        });
      }

      // Attach specific `remove` listener handler
      options.deactivateListeners = function() {
        removeListeners.forEach(function(removeFn) {
          removeFn();
        });
        options.deactivateListeners = null;
      };
    }

    /**
     * Show modal backdrop element...
     */
    function showBackdrop(scope, element, options) {

      if (options.disableParentScroll) {
        // !! DO this before creating the backdrop; since disableScrollAround()
        //    configures the scroll offset; which is used by mdBackDrop postLink()
        options.restoreScroll = $mdUtil.disableScrollAround(element, options.parent);
      }

      if (options.hasBackdrop) {
        options.backdrop = $mdUtil.createBackdrop(scope, "_md-dialog-backdrop md-opaque");
        $animate.enter(options.backdrop, options.parent);
      }

      /**
       * Hide modal backdrop element...
       */
      options.hideBackdrop = function hideBackdrop($destroy) {
        if (options.backdrop) {
          if ( !!$destroy ) options.backdrop.remove();
          else              $animate.leave(options.backdrop);
        }

        if (options.disableParentScroll) {
          options.restoreScroll();
          delete options.restoreScroll;
        }

        options.hideBackdrop = null;
      }
    }

    /**
     * Inject ARIA-specific attributes appropriate for Dialogs
     */
    function configureAria(element, options) {

      var role = (options.$type === 'alert') ? 'alertdialog' : 'dialog';
      var dialogContent = element.find('md-dialog-content');
      var existingDialogId = element.attr('id');
      var dialogContentId = 'dialogContent_' + (existingDialogId || $mdUtil.nextUid());

      element.attr({
        'role': role,
        'tabIndex': '-1'
      });

      if (dialogContent.length === 0) {
        dialogContent = element;
        // If the dialog element already had an ID, don't clobber it.
        if (existingDialogId) {
          dialogContentId = existingDialogId;
        }
      }

      dialogContent.attr('id', dialogContentId);
      element.attr('aria-describedby', dialogContentId);

      if (options.ariaLabel) {
        $mdAria.expect(element, 'aria-label', options.ariaLabel);
      }
      else {
        $mdAria.expectAsync(element, 'aria-label', function() {
          var words = dialogContent.text().split(/\s+/);
          if (words.length > 3) words = words.slice(0, 3).concat('...');
          return words.join(' ');
        });
      }

      // Set up elements before and after the dialog content to capture focus and
      // redirect back into the dialog.
      topFocusTrap = document.createElement('div');
      topFocusTrap.classList.add('_md-dialog-focus-trap');
      topFocusTrap.tabIndex = 0;

      bottomFocusTrap = topFocusTrap.cloneNode(false);

      // When focus is about to move out of the dialog, we want to intercept it and redirect it
      // back to the dialog element.
      var focusHandler = function() {
        element.focus();
      };
      topFocusTrap.addEventListener('focus', focusHandler);
      bottomFocusTrap.addEventListener('focus', focusHandler);

      // The top focus trap inserted immeidately before the md-dialog element (as a sibling).
      // The bottom focus trap is inserted at the very end of the md-dialog element (as a child).
      element[0].parentNode.insertBefore(topFocusTrap, element[0]);
      element.after(bottomFocusTrap);
    }

    /**
     * Prevents screen reader interaction behind modal window
     * on swipe interfaces
     */
    function lockScreenReader(element, options) {
      var isHidden = true;

      // get raw DOM node
      walkDOM(element[0]);

      options.unlockScreenReader = function() {
        isHidden = false;
        walkDOM(element[0]);

        options.unlockScreenReader = null;
      };

      /**
       * Walk DOM to apply or remove aria-hidden on sibling nodes
       * and parent sibling nodes
       *
       */
      function walkDOM(element) {
        while (element.parentNode) {
          if (element === document.body) {
            return;
          }
          var children = element.parentNode.children;
          for (var i = 0; i < children.length; i++) {
            // skip over child if it is an ascendant of the dialog
            // or a script or style tag
            if (element !== children[i] && !isNodeOneOf(children[i], ['SCRIPT', 'STYLE'])) {
              children[i].setAttribute('aria-hidden', isHidden);
            }
          }

          walkDOM(element = element.parentNode);
        }
      }
    }

    /**
     * Ensure the dialog container fill-stretches to the viewport
     */
    function stretchDialogContainerToViewport(container, options) {
      var isFixed = $window.getComputedStyle($document[0].body).position == 'fixed';
      var backdrop = options.backdrop ? $window.getComputedStyle(options.backdrop[0]) : null;
      var height = backdrop ? Math.min($document[0].body.clientHeight, Math.ceil(Math.abs(parseInt(backdrop.height, 10)))) : 0;

      var previousStyles = {
        top: container.css('top'),
        height: container.css('height')
      };

      container.css({
        top: (isFixed ? $mdUtil.scrollTop(options.parent) : 0) + 'px',
        height: height ? height + 'px' : '100%'
      });

      return function() {
        // Reverts the modified styles back to the previous values.
        // This is needed for contentElements, which should have the same styles after close
        // as before.
        container.css(previousStyles);
      };
    }

    /**
     *  Dialog open and pop-in animation
     */
    function dialogPopIn(container, options) {
      // Add the `md-dialog-container` to the DOM
      options.parent.append(container);
      options.reverseContainerStretch = stretchDialogContainerToViewport(container, options);

      var dialogEl = container.find('md-dialog');
      var animator = $mdUtil.dom.animator;
      var buildTranslateToOrigin = animator.calculateZoomToOrigin;
      var translateOptions = {transitionInClass: '_md-transition-in', transitionOutClass: '_md-transition-out'};
      var from = animator.toTransformCss(buildTranslateToOrigin(dialogEl, options.openFrom || options.origin));
      var to = animator.toTransformCss("");  // defaults to center display (or parent or $rootElement)

      if (options.fullscreen) {
        dialogEl.addClass('md-dialog-fullscreen');
      }

      return animator
        .translate3d(dialogEl, from, to, translateOptions)
        .then(function(animateReversal) {
          // Build a reversal translate function synced to this translation...
          options.reverseAnimate = function() {
            delete options.reverseAnimate;

            if (options.closeTo) {
              // Using the opposite classes to create a close animation to the closeTo element
              translateOptions = {transitionInClass: '_md-transition-out', transitionOutClass: '_md-transition-in'};
              from = to;
              to = animator.toTransformCss(buildTranslateToOrigin(dialogEl, options.closeTo));

              return animator
                .translate3d(dialogEl, from, to,translateOptions);
            }

            return animateReversal(
              to = animator.toTransformCss(
                // in case the origin element has moved or is hidden,
                // let's recalculate the translateCSS
                buildTranslateToOrigin(dialogEl, options.origin)
              )
            );

          };

          // Builds a function, which clears the animations / transforms of the dialog element.
          // Required for contentElements, which should not have the the animation styling after
          // the dialog is closed.
          options.clearAnimate = function() {
            delete options.clearAnimate;
            return animator
              .translate3d(dialogEl, to, animator.toTransformCss(''), {});
          };

          return true;
        });
    }

    /**
     * Dialog close and pop-out animation
     */
    function dialogPopOut(container, options) {
      return options.reverseAnimate().then(function() {
        if (options.contentElement) {
          // When we use a contentElement, we want the element to be the same as before.
          // That means, that we have to clear all the animation properties, like transform.
          options.clearAnimate();
        }
      });
    }

    /**
     * Utility function to filter out raw DOM nodes
     */
    function isNodeOneOf(elem, nodeTypeArray) {
      if (nodeTypeArray.indexOf(elem.nodeName) !== -1) {
        return true;
      }
    }

  }
}
MdDialogProvider.$inject = ["$$interimElementProvider"];

})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.gridList
 */
angular.module('material.components.gridList', ['material.core'])
       .directive('mdGridList', GridListDirective)
       .directive('mdGridTile', GridTileDirective)
       .directive('mdGridTileFooter', GridTileCaptionDirective)
       .directive('mdGridTileHeader', GridTileCaptionDirective)
       .factory('$mdGridLayout', GridLayoutFactory);

/**
 * @ngdoc directive
 * @name mdGridList
 * @module material.components.gridList
 * @restrict E
 * @description
 * Grid lists are an alternative to standard list views. Grid lists are distinct
 * from grids used for layouts and other visual presentations.
 *
 * A grid list is best suited to presenting a homogenous data type, typically
 * images, and is optimized for visual comprehension and differentiating between
 * like data types.
 *
 * A grid list is a continuous element consisting of tessellated, regular
 * subdivisions called cells that contain tiles (`md-grid-tile`).
 *
 * <img src="//material-design.storage.googleapis.com/publish/v_2/material_ext_publish/0Bx4BSt6jniD7OVlEaXZ5YmU1Xzg/components_grids_usage2.png"
 *    style="width: 300px; height: auto; margin-right: 16px;" alt="Concept of grid explained visually">
 * <img src="//material-design.storage.googleapis.com/publish/v_2/material_ext_publish/0Bx4BSt6jniD7VGhsOE5idWlJWXM/components_grids_usage3.png"
 *    style="width: 300px; height: auto;" alt="Grid concepts legend">
 *
 * Cells are arrayed vertically and horizontally within the grid.
 *
 * Tiles hold content and can span one or more cells vertically or horizontally.
 *
 * ### Responsive Attributes
 *
 * The `md-grid-list` directive supports "responsive" attributes, which allow
 * different `md-cols`, `md-gutter` and `md-row-height` values depending on the
 * currently matching media query.
 *
 * In order to set a responsive attribute, first define the fallback value with
 * the standard attribute name, then add additional attributes with the
 * following convention: `{base-attribute-name}-{media-query-name}="{value}"`
 * (ie. `md-cols-lg="8"`)
 *
 * @param {number} md-cols Number of columns in the grid.
 * @param {string} md-row-height One of
 * <ul>
 *   <li>CSS length - Fixed height rows (eg. `8px` or `1rem`)</li>
 *   <li>`{width}:{height}` - Ratio of width to height (eg.
 *   `md-row-height="16:9"`)</li>
 *   <li>`"fit"` - Height will be determined by subdividing the available
 *   height by the number of rows</li>
 * </ul>
 * @param {string=} md-gutter The amount of space between tiles in CSS units
 *     (default 1px)
 * @param {expression=} md-on-layout Expression to evaluate after layout. Event
 *     object is available as `$event`, and contains performance information.
 *
 * @usage
 * Basic:
 * <hljs lang="html">
 * <md-grid-list md-cols="5" md-gutter="1em" md-row-height="4:3">
 *   <md-grid-tile></md-grid-tile>
 * </md-grid-list>
 * </hljs>
 *
 * Fixed-height rows:
 * <hljs lang="html">
 * <md-grid-list md-cols="4" md-row-height="200px" ...>
 *   <md-grid-tile></md-grid-tile>
 * </md-grid-list>
 * </hljs>
 *
 * Fit rows:
 * <hljs lang="html">
 * <md-grid-list md-cols="4" md-row-height="fit" style="height: 400px;" ...>
 *   <md-grid-tile></md-grid-tile>
 * </md-grid-list>
 * </hljs>
 *
 * Using responsive attributes:
 * <hljs lang="html">
 * <md-grid-list
 *     md-cols-sm="2"
 *     md-cols-md="4"
 *     md-cols-lg="8"
 *     md-cols-gt-lg="12"
 *     ...>
 *   <md-grid-tile></md-grid-tile>
 * </md-grid-list>
 * </hljs>
 */
function GridListDirective($interpolate, $mdConstant, $mdGridLayout, $mdMedia) {
  return {
    restrict: 'E',
    controller: GridListController,
    scope: {
      mdOnLayout: '&'
    },
    link: postLink
  };

  function postLink(scope, element, attrs, ctrl) {
    element.addClass('_md');     // private md component indicator for styling
    
    // Apply semantics
    element.attr('role', 'list');

    // Provide the controller with a way to trigger layouts.
    ctrl.layoutDelegate = layoutDelegate;

    var invalidateLayout = angular.bind(ctrl, ctrl.invalidateLayout),
        unwatchAttrs = watchMedia();
      scope.$on('$destroy', unwatchMedia);

    /**
     * Watches for changes in media, invalidating layout as necessary.
     */
    function watchMedia() {
      for (var mediaName in $mdConstant.MEDIA) {
        $mdMedia(mediaName); // initialize
        $mdMedia.getQuery($mdConstant.MEDIA[mediaName])
            .addListener(invalidateLayout);
      }
      return $mdMedia.watchResponsiveAttributes(
          ['md-cols', 'md-row-height', 'md-gutter'], attrs, layoutIfMediaMatch);
    }

    function unwatchMedia() {
      ctrl.layoutDelegate = angular.noop;

      unwatchAttrs();
      for (var mediaName in $mdConstant.MEDIA) {
        $mdMedia.getQuery($mdConstant.MEDIA[mediaName])
            .removeListener(invalidateLayout);
      }
    }

    /**
     * Performs grid layout if the provided mediaName matches the currently
     * active media type.
     */
    function layoutIfMediaMatch(mediaName) {
      if (mediaName == null) {
        // TODO(shyndman): It would be nice to only layout if we have
        // instances of attributes using this media type
        ctrl.invalidateLayout();
      } else if ($mdMedia(mediaName)) {
        ctrl.invalidateLayout();
      }
    }

    var lastLayoutProps;

    /**
     * Invokes the layout engine, and uses its results to lay out our
     * tile elements.
     *
     * @param {boolean} tilesInvalidated Whether tiles have been
     *    added/removed/moved since the last layout. This is to avoid situations
     *    where tiles are replaced with properties identical to their removed
     *    counterparts.
     */
    function layoutDelegate(tilesInvalidated) {
      var tiles = getTileElements();
      var props = {
        tileSpans: getTileSpans(tiles),
        colCount: getColumnCount(),
        rowMode: getRowMode(),
        rowHeight: getRowHeight(),
        gutter: getGutter()
      };

      if (!tilesInvalidated && angular.equals(props, lastLayoutProps)) {
        return;
      }

      var performance =
        $mdGridLayout(props.colCount, props.tileSpans, tiles)
          .map(function(tilePositions, rowCount) {
            return {
              grid: {
                element: element,
                style: getGridStyle(props.colCount, rowCount,
                    props.gutter, props.rowMode, props.rowHeight)
              },
              tiles: tilePositions.map(function(ps, i) {
                return {
                  element: angular.element(tiles[i]),
                  style: getTileStyle(ps.position, ps.spans,
                      props.colCount, rowCount,
                      props.gutter, props.rowMode, props.rowHeight)
                }
              })
            }
          })
          .reflow()
          .performance();

      // Report layout
      scope.mdOnLayout({
        $event: {
          performance: performance
        }
      });

      lastLayoutProps = props;
    }

    // Use $interpolate to do some simple string interpolation as a convenience.

    var startSymbol = $interpolate.startSymbol();
    var endSymbol = $interpolate.endSymbol();

    // Returns an expression wrapped in the interpolator's start and end symbols.
    function expr(exprStr) {
      return startSymbol + exprStr + endSymbol;
    }

    // The amount of space a single 1x1 tile would take up (either width or height), used as
    // a basis for other calculations. This consists of taking the base size percent (as would be
    // if evenly dividing the size between cells), and then subtracting the size of one gutter.
    // However, since there are no gutters on the edges, each tile only uses a fration
    // (gutterShare = numGutters / numCells) of the gutter size. (Imagine having one gutter per
    // tile, and then breaking up the extra gutter on the edge evenly among the cells).
    var UNIT = $interpolate(expr('share') + '% - (' + expr('gutter') + ' * ' + expr('gutterShare') + ')');

    // The horizontal or vertical position of a tile, e.g., the 'top' or 'left' property value.
    // The position comes the size of a 1x1 tile plus gutter for each previous tile in the
    // row/column (offset).
    var POSITION  = $interpolate('calc((' + expr('unit') + ' + ' + expr('gutter') + ') * ' + expr('offset') + ')');

    // The actual size of a tile, e.g., width or height, taking rowSpan or colSpan into account.
    // This is computed by multiplying the base unit by the rowSpan/colSpan, and then adding back
    // in the space that the gutter would normally have used (which was already accounted for in
    // the base unit calculation).
    var DIMENSION = $interpolate('calc((' + expr('unit') + ') * ' + expr('span') + ' + (' + expr('span') + ' - 1) * ' + expr('gutter') + ')');

    /**
     * Gets the styles applied to a tile element described by the given parameters.
     * @param {{row: number, col: number}} position The row and column indices of the tile.
     * @param {{row: number, col: number}} spans The rowSpan and colSpan of the tile.
     * @param {number} colCount The number of columns.
     * @param {number} rowCount The number of rows.
     * @param {string} gutter The amount of space between tiles. This will be something like
     *     '5px' or '2em'.
     * @param {string} rowMode The row height mode. Can be one of:
     *     'fixed': all rows have a fixed size, given by rowHeight,
     *     'ratio': row height defined as a ratio to width, or
     *     'fit': fit to the grid-list element height, divinding evenly among rows.
     * @param {string|number} rowHeight The height of a row. This is only used for 'fixed' mode and
     *     for 'ratio' mode. For 'ratio' mode, this is the *ratio* of width-to-height (e.g., 0.75).
     * @returns {Object} Map of CSS properties to be applied to the style element. Will define
     *     values for top, left, width, height, marginTop, and paddingTop.
     */
    function getTileStyle(position, spans, colCount, rowCount, gutter, rowMode, rowHeight) {
      // TODO(shyndman): There are style caching opportunities here.

      // Percent of the available horizontal space that one column takes up.
      var hShare = (1 / colCount) * 100;

      // Fraction of the gutter size that each column takes up.
      var hGutterShare = (colCount - 1) / colCount;

      // Base horizontal size of a column.
      var hUnit = UNIT({share: hShare, gutterShare: hGutterShare, gutter: gutter});

      // The width and horizontal position of each tile is always calculated the same way, but the
      // height and vertical position depends on the rowMode.
      var style = {
        left: POSITION({ unit: hUnit, offset: position.col, gutter: gutter }),
        width: DIMENSION({ unit: hUnit, span: spans.col, gutter: gutter }),
        // resets
        paddingTop: '',
        marginTop: '',
        top: '',
        height: ''
      };

      switch (rowMode) {
        case 'fixed':
          // In fixed mode, simply use the given rowHeight.
          style.top = POSITION({ unit: rowHeight, offset: position.row, gutter: gutter });
          style.height = DIMENSION({ unit: rowHeight, span: spans.row, gutter: gutter });
          break;

        case 'ratio':
          // Percent of the available vertical space that one row takes up. Here, rowHeight holds
          // the ratio value. For example, if the width:height ratio is 4:3, rowHeight = 1.333.
          var vShare = hShare / rowHeight;

          // Base veritcal size of a row.
          var vUnit = UNIT({ share: vShare, gutterShare: hGutterShare, gutter: gutter });

          // padidngTop and marginTop are used to maintain the given aspect ratio, as
          // a percentage-based value for these properties is applied to the *width* of the
          // containing block. See http://www.w3.org/TR/CSS2/box.html#margin-properties
          style.paddingTop = DIMENSION({ unit: vUnit, span: spans.row, gutter: gutter});
          style.marginTop = POSITION({ unit: vUnit, offset: position.row, gutter: gutter });
          break;

        case 'fit':
          // Fraction of the gutter size that each column takes up.
          var vGutterShare = (rowCount - 1) / rowCount;

          // Percent of the available vertical space that one row takes up.
          var vShare = (1 / rowCount) * 100;

          // Base vertical size of a row.
          var vUnit = UNIT({share: vShare, gutterShare: vGutterShare, gutter: gutter});

          style.top = POSITION({unit: vUnit, offset: position.row, gutter: gutter});
          style.height = DIMENSION({unit: vUnit, span: spans.row, gutter: gutter});
          break;
      }

      return style;
    }

    function getGridStyle(colCount, rowCount, gutter, rowMode, rowHeight) {
      var style = {};

      switch(rowMode) {
        case 'fixed':
          style.height = DIMENSION({ unit: rowHeight, span: rowCount, gutter: gutter });
          style.paddingBottom = '';
          break;

        case 'ratio':
          // rowHeight is width / height
          var hGutterShare = colCount === 1 ? 0 : (colCount - 1) / colCount,
              hShare = (1 / colCount) * 100,
              vShare = hShare * (1 / rowHeight),
              vUnit = UNIT({ share: vShare, gutterShare: hGutterShare, gutter: gutter });

          style.height = '';
          style.paddingBottom = DIMENSION({ unit: vUnit, span: rowCount, gutter: gutter});
          break;

        case 'fit':
          // noop, as the height is user set
          break;
      }

      return style;
    }

    function getTileElements() {
      return [].filter.call(element.children(), function(ele) {
        return ele.tagName == 'MD-GRID-TILE' && !ele.$$mdDestroyed;
      });
    }

    /**
     * Gets an array of objects containing the rowspan and colspan for each tile.
     * @returns {Array<{row: number, col: number}>}
     */
    function getTileSpans(tileElements) {
      return [].map.call(tileElements, function(ele) {
        var ctrl = angular.element(ele).controller('mdGridTile');
        return {
          row: parseInt(
              $mdMedia.getResponsiveAttribute(ctrl.$attrs, 'md-rowspan'), 10) || 1,
          col: parseInt(
              $mdMedia.getResponsiveAttribute(ctrl.$attrs, 'md-colspan'), 10) || 1
        };
      });
    }

    function getColumnCount() {
      var colCount = parseInt($mdMedia.getResponsiveAttribute(attrs, 'md-cols'), 10);
      if (isNaN(colCount)) {
        throw 'md-grid-list: md-cols attribute was not found, or contained a non-numeric value';
      }
      return colCount;
    }

    function getGutter() {
      return applyDefaultUnit($mdMedia.getResponsiveAttribute(attrs, 'md-gutter') || 1);
    }

    function getRowHeight() {
      var rowHeight = $mdMedia.getResponsiveAttribute(attrs, 'md-row-height');
      if (!rowHeight) {
        throw 'md-grid-list: md-row-height attribute was not found';
      }

      switch (getRowMode()) {
        case 'fixed':
          return applyDefaultUnit(rowHeight);
        case 'ratio':
          var whRatio = rowHeight.split(':');
          return parseFloat(whRatio[0]) / parseFloat(whRatio[1]);
        case 'fit':
          return 0; // N/A
      }
    }

    function getRowMode() {
      var rowHeight = $mdMedia.getResponsiveAttribute(attrs, 'md-row-height');
      if (!rowHeight) {
        throw 'md-grid-list: md-row-height attribute was not found';
      }

      if (rowHeight == 'fit') {
        return 'fit';
      } else if (rowHeight.indexOf(':') !== -1) {
        return 'ratio';
      } else {
        return 'fixed';
      }
    }

    function applyDefaultUnit(val) {
      return /\D$/.test(val) ? val : val + 'px';
    }
  }
}
GridListDirective.$inject = ["$interpolate", "$mdConstant", "$mdGridLayout", "$mdMedia"];

/* @ngInject */
function GridListController($mdUtil) {
  this.layoutInvalidated = false;
  this.tilesInvalidated = false;
  this.$timeout_ = $mdUtil.nextTick;
  this.layoutDelegate = angular.noop;
}
GridListController.$inject = ["$mdUtil"];

GridListController.prototype = {
  invalidateTiles: function() {
    this.tilesInvalidated = true;
    this.invalidateLayout();
  },

  invalidateLayout: function() {
    if (this.layoutInvalidated) {
      return;
    }
    this.layoutInvalidated = true;
    this.$timeout_(angular.bind(this, this.layout));
  },

  layout: function() {
    try {
      this.layoutDelegate(this.tilesInvalidated);
    } finally {
      this.layoutInvalidated = false;
      this.tilesInvalidated = false;
    }
  }
};


/* @ngInject */
function GridLayoutFactory($mdUtil) {
  var defaultAnimator = GridTileAnimator;

  /**
   * Set the reflow animator callback
   */
  GridLayout.animateWith = function(customAnimator) {
    defaultAnimator = !angular.isFunction(customAnimator) ? GridTileAnimator : customAnimator;
  };

  return GridLayout;

  /**
   * Publish layout function
   */
  function GridLayout(colCount, tileSpans) {
      var self, layoutInfo, gridStyles, layoutTime, mapTime, reflowTime;

      layoutTime = $mdUtil.time(function() {
        layoutInfo = calculateGridFor(colCount, tileSpans);
      });

      return self = {

        /**
         * An array of objects describing each tile's position in the grid.
         */
        layoutInfo: function() {
          return layoutInfo;
        },

        /**
         * Maps grid positioning to an element and a set of styles using the
         * provided updateFn.
         */
        map: function(updateFn) {
          mapTime = $mdUtil.time(function() {
            var info = self.layoutInfo();
            gridStyles = updateFn(info.positioning, info.rowCount);
          });
          return self;
        },

        /**
         * Default animator simply sets the element.css( <styles> ). An alternate
         * animator can be provided as an argument. The function has the following
         * signature:
         *
         *    function({grid: {element: JQLite, style: Object}, tiles: Array<{element: JQLite, style: Object}>)
         */
        reflow: function(animatorFn) {
          reflowTime = $mdUtil.time(function() {
            var animator = animatorFn || defaultAnimator;
            animator(gridStyles.grid, gridStyles.tiles);
          });
          return self;
        },

        /**
         * Timing for the most recent layout run.
         */
        performance: function() {
          return {
            tileCount: tileSpans.length,
            layoutTime: layoutTime,
            mapTime: mapTime,
            reflowTime: reflowTime,
            totalTime: layoutTime + mapTime + reflowTime
          };
        }
      };
    }

  /**
   * Default Gridlist animator simple sets the css for each element;
   * NOTE: any transitions effects must be manually set in the CSS.
   * e.g.
   *
   *  md-grid-tile {
   *    transition: all 700ms ease-out 50ms;
   *  }
   *
   */
  function GridTileAnimator(grid, tiles) {
    grid.element.css(grid.style);
    tiles.forEach(function(t) {
      t.element.css(t.style);
    })
  }

  /**
   * Calculates the positions of tiles.
   *
   * The algorithm works as follows:
   *    An Array<Number> with length colCount (spaceTracker) keeps track of
   *    available tiling positions, where elements of value 0 represents an
   *    empty position. Space for a tile is reserved by finding a sequence of
   *    0s with length <= than the tile's colspan. When such a space has been
   *    found, the occupied tile positions are incremented by the tile's
   *    rowspan value, as these positions have become unavailable for that
   *    many rows.
   *
   *    If the end of a row has been reached without finding space for the
   *    tile, spaceTracker's elements are each decremented by 1 to a minimum
   *    of 0. Rows are searched in this fashion until space is found.
   */
  function calculateGridFor(colCount, tileSpans) {
    var curCol = 0,
        curRow = 0,
        spaceTracker = newSpaceTracker();

    return {
      positioning: tileSpans.map(function(spans, i) {
        return {
          spans: spans,
          position: reserveSpace(spans, i)
        };
      }),
      rowCount: curRow + Math.max.apply(Math, spaceTracker)
    };

    function reserveSpace(spans, i) {
      if (spans.col > colCount) {
        throw 'md-grid-list: Tile at position ' + i + ' has a colspan ' +
            '(' + spans.col + ') that exceeds the column count ' +
            '(' + colCount + ')';
      }

      var start = 0,
          end = 0;

      // TODO(shyndman): This loop isn't strictly necessary if you can
      // determine the minimum number of rows before a space opens up. To do
      // this, recognize that you've iterated across an entire row looking for
      // space, and if so fast-forward by the minimum rowSpan count. Repeat
      // until the required space opens up.
      while (end - start < spans.col) {
        if (curCol >= colCount) {
          nextRow();
          continue;
        }

        start = spaceTracker.indexOf(0, curCol);
        if (start === -1 || (end = findEnd(start + 1)) === -1) {
          start = end = 0;
          nextRow();
          continue;
        }

        curCol = end + 1;
      }

      adjustRow(start, spans.col, spans.row);
      curCol = start + spans.col;

      return {
        col: start,
        row: curRow
      };
    }

    function nextRow() {
      curCol = 0;
      curRow++;
      adjustRow(0, colCount, -1); // Decrement row spans by one
    }

    function adjustRow(from, cols, by) {
      for (var i = from; i < from + cols; i++) {
        spaceTracker[i] = Math.max(spaceTracker[i] + by, 0);
      }
    }

    function findEnd(start) {
      var i;
      for (i = start; i < spaceTracker.length; i++) {
        if (spaceTracker[i] !== 0) {
          return i;
        }
      }

      if (i === spaceTracker.length) {
        return i;
      }
    }

    function newSpaceTracker() {
      var tracker = [];
      for (var i = 0; i < colCount; i++) {
        tracker.push(0);
      }
      return tracker;
    }
  }
}
GridLayoutFactory.$inject = ["$mdUtil"];

/**
 * @ngdoc directive
 * @name mdGridTile
 * @module material.components.gridList
 * @restrict E
 * @description
 * Tiles contain the content of an `md-grid-list`. They span one or more grid
 * cells vertically or horizontally, and use `md-grid-tile-{footer,header}` to
 * display secondary content.
 *
 * ### Responsive Attributes
 *
 * The `md-grid-tile` directive supports "responsive" attributes, which allow
 * different `md-rowspan` and `md-colspan` values depending on the currently
 * matching media query.
 *
 * In order to set a responsive attribute, first define the fallback value with
 * the standard attribute name, then add additional attributes with the
 * following convention: `{base-attribute-name}-{media-query-name}="{value}"`
 * (ie. `md-colspan-sm="4"`)
 *
 * @param {number=} md-colspan The number of columns to span (default 1). Cannot
 *    exceed the number of columns in the grid. Supports interpolation.
 * @param {number=} md-rowspan The number of rows to span (default 1). Supports
 *     interpolation.
 *
 * @usage
 * With header:
 * <hljs lang="html">
 * <md-grid-tile>
 *   <md-grid-tile-header>
 *     <h3>This is a header</h3>
 *   </md-grid-tile-header>
 * </md-grid-tile>
 * </hljs>
 *
 * With footer:
 * <hljs lang="html">
 * <md-grid-tile>
 *   <md-grid-tile-footer>
 *     <h3>This is a footer</h3>
 *   </md-grid-tile-footer>
 * </md-grid-tile>
 * </hljs>
 *
 * Spanning multiple rows/columns:
 * <hljs lang="html">
 * <md-grid-tile md-colspan="2" md-rowspan="3">
 * </md-grid-tile>
 * </hljs>
 *
 * Responsive attributes:
 * <hljs lang="html">
 * <md-grid-tile md-colspan="1" md-colspan-sm="3" md-colspan-md="5">
 * </md-grid-tile>
 * </hljs>
 */
function GridTileDirective($mdMedia) {
  return {
    restrict: 'E',
    require: '^mdGridList',
    template: '<figure ng-transclude></figure>',
    transclude: true,
    scope: {},
    // Simple controller that exposes attributes to the grid directive
    controller: ["$attrs", function($attrs) {
      this.$attrs = $attrs;
    }],
    link: postLink
  };

  function postLink(scope, element, attrs, gridCtrl) {
    // Apply semantics
    element.attr('role', 'listitem');

    // If our colspan or rowspan changes, trigger a layout
    var unwatchAttrs = $mdMedia.watchResponsiveAttributes(['md-colspan', 'md-rowspan'],
        attrs, angular.bind(gridCtrl, gridCtrl.invalidateLayout));

    // Tile registration/deregistration
    gridCtrl.invalidateTiles();
    scope.$on('$destroy', function() {
      // Mark the tile as destroyed so it is no longer considered in layout,
      // even if the DOM element sticks around (like during a leave animation)
      element[0].$$mdDestroyed = true;
      unwatchAttrs();
      gridCtrl.invalidateLayout();
    });

    if (angular.isDefined(scope.$parent.$index)) {
      scope.$watch(function() { return scope.$parent.$index; },
        function indexChanged(newIdx, oldIdx) {
          if (newIdx === oldIdx) {
            return;
          }
          gridCtrl.invalidateTiles();
        });
    }
  }
}
GridTileDirective.$inject = ["$mdMedia"];


function GridTileCaptionDirective() {
  return {
    template: '<figcaption ng-transclude></figcaption>',
    transclude: true
  };
}

})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.navBar
 */


angular.module('material.components.navBar', ['material.core'])
    .controller('MdNavBarController', MdNavBarController)
    .directive('mdNavBar', MdNavBar)
    .controller('MdNavItemController', MdNavItemController)
    .directive('mdNavItem', MdNavItem);


/*****************************************************************************
 *                            PUBLIC DOCUMENTATION                           *
 *****************************************************************************/
/**
 * @ngdoc directive
 * @name mdNavBar
 * @module material.components.navBar
 *
 * @restrict E
 *
 * @description
 * The `<md-nav-bar>` directive renders a list of material tabs that can be used
 * for top-level page navigation. Unlike `<md-tabs>`, it has no concept of a tab
 * body and no bar pagination.
 *
 * Because it deals with page navigation, certain routing concepts are built-in.
 * Route changes via via ng-href, ui-sref, or ng-click events are supported.
 * Alternatively, the user could simply watch currentNavItem for changes.
 *
 * Accessibility functionality is implemented as a site navigator with a
 * listbox, according to
 * https://www.w3.org/TR/wai-aria-practices/#Site_Navigator_Tabbed_Style
 *
 * @param {string=} mdSelectedNavItem The name of the current tab; this must
 * match the name attribute of `<md-nav-item>`
 * @param {string=} navBarAriaLabel An aria-label for the nav-bar
 *
 * @usage
 * <hljs lang="html">
 *  <md-nav-bar md-selected-nav-item="currentNavItem">
 *    <md-nav-item md-nav-click="goto('page1')" name="page1">Page One</md-nav-item>
 *    <md-nav-item md-nav-sref="app.page2" name="page2">Page Two</md-nav-item>
 *    <md-nav-item md-nav-href="#page3" name="page3">Page Three</md-nav-item>
 *  </md-nav-bar>
 *</hljs>
 * <hljs lang="js">
 * (function() {
 *   ‘use strict’;
 *
 *    $rootScope.$on('$routeChangeSuccess', function(event, current) {
 *      $scope.currentLink = getCurrentLinkFromRoute(current);
 *    });
 * });
 * </hljs>
 */

/*****************************************************************************
 *                            mdNavItem
 *****************************************************************************/
/**
 * @ngdoc directive
 * @name mdNavItem
 * @module material.components.navBar
 *
 * @restrict E
 *
 * @description
 * `<md-nav-item>` describes a page navigation link within the `<md-nav-bar>`
 * component. It renders an md-button as the actual link.
 *
 * Exactly one of the mdNavClick, mdNavHref, mdNavSref attributes are required to be
 * specified.
 *
 * @param {Function=} mdNavClick Function which will be called when the
 * link is clicked to change the page. Renders as an `ng-click`.
 * @param {string=} mdNavHref url to transition to when this link is clicked.
 * Renders as an `ng-href`.
 * @param {string=} mdNavSref Ui-router state to transition to when this link is
 * clicked. Renders as a `ui-sref`.
 * @param {string=} name The name of this link. Used by the nav bar to know
 * which link is currently selected.
 *
 * @usage
 * See `<md-nav-bar>` for usage.
 */


/*****************************************************************************
 *                                IMPLEMENTATION                             *
 *****************************************************************************/

function MdNavBar($mdAria) {
  return {
    restrict: 'E',
    transclude: true,
    controller: MdNavBarController,
    controllerAs: 'ctrl',
    bindToController: true,
    scope: {
      'mdSelectedNavItem': '=?',
      'navBarAriaLabel': '@?',
    },
    template:
      '<div class="md-nav-bar">' +
        '<nav role="navigation">' +
          '<ul class="_md-nav-bar-list" layout="row" ng-transclude role="listbox"' +
            'tabindex="0"' +
            'ng-focus="ctrl.onFocus()"' +
            'ng-blur="ctrl.onBlur()"' +
            'ng-keydown="ctrl.onKeydown($event)"' +
            'aria-label="{{ctrl.navBarAriaLabel}}">' +
          '</ul>' +
        '</nav>' +
        '<md-nav-ink-bar></md-nav-ink-bar>' +
      '</div>',
    link: function(scope, element, attrs, ctrl) {
      if (!ctrl.navBarAriaLabel) {
        $mdAria.expectAsync(element, 'aria-label', angular.noop);
      }
    },
  };
}
MdNavBar.$inject = ["$mdAria"];

/**
 * Controller for the nav-bar component.
 *
 * Accessibility functionality is implemented as a site navigator with a
 * listbox, according to
 * https://www.w3.org/TR/wai-aria-practices/#Site_Navigator_Tabbed_Style
 * @param {!angular.JQLite} $element
 * @param {!angular.Scope} $scope
 * @param {!angular.Timeout} $timeout
 * @param {!Object} $mdConstant
 * @constructor
 * @final
 * @ngInject
 */
function MdNavBarController($element, $scope, $timeout, $mdConstant) {
  // Injected variables
  /** @private @const {!angular.Timeout} */
  this._$timeout = $timeout;

  /** @private @const {!angular.Scope} */
  this._$scope = $scope;

  /** @private @const {!Object} */
  this._$mdConstant = $mdConstant;

  // Data-bound variables.
  /** @type {string} */
  this.mdSelectedNavItem;

  /** @type {string} */
  this.navBarAriaLabel;

  // State variables.

  /** @type {?angular.JQLite} */
  this._navBarEl = $element[0];

  /** @type {?angular.JQLite} */
  this._inkbar;

  var self = this;
  // need to wait for transcluded content to be available
  var deregisterTabWatch = this._$scope.$watch(function() {
    return self._navBarEl.querySelectorAll('._md-nav-button').length;
  },
  function(newLength) {
    if (newLength > 0) {
      self._initTabs();
      deregisterTabWatch();
    }
  });
}
MdNavBarController.$inject = ["$element", "$scope", "$timeout", "$mdConstant"];



/**
 * Initializes the tab components once they exist.
 * @private
 */
MdNavBarController.prototype._initTabs = function() {
  this._inkbar = angular.element(this._navBarEl.getElementsByTagName('md-nav-ink-bar')[0]);

  var self = this;
  this._$timeout(function() {
    self._updateTabs(self.mdSelectedNavItem, undefined);
  });

  this._$scope.$watch('ctrl.mdSelectedNavItem', function(newValue, oldValue) {
    // Wait a digest before update tabs for products doing
    // anything dynamic in the template.
    self._$timeout(function() {
      self._updateTabs(newValue, oldValue);
    });
  });
};

/**
 * Set the current tab to be selected.
 * @param {string|undefined} newValue New current tab name.
 * @param {string|undefined} oldValue Previous tab name.
 * @private
 */
MdNavBarController.prototype._updateTabs = function(newValue, oldValue) {
  var self = this;
  var tabs = this._getTabs();
  var oldIndex = -1;
  var newIndex = -1;
  var newTab = this._getTabByName(newValue);
  var oldTab = this._getTabByName(oldValue);

  if (oldTab) {
    oldTab.setSelected(false);
    oldIndex = tabs.indexOf(oldTab);
  }

  if (newTab) {
    newTab.setSelected(true);
    newIndex = tabs.indexOf(newTab);
  }

  this._$timeout(function() {
    self._updateInkBarStyles(newTab, newIndex, oldIndex);
  });
};

/**
 * Repositions the ink bar to the selected tab.
 * @private
 */
MdNavBarController.prototype._updateInkBarStyles = function(tab, newIndex, oldIndex) {
  this._inkbar.toggleClass('_md-left', newIndex < oldIndex)
      .toggleClass('_md-right', newIndex > oldIndex);

  this._inkbar.css({display: newIndex < 0 ? 'none' : ''});

  if(tab){
    var tabEl = tab.getButtonEl();
    var left = tabEl.offsetLeft;

    this._inkbar.css({left: left + 'px', width: tabEl.offsetWidth + 'px'});
  }
};

/**
 * Returns an array of the current tabs.
 * @return {!Array<!NavItemController>}
 * @private
 */
MdNavBarController.prototype._getTabs = function() {
  var linkArray = Array.prototype.slice.call(
      this._navBarEl.querySelectorAll('.md-nav-item'));
  return linkArray.map(function(el) {
    return angular.element(el).controller('mdNavItem')
  });
};

/**
 * Returns the tab with the specified name.
 * @param {string} name The name of the tab, found in its name attribute.
 * @return {!NavItemController|undefined}
 * @private
 */
MdNavBarController.prototype._getTabByName = function(name) {
  return this._findTab(function(tab) {
    return tab.getName() == name;
  });
};

/**
 * Returns the selected tab.
 * @return {!NavItemController|undefined}
 * @private
 */
MdNavBarController.prototype._getSelectedTab = function() {
  return this._findTab(function(tab) {
    return tab.isSelected()
  });
};

/**
 * Returns the focused tab.
 * @return {!NavItemController|undefined}
 */
MdNavBarController.prototype.getFocusedTab = function() {
  return this._findTab(function(tab) {
    return tab.hasFocus()
  });
};

/**
 * Find a tab that matches the specified function.
 * @private
 */
MdNavBarController.prototype._findTab = function(fn) {
  var tabs = this._getTabs();
  for (var i = 0; i < tabs.length; i++) {
    if (fn(tabs[i])) {
      return tabs[i];
    }
  }

  return null;
};

/**
 * Direct focus to the selected tab when focus enters the nav bar.
 */
MdNavBarController.prototype.onFocus = function() {
  var tab = this._getSelectedTab();
  if (tab) {
    tab.setFocused(true);
  }
};

/**
 * Clear tab focus when focus leaves the nav bar.
 */
MdNavBarController.prototype.onBlur = function() {
  var tab = this.getFocusedTab();
  if (tab) {
    tab.setFocused(false);
  }
};

/**
 * Move focus from oldTab to newTab.
 * @param {!NavItemController} oldTab
 * @param {!NavItemController} newTab
 * @private
 */
MdNavBarController.prototype._moveFocus = function(oldTab, newTab) {
  oldTab.setFocused(false);
  newTab.setFocused(true);
};

/**
 * Responds to keypress events.
 * @param {!Event} e
 */
MdNavBarController.prototype.onKeydown = function(e) {
  var keyCodes = this._$mdConstant.KEY_CODE;
  var tabs = this._getTabs();
  var focusedTab = this.getFocusedTab();
  if (!focusedTab) return;

  var focusedTabIndex = tabs.indexOf(focusedTab);

  // use arrow keys to navigate between tabs
  switch (e.keyCode) {
    case keyCodes.UP_ARROW:
    case keyCodes.LEFT_ARROW:
      if (focusedTabIndex > 0) {
        this._moveFocus(focusedTab, tabs[focusedTabIndex - 1]);
      }
      break;
    case keyCodes.DOWN_ARROW:
    case keyCodes.RIGHT_ARROW:
      if (focusedTabIndex < tabs.length - 1) {
        this._moveFocus(focusedTab, tabs[focusedTabIndex + 1]);
      }
      break;
    case keyCodes.SPACE:
    case keyCodes.ENTER:
      // timeout to avoid a "digest already in progress" console error
      this._$timeout(function() {
        focusedTab.getButtonEl().click();
      });
      break;
  }
};

/**
 * @ngInject
 */
function MdNavItem($$rAF) {
  return {
    restrict: 'E',
    require: ['mdNavItem', '^mdNavBar'],
    controller: MdNavItemController,
    bindToController: true,
    controllerAs: 'ctrl',
    replace: true,
    transclude: true,
    template:
      '<li class="md-nav-item" role="option" aria-selected="{{ctrl.isSelected()}}">' +
        '<md-button ng-if="ctrl.mdNavSref" class="_md-nav-button md-accent"' +
          'ng-class="ctrl.getNgClassMap()"' +
          'tabindex="-1"' +
          'ui-sref="{{ctrl.mdNavSref}}">' +
          '<span ng-transclude class="_md-nav-button-text"></span>' +
        '</md-button>' +
        '<md-button ng-if="ctrl.mdNavHref" class="_md-nav-button md-accent"' +
          'ng-class="ctrl.getNgClassMap()"' +
          'tabindex="-1"' +
          'ng-href="{{ctrl.mdNavHref}}">' +
          '<span ng-transclude class="_md-nav-button-text"></span>' +
        '</md-button>' +
        '<md-button ng-if="ctrl.mdNavClick" class="_md-nav-button md-accent"' +
          'ng-class="ctrl.getNgClassMap()"' +
          'tabindex="-1"' +
          'ng-click="ctrl.mdNavClick()">' +
          '<span ng-transclude class="_md-nav-button-text"></span>' +
        '</md-button>' +
      '</li>',
    scope: {
      'mdNavClick': '&?',
      'mdNavHref': '@?',
      'mdNavSref': '@?',
      'name': '@',
    },
    link: function(scope, element, attrs, controllers) {
      var mdNavItem = controllers[0];
      var mdNavBar = controllers[1];

      // When accessing the element's contents synchronously, they
      // may not be defined yet because of transclusion. There is a higher chance
      // that it will be accessible if we wait one frame.
      $$rAF(function() {
        if (!mdNavItem.name) {
          mdNavItem.name = angular.element(element[0].querySelector('._md-nav-button-text'))
            .text().trim();
        }

        var navButton = angular.element(element[0].querySelector('._md-nav-button'));
        navButton.on('click', function() {
          mdNavBar.mdSelectedNavItem = mdNavItem.name;
          scope.$apply();
        });
      });
    }
  };
}
MdNavItem.$inject = ["$$rAF"];

/**
 * Controller for the nav-item component.
 * @param {!angular.JQLite} $element
 * @constructor
 * @final
 * @ngInject
 */
function MdNavItemController($element) {

  /** @private @const {!angular.JQLite} */
  this._$element = $element;

  // Data-bound variables
  /** @const {?Function} */
  this.mdNavClick;
  /** @const {?string} */
  this.mdNavHref;
  /** @const {?string} */
  this.name;

  // State variables
  /** @private {boolean} */
  this._selected = false;

  /** @private {boolean} */
  this._focused = false;

  var hasNavClick = !!($element.attr('md-nav-click'));
  var hasNavHref = !!($element.attr('md-nav-href'));
  var hasNavSref = !!($element.attr('md-nav-sref'));

  // Cannot specify more than one nav attribute
  if ((hasNavClick ? 1:0) + (hasNavHref ? 1:0) + (hasNavSref ? 1:0) > 1) {
    throw Error(
        'Must specify exactly one of md-nav-click, md-nav-href, ' +
        'md-nav-sref for nav-item directive');
  }
}
MdNavItemController.$inject = ["$element"];

/**
 * Returns a map of class names and values for use by ng-class.
 * @return {!Object<string,boolean>}
 */
MdNavItemController.prototype.getNgClassMap = function() {
  return {
    'md-active': this._selected,
    'md-primary': this._selected,
    'md-unselected': !this._selected,
    'md-focused': this._focused,
  };
};

/**
 * Get the name attribute of the tab.
 * @return {string}
 */
MdNavItemController.prototype.getName = function() {
  return this.name;
};

/**
 * Get the button element associated with the tab.
 * @return {!Element}
 */
MdNavItemController.prototype.getButtonEl = function() {
  return this._$element[0].querySelector('._md-nav-button');
};

/**
 * Set the selected state of the tab.
 * @param {boolean} isSelected
 */
MdNavItemController.prototype.setSelected = function(isSelected) {
  this._selected = isSelected;
};

/**
 * @return {boolean}
 */
MdNavItemController.prototype.isSelected = function() {
  return this._selected;
};

/**
 * Set the focused state of the tab.
 * @param {boolean} isFocused
 */
MdNavItemController.prototype.setFocused = function(isFocused) {
  this._focused = isFocused;
};

/**
 * @return {boolean}
 */
MdNavItemController.prototype.hasFocus = function() {
  return this._focused;
};

})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.progressLinear
 * @description Linear Progress module!
 */
angular.module('material.components.progressLinear', [
  'material.core'
])
  .directive('mdProgressLinear', MdProgressLinearDirective);

/**
 * @ngdoc directive
 * @name mdProgressLinear
 * @module material.components.progressLinear
 * @restrict E
 *
 * @description
 * The linear progress directive is used to make loading content
 * in your app as delightful and painless as possible by minimizing
 * the amount of visual change a user sees before they can view
 * and interact with content.
 *
 * Each operation should only be represented by one activity indicator
 * For example: one refresh operation should not display both a
 * refresh bar and an activity circle.
 *
 * For operations where the percentage of the operation completed
 * can be determined, use a determinate indicator. They give users
 * a quick sense of how long an operation will take.
 *
 * For operations where the user is asked to wait a moment while
 * something finishes up, and it’s not necessary to expose what's
 * happening behind the scenes and how long it will take, use an
 * indeterminate indicator.
 *
 * @param {string} md-mode Select from one of four modes: determinate, indeterminate, buffer or query.
 *
 * Note: if the `md-mode` value is set as undefined or specified as 1 of the four (4) valid modes, then `indeterminate`
 * will be auto-applied as the mode.
 *
 * Note: if not configured, the `md-mode="indeterminate"` will be auto injected as an attribute. If `value=""` is also specified, however,
 * then `md-mode="determinate"` would be auto-injected instead.
 * @param {number=} value In determinate and buffer modes, this number represents the percentage of the primary progress bar. Default: 0
 * @param {number=} md-buffer-value In the buffer mode, this number represents the percentage of the secondary progress bar. Default: 0
 * @param {boolean=} ng-disabled Determines whether to disable the progress element.
 *
 * @usage
 * <hljs lang="html">
 * <md-progress-linear md-mode="determinate" value="..."></md-progress-linear>
 *
 * <md-progress-linear md-mode="determinate" ng-value="..."></md-progress-linear>
 *
 * <md-progress-linear md-mode="indeterminate"></md-progress-linear>
 *
 * <md-progress-linear md-mode="buffer" value="..." md-buffer-value="..."></md-progress-linear>
 *
 * <md-progress-linear md-mode="query"></md-progress-linear>
 * </hljs>
 */
function MdProgressLinearDirective($mdTheming, $mdUtil, $log) {
  var MODE_DETERMINATE = "determinate";
  var MODE_INDETERMINATE = "indeterminate";
  var MODE_BUFFER = "buffer";
  var MODE_QUERY = "query";
  var DISABLED_CLASS = "_md-progress-linear-disabled";

  return {
    restrict: 'E',
    template: '<div class="_md-container">' +
      '<div class="_md-dashed"></div>' +
      '<div class="_md-bar _md-bar1"></div>' +
      '<div class="_md-bar _md-bar2"></div>' +
      '</div>',
    compile: compile
  };

  function compile(tElement, tAttrs, transclude) {
    tElement.attr('aria-valuemin', 0);
    tElement.attr('aria-valuemax', 100);
    tElement.attr('role', 'progressbar');

    return postLink;
  }
  function postLink(scope, element, attr) {
    $mdTheming(element);

    var lastMode;
    var isDisabled = attr.hasOwnProperty('disabled');
    var toVendorCSS = $mdUtil.dom.animator.toCss;
    var bar1 = angular.element(element[0].querySelector('._md-bar1'));
    var bar2 = angular.element(element[0].querySelector('._md-bar2'));
    var container = angular.element(element[0].querySelector('._md-container'));

    element
      .attr('md-mode', mode())
      .toggleClass(DISABLED_CLASS, isDisabled);

    validateMode();
    watchAttributes();

    /**
     * Watch the value, md-buffer-value, and md-mode attributes
     */
    function watchAttributes() {
      attr.$observe('value', function(value) {
        var percentValue = clamp(value);
        element.attr('aria-valuenow', percentValue);

        if (mode() != MODE_QUERY) animateIndicator(bar2, percentValue);
      });

      attr.$observe('mdBufferValue', function(value) {
        animateIndicator(bar1, clamp(value));
      });

      attr.$observe('disabled', function(value) {
        if (value === true || value === false) {
          isDisabled = !!value;
        } else {
          isDisabled = angular.isDefined(value);
        }

        element.toggleClass(DISABLED_CLASS, isDisabled);
        container.toggleClass(lastMode, !isDisabled);
      });

      attr.$observe('mdMode', function(mode) {
        if (lastMode) container.removeClass( lastMode );

        switch( mode ) {
          case MODE_QUERY:
          case MODE_BUFFER:
          case MODE_DETERMINATE:
          case MODE_INDETERMINATE:
            container.addClass( lastMode = "_md-mode-" + mode );
            break;
          default:
            container.addClass( lastMode = "_md-mode-" + MODE_INDETERMINATE );
            break;
        }
      });
    }

    /**
     * Auto-defaults the mode to either `determinate` or `indeterminate` mode; if not specified
     */
    function validateMode() {
      if ( angular.isUndefined(attr.mdMode) ) {
        var hasValue = angular.isDefined(attr.value);
        var mode = hasValue ? MODE_DETERMINATE : MODE_INDETERMINATE;
        var info = "Auto-adding the missing md-mode='{0}' to the ProgressLinear element";

        //$log.debug( $mdUtil.supplant(info, [mode]) );

        element.attr("md-mode", mode);
        attr.mdMode = mode;
      }
    }

    /**
     * Is the md-mode a valid option?
     */
    function mode() {
      var value = (attr.mdMode || "").trim();
      if ( value ) {
        switch(value) {
          case MODE_DETERMINATE:
          case MODE_INDETERMINATE:
          case MODE_BUFFER:
          case MODE_QUERY:
            break;
          default:
            value = MODE_INDETERMINATE;
            break;
        }
      }
      return value;
    }

    /**
     * Manually set CSS to animate the Determinate indicator based on the specified
     * percentage value (0-100).
     */
    function animateIndicator(target, value) {
      if ( isDisabled || !mode() ) return;

      var to = $mdUtil.supplant("translateX({0}%) scale({1},1)", [ (value-100)/2, value/100 ]);
      var styles = toVendorCSS({ transform : to });
      angular.element(target).css( styles );
    }
  }

  /**
   * Clamps the value to be between 0 and 100.
   * @param {number} value The value to clamp.
   * @returns {number}
   */
  function clamp(value) {
    return Math.max(0, Math.min(value || 0, 100));
  }
}
MdProgressLinearDirective.$inject = ["$mdTheming", "$mdUtil", "$log"];


})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.sidenav
 *
 * @description
 * A Sidenav QP component.
 */
angular
  .module('material.components.sidenav', [
    'material.core',
    'material.components.backdrop'
  ])
  .factory('$mdSidenav', SidenavService )
  .directive('mdSidenav', SidenavDirective)
  .directive('mdSidenavFocus', SidenavFocusDirective)
  .controller('$mdSidenavController', SidenavController);


/**
 * @ngdoc service
 * @name $mdSidenav
 * @module material.components.sidenav
 *
 * @description
 * `$mdSidenav` makes it easy to interact with multiple sidenavs
 * in an app. When looking up a sidenav instance, you can either look
 * it up synchronously or wait for it to be initializied asynchronously.
 * This is done by passing the second argument to `$mdSidenav`.
 *
 * @usage
 * <hljs lang="js">
 * // Async lookup for sidenav instance; will resolve when the instance is available
 * $mdSidenav(componentId, true).then(function(instance) {
 *   $log.debug( componentId + "is now ready" );
 * });
 * // Sync lookup for sidenav instance; this will resolve immediately.
 * $mdSidenav(componentId).then(function(instance) {
 *   $log.debug( componentId + "is now ready" );
 * });
 * // Async toggle the given sidenav;
 * // when instance is known ready and lazy lookup is not needed.
 * $mdSidenav(componentId)
 *    .toggle()
 *    .then(function(){
 *      $log.debug('toggled');
 *    });
 * // Async open the given sidenav
 * $mdSidenav(componentId)
 *    .open()
 *    .then(function(){
 *      $log.debug('opened');
 *    });
 * // Async close the given sidenav
 * $mdSidenav(componentId)
 *    .close()
 *    .then(function(){
 *      $log.debug('closed');
 *    });
 * // Sync check to see if the specified sidenav is set to be open
 * $mdSidenav(componentId).isOpen();
 * // Sync check to whether given sidenav is locked open
 * // If this is true, the sidenav will be open regardless of close()
 * $mdSidenav(componentId).isLockedOpen();
 * // On close callback to handle close, backdrop click or escape key pressed
 * // Callback happens BEFORE the close action occurs.
 * $mdSidenav(componentId).onClose(function () {
 *   $log.debug('closing');
 * });
 * </hljs>
 */
function SidenavService($mdComponentRegistry, $mdUtil, $q, $log) {
  var errorMsg = "SideNav '{0}' is not available! Did you use md-component-id='{0}'?";
  var service = {
        find    : findInstance,     //  sync  - returns proxy API
        waitFor : waitForInstance   //  async - returns promise
      };

  /**
   * Service API that supports three (3) usages:
   *   $mdSidenav().find("left")                       // sync (must already exist) or returns undefined
   *   $mdSidenav("left").toggle();                    // sync (must already exist) or returns reject promise;
   *   $mdSidenav("left",true).then( function(left){   // async returns instance when available
   *    left.toggle();
   *   });
   */
  return function(handle, enableWait) {
    if ( angular.isUndefined(handle) ) return service;

    var shouldWait = enableWait === true;
    var instance = service.find(handle, shouldWait);
    return  !instance && shouldWait ? service.waitFor(handle) :
            !instance && angular.isUndefined(enableWait) ? addLegacyAPI(service, handle) : instance;
  };

  /**
   * For failed instance/handle lookups, older-clients expect an response object with noops
   * that include `rejected promise APIs`
   */
  function addLegacyAPI(service, handle) {
      var falseFn  = function() { return false; };
      var rejectFn = function() {
            return $q.when($mdUtil.supplant(errorMsg, [handle || ""]));
          };

      return angular.extend({
        isLockedOpen : falseFn,
        isOpen       : falseFn,
        toggle       : rejectFn,
        open         : rejectFn,
        close        : rejectFn,
        onClose      : angular.noop,
        then : function(callback) {
          return waitForInstance(handle)
            .then(callback || angular.noop);
        }
       }, service);
    }
    /**
     * Synchronously lookup the controller instance for the specified sidNav instance which has been
     * registered with the markup `md-component-id`
     */
    function findInstance(handle, shouldWait) {
      var instance = $mdComponentRegistry.get(handle);

      if (!instance && !shouldWait) {

        // Report missing instance
        $log.error( $mdUtil.supplant(errorMsg, [handle || ""]) );

        // The component has not registered itself... most like NOT yet created
        // return null to indicate that the Sidenav is not in the DOM
        return undefined;
      }
      return instance;
    }

    /**
     * Asynchronously wait for the component instantiation,
     * Deferred lookup of component instance using $component registry
     */
    function waitForInstance(handle) {
      return $mdComponentRegistry.when(handle).catch($log.error);
    }
}
SidenavService.$inject = ["$mdComponentRegistry", "$mdUtil", "$q", "$log"];
/**
 * @ngdoc directive
 * @name mdSidenavFocus
 * @module material.components.sidenav
 *
 * @restrict A
 *
 * @description
 * `mdSidenavFocus` provides a way to specify the focused element when a sidenav opens.
 * This is completely optional, as the sidenav itself is focused by default.
 *
 * @usage
 * <hljs lang="html">
 * <md-sidenav>
 *   <form>
 *     <md-input-container>
 *       <label for="testInput">Label</label>
 *       <input id="testInput" type="text" md-sidenav-focus>
 *     </md-input-container>
 *   </form>
 * </md-sidenav>
 * </hljs>
 **/
function SidenavFocusDirective() {
  return {
    restrict: 'A',
    require: '^mdSidenav',
    link: function(scope, element, attr, sidenavCtrl) {
      // @see $mdUtil.findFocusTarget(...)
    }
  };
}
/**
 * @ngdoc directive
 * @name mdSidenav
 * @module material.components.sidenav
 * @restrict E
 *
 * @description
 *
 * A Sidenav component that can be opened and closed programatically.
 *
 * By default, upon opening it will slide out on top of the main content area.
 *
 * For keyboard and screen reader accessibility, focus is sent to the sidenav wrapper by default.
 * It can be overridden with the `md-autofocus` directive on the child element you want focused.
 *
 * @usage
 * <hljs lang="html">
 * <div layout="row" ng-controller="MyController">
 *   <md-sidenav md-component-id="left" class="md-sidenav-left">
 *     Left Nav!
 *   </md-sidenav>
 *
 *   <md-content>
 *     Center Content
 *     <md-button ng-click="openLeftMenu()">
 *       Open Left Menu
 *     </md-button>
 *   </md-content>
 *
 *   <md-sidenav md-component-id="right"
 *     md-is-locked-open="$mdMedia('min-width: 333px')"
 *     class="md-sidenav-right">
 *     <form>
 *       <md-input-container>
 *         <label for="testInput">Test input</label>
 *         <input id="testInput" type="text"
 *                ng-model="data" md-autofocus>
 *       </md-input-container>
 *     </form>
 *   </md-sidenav>
 * </div>
 * </hljs>
 *
 * <hljs lang="js">
 * var app = angular.module('myApp', ['ngMaterial']);
 * app.controller('MyController', function($scope, $mdSidenav) {
 *   $scope.openLeftMenu = function() {
 *     $mdSidenav('left').toggle();
 *   };
 * });
 * </hljs>
 *
 * @param {expression=} md-is-open A model bound to whether the sidenav is opened.
 * @param {boolean=} md-disable-backdrop When present in the markup, the sidenav will not show a backdrop.
 * @param {string=} md-component-id componentId to use with $mdSidenav service.
 * @param {expression=} md-is-locked-open When this expression evaluates to true,
 * the sidenav 'locks open': it falls into the content's flow instead
 * of appearing over it. This overrides the `md-is-open` attribute.
 *
* The $mdMedia() service is exposed to the is-locked-open attribute, which
 * can be given a media query or one of the `sm`, `gt-sm`, `md`, `gt-md`, `lg` or `gt-lg` presets.
 * Examples:
 *
 *   - `<md-sidenav md-is-locked-open="shouldLockOpen"></md-sidenav>`
 *   - `<md-sidenav md-is-locked-open="$mdMedia('min-width: 1000px')"></md-sidenav>`
 *   - `<md-sidenav md-is-locked-open="$mdMedia('sm')"></md-sidenav>` (locks open on small screens)
 */
function SidenavDirective($mdMedia, $mdUtil, $mdConstant, $mdTheming, $animate, $compile, $parse, $log, $q, $document) {
  return {
    restrict: 'E',
    scope: {
      isOpen: '=?mdIsOpen'
    },
    controller: '$mdSidenavController',
    compile: function(element) {
      element.addClass('_md-closed');
      element.attr('tabIndex', '-1');
      return postLink;
    }
  };

  /**
   * Directive Post Link function...
   */
  function postLink(scope, element, attr, sidenavCtrl) {
    var lastParentOverFlow;
    var backdrop;
    var triggeringElement = null;
    var previousContainerStyles;
    var promise = $q.when(true);
    var isLockedOpenParsed = $parse(attr.mdIsLockedOpen);
    var isLocked = function() {
      return isLockedOpenParsed(scope.$parent, {
        $media: function(arg) {
          $log.warn("$media is deprecated for is-locked-open. Use $mdMedia instead.");
          return $mdMedia(arg);
        },
        $mdMedia: $mdMedia
      });
    };

    // Only create the backdrop if the backdrop isn't disabled.
    if (!angular.isDefined(attr.mdDisableBackdrop)) {
      backdrop = $mdUtil.createBackdrop(scope, "_md-sidenav-backdrop md-opaque ng-enter");
    }

    element.addClass('_md');     // private md component indicator for styling
    $mdTheming(element);

    // The backdrop should inherit the sidenavs theme,
    // because the backdrop will take its parent theme by default.
    if ( backdrop ) $mdTheming.inherit(backdrop, element);

    element.on('$destroy', function() {
      backdrop && backdrop.remove();
      sidenavCtrl.destroy();
    });

    scope.$on('$destroy', function(){
      backdrop && backdrop.remove();
    });

    scope.$watch(isLocked, updateIsLocked);
    scope.$watch('isOpen', updateIsOpen);


    // Publish special accessor for the Controller instance
    sidenavCtrl.$toggleOpen = toggleOpen;

    /**
     * Toggle the DOM classes to indicate `locked`
     * @param isLocked
     */
    function updateIsLocked(isLocked, oldValue) {
      scope.isLockedOpen = isLocked;
      if (isLocked === oldValue) {
        element.toggleClass('_md-locked-open', !!isLocked);
      } else {
        $animate[isLocked ? 'addClass' : 'removeClass'](element, '_md-locked-open');
      }
      if (backdrop) {
        backdrop.toggleClass('_md-locked-open', !!isLocked);
      }
    }

    /**
     * Toggle the SideNav view and attach/detach listeners
     * @param isOpen
     */
    function updateIsOpen(isOpen) {
      // Support deprecated md-sidenav-focus attribute as fallback
      var focusEl = $mdUtil.findFocusTarget(element) || $mdUtil.findFocusTarget(element,'[md-sidenav-focus]') || element;
      var parent = element.parent();

      parent[isOpen ? 'on' : 'off']('keydown', onKeyDown);
      if (backdrop) backdrop[isOpen ? 'on' : 'off']('click', close);

      var restorePositioning = updateContainerPositions(parent, isOpen);

      if ( isOpen ) {
        // Capture upon opening..
        triggeringElement = $document[0].activeElement;
      }

      disableParentScroll(isOpen);

      return promise = $q.all([
        isOpen && backdrop ? $animate.enter(backdrop, parent) : backdrop ?
                             $animate.leave(backdrop) : $q.when(true),
        $animate[isOpen ? 'removeClass' : 'addClass'](element, '_md-closed')
      ]).then(function() {
        // Perform focus when animations are ALL done...
        if (scope.isOpen) {
          focusEl && focusEl.focus();
        }

        // Restores the positioning on the sidenav and backdrop.
        restorePositioning && restorePositioning();
      });
    }

    function updateContainerPositions(parent, willOpen) {
      var drawerEl = element[0];
      var scrollTop = parent[0].scrollTop;

      if (willOpen && scrollTop) {
        previousContainerStyles = {
          top: drawerEl.style.top,
          bottom: drawerEl.style.bottom,
          height: drawerEl.style.height
        };

        // When the parent is scrolled down, then we want to be able to show the sidenav at the current scroll
        // position. We're moving the sidenav down to the correct scroll position and apply the height of the
        // parent, to increase the performance. Using 100% as height, will impact the performance heavily.
        var positionStyle = {
          top: scrollTop + 'px',
          bottom: 'initial',
          height: parent[0].clientHeight + 'px'
        };

        // Apply the new position styles to the sidenav and backdrop.
        element.css(positionStyle);
        backdrop.css(positionStyle);
      }

      // When the sidenav is closing and we have previous defined container styles,
      // then we return a restore function, which resets the sidenav and backdrop.
      if (!willOpen && previousContainerStyles) {
        return function() {
          drawerEl.style.top = previousContainerStyles.top;
          drawerEl.style.bottom = previousContainerStyles.bottom;
          drawerEl.style.height = previousContainerStyles.height;

          backdrop[0].style.top = null;
          backdrop[0].style.bottom = null;
          backdrop[0].style.height = null;

          previousContainerStyles = null;
        }
      }
    }

    /**
     * Prevent parent scrolling (when the SideNav is open)
     */
    function disableParentScroll(disabled) {
      var parent = element.parent();
      if ( disabled && !lastParentOverFlow ) {

        lastParentOverFlow = parent.css('overflow');
        parent.css('overflow', 'hidden');

      } else if (angular.isDefined(lastParentOverFlow)) {

        parent.css('overflow', lastParentOverFlow);
        lastParentOverFlow = undefined;

      }
    }

    /**
     * Toggle the sideNav view and publish a promise to be resolved when
     * the view animation finishes.
     *
     * @param isOpen
     * @returns {*}
     */
    function toggleOpen( isOpen ) {
      if (scope.isOpen == isOpen ) {

        return $q.when(true);

      } else {
        if (scope.isOpen && sidenavCtrl.onCloseCb) sidenavCtrl.onCloseCb();

        return $q(function(resolve){
          // Toggle value to force an async `updateIsOpen()` to run
          scope.isOpen = isOpen;

          $mdUtil.nextTick(function() {
            // When the current `updateIsOpen()` animation finishes
            promise.then(function(result) {

              if ( !scope.isOpen ) {
                // reset focus to originating element (if available) upon close
                triggeringElement && triggeringElement.focus();
                triggeringElement = null;
              }

              resolve(result);
            });
          });

        });

      }
    }

    /**
     * Auto-close sideNav when the `escape` key is pressed.
     * @param evt
     */
    function onKeyDown(ev) {
      var isEscape = (ev.keyCode === $mdConstant.KEY_CODE.ESCAPE);
      return isEscape ? close(ev) : $q.when(true);
    }

    /**
     * With backdrop `clicks` or `escape` key-press, immediately
     * apply the CSS close transition... Then notify the controller
     * to close() and perform its own actions.
     */
    function close(ev) {
      ev.preventDefault();

      return sidenavCtrl.close();
    }

  }
}
SidenavDirective.$inject = ["$mdMedia", "$mdUtil", "$mdConstant", "$mdTheming", "$animate", "$compile", "$parse", "$log", "$q", "$document"];

/*
 * @private
 * @ngdoc controller
 * @name SidenavController
 * @module material.components.sidenav
 *
 */
function SidenavController($scope, $element, $attrs, $mdComponentRegistry, $q) {

  var self = this;

  // Use Default internal method until overridden by directive postLink

  // Synchronous getters
  self.isOpen = function() { return !!$scope.isOpen; };
  self.isLockedOpen = function() { return !!$scope.isLockedOpen; };

  // Synchronous setters
  self.onClose = function (callback) {
    self.onCloseCb = callback;
    return self;
  };

  // Async actions
  self.open   = function() { return self.$toggleOpen( true );  };
  self.close  = function() { return self.$toggleOpen( false ); };
  self.toggle = function() { return self.$toggleOpen( !$scope.isOpen );  };
  self.$toggleOpen = function(value) { return $q.when($scope.isOpen = value); };

  self.destroy = $mdComponentRegistry.register(self, $attrs.mdComponentId);
}
SidenavController.$inject = ["$scope", "$element", "$attrs", "$mdComponentRegistry", "$q"];

})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.tooltip
 */
angular
    .module('material.components.tooltip', [ 'material.core' ])
    .directive('mdTooltip', MdTooltipDirective);

/**
 * @ngdoc directive
 * @name mdTooltip
 * @module material.components.tooltip
 * @description
 * Tooltips are used to describe elements that are interactive and primarily graphical (not textual).
 *
 * Place a `<md-tooltip>` as a child of the element it describes.
 *
 * A tooltip will activate when the user focuses, hovers over, or touches the parent.
 *
 * @usage
 * <hljs lang="html">
 * <md-button class="md-fab md-accent" aria-label="Play">
 *   <md-tooltip>
 *     Play Music
 *   </md-tooltip>
 *   <md-icon icon="img/icons/ic_play_arrow_24px.svg"></md-icon>
 * </md-button>
 * </hljs>
 *
 * @param {expression=} md-visible Boolean bound to whether the tooltip is currently visible.
 * @param {number=} md-delay How many milliseconds to wait to show the tooltip after the user focuses, hovers, or touches the
 * parent. Defaults to 0ms on non-touch devices and 75ms on touch.
 * @param {boolean=} md-autohide If present or provided with a boolean value, the tooltip will hide on mouse leave, regardless of focus
 * @param {string=} md-direction Which direction would you like the tooltip to go?  Supports left, right, top, and bottom.  Defaults to bottom.
 */
function MdTooltipDirective($timeout, $window, $$rAF, $document, $mdUtil, $mdTheming, $rootElement,
                            $animate, $q, $interpolate) {

  var ENTER_EVENTS = 'focus touchstart mouseenter';
  var LEAVE_EVENTS = 'blur touchcancel mouseleave';
  var TOOLTIP_SHOW_DELAY = 0;
  var TOOLTIP_WINDOW_EDGE_SPACE = 8;

  return {
    restrict: 'E',
    transclude: true,
    priority: 210, // Before ngAria
    template: '<div class="_md-content _md" ng-transclude></div>',
    scope: {
      delay: '=?mdDelay',
      visible: '=?mdVisible',
      autohide: '=?mdAutohide',
      direction: '@?mdDirection'    // only expect raw or interpolated string value; not expression
    },
    compile: function(tElement, tAttr) {
      if (!tAttr.mdDirection) {
        tAttr.$set('mdDirection', 'bottom');
      }

      return postLink;
    }
  };

  function postLink(scope, element, attr) {

    $mdTheming(element);

    var parent        = $mdUtil.getParentWithPointerEvents(element),
        content       = angular.element(element[0].getElementsByClassName('_md-content')[0]),
        tooltipParent = angular.element(document.body),
        showTimeout   = null,
        debouncedOnResize = $$rAF.throttle(function () { updatePosition(); });

    if ($animate.pin) $animate.pin(element, parent);

    // Initialize element

    setDefaults();
    manipulateElement();
    bindEvents();

    // Default origin transform point is 'center top'
    // positionTooltip() is always relative to center top
    updateContentOrigin();

    configureWatchers();
    addAriaLabel();


    function setDefaults () {
      scope.delay = scope.delay || TOOLTIP_SHOW_DELAY;
    }

    function updateContentOrigin() {
      var origin = 'center top';
      switch (scope.direction) {
        case 'left'  : origin =  'right center';  break;
        case 'right' : origin =  'left center';   break;
        case 'top'   : origin =  'center bottom'; break;
        case 'bottom': origin =  'center top';    break;
      }
      content.css('transform-origin', origin);
    }

    function onVisibleChanged (isVisible) {
      if (isVisible) showTooltip();
      else hideTooltip();
    }

    function configureWatchers () {
      if (element[0] && 'MutationObserver' in $window) {
        var attributeObserver = new MutationObserver(function(mutations) {
          mutations
            .forEach(function (mutation) {
              if (mutation.attributeName === 'md-visible') {
                if (!scope.visibleWatcher)
                  scope.visibleWatcher = scope.$watch('visible', onVisibleChanged );
              }
              if (mutation.attributeName === 'md-direction') {
                updatePosition(scope.direction);
              }
            });
        });

        attributeObserver.observe(element[0], { attributes: true });

        // build watcher only if mdVisible is being used
        if (attr.hasOwnProperty('mdVisible')) {
          scope.visibleWatcher = scope.$watch('visible', onVisibleChanged );
        }
      } else { // MutationObserver not supported
        scope.visibleWatcher = scope.$watch('visible', onVisibleChanged );
        scope.$watch('direction', updatePosition );
      }

      var onElementDestroy = function() {
        scope.$destroy();
      };

      // Clean up if the element or parent was removed via jqLite's .remove.
      // A couple of notes:
      // - In these cases the scope might not have been destroyed, which is why we
      // destroy it manually. An example of this can be having `md-visible="false"` and
      // adding tooltips while they're invisible. If `md-visible` becomes true, at some
      // point, you'd usually get a lot of inputs.
      // - We use `.one`, not `.on`, because this only needs to fire once. If we were
      // using `.on`, it would get thrown into an infinite loop.
      // - This kicks off the scope's `$destroy` event which finishes the cleanup.
      element.one('$destroy', onElementDestroy);
      parent.one('$destroy', onElementDestroy);
      scope.$on('$destroy', function() {
        setVisible(false);
        element.remove();
        attributeObserver && attributeObserver.disconnect();
      });

      // Updates the aria-label when the element text changes. This watch
      // doesn't need to be set up if the element doesn't have any data
      // bindings.
      if (element.text().indexOf($interpolate.startSymbol()) > -1) {
        scope.$watch(function() {
          return element.text().trim();
        }, addAriaLabel);
      }
    }

    function addAriaLabel (override) {
      if ((override || !parent.attr('aria-label')) && !parent.text().trim()) {
        var rawText = override || element.text().trim();
        var interpolatedText = $interpolate(rawText)(parent.scope());
        parent.attr('aria-label', interpolatedText);
      }
    }

    function manipulateElement () {
      element.detach();
      element.attr('role', 'tooltip');
    }

    function bindEvents () {
      var mouseActive = false;

      // add an mutationObserver when there is support for it
      // and the need for it in the form of viable host(parent[0])
      if (parent[0] && 'MutationObserver' in $window) {
        // use an mutationObserver to tackle #2602
        var attributeObserver = new MutationObserver(function(mutations) {
          if (mutations.some(function (mutation) {
              return (mutation.attributeName === 'disabled' && parent[0].disabled);
            })) {
              $mdUtil.nextTick(function() {
                setVisible(false);
              });
          }
        });

        attributeObserver.observe(parent[0], { attributes: true});
      }

      // Store whether the element was focused when the window loses focus.
      var windowBlurHandler = function() {
        elementFocusedOnWindowBlur = document.activeElement === parent[0];
      };
      var elementFocusedOnWindowBlur = false;

      function windowScrollHandler() {
        setVisible(false);
      }

      angular.element($window)
        .on('blur', windowBlurHandler)
        .on('resize', debouncedOnResize);

      document.addEventListener('scroll', windowScrollHandler, true);
      scope.$on('$destroy', function() {
        angular.element($window)
          .off('blur', windowBlurHandler)
          .off('resize', debouncedOnResize);

        parent
          .off(ENTER_EVENTS, enterHandler)
          .off(LEAVE_EVENTS, leaveHandler)
          .off('mousedown', mousedownHandler);

        // Trigger the handler in case any the tooltip was still visible.
        leaveHandler();
        document.removeEventListener('scroll', windowScrollHandler, true);
        attributeObserver && attributeObserver.disconnect();
      });

      var enterHandler = function(e) {
        // Prevent the tooltip from showing when the window is receiving focus.
        if (e.type === 'focus' && elementFocusedOnWindowBlur) {
          elementFocusedOnWindowBlur = false;
        } else if (!scope.visible) {
          parent.on(LEAVE_EVENTS, leaveHandler);
          setVisible(true);

          // If the user is on a touch device, we should bind the tap away after
          // the `touched` in order to prevent the tooltip being removed immediately.
          if (e.type === 'touchstart') {
            parent.one('touchend', function() {
              $mdUtil.nextTick(function() {
                $document.one('touchend', leaveHandler);
              }, false);
            });
          }
        }
      };
      var leaveHandler = function () {
        var autohide = scope.hasOwnProperty('autohide') ? scope.autohide : attr.hasOwnProperty('mdAutohide');

        if (autohide || mouseActive || $document[0].activeElement !== parent[0]) {
          // When a show timeout is currently in progress, then we have to cancel it.
          // Otherwise the tooltip will remain showing without focus or hover.
          if (showTimeout) {
            $timeout.cancel(showTimeout);
            setVisible.queued = false;
            showTimeout = null;
          }

          parent.off(LEAVE_EVENTS, leaveHandler);
          parent.triggerHandler('blur');
          setVisible(false);
        }
        mouseActive = false;
      };
      var mousedownHandler = function() {
        mouseActive = true;
      };

      // to avoid `synthetic clicks` we listen to mousedown instead of `click`
      parent.on('mousedown', mousedownHandler);
      parent.on(ENTER_EVENTS, enterHandler);
    }

    function setVisible (value) {
      // break if passed value is already in queue or there is no queue and passed value is current in the scope
      if (setVisible.queued && setVisible.value === !!value || !setVisible.queued && scope.visible === !!value) return;
      setVisible.value = !!value;

      if (!setVisible.queued) {
        if (value) {
          setVisible.queued = true;
          showTimeout = $timeout(function() {
            scope.visible = setVisible.value;
            setVisible.queued = false;
            showTimeout = null;

            if (!scope.visibleWatcher) {
              onVisibleChanged(scope.visible);
            }
          }, scope.delay);
        } else {
          $mdUtil.nextTick(function() {
            scope.visible = false;
            if (!scope.visibleWatcher)
              onVisibleChanged(false);
          });
        }
      }
    }

    function showTooltip() {
      //  Do not show the tooltip if the text is empty.
      if (!element[0].textContent.trim()) return;

      // Insert the element and position at top left, so we can get the position
      // and check if we should display it
      element.css({top: 0, left: 0});
      tooltipParent.append(element);

      // Check if we should display it or not.
      // This handles hide-* and show-* along with any user defined css
      if ( $mdUtil.hasComputedStyle(element, 'display', 'none')) {
        scope.visible = false;
        element.detach();
        return;
      }

      updatePosition();

      angular.forEach([element, content], function (element) {
        $animate.addClass(element, '_md-show');
      });
    }

    function hideTooltip() {
        var promises = [];
        angular.forEach([element, content], function (it) {
          if (it.parent() && it.hasClass('_md-show')) {
            promises.push($animate.removeClass(it, '_md-show'));
          }
        });

        $q.all(promises)
          .then(function () {
            if (!scope.visible) element.detach();
          });
    }

    function updatePosition() {
      if ( !scope.visible ) return;

      updateContentOrigin();
      positionTooltip();
    }

    function positionTooltip() {
      var tipRect = $mdUtil.offsetRect(element, tooltipParent);
      var parentRect = $mdUtil.offsetRect(parent, tooltipParent);
      var newPosition = getPosition(scope.direction);
      var offsetParent = element.prop('offsetParent');

      // If the user provided a direction, just nudge the tooltip onto the screen
      // Otherwise, recalculate based on 'top' since default is 'bottom'
      if (scope.direction) {
        newPosition = fitInParent(newPosition);
      } else if (offsetParent && newPosition.top > offsetParent.scrollHeight - tipRect.height - TOOLTIP_WINDOW_EDGE_SPACE) {
        newPosition = fitInParent(getPosition('top'));
      }

      element.css({
        left: newPosition.left + 'px',
        top: newPosition.top + 'px'
      });

      function fitInParent (pos) {
        var newPosition = { left: pos.left, top: pos.top };
        newPosition.left = Math.min( newPosition.left, tooltipParent.prop('scrollWidth') - tipRect.width - TOOLTIP_WINDOW_EDGE_SPACE );
        newPosition.left = Math.max( newPosition.left, TOOLTIP_WINDOW_EDGE_SPACE );
        newPosition.top  = Math.min( newPosition.top,  tooltipParent.prop('scrollHeight') - tipRect.height - TOOLTIP_WINDOW_EDGE_SPACE );
        newPosition.top  = Math.max( newPosition.top,  TOOLTIP_WINDOW_EDGE_SPACE );
        return newPosition;
      }

      function getPosition (dir) {
        return dir === 'left'
          ? { left: parentRect.left - tipRect.width - TOOLTIP_WINDOW_EDGE_SPACE,
              top: parentRect.top + parentRect.height / 2 - tipRect.height / 2 }
          : dir === 'right'
          ? { left: parentRect.left + parentRect.width + TOOLTIP_WINDOW_EDGE_SPACE,
              top: parentRect.top + parentRect.height / 2 - tipRect.height / 2 }
          : dir === 'top'
          ? { left: parentRect.left + parentRect.width / 2 - tipRect.width / 2,
              top: parentRect.top - tipRect.height - TOOLTIP_WINDOW_EDGE_SPACE }
          : { left: parentRect.left + parentRect.width / 2 - tipRect.width / 2,
              top: parentRect.top + parentRect.height + TOOLTIP_WINDOW_EDGE_SPACE };
      }
    }

  }

}
MdTooltipDirective.$inject = ["$timeout", "$window", "$$rAF", "$document", "$mdUtil", "$mdTheming", "$rootElement", "$animate", "$q", "$interpolate"];

})();
(function(){
"use strict";

/**
 * @ngdoc module
 * @name material.components.virtualRepeat
 */
angular.module('material.components.virtualRepeat', [
  'material.core',
  'material.components.showHide'
])
.directive('mdVirtualRepeatContainer', VirtualRepeatContainerDirective)
.directive('mdVirtualRepeat', VirtualRepeatDirective);


/**
 * @ngdoc directive
 * @name mdVirtualRepeatContainer
 * @module material.components.virtualRepeat
 * @restrict E
 * @description
 * `md-virtual-repeat-container` provides the scroll container for md-virtual-repeat.
 *
 * Virtual repeat is a limited substitute for ng-repeat that renders only
 * enough dom nodes to fill the container and recycling them as the user scrolls.
 *
 * @usage
 * <hljs lang="html">
 *
 * <md-virtual-repeat-container md-top-index="topIndex">
 *   <div md-virtual-repeat="i in items" md-item-size="20">Hello {{i}}!</div>
 * </md-virtual-repeat-container>
 * </hljs>
 *
 * @param {number=} md-top-index Binds the index of the item that is at the top of the scroll
 *     container to $scope. It can both read and set the scroll position.
 * @param {boolean=} md-orient-horizontal Whether the container should scroll horizontally
 *     (defaults to orientation and scrolling vertically).
 * @param {boolean=} md-auto-shrink When present, the container will shrink to fit
 *     the number of items when that number is less than its original size.
 * @param {number=} md-auto-shrink-min Minimum number of items that md-auto-shrink
 *     will shrink to (default: 0).
 */
function VirtualRepeatContainerDirective() {
  return {
    controller: VirtualRepeatContainerController,
    template: virtualRepeatContainerTemplate,
    compile: function virtualRepeatContainerCompile($element, $attrs) {
      $element
          .addClass('md-virtual-repeat-container')
          .addClass($attrs.hasOwnProperty('mdOrientHorizontal')
              ? 'md-orient-horizontal'
              : 'md-orient-vertical');
    }
  };
}


function virtualRepeatContainerTemplate($element) {
  return '<div class="md-virtual-repeat-scroller">' +
    '<div class="md-virtual-repeat-sizer"></div>' +
    '<div class="md-virtual-repeat-offsetter">' +
      $element[0].innerHTML +
    '</div></div>';
}

/**
 * Maximum size, in pixels, that can be explicitly set to an element. The actual value varies
 * between browsers, but IE11 has the very lowest size at a mere 1,533,917px. Ideally we could
 * *compute* this value, but Firefox always reports an element to have a size of zero if it
 * goes over the max, meaning that we'd have to binary search for the value.
 * @const {number}
 */
var MAX_ELEMENT_SIZE = 1533917;

/**
 * Number of additional elements to render above and below the visible area inside
 * of the virtual repeat container. A higher number results in less flicker when scrolling
 * very quickly in Safari, but comes with a higher rendering and dirty-checking cost.
 * @const {number}
 */
var NUM_EXTRA = 3;

/** @ngInject */
function VirtualRepeatContainerController(
    $$rAF, $mdUtil, $parse, $rootScope, $window, $scope, $element, $attrs) {
  this.$rootScope = $rootScope;
  this.$scope = $scope;
  this.$element = $element;
  this.$attrs = $attrs;

  /** @type {number} The width or height of the container */
  this.size = 0;
  /** @type {number} The scroll width or height of the scroller */
  this.scrollSize = 0;
  /** @type {number} The scrollLeft or scrollTop of the scroller */
  this.scrollOffset = 0;
  /** @type {boolean} Whether the scroller is oriented horizontally */
  this.horizontal = this.$attrs.hasOwnProperty('mdOrientHorizontal');
  /** @type {!VirtualRepeatController} The repeater inside of this container */
  this.repeater = null;
  /** @type {boolean} Whether auto-shrink is enabled */
  this.autoShrink = this.$attrs.hasOwnProperty('mdAutoShrink');
  /** @type {number} Minimum number of items to auto-shrink to */
  this.autoShrinkMin = parseInt(this.$attrs.mdAutoShrinkMin, 10) || 0;
  /** @type {?number} Original container size when shrank */
  this.originalSize = null;
  /** @type {number} Amount to offset the total scroll size by. */
  this.offsetSize = parseInt(this.$attrs.mdOffsetSize, 10) || 0;
  /** @type {?string} height or width element style on the container prior to auto-shrinking. */
  this.oldElementSize = null;

  if (this.$attrs.mdTopIndex) {
    /** @type {function(angular.Scope): number} Binds to topIndex on Angular scope */
    this.bindTopIndex = $parse(this.$attrs.mdTopIndex);
    /** @type {number} The index of the item that is at the top of the scroll container */
    this.topIndex = this.bindTopIndex(this.$scope);

    if (!angular.isDefined(this.topIndex)) {
      this.topIndex = 0;
      this.bindTopIndex.assign(this.$scope, 0);
    }

    this.$scope.$watch(this.bindTopIndex, angular.bind(this, function(newIndex) {
      if (newIndex !== this.topIndex) {
        this.scrollToIndex(newIndex);
      }
    }));
  } else {
    this.topIndex = 0;
  }

  this.scroller = $element[0].getElementsByClassName('md-virtual-repeat-scroller')[0];
  this.sizer = this.scroller.getElementsByClassName('md-virtual-repeat-sizer')[0];
  this.offsetter = this.scroller.getElementsByClassName('md-virtual-repeat-offsetter')[0];

  // After the dom stablizes, measure the initial size of the container and
  // make a best effort at re-measuring as it changes.
  var boundUpdateSize = angular.bind(this, this.updateSize);

  $$rAF(angular.bind(this, function() {
    boundUpdateSize();

    var debouncedUpdateSize = $mdUtil.debounce(boundUpdateSize, 10, null, false);
    var jWindow = angular.element($window);

    // Make one more attempt to get the size if it is 0.
    // This is not by any means a perfect approach, but there's really no
    // silver bullet here.
    if (!this.size) {
      debouncedUpdateSize();
    }

    jWindow.on('resize', debouncedUpdateSize);
    $scope.$on('$destroy', function() {
      jWindow.off('resize', debouncedUpdateSize);
    });

    $scope.$emit('$md-resize-enable');
    $scope.$on('$md-resize', boundUpdateSize);
  }));
}
VirtualRepeatContainerController.$inject = ["$$rAF", "$mdUtil", "$parse", "$rootScope", "$window", "$scope", "$element", "$attrs"];


/** Called by the md-virtual-repeat inside of the container at startup. */
VirtualRepeatContainerController.prototype.register = function(repeaterCtrl) {
  this.repeater = repeaterCtrl;

  angular.element(this.scroller)
      .on('scroll wheel touchmove touchend', angular.bind(this, this.handleScroll_));
};


/** @return {boolean} Whether the container is configured for horizontal scrolling. */
VirtualRepeatContainerController.prototype.isHorizontal = function() {
  return this.horizontal;
};


/** @return {number} The size (width or height) of the container. */
VirtualRepeatContainerController.prototype.getSize = function() {
  return this.size;
};


/**
 * Resizes the container.
 * @private
 * @param {number} size The new size to set.
 */
VirtualRepeatContainerController.prototype.setSize_ = function(size) {
  var dimension = this.getDimensionName_();

  this.size = size;
  this.$element[0].style[dimension] = size + 'px';
};


VirtualRepeatContainerController.prototype.unsetSize_ = function() {
  this.$element[0].style[this.getDimensionName_()] = this.oldElementSize;
  this.oldElementSize = null;
};


/** Instructs the container to re-measure its size. */
VirtualRepeatContainerController.prototype.updateSize = function() {
  // If the original size is already determined, we can skip the update.
  if (this.originalSize) return;

  this.size = this.isHorizontal()
      ? this.$element[0].clientWidth
      : this.$element[0].clientHeight;

  // Recheck the scroll position after updating the size. This resolves
  // problems that can result if the scroll position was measured while the
  // element was display: none or detached from the document.
  this.handleScroll_();

  this.repeater && this.repeater.containerUpdated();
};


/** @return {number} The container's scrollHeight or scrollWidth. */
VirtualRepeatContainerController.prototype.getScrollSize = function() {
  return this.scrollSize;
};


VirtualRepeatContainerController.prototype.getDimensionName_ = function() {
  return this.isHorizontal() ? 'width' : 'height';
};


/**
 * Sets the scroller element to the specified size.
 * @private
 * @param {number} size The new size.
 */
VirtualRepeatContainerController.prototype.sizeScroller_ = function(size) {
  var dimension =  this.getDimensionName_();
  var crossDimension = this.isHorizontal() ? 'height' : 'width';

  // Clear any existing dimensions.
  this.sizer.innerHTML = '';

  // If the size falls within the browser's maximum explicit size for a single element, we can
  // set the size and be done. Otherwise, we have to create children that add up the the desired
  // size.
  if (size < MAX_ELEMENT_SIZE) {
    this.sizer.style[dimension] = size + 'px';
  } else {
    this.sizer.style[dimension] = 'auto';
    this.sizer.style[crossDimension] = 'auto';

    // Divide the total size we have to render into N max-size pieces.
    var numChildren = Math.floor(size / MAX_ELEMENT_SIZE);

    // Element template to clone for each max-size piece.
    var sizerChild = document.createElement('div');
    sizerChild.style[dimension] = MAX_ELEMENT_SIZE + 'px';
    sizerChild.style[crossDimension] = '1px';

    for (var i = 0; i < numChildren; i++) {
      this.sizer.appendChild(sizerChild.cloneNode(false));
    }

    // Re-use the element template for the remainder.
    sizerChild.style[dimension] = (size - (numChildren * MAX_ELEMENT_SIZE)) + 'px';
    this.sizer.appendChild(sizerChild);
  }
};


/**
 * If auto-shrinking is enabled, shrinks or unshrinks as appropriate.
 * @private
 * @param {number} size The new size.
 */
VirtualRepeatContainerController.prototype.autoShrink_ = function(size) {
  var shrinkSize = Math.max(size, this.autoShrinkMin * this.repeater.getItemSize());

  if (this.autoShrink && shrinkSize !== this.size) {
    if (this.oldElementSize === null) {
      this.oldElementSize = this.$element[0].style[this.getDimensionName_()];
    }

    var currentSize = this.originalSize || this.size;

    if (!currentSize || shrinkSize < currentSize) {
      if (!this.originalSize) {
        this.originalSize = this.size;
      }

      // Now we update the containers size, because shrinking is enabled.
      this.setSize_(shrinkSize);
    } else if (this.originalSize !== null) {
      // Set the size back to our initial size.
      this.unsetSize_();

      var _originalSize = this.originalSize;
      this.originalSize = null;

      // We determine the repeaters size again, if the original size was zero.
      // The originalSize needs to be null, to be able to determine the size.
      if (!_originalSize) this.updateSize();

      // Apply the original size or the determined size back to the container, because
      // it has been overwritten before, in the shrink block.
      this.setSize_(_originalSize || this.size);
    }

    this.repeater.containerUpdated();
  }
};


/**
 * Sets the scrollHeight or scrollWidth. Called by the repeater based on
 * its item count and item size.
 * @param {number} itemsSize The total size of the items.
 */
VirtualRepeatContainerController.prototype.setScrollSize = function(itemsSize) {
  var size = itemsSize + this.offsetSize;
  if (this.scrollSize === size) return;

  this.sizeScroller_(size);
  this.autoShrink_(size);
  this.scrollSize = size;
};


/** @return {number} The container's current scroll offset. */
VirtualRepeatContainerController.prototype.getScrollOffset = function() {
  return this.scrollOffset;
};

/**
 * Scrolls to a given scrollTop position.
 * @param {number} position
 */
VirtualRepeatContainerController.prototype.scrollTo = function(position) {
  this.scroller[this.isHorizontal() ? 'scrollLeft' : 'scrollTop'] = position;
  this.handleScroll_();
};

/**
 * Scrolls the item with the given index to the top of the scroll container.
 * @param {number} index
 */
VirtualRepeatContainerController.prototype.scrollToIndex = function(index) {
  var itemSize = this.repeater.getItemSize();
  var itemsLength = this.repeater.itemsLength;
  if(index > itemsLength) {
    index = itemsLength - 1;
  }
  this.scrollTo(itemSize * index);
};

VirtualRepeatContainerController.prototype.resetScroll = function() {
  this.scrollTo(0);
};


VirtualRepeatContainerController.prototype.handleScroll_ = function() {
  var doc = angular.element(document)[0];
  var ltr = doc.dir != 'rtl' && doc.body.dir != 'rtl';
  if(!ltr && !this.maxSize) {
    this.scroller.scrollLeft = this.scrollSize;
    this.maxSize = this.scroller.scrollLeft;
  }
  var offset = this.isHorizontal() ?
      (ltr?this.scroller.scrollLeft : this.maxSize - this.scroller.scrollLeft)
      : this.scroller.scrollTop;
  if (offset === this.scrollOffset || offset > this.scrollSize - this.size) return;

  var itemSize = this.repeater.getItemSize();
  if (!itemSize) return;

  var numItems = Math.max(0, Math.floor(offset / itemSize) - NUM_EXTRA);

  var transform = (this.isHorizontal() ? 'translateX(' : 'translateY(') +
      (!this.isHorizontal() || ltr ? (numItems * itemSize) : - (numItems * itemSize))  + 'px)';

  this.scrollOffset = offset;
  this.offsetter.style.webkitTransform = transform;
  this.offsetter.style.transform = transform;

  if (this.bindTopIndex) {
    var topIndex = Math.floor(offset / itemSize);
    if (topIndex !== this.topIndex && topIndex < this.repeater.getItemCount()) {
      this.topIndex = topIndex;
      this.bindTopIndex.assign(this.$scope, topIndex);
      if (!this.$rootScope.$$phase) this.$scope.$digest();
    }
  }

  this.repeater.containerUpdated();
};


/**
 * @ngdoc directive
 * @name mdVirtualRepeat
 * @module material.components.virtualRepeat
 * @restrict A
 * @priority 1000
 * @description
 * `md-virtual-repeat` specifies an element to repeat using virtual scrolling.
 *
 * Virtual repeat is a limited substitute for ng-repeat that renders only
 * enough dom nodes to fill the container and recycling them as the user scrolls.
 * Arrays, but not objects are supported for iteration.
 * Track by, as alias, and (key, value) syntax are not supported.
 *
 * @usage
 * <hljs lang="html">
 * <md-virtual-repeat-container>
 *   <div md-virtual-repeat="i in items">Hello {{i}}!</div>
 * </md-virtual-repeat-container>
 *
 * <md-virtual-repeat-container md-orient-horizontal>
 *   <div md-virtual-repeat="i in items" md-item-size="20">Hello {{i}}!</div>
 * </md-virtual-repeat-container>
 * </hljs>
 *
 * @param {number=} md-item-size The height or width of the repeated elements (which must be
 *   identical for each element). Optional. Will attempt to read the size from the dom if missing,
 *   but still assumes that all repeated nodes have same height or width.
 * @param {string=} md-extra-name Evaluates to an additional name to which the current iterated item
 *   can be assigned on the repeated scope (needed for use in `md-autocomplete`).
 * @param {boolean=} md-on-demand When present, treats the md-virtual-repeat argument as an object
 *   that can fetch rows rather than an array.
 *
 *   **NOTE:** This object must implement the following interface with two (2) methods:
 *
 *   - `getItemAtIndex: function(index) [object]` The item at that index or null if it is not yet
 *     loaded (it should start downloading the item in that case).
 *   - `getLength: function() [number]` The data length to which the repeater container
 *     should be sized. Ideally, when the count is known, this method should return it.
 *     Otherwise, return a higher number than the currently loaded items to produce an
 *     infinite-scroll behavior.
 */
function VirtualRepeatDirective($parse) {
  return {
    controller: VirtualRepeatController,
    priority: 1000,
    require: ['mdVirtualRepeat', '^^mdVirtualRepeatContainer'],
    restrict: 'A',
    terminal: true,
    transclude: 'element',
    compile: function VirtualRepeatCompile($element, $attrs) {
      var expression = $attrs.mdVirtualRepeat;
      var match = expression.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)\s*$/);
      var repeatName = match[1];
      var repeatListExpression = $parse(match[2]);
      var extraName = $attrs.mdExtraName && $parse($attrs.mdExtraName);

      return function VirtualRepeatLink($scope, $element, $attrs, ctrl, $transclude) {
        ctrl[0].link_(ctrl[1], $transclude, repeatName, repeatListExpression, extraName);
      };
    }
  };
}
VirtualRepeatDirective.$inject = ["$parse"];


/** @ngInject */
function VirtualRepeatController($scope, $element, $attrs, $browser, $document, $rootScope,
    $$rAF, $mdUtil) {
  this.$scope = $scope;
  this.$element = $element;
  this.$attrs = $attrs;
  this.$browser = $browser;
  this.$document = $document;
  this.$rootScope = $rootScope;
  this.$$rAF = $$rAF;

  /** @type {boolean} Whether we are in on-demand mode. */
  this.onDemand = $mdUtil.parseAttributeBoolean($attrs.mdOnDemand);
  /** @type {!Function} Backup reference to $browser.$$checkUrlChange */
  this.browserCheckUrlChange = $browser.$$checkUrlChange;
  /** @type {number} Most recent starting repeat index (based on scroll offset) */
  this.newStartIndex = 0;
  /** @type {number} Most recent ending repeat index (based on scroll offset) */
  this.newEndIndex = 0;
  /** @type {number} Most recent end visible index (based on scroll offset) */
  this.newVisibleEnd = 0;
  /** @type {number} Previous starting repeat index (based on scroll offset) */
  this.startIndex = 0;
  /** @type {number} Previous ending repeat index (based on scroll offset) */
  this.endIndex = 0;
  // TODO: measure width/height of first element from dom if not provided.
  // getComputedStyle?
  /** @type {?number} Height/width of repeated elements. */
  this.itemSize = $scope.$eval($attrs.mdItemSize) || null;

  /** @type {boolean} Whether this is the first time that items are rendered. */
  this.isFirstRender = true;

  /**
   * @private {boolean} Whether the items in the list are already being updated. Used to prevent
   *     nested calls to virtualRepeatUpdate_.
   */
  this.isVirtualRepeatUpdating_ = false;

  /** @type {number} Most recently seen length of items. */
  this.itemsLength = 0;

  /**
   * @type {!Function} Unwatch callback for item size (when md-items-size is
   *     not specified), or angular.noop otherwise.
   */
  this.unwatchItemSize_ = angular.noop;

  /**
   * Presently rendered blocks by repeat index.
   * @type {Object<number, !VirtualRepeatController.Block}
   */
  this.blocks = {};
  /** @type {Array<!VirtualRepeatController.Block>} A pool of presently unused blocks. */
  this.pooledBlocks = [];

  $scope.$on('$destroy', angular.bind(this, this.cleanupBlocks_));
}
VirtualRepeatController.$inject = ["$scope", "$element", "$attrs", "$browser", "$document", "$rootScope", "$$rAF", "$mdUtil"];


/**
 * An object representing a repeated item.
 * @typedef {{element: !jqLite, new: boolean, scope: !angular.Scope}}
 */
VirtualRepeatController.Block;


/**
 * Called at startup by the md-virtual-repeat postLink function.
 * @param {!VirtualRepeatContainerController} container The container's controller.
 * @param {!Function} transclude The repeated element's bound transclude function.
 * @param {string} repeatName The left hand side of the repeat expression, indicating
 *     the name for each item in the array.
 * @param {!Function} repeatListExpression A compiled expression based on the right hand side
 *     of the repeat expression. Points to the array to repeat over.
 * @param {string|undefined} extraName The optional extra repeatName.
 */
VirtualRepeatController.prototype.link_ =
    function(container, transclude, repeatName, repeatListExpression, extraName) {
  this.container = container;
  this.transclude = transclude;
  this.repeatName = repeatName;
  this.rawRepeatListExpression = repeatListExpression;
  this.extraName = extraName;
  this.sized = false;

  this.repeatListExpression = angular.bind(this, this.repeatListExpression_);

  this.container.register(this);
};


/** @private Cleans up unused blocks. */
VirtualRepeatController.prototype.cleanupBlocks_ = function() {
  angular.forEach(this.pooledBlocks, function cleanupBlock(block) {
    block.element.remove();
  });
};


/** @private Attempts to set itemSize by measuring a repeated element in the dom */
VirtualRepeatController.prototype.readItemSize_ = function() {
  if (this.itemSize) {
    // itemSize was successfully read in a different asynchronous call.
    return;
  }

  this.items = this.repeatListExpression(this.$scope);
  this.parentNode = this.$element[0].parentNode;
  var block = this.getBlock_(0);
  if (!block.element[0].parentNode) {
    this.parentNode.appendChild(block.element[0]);
  }

  this.itemSize = block.element[0][
      this.container.isHorizontal() ? 'offsetWidth' : 'offsetHeight'] || null;

  this.blocks[0] = block;
  this.poolBlock_(0);

  if (this.itemSize) {
    this.containerUpdated();
  }
};


/**
 * Returns the user-specified repeat list, transforming it into an array-like
 * object in the case of infinite scroll/dynamic load mode.
 * @param {!angular.Scope} The scope.
 * @return {!Array|!Object} An array or array-like object for iteration.
 */
VirtualRepeatController.prototype.repeatListExpression_ = function(scope) {
  var repeatList = this.rawRepeatListExpression(scope);

  if (this.onDemand && repeatList) {
    var virtualList = new VirtualRepeatModelArrayLike(repeatList);
    virtualList.$$includeIndexes(this.newStartIndex, this.newVisibleEnd);
    return virtualList;
  } else {
    return repeatList;
  }
};


/**
 * Called by the container. Informs us that the containers scroll or size has
 * changed.
 */
VirtualRepeatController.prototype.containerUpdated = function() {
  // If itemSize is unknown, attempt to measure it.
  if (!this.itemSize) {
    // Make sure to clean up watchers if we can (see #8178)
    if(this.unwatchItemSize_ && this.unwatchItemSize_ !== angular.noop){
      this.unwatchItemSize_();
    }
    this.unwatchItemSize_ = this.$scope.$watchCollection(
        this.repeatListExpression,
        angular.bind(this, function(items) {
          if (items && items.length) {
            this.$$rAF(angular.bind(this, this.readItemSize_));
          }
        }));
    if (!this.$rootScope.$$phase) this.$scope.$digest();

    return;
  } else if (!this.sized) {
    this.items = this.repeatListExpression(this.$scope);
  }

  if (!this.sized) {
    this.unwatchItemSize_();
    this.sized = true;
    this.$scope.$watchCollection(this.repeatListExpression,
        angular.bind(this, function(items, oldItems) {
          if (!this.isVirtualRepeatUpdating_) {
            this.virtualRepeatUpdate_(items, oldItems);
          }
        }));
  }

  this.updateIndexes_();

  if (this.newStartIndex !== this.startIndex ||
      this.newEndIndex !== this.endIndex ||
      this.container.getScrollOffset() > this.container.getScrollSize()) {
    if (this.items instanceof VirtualRepeatModelArrayLike) {
      this.items.$$includeIndexes(this.newStartIndex, this.newEndIndex);
    }
    this.virtualRepeatUpdate_(this.items, this.items);
  }
};


/**
 * Called by the container. Returns the size of a single repeated item.
 * @return {?number} Size of a repeated item.
 */
VirtualRepeatController.prototype.getItemSize = function() {
  return this.itemSize;
};


/**
 * Called by the container. Returns the size of a single repeated item.
 * @return {?number} Size of a repeated item.
 */
VirtualRepeatController.prototype.getItemCount = function() {
  return this.itemsLength;
};


/**
 * Updates the order and visible offset of repeated blocks in response to scrolling
 * or items updates.
 * @private
 */
VirtualRepeatController.prototype.virtualRepeatUpdate_ = function(items, oldItems) {
  this.isVirtualRepeatUpdating_ = true;

  var itemsLength = items && items.length || 0;
  var lengthChanged = false;

  // If the number of items shrank
  if (this.items && itemsLength < this.items.length && this.container.getScrollOffset() !== 0) {
    this.items = items;
    var previousScrollOffset = this.container.getScrollOffset();
    this.container.resetScroll();
    this.container.scrollTo(previousScrollOffset);
    return;
  }

  if (itemsLength !== this.itemsLength) {
    lengthChanged = true;
    this.itemsLength = itemsLength;
  }

  this.items = items;
  if (items !== oldItems || lengthChanged) {
    this.updateIndexes_();
  }

  this.parentNode = this.$element[0].parentNode;

  if (lengthChanged) {
    this.container.setScrollSize(itemsLength * this.itemSize);
  }

  if (this.isFirstRender) {
    this.isFirstRender = false;
    var startIndex = this.$attrs.mdStartIndex ?
      this.$scope.$eval(this.$attrs.mdStartIndex) :
      this.container.topIndex;
    this.container.scrollToIndex(startIndex);
  }

  // Detach and pool any blocks that are no longer in the viewport.
  Object.keys(this.blocks).forEach(function(blockIndex) {
    var index = parseInt(blockIndex, 10);
    if (index < this.newStartIndex || index >= this.newEndIndex) {
      this.poolBlock_(index);
    }
  }, this);

  // Add needed blocks.
  // For performance reasons, temporarily block browser url checks as we digest
  // the restored block scopes ($$checkUrlChange reads window.location to
  // check for changes and trigger route change, etc, which we don't need when
  // trying to scroll at 60fps).
  this.$browser.$$checkUrlChange = angular.noop;

  var i, block,
      newStartBlocks = [],
      newEndBlocks = [];

  // Collect blocks at the top.
  for (i = this.newStartIndex; i < this.newEndIndex && this.blocks[i] == null; i++) {
    block = this.getBlock_(i);
    this.updateBlock_(block, i);
    newStartBlocks.push(block);
  }

  // Update blocks that are already rendered.
  for (; this.blocks[i] != null; i++) {
    this.updateBlock_(this.blocks[i], i);
  }
  var maxIndex = i - 1;

  // Collect blocks at the end.
  for (; i < this.newEndIndex; i++) {
    block = this.getBlock_(i);
    this.updateBlock_(block, i);
    newEndBlocks.push(block);
  }

  // Attach collected blocks to the document.
  if (newStartBlocks.length) {
    this.parentNode.insertBefore(
        this.domFragmentFromBlocks_(newStartBlocks),
        this.$element[0].nextSibling);
  }
  if (newEndBlocks.length) {
    this.parentNode.insertBefore(
        this.domFragmentFromBlocks_(newEndBlocks),
        this.blocks[maxIndex] && this.blocks[maxIndex].element[0].nextSibling);
  }

  // Restore $$checkUrlChange.
  this.$browser.$$checkUrlChange = this.browserCheckUrlChange;

  this.startIndex = this.newStartIndex;
  this.endIndex = this.newEndIndex;

  this.isVirtualRepeatUpdating_ = false;
};


/**
 * @param {number} index Where the block is to be in the repeated list.
 * @return {!VirtualRepeatController.Block} A new or pooled block to place at the specified index.
 * @private
 */
VirtualRepeatController.prototype.getBlock_ = function(index) {
  if (this.pooledBlocks.length) {
    return this.pooledBlocks.pop();
  }

  var block;
  this.transclude(angular.bind(this, function(clone, scope) {
    block = {
      element: clone,
      new: true,
      scope: scope
    };

    this.updateScope_(scope, index);
    this.parentNode.appendChild(clone[0]);
  }));

  return block;
};


/**
 * Updates and if not in a digest cycle, digests the specified block's scope to the data
 * at the specified index.
 * @param {!VirtualRepeatController.Block} block The block whose scope should be updated.
 * @param {number} index The index to set.
 * @private
 */
VirtualRepeatController.prototype.updateBlock_ = function(block, index) {
  this.blocks[index] = block;

  if (!block.new &&
      (block.scope.$index === index && block.scope[this.repeatName] === this.items[index])) {
    return;
  }
  block.new = false;

  // Update and digest the block's scope.
  this.updateScope_(block.scope, index);

  // Perform digest before reattaching the block.
  // Any resulting synchronous dom mutations should be much faster as a result.
  // This might break some directives, but I'm going to try it for now.
  if (!this.$rootScope.$$phase) {
    block.scope.$digest();
  }
};


/**
 * Updates scope to the data at the specified index.
 * @param {!angular.Scope} scope The scope which should be updated.
 * @param {number} index The index to set.
 * @private
 */
VirtualRepeatController.prototype.updateScope_ = function(scope, index) {
  scope.$index = index;
  scope[this.repeatName] = this.items && this.items[index];
  if (this.extraName) scope[this.extraName(this.$scope)] = this.items[index];
};


/**
 * Pools the block at the specified index (Pulls its element out of the dom and stores it).
 * @param {number} index The index at which the block to pool is stored.
 * @private
 */
VirtualRepeatController.prototype.poolBlock_ = function(index) {
  this.pooledBlocks.push(this.blocks[index]);
  this.parentNode.removeChild(this.blocks[index].element[0]);
  delete this.blocks[index];
};


/**
 * Produces a dom fragment containing the elements from the list of blocks.
 * @param {!Array<!VirtualRepeatController.Block>} blocks The blocks whose elements
 *     should be added to the document fragment.
 * @return {DocumentFragment}
 * @private
 */
VirtualRepeatController.prototype.domFragmentFromBlocks_ = function(blocks) {
  var fragment = this.$document[0].createDocumentFragment();
  blocks.forEach(function(block) {
    fragment.appendChild(block.element[0]);
  });
  return fragment;
};


/**
 * Updates start and end indexes based on length of repeated items and container size.
 * @private
 */
VirtualRepeatController.prototype.updateIndexes_ = function() {
  var itemsLength = this.items ? this.items.length : 0;
  var containerLength = Math.ceil(this.container.getSize() / this.itemSize);

  this.newStartIndex = Math.max(0, Math.min(
      itemsLength - containerLength,
      Math.floor(this.container.getScrollOffset() / this.itemSize)));
  this.newVisibleEnd = this.newStartIndex + containerLength + NUM_EXTRA;
  this.newEndIndex = Math.min(itemsLength, this.newVisibleEnd);
  this.newStartIndex = Math.max(0, this.newStartIndex - NUM_EXTRA);
};

/**
 * This VirtualRepeatModelArrayLike class enforces the interface requirements
 * for infinite scrolling within a mdVirtualRepeatContainer. An object with this
 * interface must implement the following interface with two (2) methods:
 *
 * getItemAtIndex: function(index) -> item at that index or null if it is not yet
 *     loaded (It should start downloading the item in that case).
 *
 * getLength: function() -> number The data legnth to which the repeater container
 *     should be sized. Ideally, when the count is known, this method should return it.
 *     Otherwise, return a higher number than the currently loaded items to produce an
 *     infinite-scroll behavior.
 *
 * @usage
 * <hljs lang="html">
 *  <md-virtual-repeat-container md-orient-horizontal>
 *    <div md-virtual-repeat="i in items" md-on-demand>
 *      Hello {{i}}!
 *    </div>
 *  </md-virtual-repeat-container>
 * </hljs>
 *
 */
function VirtualRepeatModelArrayLike(model) {
  if (!angular.isFunction(model.getItemAtIndex) ||
      !angular.isFunction(model.getLength)) {
    throw Error('When md-on-demand is enabled, the Object passed to md-virtual-repeat must implement ' +
        'functions getItemAtIndex() and getLength() ');
  }

  this.model = model;
}


VirtualRepeatModelArrayLike.prototype.$$includeIndexes = function(start, end) {
  for (var i = start; i < end; i++) {
    if (!this.hasOwnProperty(i)) {
      this[i] = this.model.getItemAtIndex(i);
    }
  }
  this.length = this.model.getLength();
};


function abstractMethod() {
  throw Error('Non-overridden abstract method called.');
}

})();
(function(){ 
angular.module("material.core").constant("$MD_THEME_CSS", "/*  Only used with Theme processes */html.md-THEME_NAME-theme, body.md-THEME_NAME-theme {  color: '{{foreground-1}}';  background-color: '{{background-color}}'; }md-autocomplete.md-THEME_NAME-theme {  background: '{{background-A100}}'; }  md-autocomplete.md-THEME_NAME-theme[disabled]:not([md-floating-label]) {    background: '{{background-100}}'; }  md-autocomplete.md-THEME_NAME-theme button md-icon path {    fill: '{{background-600}}'; }  md-autocomplete.md-THEME_NAME-theme button:after {    background: '{{background-600-0.3}}'; }.md-autocomplete-suggestions-container.md-THEME_NAME-theme {  background: '{{background-A100}}'; }  .md-autocomplete-suggestions-container.md-THEME_NAME-theme li {    color: '{{background-900}}'; }    .md-autocomplete-suggestions-container.md-THEME_NAME-theme li .highlight {      color: '{{background-600}}'; }    .md-autocomplete-suggestions-container.md-THEME_NAME-theme li:hover, .md-autocomplete-suggestions-container.md-THEME_NAME-theme li.selected {      background: '{{background-200}}'; }md-bottom-sheet.md-THEME_NAME-theme {  background-color: '{{background-50}}';  border-top-color: '{{background-300}}'; }  md-bottom-sheet.md-THEME_NAME-theme.md-list md-list-item {    color: '{{foreground-1}}'; }  md-bottom-sheet.md-THEME_NAME-theme .md-subheader {    background-color: '{{background-50}}'; }  md-bottom-sheet.md-THEME_NAME-theme .md-subheader {    color: '{{foreground-1}}'; }md-backdrop {  background-color: '{{background-900-0.0}}'; }  md-backdrop.md-opaque.md-THEME_NAME-theme {    background-color: '{{background-900-1.0}}'; }.md-button.md-THEME_NAME-theme:not([disabled]):hover {  background-color: '{{background-500-0.2}}'; }.md-button.md-THEME_NAME-theme:not([disabled]).md-focused {  background-color: '{{background-500-0.2}}'; }.md-button.md-THEME_NAME-theme:not([disabled]).md-icon-button:hover {  background-color: transparent; }.md-button.md-THEME_NAME-theme.md-fab {  background-color: '{{accent-color}}';  color: '{{accent-contrast}}'; }  .md-button.md-THEME_NAME-theme.md-fab md-icon {    color: '{{accent-contrast}}'; }  .md-button.md-THEME_NAME-theme.md-fab:not([disabled]):hover {    background-color: '{{accent-A700}}'; }  .md-button.md-THEME_NAME-theme.md-fab:not([disabled]).md-focused {    background-color: '{{accent-A700}}'; }.md-button.md-THEME_NAME-theme.md-primary {  color: '{{primary-color}}'; }  .md-button.md-THEME_NAME-theme.md-primary.md-raised, .md-button.md-THEME_NAME-theme.md-primary.md-fab {    color: '{{primary-contrast}}';    background-color: '{{primary-color}}'; }    .md-button.md-THEME_NAME-theme.md-primary.md-raised:not([disabled]) md-icon, .md-button.md-THEME_NAME-theme.md-primary.md-fab:not([disabled]) md-icon {      color: '{{primary-contrast}}'; }    .md-button.md-THEME_NAME-theme.md-primary.md-raised:not([disabled]):hover, .md-button.md-THEME_NAME-theme.md-primary.md-fab:not([disabled]):hover {      background-color: '{{primary-600}}'; }    .md-button.md-THEME_NAME-theme.md-primary.md-raised:not([disabled]).md-focused, .md-button.md-THEME_NAME-theme.md-primary.md-fab:not([disabled]).md-focused {      background-color: '{{primary-600}}'; }  .md-button.md-THEME_NAME-theme.md-primary:not([disabled]) md-icon {    color: '{{primary-color}}'; }.md-button.md-THEME_NAME-theme.md-fab {  background-color: '{{accent-color}}';  color: '{{accent-contrast}}'; }  .md-button.md-THEME_NAME-theme.md-fab:not([disabled]) .md-icon {    color: '{{accent-contrast}}'; }  .md-button.md-THEME_NAME-theme.md-fab:not([disabled]):hover {    background-color: '{{accent-A700}}'; }  .md-button.md-THEME_NAME-theme.md-fab:not([disabled]).md-focused {    background-color: '{{accent-A700}}'; }.md-button.md-THEME_NAME-theme.md-raised {  color: '{{background-900}}';  background-color: '{{background-50}}'; }  .md-button.md-THEME_NAME-theme.md-raised:not([disabled]) md-icon {    color: '{{background-900}}'; }  .md-button.md-THEME_NAME-theme.md-raised:not([disabled]):hover {    background-color: '{{background-50}}'; }  .md-button.md-THEME_NAME-theme.md-raised:not([disabled]).md-focused {    background-color: '{{background-200}}'; }.md-button.md-THEME_NAME-theme.md-warn {  color: '{{warn-color}}'; }  .md-button.md-THEME_NAME-theme.md-warn.md-raised, .md-button.md-THEME_NAME-theme.md-warn.md-fab {    color: '{{warn-contrast}}';    background-color: '{{warn-color}}'; }    .md-button.md-THEME_NAME-theme.md-warn.md-raised:not([disabled]) md-icon, .md-button.md-THEME_NAME-theme.md-warn.md-fab:not([disabled]) md-icon {      color: '{{warn-contrast}}'; }    .md-button.md-THEME_NAME-theme.md-warn.md-raised:not([disabled]):hover, .md-button.md-THEME_NAME-theme.md-warn.md-fab:not([disabled]):hover {      background-color: '{{warn-600}}'; }    .md-button.md-THEME_NAME-theme.md-warn.md-raised:not([disabled]).md-focused, .md-button.md-THEME_NAME-theme.md-warn.md-fab:not([disabled]).md-focused {      background-color: '{{warn-600}}'; }  .md-button.md-THEME_NAME-theme.md-warn:not([disabled]) md-icon {    color: '{{warn-color}}'; }.md-button.md-THEME_NAME-theme.md-accent {  color: '{{accent-color}}'; }  .md-button.md-THEME_NAME-theme.md-accent.md-raised, .md-button.md-THEME_NAME-theme.md-accent.md-fab {    color: '{{accent-contrast}}';    background-color: '{{accent-color}}'; }    .md-button.md-THEME_NAME-theme.md-accent.md-raised:not([disabled]) md-icon, .md-button.md-THEME_NAME-theme.md-accent.md-fab:not([disabled]) md-icon {      color: '{{accent-contrast}}'; }    .md-button.md-THEME_NAME-theme.md-accent.md-raised:not([disabled]):hover, .md-button.md-THEME_NAME-theme.md-accent.md-fab:not([disabled]):hover {      background-color: '{{accent-A700}}'; }    .md-button.md-THEME_NAME-theme.md-accent.md-raised:not([disabled]).md-focused, .md-button.md-THEME_NAME-theme.md-accent.md-fab:not([disabled]).md-focused {      background-color: '{{accent-A700}}'; }  .md-button.md-THEME_NAME-theme.md-accent:not([disabled]) md-icon {    color: '{{accent-color}}'; }.md-button.md-THEME_NAME-theme[disabled], .md-button.md-THEME_NAME-theme.md-raised[disabled], .md-button.md-THEME_NAME-theme.md-fab[disabled], .md-button.md-THEME_NAME-theme.md-accent[disabled], .md-button.md-THEME_NAME-theme.md-warn[disabled] {  color: '{{foreground-3}}';  cursor: default; }  .md-button.md-THEME_NAME-theme[disabled] md-icon, .md-button.md-THEME_NAME-theme.md-raised[disabled] md-icon, .md-button.md-THEME_NAME-theme.md-fab[disabled] md-icon, .md-button.md-THEME_NAME-theme.md-accent[disabled] md-icon, .md-button.md-THEME_NAME-theme.md-warn[disabled] md-icon {    color: '{{foreground-3}}'; }.md-button.md-THEME_NAME-theme.md-raised[disabled], .md-button.md-THEME_NAME-theme.md-fab[disabled] {  background-color: '{{foreground-4}}'; }.md-button.md-THEME_NAME-theme[disabled] {  background-color: transparent; }._md a.md-THEME_NAME-theme:not(.md-button).md-primary {  color: '{{primary-color}}'; }  ._md a.md-THEME_NAME-theme:not(.md-button).md-primary:hover {    color: '{{primary-700}}'; }._md a.md-THEME_NAME-theme:not(.md-button).md-accent {  color: '{{accent-color}}'; }  ._md a.md-THEME_NAME-theme:not(.md-button).md-accent:hover {    color: '{{accent-700}}'; }._md a.md-THEME_NAME-theme:not(.md-button).md-accent {  color: '{{accent-color}}'; }  ._md a.md-THEME_NAME-theme:not(.md-button).md-accent:hover {    color: '{{accent-A700}}'; }._md a.md-THEME_NAME-theme:not(.md-button).md-warn {  color: '{{warn-color}}'; }  ._md a.md-THEME_NAME-theme:not(.md-button).md-warn:hover {    color: '{{warn-700}}'; }md-card.md-THEME_NAME-theme {  color: '{{foreground-1}}';  background-color: '{{background-hue-1}}';  border-radius: 2px; }  md-card.md-THEME_NAME-theme .md-card-image {    border-radius: 2px 2px 0 0; }  md-card.md-THEME_NAME-theme md-card-header md-card-avatar md-icon {    color: '{{background-color}}';    background-color: '{{foreground-3}}'; }  md-card.md-THEME_NAME-theme md-card-header md-card-header-text .md-subhead {    color: '{{foreground-2}}'; }  md-card.md-THEME_NAME-theme md-card-title md-card-title-text:not(:only-child) .md-subhead {    color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme .md-ripple {  color: '{{accent-A700}}'; }md-checkbox.md-THEME_NAME-theme.md-checked .md-ripple {  color: '{{background-600}}'; }md-checkbox.md-THEME_NAME-theme.md-checked.md-focused ._md-container:before {  background-color: '{{accent-color-0.26}}'; }md-checkbox.md-THEME_NAME-theme .md-ink-ripple {  color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme.md-checked .md-ink-ripple {  color: '{{accent-color-0.87}}'; }md-checkbox.md-THEME_NAME-theme ._md-icon {  border-color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme.md-checked ._md-icon {  background-color: '{{accent-color-0.87}}'; }md-checkbox.md-THEME_NAME-theme.md-checked ._md-icon:after {  border-color: '{{accent-contrast-0.87}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary .md-ripple {  color: '{{primary-600}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked .md-ripple {  color: '{{background-600}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary .md-ink-ripple {  color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked .md-ink-ripple {  color: '{{primary-color-0.87}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary ._md-icon {  border-color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked ._md-icon {  background-color: '{{primary-color-0.87}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked.md-focused ._md-container:before {  background-color: '{{primary-color-0.26}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked ._md-icon:after {  border-color: '{{primary-contrast-0.87}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-primary .md-indeterminate[disabled] ._md-container {  color: '{{foreground-3}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn .md-ripple {  color: '{{warn-600}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn .md-ink-ripple {  color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked .md-ink-ripple {  color: '{{warn-color-0.87}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn ._md-icon {  border-color: '{{foreground-2}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked ._md-icon {  background-color: '{{warn-color-0.87}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked.md-focused:not([disabled]) ._md-container:before {  background-color: '{{warn-color-0.26}}'; }md-checkbox.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked ._md-icon:after {  border-color: '{{background-200}}'; }md-checkbox.md-THEME_NAME-theme[disabled] ._md-icon {  border-color: '{{foreground-3}}'; }md-checkbox.md-THEME_NAME-theme[disabled].md-checked ._md-icon {  background-color: '{{foreground-3}}'; }md-checkbox.md-THEME_NAME-theme[disabled].md-checked ._md-icon:after {  border-color: '{{background-200}}'; }md-checkbox.md-THEME_NAME-theme[disabled] ._md-icon:after {  border-color: '{{foreground-3}}'; }md-checkbox.md-THEME_NAME-theme[disabled] ._md-label {  color: '{{foreground-3}}'; }md-chips.md-THEME_NAME-theme .md-chips {  box-shadow: 0 1px '{{foreground-4}}'; }  md-chips.md-THEME_NAME-theme .md-chips.md-focused {    box-shadow: 0 2px '{{primary-color}}'; }  md-chips.md-THEME_NAME-theme .md-chips ._md-chip-input-container input {    color: '{{foreground-1}}'; }    md-chips.md-THEME_NAME-theme .md-chips ._md-chip-input-container input::-webkit-input-placeholder {      color: '{{foreground-3}}'; }    md-chips.md-THEME_NAME-theme .md-chips ._md-chip-input-container input:-moz-placeholder {      color: '{{foreground-3}}'; }    md-chips.md-THEME_NAME-theme .md-chips ._md-chip-input-container input::-moz-placeholder {      color: '{{foreground-3}}'; }    md-chips.md-THEME_NAME-theme .md-chips ._md-chip-input-container input:-ms-input-placeholder {      color: '{{foreground-3}}'; }    md-chips.md-THEME_NAME-theme .md-chips ._md-chip-input-container input::-webkit-input-placeholder {      color: '{{foreground-3}}'; }md-chips.md-THEME_NAME-theme md-chip {  background: '{{background-300}}';  color: '{{background-800}}'; }  md-chips.md-THEME_NAME-theme md-chip md-icon {    color: '{{background-700}}'; }  md-chips.md-THEME_NAME-theme md-chip.md-focused {    background: '{{primary-color}}';    color: '{{primary-contrast}}'; }    md-chips.md-THEME_NAME-theme md-chip.md-focused md-icon {      color: '{{primary-contrast}}'; }  md-chips.md-THEME_NAME-theme md-chip._md-chip-editing {    background: transparent;    color: '{{background-800}}'; }md-chips.md-THEME_NAME-theme md-chip-remove .md-button md-icon path {  fill: '{{background-500}}'; }.md-contact-suggestion span.md-contact-email {  color: '{{background-400}}'; }md-content.md-THEME_NAME-theme {  color: '{{foreground-1}}';  background-color: '{{background-default}}'; }/** Theme styles for mdCalendar. */.md-calendar.md-THEME_NAME-theme {  background: '{{background-A100}}';  color: '{{background-A200-0.87}}'; }  .md-calendar.md-THEME_NAME-theme tr:last-child td {    border-bottom-color: '{{background-200}}'; }.md-THEME_NAME-theme .md-calendar-day-header {  background: '{{background-300}}';  color: '{{background-A200-0.87}}'; }.md-THEME_NAME-theme .md-calendar-date.md-calendar-date-today .md-calendar-date-selection-indicator {  border: 1px solid '{{primary-500}}'; }.md-THEME_NAME-theme .md-calendar-date.md-calendar-date-today.md-calendar-date-disabled {  color: '{{primary-500-0.6}}'; }.md-calendar-date.md-focus .md-THEME_NAME-theme .md-calendar-date-selection-indicator, .md-THEME_NAME-theme .md-calendar-date-selection-indicator:hover {  background: '{{background-300}}'; }.md-THEME_NAME-theme .md-calendar-date.md-calendar-selected-date .md-calendar-date-selection-indicator,.md-THEME_NAME-theme .md-calendar-date.md-focus.md-calendar-selected-date .md-calendar-date-selection-indicator {  background: '{{primary-500}}';  color: '{{primary-500-contrast}}';  border-color: transparent; }.md-THEME_NAME-theme .md-calendar-date-disabled,.md-THEME_NAME-theme .md-calendar-month-label-disabled {  color: '{{background-A200-0.435}}'; }/** Theme styles for mdDatepicker. */.md-THEME_NAME-theme .md-datepicker-input {  color: '{{foreground-1}}'; }  .md-THEME_NAME-theme .md-datepicker-input::-webkit-input-placeholder {    color: '{{foreground-3}}'; }  .md-THEME_NAME-theme .md-datepicker-input:-moz-placeholder {    color: '{{foreground-3}}'; }  .md-THEME_NAME-theme .md-datepicker-input::-moz-placeholder {    color: '{{foreground-3}}'; }  .md-THEME_NAME-theme .md-datepicker-input:-ms-input-placeholder {    color: '{{foreground-3}}'; }  .md-THEME_NAME-theme .md-datepicker-input::-webkit-input-placeholder {    color: '{{foreground-3}}'; }.md-THEME_NAME-theme .md-datepicker-input-container {  border-bottom-color: '{{foreground-4}}'; }  .md-THEME_NAME-theme .md-datepicker-input-container.md-datepicker-focused {    border-bottom-color: '{{primary-color}}'; }  .md-THEME_NAME-theme .md-datepicker-input-container.md-datepicker-invalid {    border-bottom-color: '{{warn-A700}}'; }.md-THEME_NAME-theme .md-datepicker-calendar-pane {  border-color: '{{background-hue-1}}'; }.md-THEME_NAME-theme .md-datepicker-triangle-button .md-datepicker-expand-triangle {  border-top-color: '{{foreground-3}}'; }.md-THEME_NAME-theme .md-datepicker-triangle-button:hover .md-datepicker-expand-triangle {  border-top-color: '{{foreground-2}}'; }.md-THEME_NAME-theme .md-datepicker-open .md-datepicker-calendar-icon {  fill: '{{primary-500}}'; }.md-THEME_NAME-theme .md-datepicker-open .md-datepicker-input-container,.md-THEME_NAME-theme .md-datepicker-input-mask-opaque {  background: '{{background-hue-1}}'; }.md-THEME_NAME-theme .md-datepicker-calendar {  background: '{{background-A100}}'; }md-dialog.md-THEME_NAME-theme {  border-radius: 4px;  background-color: '{{background-hue-1}}';  color: '{{foreground-1}}'; }  md-dialog.md-THEME_NAME-theme.md-content-overflow .md-actions, md-dialog.md-THEME_NAME-theme.md-content-overflow md-dialog-actions {    border-top-color: '{{foreground-4}}'; }md-divider.md-THEME_NAME-theme {  border-top-color: '{{foreground-4}}'; }.layout-row > md-divider.md-THEME_NAME-theme,.layout-xs-row > md-divider.md-THEME_NAME-theme, .layout-gt-xs-row > md-divider.md-THEME_NAME-theme,.layout-sm-row > md-divider.md-THEME_NAME-theme, .layout-gt-sm-row > md-divider.md-THEME_NAME-theme,.layout-md-row > md-divider.md-THEME_NAME-theme, .layout-gt-md-row > md-divider.md-THEME_NAME-theme,.layout-lg-row > md-divider.md-THEME_NAME-theme, .layout-gt-lg-row > md-divider.md-THEME_NAME-theme,.layout-xl-row > md-divider.md-THEME_NAME-theme {  border-right-color: '{{foreground-4}}'; }md-icon.md-THEME_NAME-theme {  color: '{{foreground-2}}'; }  md-icon.md-THEME_NAME-theme.md-primary {    color: '{{primary-color}}'; }  md-icon.md-THEME_NAME-theme.md-accent {    color: '{{accent-color}}'; }  md-icon.md-THEME_NAME-theme.md-warn {    color: '{{warn-color}}'; }md-input-container.md-THEME_NAME-theme .md-input {  color: '{{foreground-1}}';  border-color: '{{foreground-4}}'; }  md-input-container.md-THEME_NAME-theme .md-input::-webkit-input-placeholder {    color: '{{foreground-3}}'; }  md-input-container.md-THEME_NAME-theme .md-input:-moz-placeholder {    color: '{{foreground-3}}'; }  md-input-container.md-THEME_NAME-theme .md-input::-moz-placeholder {    color: '{{foreground-3}}'; }  md-input-container.md-THEME_NAME-theme .md-input:-ms-input-placeholder {    color: '{{foreground-3}}'; }  md-input-container.md-THEME_NAME-theme .md-input::-webkit-input-placeholder {    color: '{{foreground-3}}'; }md-input-container.md-THEME_NAME-theme > md-icon {  color: '{{foreground-1}}'; }md-input-container.md-THEME_NAME-theme label,md-input-container.md-THEME_NAME-theme ._md-placeholder {  color: '{{foreground-3}}'; }md-input-container.md-THEME_NAME-theme.md-input-invalid label.md-required:after {  color: '{{warn-A700}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-focused):not(.md-input-invalid) label.md-required:after {  color: '{{foreground-2}}'; }md-input-container.md-THEME_NAME-theme .md-input-messages-animation, md-input-container.md-THEME_NAME-theme .md-input-message-animation {  color: '{{warn-A700}}'; }  md-input-container.md-THEME_NAME-theme .md-input-messages-animation .md-char-counter, md-input-container.md-THEME_NAME-theme .md-input-message-animation .md-char-counter {    color: '{{foreground-1}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-has-value label {  color: '{{foreground-2}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused .md-input, md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-resized .md-input {  border-color: '{{primary-color}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused label {  color: '{{primary-color}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused md-icon {  color: '{{primary-color}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused.md-accent .md-input {  border-color: '{{accent-color}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused.md-accent label {  color: '{{accent-color}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused.md-warn .md-input {  border-color: '{{warn-A700}}'; }md-input-container.md-THEME_NAME-theme:not(.md-input-invalid).md-input-focused.md-warn label {  color: '{{warn-A700}}'; }md-input-container.md-THEME_NAME-theme.md-input-invalid .md-input {  border-color: '{{warn-A700}}'; }md-input-container.md-THEME_NAME-theme.md-input-invalid label {  color: '{{warn-A700}}'; }md-input-container.md-THEME_NAME-theme.md-input-invalid .md-input-message-animation, md-input-container.md-THEME_NAME-theme.md-input-invalid .md-char-counter {  color: '{{warn-A700}}'; }md-input-container.md-THEME_NAME-theme .md-input[disabled],[disabled] md-input-container.md-THEME_NAME-theme .md-input {  border-bottom-color: transparent;  color: '{{foreground-3}}';  background-image: linear-gradient(to right, \"{{foreground-3}}\" 0%, \"{{foreground-3}}\" 33%, transparent 0%);  background-image: -ms-linear-gradient(left, transparent 0%, \"{{foreground-3}}\" 100%); }md-list.md-THEME_NAME-theme md-list-item.md-2-line .md-list-item-text h3, md-list.md-THEME_NAME-theme md-list-item.md-2-line .md-list-item-text h4,md-list.md-THEME_NAME-theme md-list-item.md-3-line .md-list-item-text h3,md-list.md-THEME_NAME-theme md-list-item.md-3-line .md-list-item-text h4 {  color: '{{foreground-1}}'; }md-list.md-THEME_NAME-theme md-list-item.md-2-line .md-list-item-text p,md-list.md-THEME_NAME-theme md-list-item.md-3-line .md-list-item-text p {  color: '{{foreground-2}}'; }md-list.md-THEME_NAME-theme ._md-proxy-focus.md-focused div._md-no-style {  background-color: '{{background-100}}'; }md-list.md-THEME_NAME-theme md-list-item .md-avatar-icon {  background-color: '{{foreground-3}}';  color: '{{background-color}}'; }md-list.md-THEME_NAME-theme md-list-item > md-icon {  color: '{{foreground-2}}'; }  md-list.md-THEME_NAME-theme md-list-item > md-icon.md-highlight {    color: '{{primary-color}}'; }    md-list.md-THEME_NAME-theme md-list-item > md-icon.md-highlight.md-accent {      color: '{{accent-color}}'; }md-menu-content.md-THEME_NAME-theme {  background-color: '{{background-A100}}'; }  md-menu-content.md-THEME_NAME-theme md-menu-item {    color: '{{background-A200-0.87}}'; }    md-menu-content.md-THEME_NAME-theme md-menu-item md-icon {      color: '{{background-A200-0.54}}'; }    md-menu-content.md-THEME_NAME-theme md-menu-item .md-button[disabled] {      color: '{{background-A200-0.25}}'; }      md-menu-content.md-THEME_NAME-theme md-menu-item .md-button[disabled] md-icon {        color: '{{background-A200-0.25}}'; }  md-menu-content.md-THEME_NAME-theme md-menu-divider {    background-color: '{{background-A200-0.11}}'; }md-menu-bar.md-THEME_NAME-theme > button.md-button {  color: '{{foreground-2}}';  border-radius: 2px; }md-menu-bar.md-THEME_NAME-theme md-menu._md-open > button, md-menu-bar.md-THEME_NAME-theme md-menu > button:focus {  outline: none;  background: '{{background-200}}'; }md-menu-bar.md-THEME_NAME-theme._md-open:not(._md-keyboard-mode) md-menu:hover > button {  background-color: '{{ background-500-0.2}}'; }md-menu-bar.md-THEME_NAME-theme:not(._md-keyboard-mode):not(._md-open) md-menu button:hover,md-menu-bar.md-THEME_NAME-theme:not(._md-keyboard-mode):not(._md-open) md-menu button:focus {  background: transparent; }md-menu-content.md-THEME_NAME-theme .md-menu > .md-button:after {  color: '{{background-A200-0.54}}'; }md-menu-content.md-THEME_NAME-theme .md-menu._md-open > .md-button {  background-color: '{{ background-500-0.2}}'; }md-toolbar.md-THEME_NAME-theme.md-menu-toolbar {  background-color: '{{background-A100}}';  color: '{{background-A200}}'; }  md-toolbar.md-THEME_NAME-theme.md-menu-toolbar md-toolbar-filler {    background-color: '{{primary-color}}';    color: '{{background-A100-0.87}}'; }    md-toolbar.md-THEME_NAME-theme.md-menu-toolbar md-toolbar-filler md-icon {      color: '{{background-A100-0.87}}'; }md-nav-bar.md-THEME_NAME-theme .md-nav-bar {  background-color: transparent;  border-color: '{{foreground-4}}'; }md-nav-bar.md-THEME_NAME-theme .md-button._md-nav-button.md-unselected {  color: '{{foreground-2}}'; }md-nav-bar.md-THEME_NAME-theme md-nav-ink-bar {  color: '{{accent-color}}';  background: '{{accent-color}}'; }.md-panel {  background-color: '{{background-900-0.0}}'; }  .md-panel._md-panel-backdrop.md-THEME_NAME-theme {    background-color: '{{background-900-1.0}}'; }md-progress-circular.md-THEME_NAME-theme path {  stroke: '{{primary-color}}'; }md-progress-circular.md-THEME_NAME-theme.md-warn path {  stroke: '{{warn-color}}'; }md-progress-circular.md-THEME_NAME-theme.md-accent path {  stroke: '{{accent-color}}'; }md-progress-linear.md-THEME_NAME-theme ._md-container {  background-color: '{{primary-100}}'; }md-progress-linear.md-THEME_NAME-theme ._md-bar {  background-color: '{{primary-color}}'; }md-progress-linear.md-THEME_NAME-theme.md-warn ._md-container {  background-color: '{{warn-100}}'; }md-progress-linear.md-THEME_NAME-theme.md-warn ._md-bar {  background-color: '{{warn-color}}'; }md-progress-linear.md-THEME_NAME-theme.md-accent ._md-container {  background-color: '{{accent-A100}}'; }md-progress-linear.md-THEME_NAME-theme.md-accent ._md-bar {  background-color: '{{accent-color}}'; }md-progress-linear.md-THEME_NAME-theme[md-mode=buffer].md-warn ._md-bar1 {  background-color: '{{warn-100}}'; }md-progress-linear.md-THEME_NAME-theme[md-mode=buffer].md-warn ._md-dashed:before {  background: radial-gradient(\"{{warn-100}}\" 0%, \"{{warn-100}}\" 16%, transparent 42%); }md-progress-linear.md-THEME_NAME-theme[md-mode=buffer].md-accent ._md-bar1 {  background-color: '{{accent-A100}}'; }md-progress-linear.md-THEME_NAME-theme[md-mode=buffer].md-accent ._md-dashed:before {  background: radial-gradient(\"{{accent-A100}}\" 0%, \"{{accent-A100}}\" 16%, transparent 42%); }md-radio-button.md-THEME_NAME-theme ._md-off {  border-color: '{{foreground-2}}'; }md-radio-button.md-THEME_NAME-theme ._md-on {  background-color: '{{accent-color-0.87}}'; }md-radio-button.md-THEME_NAME-theme.md-checked ._md-off {  border-color: '{{accent-color-0.87}}'; }md-radio-button.md-THEME_NAME-theme.md-checked .md-ink-ripple {  color: '{{accent-color-0.87}}'; }md-radio-button.md-THEME_NAME-theme ._md-container .md-ripple {  color: '{{accent-A700}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-primary ._md-on, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-primary ._md-on,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-primary ._md-on,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-primary ._md-on {  background-color: '{{primary-color-0.87}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-primary .md-checked ._md-off, md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-primary.md-checked ._md-off, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-primary .md-checked ._md-off, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-primary .md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-primary.md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-primary .md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked ._md-off {  border-color: '{{primary-color-0.87}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-primary .md-checked .md-ink-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-primary.md-checked .md-ink-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-primary .md-checked .md-ink-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-primary .md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-primary.md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-primary .md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-primary.md-checked .md-ink-ripple {  color: '{{primary-color-0.87}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-primary ._md-container .md-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-primary ._md-container .md-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-primary ._md-container .md-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-primary ._md-container .md-ripple {  color: '{{primary-600}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-warn ._md-on, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-warn ._md-on,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-warn ._md-on,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-warn ._md-on {  background-color: '{{warn-color-0.87}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-warn .md-checked ._md-off, md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-warn.md-checked ._md-off, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-warn .md-checked ._md-off, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-warn .md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-warn.md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-warn .md-checked ._md-off,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked ._md-off {  border-color: '{{warn-color-0.87}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-warn .md-checked .md-ink-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-warn.md-checked .md-ink-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-warn .md-checked .md-ink-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-warn .md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-warn.md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-warn .md-checked .md-ink-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-warn.md-checked .md-ink-ripple {  color: '{{warn-color-0.87}}'; }md-radio-group.md-THEME_NAME-theme:not([disabled]) .md-warn ._md-container .md-ripple, md-radio-group.md-THEME_NAME-theme:not([disabled]).md-warn ._md-container .md-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]) .md-warn ._md-container .md-ripple,md-radio-button.md-THEME_NAME-theme:not([disabled]).md-warn ._md-container .md-ripple {  color: '{{warn-600}}'; }md-radio-group.md-THEME_NAME-theme[disabled],md-radio-button.md-THEME_NAME-theme[disabled] {  color: '{{foreground-3}}'; }  md-radio-group.md-THEME_NAME-theme[disabled] ._md-container ._md-off,  md-radio-button.md-THEME_NAME-theme[disabled] ._md-container ._md-off {    border-color: '{{foreground-3}}'; }  md-radio-group.md-THEME_NAME-theme[disabled] ._md-container ._md-on,  md-radio-button.md-THEME_NAME-theme[disabled] ._md-container ._md-on {    border-color: '{{foreground-3}}'; }md-radio-group.md-THEME_NAME-theme .md-checked .md-ink-ripple {  color: '{{accent-color-0.26}}'; }md-radio-group.md-THEME_NAME-theme.md-primary .md-checked:not([disabled]) .md-ink-ripple, md-radio-group.md-THEME_NAME-theme .md-checked:not([disabled]).md-primary .md-ink-ripple {  color: '{{primary-color-0.26}}'; }md-radio-group.md-THEME_NAME-theme .md-checked.md-primary .md-ink-ripple {  color: '{{warn-color-0.26}}'; }md-radio-group.md-THEME_NAME-theme.md-focused:not(:empty) .md-checked ._md-container:before {  background-color: '{{accent-color-0.26}}'; }md-radio-group.md-THEME_NAME-theme.md-focused:not(:empty).md-primary .md-checked ._md-container:before,md-radio-group.md-THEME_NAME-theme.md-focused:not(:empty) .md-checked.md-primary ._md-container:before {  background-color: '{{primary-color-0.26}}'; }md-radio-group.md-THEME_NAME-theme.md-focused:not(:empty).md-warn .md-checked ._md-container:before,md-radio-group.md-THEME_NAME-theme.md-focused:not(:empty) .md-checked.md-warn ._md-container:before {  background-color: '{{warn-color-0.26}}'; }md-input-container.md-input-focused:not(.md-input-has-value) md-select.md-THEME_NAME-theme ._md-select-value {  color: '{{primary-color}}'; }  md-input-container.md-input-focused:not(.md-input-has-value) md-select.md-THEME_NAME-theme ._md-select-value._md-select-placeholder {    color: '{{primary-color}}'; }md-input-container.md-input-invalid md-select.md-THEME_NAME-theme ._md-select-value {  color: '{{warn-A700}}' !important;  border-bottom-color: '{{warn-A700}}' !important; }md-input-container.md-input-invalid md-select.md-THEME_NAME-theme.md-no-underline ._md-select-value {  border-bottom-color: transparent !important; }md-select.md-THEME_NAME-theme[disabled] ._md-select-value {  border-bottom-color: transparent;  background-image: linear-gradient(to right, \"{{foreground-3}}\" 0%, \"{{foreground-3}}\" 33%, transparent 0%);  background-image: -ms-linear-gradient(left, transparent 0%, \"{{foreground-3}}\" 100%); }md-select.md-THEME_NAME-theme ._md-select-value {  border-bottom-color: '{{foreground-4}}'; }  md-select.md-THEME_NAME-theme ._md-select-value._md-select-placeholder {    color: '{{foreground-3}}'; }md-select.md-THEME_NAME-theme.md-no-underline ._md-select-value {  border-bottom-color: transparent !important; }md-select.md-THEME_NAME-theme.ng-invalid.ng-touched ._md-select-value {  color: '{{warn-A700}}' !important;  border-bottom-color: '{{warn-A700}}' !important; }md-select.md-THEME_NAME-theme.ng-invalid.ng-touched.md-no-underline ._md-select-value {  border-bottom-color: transparent !important; }md-select.md-THEME_NAME-theme:not([disabled]):focus ._md-select-value {  border-bottom-color: '{{primary-color}}';  color: '{{ foreground-1 }}'; }  md-select.md-THEME_NAME-theme:not([disabled]):focus ._md-select-value._md-select-placeholder {    color: '{{ foreground-1 }}'; }md-select.md-THEME_NAME-theme:not([disabled]):focus.md-no-underline ._md-select-value {  border-bottom-color: transparent !important; }md-select.md-THEME_NAME-theme:not([disabled]):focus.md-accent ._md-select-value {  border-bottom-color: '{{accent-color}}'; }md-select.md-THEME_NAME-theme:not([disabled]):focus.md-warn ._md-select-value {  border-bottom-color: '{{warn-color}}'; }md-select.md-THEME_NAME-theme[disabled] ._md-select-value {  color: '{{foreground-3}}'; }  md-select.md-THEME_NAME-theme[disabled] ._md-select-value._md-select-placeholder {    color: '{{foreground-3}}'; }md-select-menu.md-THEME_NAME-theme md-content {  background: '{{background-A100}}'; }  md-select-menu.md-THEME_NAME-theme md-content md-optgroup {    color: '{{background-600-0.87}}'; }  md-select-menu.md-THEME_NAME-theme md-content md-option {    color: '{{background-900-0.87}}'; }    md-select-menu.md-THEME_NAME-theme md-content md-option[disabled] ._md-text {      color: '{{background-400-0.87}}'; }    md-select-menu.md-THEME_NAME-theme md-content md-option:not([disabled]):focus, md-select-menu.md-THEME_NAME-theme md-content md-option:not([disabled]):hover {      background: '{{background-200}}'; }    md-select-menu.md-THEME_NAME-theme md-content md-option[selected] {      color: '{{primary-500}}'; }      md-select-menu.md-THEME_NAME-theme md-content md-option[selected]:focus {        color: '{{primary-600}}'; }      md-select-menu.md-THEME_NAME-theme md-content md-option[selected].md-accent {        color: '{{accent-color}}'; }        md-select-menu.md-THEME_NAME-theme md-content md-option[selected].md-accent:focus {          color: '{{accent-A700}}'; }._md-checkbox-enabled.md-THEME_NAME-theme .md-ripple {  color: '{{primary-600}}'; }._md-checkbox-enabled.md-THEME_NAME-theme[selected] .md-ripple {  color: '{{background-600}}'; }._md-checkbox-enabled.md-THEME_NAME-theme .md-ink-ripple {  color: '{{foreground-2}}'; }._md-checkbox-enabled.md-THEME_NAME-theme[selected] .md-ink-ripple {  color: '{{primary-color-0.87}}'; }._md-checkbox-enabled.md-THEME_NAME-theme ._md-icon {  border-color: '{{foreground-2}}'; }._md-checkbox-enabled.md-THEME_NAME-theme[selected] ._md-icon {  background-color: '{{primary-color-0.87}}'; }._md-checkbox-enabled.md-THEME_NAME-theme[selected].md-focused ._md-container:before {  background-color: '{{primary-color-0.26}}'; }._md-checkbox-enabled.md-THEME_NAME-theme[selected] ._md-icon:after {  border-color: '{{primary-contrast-0.87}}'; }._md-checkbox-enabled.md-THEME_NAME-theme .md-indeterminate[disabled] ._md-container {  color: '{{foreground-3}}'; }._md-checkbox-enabled.md-THEME_NAME-theme md-option ._md-text {  color: '{{background-900-0.87}}'; }md-sidenav.md-THEME_NAME-theme, md-sidenav.md-THEME_NAME-theme md-content {  background-color: '{{background-hue-1}}'; }md-slider.md-THEME_NAME-theme ._md-track {  background-color: '{{foreground-3}}'; }md-slider.md-THEME_NAME-theme ._md-track-ticks {  color: '{{background-contrast}}'; }md-slider.md-THEME_NAME-theme ._md-focus-ring {  background-color: '{{accent-A200-0.2}}'; }md-slider.md-THEME_NAME-theme ._md-disabled-thumb {  border-color: '{{background-color}}';  background-color: '{{background-color}}'; }md-slider.md-THEME_NAME-theme._md-min ._md-thumb:after {  background-color: '{{background-color}}';  border-color: '{{foreground-3}}'; }md-slider.md-THEME_NAME-theme._md-min ._md-focus-ring {  background-color: '{{foreground-3-0.38}}'; }md-slider.md-THEME_NAME-theme._md-min[md-discrete] ._md-thumb:after {  background-color: '{{background-contrast}}';  border-color: transparent; }md-slider.md-THEME_NAME-theme._md-min[md-discrete] ._md-sign {  background-color: '{{background-400}}'; }  md-slider.md-THEME_NAME-theme._md-min[md-discrete] ._md-sign:after {    border-top-color: '{{background-400}}'; }md-slider.md-THEME_NAME-theme._md-min[md-discrete][md-vertical] ._md-sign:after {  border-top-color: transparent;  border-left-color: '{{background-400}}'; }md-slider.md-THEME_NAME-theme ._md-track._md-track-fill {  background-color: '{{accent-color}}'; }md-slider.md-THEME_NAME-theme ._md-thumb:after {  border-color: '{{accent-color}}';  background-color: '{{accent-color}}'; }md-slider.md-THEME_NAME-theme ._md-sign {  background-color: '{{accent-color}}'; }  md-slider.md-THEME_NAME-theme ._md-sign:after {    border-top-color: '{{accent-color}}'; }md-slider.md-THEME_NAME-theme[md-vertical] ._md-sign:after {  border-top-color: transparent;  border-left-color: '{{accent-color}}'; }md-slider.md-THEME_NAME-theme ._md-thumb-text {  color: '{{accent-contrast}}'; }md-slider.md-THEME_NAME-theme.md-warn ._md-focus-ring {  background-color: '{{warn-200-0.38}}'; }md-slider.md-THEME_NAME-theme.md-warn ._md-track._md-track-fill {  background-color: '{{warn-color}}'; }md-slider.md-THEME_NAME-theme.md-warn ._md-thumb:after {  border-color: '{{warn-color}}';  background-color: '{{warn-color}}'; }md-slider.md-THEME_NAME-theme.md-warn ._md-sign {  background-color: '{{warn-color}}'; }  md-slider.md-THEME_NAME-theme.md-warn ._md-sign:after {    border-top-color: '{{warn-color}}'; }md-slider.md-THEME_NAME-theme.md-warn[md-vertical] ._md-sign:after {  border-top-color: transparent;  border-left-color: '{{warn-color}}'; }md-slider.md-THEME_NAME-theme.md-warn ._md-thumb-text {  color: '{{warn-contrast}}'; }md-slider.md-THEME_NAME-theme.md-primary ._md-focus-ring {  background-color: '{{primary-200-0.38}}'; }md-slider.md-THEME_NAME-theme.md-primary ._md-track._md-track-fill {  background-color: '{{primary-color}}'; }md-slider.md-THEME_NAME-theme.md-primary ._md-thumb:after {  border-color: '{{primary-color}}';  background-color: '{{primary-color}}'; }md-slider.md-THEME_NAME-theme.md-primary ._md-sign {  background-color: '{{primary-color}}'; }  md-slider.md-THEME_NAME-theme.md-primary ._md-sign:after {    border-top-color: '{{primary-color}}'; }md-slider.md-THEME_NAME-theme.md-primary[md-vertical] ._md-sign:after {  border-top-color: transparent;  border-left-color: '{{primary-color}}'; }md-slider.md-THEME_NAME-theme.md-primary ._md-thumb-text {  color: '{{primary-contrast}}'; }md-slider.md-THEME_NAME-theme[disabled] ._md-thumb:after {  border-color: transparent; }md-slider.md-THEME_NAME-theme[disabled]:not(._md-min) ._md-thumb:after, md-slider.md-THEME_NAME-theme[disabled][md-discrete] ._md-thumb:after {  background-color: '{{foreground-3}}';  border-color: transparent; }md-slider.md-THEME_NAME-theme[disabled][readonly] ._md-sign {  background-color: '{{background-400}}'; }  md-slider.md-THEME_NAME-theme[disabled][readonly] ._md-sign:after {    border-top-color: '{{background-400}}'; }md-slider.md-THEME_NAME-theme[disabled][readonly][md-vertical] ._md-sign:after {  border-top-color: transparent;  border-left-color: '{{background-400}}'; }md-slider.md-THEME_NAME-theme[disabled][readonly] ._md-disabled-thumb {  border-color: transparent;  background-color: transparent; }md-slider-container[disabled] > *:first-child:not(md-slider),md-slider-container[disabled] > *:last-child:not(md-slider) {  color: '{{foreground-3}}'; }.md-subheader.md-THEME_NAME-theme {  color: '{{ foreground-2-0.23 }}';  background-color: '{{background-default}}'; }  .md-subheader.md-THEME_NAME-theme.md-primary {    color: '{{primary-color}}'; }  .md-subheader.md-THEME_NAME-theme.md-accent {    color: '{{accent-color}}'; }  .md-subheader.md-THEME_NAME-theme.md-warn {    color: '{{warn-color}}'; }md-switch.md-THEME_NAME-theme .md-ink-ripple {  color: '{{background-500}}'; }md-switch.md-THEME_NAME-theme ._md-thumb {  background-color: '{{background-50}}'; }md-switch.md-THEME_NAME-theme ._md-bar {  background-color: '{{background-500}}'; }md-switch.md-THEME_NAME-theme.md-checked .md-ink-ripple {  color: '{{accent-color}}'; }md-switch.md-THEME_NAME-theme.md-checked ._md-thumb {  background-color: '{{accent-color}}'; }md-switch.md-THEME_NAME-theme.md-checked ._md-bar {  background-color: '{{accent-color-0.5}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-focused ._md-thumb:before {  background-color: '{{accent-color-0.26}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-primary .md-ink-ripple {  color: '{{primary-color}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-primary ._md-thumb {  background-color: '{{primary-color}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-primary ._md-bar {  background-color: '{{primary-color-0.5}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-primary.md-focused ._md-thumb:before {  background-color: '{{primary-color-0.26}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-warn .md-ink-ripple {  color: '{{warn-color}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-warn ._md-thumb {  background-color: '{{warn-color}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-warn ._md-bar {  background-color: '{{warn-color-0.5}}'; }md-switch.md-THEME_NAME-theme.md-checked.md-warn.md-focused ._md-thumb:before {  background-color: '{{warn-color-0.26}}'; }md-switch.md-THEME_NAME-theme[disabled] ._md-thumb {  background-color: '{{background-400}}'; }md-switch.md-THEME_NAME-theme[disabled] ._md-bar {  background-color: '{{foreground-4}}'; }md-tabs.md-THEME_NAME-theme md-tabs-wrapper {  background-color: transparent;  border-color: '{{foreground-4}}'; }md-tabs.md-THEME_NAME-theme .md-paginator md-icon {  color: '{{primary-color}}'; }md-tabs.md-THEME_NAME-theme md-ink-bar {  color: '{{accent-color}}';  background: '{{accent-color}}'; }md-tabs.md-THEME_NAME-theme .md-tab {  color: '{{foreground-2}}'; }  md-tabs.md-THEME_NAME-theme .md-tab[disabled], md-tabs.md-THEME_NAME-theme .md-tab[disabled] md-icon {    color: '{{foreground-3}}'; }  md-tabs.md-THEME_NAME-theme .md-tab.md-active, md-tabs.md-THEME_NAME-theme .md-tab.md-active md-icon, md-tabs.md-THEME_NAME-theme .md-tab.md-focused, md-tabs.md-THEME_NAME-theme .md-tab.md-focused md-icon {    color: '{{primary-color}}'; }  md-tabs.md-THEME_NAME-theme .md-tab.md-focused {    background: '{{primary-color-0.1}}'; }  md-tabs.md-THEME_NAME-theme .md-tab .md-ripple-container {    color: '{{accent-A100}}'; }md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper {  background-color: '{{accent-color}}'; }  md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]) {    color: '{{accent-A100}}'; }    md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active, md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active md-icon, md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused, md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused md-icon {      color: '{{accent-contrast}}'; }    md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused {      background: '{{accent-contrast-0.1}}'; }  md-tabs.md-THEME_NAME-theme.md-accent > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-ink-bar {    color: '{{primary-600-1}}';    background: '{{primary-600-1}}'; }md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper {  background-color: '{{primary-color}}'; }  md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]) {    color: '{{primary-100}}'; }    md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active, md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active md-icon, md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused, md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused md-icon {      color: '{{primary-contrast}}'; }    md-tabs.md-THEME_NAME-theme.md-primary > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused {      background: '{{primary-contrast-0.1}}'; }md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper {  background-color: '{{warn-color}}'; }  md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]) {    color: '{{warn-100}}'; }    md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active, md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active md-icon, md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused, md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused md-icon {      color: '{{warn-contrast}}'; }    md-tabs.md-THEME_NAME-theme.md-warn > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused {      background: '{{warn-contrast-0.1}}'; }md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper {  background-color: '{{primary-color}}'; }  md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]) {    color: '{{primary-100}}'; }    md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active, md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active md-icon, md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused, md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused md-icon {      color: '{{primary-contrast}}'; }    md-toolbar > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused {      background: '{{primary-contrast-0.1}}'; }md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper {  background-color: '{{accent-color}}'; }  md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]) {    color: '{{accent-A100}}'; }    md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active, md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active md-icon, md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused, md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused md-icon {      color: '{{accent-contrast}}'; }    md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused {      background: '{{accent-contrast-0.1}}'; }  md-toolbar.md-accent > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-ink-bar {    color: '{{primary-600-1}}';    background: '{{primary-600-1}}'; }md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper {  background-color: '{{warn-color}}'; }  md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]) {    color: '{{warn-100}}'; }    md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active, md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-active md-icon, md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused, md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused md-icon {      color: '{{warn-contrast}}'; }    md-toolbar.md-warn > md-tabs.md-THEME_NAME-theme > md-tabs-wrapper > md-tabs-canvas > md-pagination-wrapper > md-tab-item:not([disabled]).md-focused {      background: '{{warn-contrast-0.1}}'; }md-toast.md-THEME_NAME-theme .md-toast-content {  background-color: #323232;  color: '{{background-50}}'; }  md-toast.md-THEME_NAME-theme .md-toast-content .md-button {    color: '{{background-50}}'; }    md-toast.md-THEME_NAME-theme .md-toast-content .md-button.md-highlight {      color: '{{accent-color}}'; }      md-toast.md-THEME_NAME-theme .md-toast-content .md-button.md-highlight.md-primary {        color: '{{primary-color}}'; }      md-toast.md-THEME_NAME-theme .md-toast-content .md-button.md-highlight.md-warn {        color: '{{warn-color}}'; }md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar) {  background-color: '{{primary-color}}';  color: '{{primary-contrast}}'; }  md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar) md-icon {    color: '{{primary-contrast}}';    fill: '{{primary-contrast}}'; }  md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar) .md-button[disabled] md-icon {    color: '{{primary-contrast-0.26}}';    fill: '{{primary-contrast-0.26}}'; }  md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar).md-accent {    background-color: '{{accent-color}}';    color: '{{accent-contrast}}'; }    md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar).md-accent .md-ink-ripple {      color: '{{accent-contrast}}'; }    md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar).md-accent md-icon {      color: '{{accent-contrast}}';      fill: '{{accent-contrast}}'; }    md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar).md-accent .md-button[disabled] md-icon {      color: '{{accent-contrast-0.26}}';      fill: '{{accent-contrast-0.26}}'; }  md-toolbar.md-THEME_NAME-theme:not(.md-menu-toolbar).md-warn {    background-color: '{{warn-color}}';    color: '{{warn-contrast}}'; }md-tooltip.md-THEME_NAME-theme {  color: '{{background-A100}}'; }  md-tooltip.md-THEME_NAME-theme ._md-content {    background-color: '{{foreground-2}}'; }"); 
})();


})(window, window.angular);