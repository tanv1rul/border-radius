(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.ResizableTable = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class ResizableTable {
        constructor(targetElementOrSelector, options) {
            this.options = Object.assign({}, { forceFixedLayout: true, minColumnWidth: 20 }, options);
        /**
         * @param {string|HTMLTableElement} targetElementOrSelector - The table element or its selector.
         * @param {object} [options] - Optional configuration.
         * @param {number} [options.resizeUpdateInterval=0] - Interval in ms to throttle resize updates during drag. 0 for no throttling (uses rAF).
         * @param {boolean} [options.deferDomWrites=false] - If true, attempts to defer DOM write operations (setting column width) using `requestIdleCallback`. Experimental.
         */
            this.isInitialized = false;
            this.isResizing = false;
            this.startX = 0;
            this.currentColumnIndex = -1;
            this.currentHeaderCellIndex = -1; // Added in previous step
            this.startWidth = 0;
            this.rafPending = false;
            this.lastMouseX = 0;
            this.collapsedColumns = {};
            this.isTouchEvent = false;

            this.options = Object.assign({}, {
                resizeUpdateInterval: 0, // Default to no throttling
                deferDomWrites: false // Default to synchronous DOM writes
            }, options);

            this.lastResizeUpdateTime = 0; // For throttling

            let tableElement;

            if (typeof targetElementOrSelector === 'string') {
                tableElement = document.querySelector(targetElementOrSelector);
                if (!tableElement) {
                    throw new Error(`ResizableTable: Target element not found for selector: ${targetElementOrSelector}`);
                }
            } else {
                tableElement = targetElementOrSelector;
            }

            if (!(tableElement instanceof HTMLTableElement)) {
                throw new Error('ResizableTable: Target element is not a <table>.');
            }

            this.table = tableElement;
            this.init();

            this._onMouseDown = this._onMouseDown.bind(this);
            // _onMouseMove and _onMouseUp will be replaced by _onDragMoveWrapper and _onDragEndWrapper
            // this._onMouseMove = this._onMouseMove.bind(this);
            // this._onMouseUp = this._onMouseUp.bind(this);
            this._onCollapseToggle = this._onCollapseToggle.bind(this);

            this._onTouchStart = this._onTouchStart.bind(this);
            this._onDragStart = this._onDragStart.bind(this);
            this._onDragMoveWrapper = this._onDragMoveWrapper.bind(this);
            this._onDragEndWrapper = this._onDragEndWrapper.bind(this);
            this._throttledUpdate = this._throttledUpdate.bind(this); // Bind new method
        }

        init() {
            if (this.isInitialized) {
                console.warn('ResizableTable: Already initialized.');
                return;
            }

            const head = this.table.tHead;
            if (!head || head.rows.length === 0) {
                throw new Error("ResizableTable: <table> must have a <thead> section with at least one row.");
            }

            this.headerRow = head.rows[0];
            // The check above ensures headerRow is now always assigned from a valid thead.
            // The following check for !this.headerRow is technically redundant if the above logic is sound,
            // but kept for safety, though it should ideally never be triggered.
            if (!this.headerRow) {
                // This case should ideally not be reached if the previous logic is correct.
                // If it is, it implies an unexpected state (e.g. tHead exists but tHead.rows[0] is nullish).
                console.error("ResizableTable: Critical error - Header row could not be determined despite checks.");
                return; // Abort initialization
            }

            const headerCells = Array.from(this.headerRow.cells);
            this.columnCount = headerCells.length;

            if (this.columnCount === 0) { // this.headerRow is guaranteed by this point
                // Throw an error to abort initialization, as a table with no header columns is not usable.
                throw new Error("ResizableTable: No columns (th elements) found in the header row. Initialization aborted.");
            }

            this.table.style.tableLayout = 'fixed';

            // Attempt to apply overflow-x: auto to parent element
            const parentEl = this.table.parentNode;
            if (parentEl && parentEl instanceof HTMLElement) {
                const parentStyles = window.getComputedStyle(parentEl);
                const currentOverflowX = parentStyles.overflowX;

                if (currentOverflowX === 'visible' || currentOverflowX === 'initial' || currentOverflowX === 'unset') {
                    parentEl.style.overflowX = 'auto';
                    console.log(`ResizableTable: Applied overflow-x: auto; to parent element of table '${this.table.id || '[no id]'}':`, parentEl);
                } else {
                    console.warn(`ResizableTable: Parent element of table '${this.table.id || '[no id]'}' already has overflow-x: ${currentOverflowX}. Plugin will not override.`, parentEl);
                }
            } else {
                console.warn(`ResizableTable: Could not apply overflow-x to parent of table '${this.table.id || '[no id]}'. Parent element not found or not an HTMLElement.`, parentEl);
            }

            this.columnWidths = [];

            // Initialize column widths based on their current computed styles
            // This entire block is critical for basic setup.
            try {
                // Note: headerCells is already defined above. No need to redefine.
                headerCells.forEach((cell, index) => {
                    // Each cell's width calculation is critical. If one fails,
                    // the overall layout might be compromised.
                    // The individual try-catch within the loop is removed in favor of catching at this higher level.
                    const computedWidth = window.getComputedStyle(cell).width;
                    const parsedWidth = parseFloat(computedWidth);
                    if (isNaN(parsedWidth) || parsedWidth < 0) {
                        // Log the problematic value and throw to indicate critical failure.
                        console.error(`ResizableTable: Invalid computed width "${computedWidth}" (parsed as ${parsedWidth}) for column ${index}.`);
                        throw new Error(`ResizableTable: Failed to parse valid width for column ${index}.`);
                    }
                    this.columnWidths[index] = parsedWidth;
                    cell.style.width = parsedWidth + 'px';
                    // console.log(`ResizableTable: Column ${index} - Initial computed width: ${computedWidth}, Set width: ${cell.style.width}`);
                });
            } catch (error) {
                // If any error occurs during the critical width initialization, log it and re-throw to abort.
                console.error("ResizableTable: Critical error during initial column width calculation. Initialization aborted.", error);
                // Re-throw the original error or a new one to ensure initialization stops.
                throw new Error("ResizableTable: Failed to initialize column widths. " + (error.message || ""));
            }

            this._createResizeHandles();
            this._createCollapseToggles();
            this.isInitialized = true;
        }

        _createResizeHandles() {
            if (!this.headerRow) {
                console.error("ResizableTable: Cannot create resize handles, header row not found.");
                return;
            }

            try {
                const headerCells = Array.from(this.headerRow.cells);
                this.resizeHandles = [];
                let currentActualColumnIndex = 0; // Tracks the actual column index considering colspans

                headerCells.forEach((th, index) => {
                    try {
                        const rSpan = th.rowSpan;
                        const cSpan = th.colSpan;

                        if (rSpan > 1) {
                            console.warn(`ResizableTable: Header cell at index ${index} ("${th.textContent.trim()}") has rowspan="${rSpan}". While the resize handle will match the cell's height, resizing columns with rowspan may cause layout misalignments in other rows. Full rowspan support is not yet implemented.`);
                        }
                        if (cSpan > 1) {
                            console.warn(`ResizableTable: Header cell at index ${index} ("${th.textContent.trim()}") has colspan="${cSpan}". Resizing columns involved in a colspan may lead to unpredictable behavior or may not work correctly, especially for cells not starting the span. Full colspan support is not yet implemented.`);
                        }

                        // Ensure th has an ID for ARIA attributes
                        if (!th.id) {
                            th.id = `rt-header-${this.table.id || 'table'}-${index}`; // Generate a unique ID if not present
                        }

                        // Ensure the cell is positioned to contain the handle correctly.
                        const cellPosition = window.getComputedStyle(th).position;
                        if (cellPosition === 'static') { // Only override if static, other positions like 'relative', 'absolute', 'fixed' are fine.
                            th.style.position = 'relative';
                        }

                        const handle = document.createElement('div');
                        handle.className = 'rt-resize-handle';
                        handle.dataset.columnIndex = index;

                        // Accessibility attributes for resize handle
                        handle.setAttribute('tabindex', '0');
                        handle.setAttribute('role', 'separator');
                        handle.setAttribute('aria-orientation', 'vertical');
                        handle.setAttribute('aria-controls', th.id);
                        handle.setAttribute('aria-labelledby', th.id); // Assumes th content is the label

                        const currentColumnWidth = this.columnWidths[index] !== undefined ? this.columnWidths[index] : parseFloat(window.getComputedStyle(th).width);
                        handle.setAttribute('aria-valuenow', currentColumnWidth.toFixed(0));
                        handle.setAttribute('aria-valuemin', String(this.options.minColumnWidth));
                        handle.setAttribute('aria-valuetext', `${currentColumnWidth.toFixed(0)} pixels`);

                        // Fundamental positioning and dynamic styles (kept inline)
                        handle.style.position = 'absolute';
                        handle.style.right = '0px';
                        handle.style.top = '0px';
                        handle.style.height = th.offsetHeight + 'px'; // Dynamic
                        handle.style.touchAction = 'none'; // Functional

                        // Styles to be moved to CSS:
                        // handle.style.width = '5px';
                        // handle.style.cursor = 'col-resize';
                        // handle.style.backgroundColor = 'rgba(100, 100, 100, 0.2)';
                        // handle.style.zIndex = '10';

                        handle.addEventListener('mousedown', this._onMouseDown);
                        handle.addEventListener('touchstart', this._onTouchStart, { passive: false });

                        // Define and store the keydown listener for easy removal in destroy
                        handle._rtKeyDownListener = (event) => {
                            // console.log("Resize handle keydown event:", event.key, "on column", index);
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                                event.preventDefault();
                                // Placeholder for actual keyboard resizing logic
                                console.log(`Keyboard resize attempt on column ${index} with ${event.key}. Not implemented.`);
                                // Future: Implement actual keyboard resizing logic here.
                                // This would involve updating the column width, potentially by a fixed step,
                                // and then calling _updateColumnWidth or similar, ensuring ARIA attributes are updated.
                            }
                        };
                        handle.addEventListener('keydown', handle._rtKeyDownListener);

                        th.appendChild(handle);
                        this.resizeHandles[index] = handle;
                        // console.log(`ResizableTable: Created resize handle for column ${index}`);
                    } catch (cellError) {
                        console.error(`ResizableTable: Error creating resize handle for column ${index}. Skipping this handle.`, cellError);
                        // Continue to the next iteration to try and create handles for other columns.
                    }
                });
            } catch (error) {
                // This outer catch handles errors like `this.headerRow.cells` not being iterable,
                // or other unexpected issues outside the loop.
                console.error("ResizableTable: Critical error during resize handles creation process.", error);
                // Depending on severity, might re-throw or ensure isInitialized remains false.
                // For now, just logging, as individual handle errors are caught inside.
            }
        }

        _createCollapseToggles() {
            if (!this.headerRow) {
                console.error("ResizableTable: Cannot create collapse toggles, header row not found.");
                return;
            }

            try {
                const headerCells = Array.from(this.headerRow.cells);
                this.collapseToggles = []; // Initialize if you plan to store them

                headerCells.forEach((th, index) => {
                    try {
                        // Ensure th is relatively positioned (should be by _createResizeHandles, but double check)
                        if (window.getComputedStyle(th).position === 'static') {
                            th.style.position = 'relative';
                            // console.warn(`ResizableTable: Header cell ${index} was static, forced to relative for collapse toggle.`);
                        }

                        // Ensure th has an ID (likely already set by _createResizeHandles, but good practice)
                        if (!th.id) {
                            th.id = `rt-header-${this.table.id || 'table'}-${index}`;
                        }

                        const toggle = document.createElement('button');
                        toggle.className = 'rt-collapse-toggle';
                        toggle.dataset.columnIndex = index;

                        // ARIA attributes for collapse toggle button
                        // Initial state is expanded, so aria-expanded is true unless already collapsed
                        const isCollapsed = this.collapsedColumns[index] === true;
                        toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
                        toggle.setAttribute('aria-controls', th.id);

                        // Minimal inline styles for positioning (as per spec)
                        toggle.style.position = 'absolute';
                        toggle.style.left = '5px';
                        toggle.style.top = '50%';
                        toggle.style.transform = 'translateY(-50%)';
                        // All other styles (background, border, padding, font, color, textAlign, cursor, width, height)
                        // are expected to be handled by external CSS via the '.rt-collapse-toggle' class.

                        // Visual indicators (+/-) are set in _onCollapseToggle and also here for initial state
                        toggle.innerHTML = isCollapsed ? '+' : '-';
                        toggle.title = `Collapse/Expand column ${th.textContent.trim() || index + 1}`;


                        toggle.addEventListener('click', this._onCollapseToggle);

                        th.appendChild(toggle);
                        this.collapseToggles[index] = toggle; // Store by index
                        // console.log(`ResizableTable: Created collapse toggle for column ${index}`);
                    } catch (cellError) {
                        console.error(`ResizableTable: Error creating collapse toggle for column ${index}. Skipping this toggle.`, cellError);
                        // Continue to the next iteration.
                    }
                });
            } catch (error) {
                // This outer catch handles errors like `this.headerRow.cells` not being iterable,
                // or other unexpected issues outside the loop.
                console.error("ResizableTable: Critical error during collapse toggles creation process.", error);
            }
        }

        _onCollapseToggle(event) {
            event.preventDefault();
            event.stopPropagation(); // Crucial to prevent interference

            const toggle = event.currentTarget;
            // The collapse toggle should operate on the visual header cell and its corresponding actual columns.
            // For now, let's assume toggle.dataset.columnIndex refers to the *header cell index*, not the actual column index.
            // This needs to be consistent with how it's set in _createCollapseToggles.
            // Let's verify _createCollapseToggles uses header cell index.
            const headerCellIndex = parseInt(toggle.dataset.columnIndex, 10); // Assuming this is header cell index

            if (isNaN(headerCellIndex)) {
                console.error("ResizableTable: Could not determine header cell index for collapse toggle.", toggle);
                return;
            }

            // TODO: If a cell has colspan, collapsing it should hide all spanned actual columns.
            // This part needs further implementation if a single header cell with colspan is collapsed.
            // For now, the logic might only work correctly for cells with colspan=1.
            // Let's assume for now that columnIndex for collapse refers to the first actual column in a span.
            const columnIndex = headerCellIndex; // This is a simplification for now.
            console.log(`ResizableTable: Collapse toggle clicked for header cell index: ${headerCellIndex}. Corresponding actual column index (simplified): ${columnIndex}`);

            if (isNaN(columnIndex)) {
                console.error("ResizableTable: Could not determine column index for collapse toggle.", toggle);
                return;
            }

            // TODO: Implement actual collapse/expand logic here in a future step.
            // console.log(`ResizableTable: Collapse toggle clicked for column index: ${columnIndex}`);

            const isCurrentlyCollapsed = this.collapsedColumns[columnIndex] === true;
            const newCollapsedState = !isCurrentlyCollapsed;
            this.collapsedColumns[columnIndex] = newCollapsedState;

            const headerCell = this.headerRow.cells[columnIndex];
            const tableRows = Array.from(this.table.rows); // Includes thead, tbody, tfoot rows

            // Resize handle for this column is a child of the header cell and
            // will be hidden/shown automatically when the header cell's display property is changed.
            // Same for the collapse toggle itself, as it's also a child of headerCell.

            if (newCollapsedState) { // Collapsing
                if (headerCell) {
                    // Store the current width before hiding the column, as 'display: none'
                    // can affect an element's computed width or make it unavailable.
                    // This ensures that when expanded, the column returns to its previous visual width.
                    const currentWidth = parseFloat(window.getComputedStyle(headerCell).width);

                    // Check if the current computed width is different from what's already stored
                    // (e.g. from a resize operation or previous collapse).
                    // This avoids redundantly storing the same width or overwriting a user-resized width
                    // with a computed width if they happen to differ subtly due to browser rendering.
                    if (this.columnWidths[columnIndex] === undefined || Math.abs(this.columnWidths[columnIndex] - currentWidth) > 0.5) { // Using a small tolerance for float comparison
                        console.log(`ResizableTable: Storing/updating width ${currentWidth}px for column ${columnIndex} from computed style before collapse. Previous stored: ${this.columnWidths[columnIndex]}`);
                        this.columnWidths[columnIndex] = currentWidth;
                    } else {
                        console.log(`ResizableTable: Width ${this.columnWidths[columnIndex]}px for column ${columnIndex} is already accurately stored. Not re-storing before collapse.`);
                    }
                    headerCell.style.display = 'none';
                }
                tableRows.forEach(row => {
                    if (row.cells && row.cells[columnIndex]) {
                        row.cells[columnIndex].style.display = 'none';
                    }
                });
                event.currentTarget.innerHTML = '+';
                event.currentTarget.setAttribute('aria-expanded', 'false');
                event.currentTarget.title = `Expand column ${headerCell ? headerCell.textContent.trim() : columnIndex + 1}`;
                console.log(`ResizableTable: Column ${columnIndex} collapsed.`);

            } else { // Expanding
                if (headerCell) {
                    headerCell.style.display = ''; // Reverts to default (e.g., 'table-cell')

                    // Restore the stored width after making the column visible again,
                    // ensuring it retains its previous size (either from original layout, resize, or previous collapse).
                    if (typeof this.columnWidths[columnIndex] === 'number') {
                        headerCell.style.width = this.columnWidths[columnIndex] + 'px';
                        // console.log(`ResizableTable: Restored width ${this.columnWidths[columnIndex]}px to column ${columnIndex} after expand.`);
                    } else {
                        // console.log(`ResizableTable: No specific width stored for column ${columnIndex}. Reverting to default/CSS width on expand.`);
                    }
                }
                tableRows.forEach(row => {
                    if (row.cells && row.cells[columnIndex]) {
                        row.cells[columnIndex].style.display = '';
                    }
                });
                event.currentTarget.innerHTML = '-';
                event.currentTarget.setAttribute('aria-expanded', 'true');
                event.currentTarget.title = `Collapse column ${headerCell ? headerCell.textContent.trim() : columnIndex + 1}`;
                console.log(`ResizableTable: Column ${columnIndex} expanded.`);
            }
        }

        _onMouseDown(event) {
            this._onDragStart(event, event.clientX, false);
        }

        _onTouchStart(event) {
            if (event.touches.length > 1) {
                // Ignore multi-touch gestures for resizing
                return;
            }
            // event.preventDefault(); // Already called in _onDragStart if passive:false is respected
            this._onDragStart(event, event.touches[0].clientX, true);
        }

        _onDragStart(event, clientX, isTouchEvent) {
            event.preventDefault();
            // event.stopPropagation(); // Not strictly needed here unless other listeners on handle

            const handle = event.currentTarget;
            const actualColumnIndexToResize = parseInt(handle.dataset.columnIndex, 10); // This is the actual target column
            const headerCellIndex = parseInt(handle.dataset.headerCellIndex, 10); // Original header cell

            if (isNaN(actualColumnIndexToResize)) {
                console.error("ResizableTable: Invalid actual column index from handle.", handle);
                return;
            }
            if (isNaN(headerCellIndex)) {
                console.error("ResizableTable: Invalid header cell index from handle.", handle);
                return;
            }

            this.isTouchEvent = isTouchEvent;
            this.startX = clientX;
            this.lastMouseX = clientX;
            this.currentColumnIndex = actualColumnIndexToResize; // This is the actual column index we are resizing
            this.currentHeaderCellIndex = headerCellIndex; // Keep track of the header cell this handle belongs to

            // Get the TH element that this handle is a child of (which might have a colspan)
            const thWithHandle = this.headerRow.cells[headerCellIndex];
            if (!thWithHandle) {
                console.error(`ResizableTable: DragStart - Could not find header cell (index ${headerCellIndex}) that contains the handle.`);
                return;
            }

            // The startWidth should be the width of the *specific actual column being resized*.
            // This should come from our `this.columnWidths` array.
            if (typeof this.columnWidths[actualColumnIndexToResize] !== 'number' || this.columnWidths[actualColumnIndexToResize] <= 0) {
                // This might happen if initialization of columnWidths for spanned columns was not perfect or resulted in zero/undefined.
                // Fallback to a portion of the thWithHandle's computed width.
                const colSpan = thWithHandle.colSpan || 1;
                const thComputedWidth = parseFloat(window.getComputedStyle(thWithHandle).width);
                this.startWidth = thComputedWidth / colSpan;
                console.warn(`ResizableTable: DragStart - Width for actual column ${actualColumnIndexToResize} was invalid (${this.columnWidths[actualColumnIndexToResize]}). Using proportional width (${this.startWidth.toFixed(2)}px) from header cell ${headerCellIndex} (width ${thComputedWidth.toFixed(2)}px, colspan ${colSpan}).`);
                // Optionally, update columnWidths here if it was really bad
                // this.columnWidths[actualColumnIndexToResize] = this.startWidth;
            } else {
                this.startWidth = this.columnWidths[actualColumnIndexToResize];
            }

            // If the column being resized is the last in a colspan group,
            // the thWithHandle is the cell whose visual width will appear to change.
            // If it's a single column (colspan=1), thWithHandle is also the direct cell.
            console.log(`ResizableTable: DragStart - Target actual column ${actualColumnIndexToResize} (from header cell ${headerCellIndex}, colspan ${thWithHandle.colSpan || 1}). StartX: ${this.startX.toFixed(2)}, StartWidth of actual column: ${this.startWidth.toFixed(2)}px, isTouch: ${this.isTouchEvent}`);
            this.isResizing = true;


            if (this.isTouchEvent) {
                document.addEventListener('touchmove', this._onDragMoveWrapper, { passive: false });
                document.addEventListener('touchend', this._onDragEndWrapper);
                document.addEventListener('touchcancel', this._onDragEndWrapper);
            } else {
                document.addEventListener('mousemove', this._onDragMoveWrapper);
                document.addEventListener('mouseup', this._onDragEndWrapper);
            }
        }

        _onDragMoveWrapper(event) {
            if (!this.isResizing) return;
            // This wrapper will extract clientX and call _onDragMove (new method similar to old _onMouseMove)
            // For now, just call existing _onMouseMove logic and _updateColumnWidth by proxy
            const clientX = this.isTouchEvent ? event.touches[0].clientX : event.clientX;
            this.lastMouseX = clientX; // Always update lastMouseX for _updateColumnWidth to use

            if (this.options.resizeUpdateInterval && this.options.resizeUpdateInterval > 0) {
                // Throttling is enabled.
                const now = Date.now();
                // Check if enough time has passed since the last throttled update.
                if (now - this.lastResizeUpdateTime > this.options.resizeUpdateInterval) {
                    if (!this.rafPending) { // And no rAF is currently pending.
                        this.rafPending = true;
                        // Schedule _throttledUpdate via rAF.
                        // Pass `now` to ensure `lastResizeUpdateTime` is set based on when this decision
                        // to update was made, not when rAF eventually executes.
                        console.log(`ResizableTable: Throttling resize event. Interval: ${this.options.resizeUpdateInterval}ms. Scheduling update.`);
                        requestAnimationFrame(() => this._throttledUpdate(now));
                    }
                }
                // If not enough time has passed, do nothing in this call.
                // The latest `this.lastMouseX` is stored and will be used when the throttle interval allows an update.
            } else {
                // No throttling (or invalid interval), use default rAF behavior for every move event.
                if (!this.rafPending) {
                    this.rafPending = true;
                    requestAnimationFrame(() => {
                        // console.log("ResizableTable: Standard rAF update."); // Optional: for debugging non-throttled path
                        this._updateColumnWidth(); // _updateColumnWidth uses this.lastMouseX
                        this.rafPending = false;
                    });
                }
            }

            if (this.isTouchEvent) { // To prevent scrolling while dragging
                event.preventDefault();
            }
        }

        _onDragEndWrapper(event) {
            if (!this.isResizing) return;
            // This wrapper will call _onDragEnd (new method similar to old _onMouseUp)

            // For now, directly use logic from old _onMouseUp
            this._updateColumnWidth(); // Final update

            const th = this.headerRow.cells[this.currentColumnIndex]; // currentColumnIndex should be valid
            if (th) {
                const finalWidth = parseFloat(th.style.width);
                this.columnWidths[this.currentColumnIndex] = finalWidth;
                console.log(`ResizableTable: DragEnd - Column ${this.currentColumnIndex} finalized width to: ${finalWidth.toFixed(2)}px. Stored: ${this.columnWidths[this.currentColumnIndex].toFixed(2)}px. isTouch: ${this.isTouchEvent}`);
            } else {
                console.warn(`ResizableTable: DragEnd - Could not find header cell for column ${this.currentColumnIndex} to finalize width.`);
            }

            this.isResizing = false;

            if (this.isTouchEvent) {
                document.removeEventListener('touchmove', this._onDragMoveWrapper);
                document.removeEventListener('touchend', this._onDragEndWrapper);
                document.removeEventListener('touchcancel', this._onDragEndWrapper);
            } else {
                document.removeEventListener('mousemove', this._onDragMoveWrapper);
                document.removeEventListener('mouseup', this._onDragEndWrapper);
            }

            // Reset transient properties
            this.startX = 0;
            this.startWidth = 0;
            this.lastMouseX = 0;
            this.currentColumnIndex = -1;
            this.isTouchEvent = false; // Reset touch flag
        }

        // _onMouseMove and _onMouseUp are now effectively replaced by
        // _onDragMoveWrapper, _onDragEndWrapper, and _updateColumnWidth (which was already used by them)

        _throttledUpdate(timestamp) {
            this._updateColumnWidth();
            this.lastResizeUpdateTime = timestamp; // Use the timestamp from when the update was scheduled
            this.rafPending = false;
            console.log(`ResizableTable: _throttledUpdate executed at ${timestamp}`);
        }

        /**
         * Updates the column width in the DOM.
         * Can defer DOM writes using requestIdleCallback if configured and forceSync is false.
         * @param {boolean} [forceSync=false] - If true, forces synchronous DOM updates, bypassing requestIdleCallback.
         */
        _updateColumnWidth(forceSync = false) {
            if (!this.isResizing) return;

            const currentX = this.lastMouseX;
            const deltaX = currentX - this.startX;
            let newActualColumnWidth = this.startWidth + deltaX;

            const minWidth = this.options.minColumnWidth;
            if (newWidth < minWidth) {
                newWidth = minWidth;
            }

            const th = this.headerRow.cells[this.currentColumnIndex];
            if (th) {
                th.style.width = newWidth + 'px';

                // Update ARIA attributes on the corresponding resize handle
                const handle = this.resizeHandles[this.currentColumnIndex]; // Assumes resizeHandles is an array/object keyed by index
                if (handle) {
                    handle.setAttribute('aria-valuenow', newWidth.toFixed(0));
                    handle.setAttribute('aria-valuetext', `${newWidth.toFixed(0)} pixels`);
                }
            }
        }

        destroy() {
            if (!this.isInitialized) {
                // console.info("ResizableTable: Instance not initialized or already destroyed.");
                return;
            }

            // Handle active resizing cleanup
            if (this.isResizing) {
                if (this.isTouchEvent) {
                    document.removeEventListener('touchmove', this._onDragMoveWrapper);
                    document.removeEventListener('touchend', this._onDragEndWrapper);
                    document.removeEventListener('touchcancel', this._onDragEndWrapper);
                } else {
                    document.removeEventListener('mousemove', this._onDragMoveWrapper);
                    document.removeEventListener('mouseup', this._onDragEndWrapper);
                }
                this.isResizing = false;
                // Reset drag-related properties as well for good measure
                this.startX = 0;
                this.startWidth = 0;
                this.lastMouseX = 0;
                this.currentColumnIndex = -1;
                this.isTouchEvent = false;
            }

            // Remove resize handles and their event listeners
            if (this.resizeHandles) { // Check if the object exists
                Object.values(this.resizeHandles).forEach(handle => {
                    if (handle) {
                        handle.removeEventListener('mousedown', this._onMouseDown);
                        handle.removeEventListener('touchstart', this._onTouchStart);
                        if (handle._rtKeyDownListener) { // Check if the listener was stored
                            handle.removeEventListener('keydown', handle._rtKeyDownListener);
                        }
                        if (handle.parentNode) {
                            handle.parentNode.removeChild(handle);
                        }
                    }
                });
                this.resizeHandles = {}; // Reset to an empty object
            }

            // Remove collapse toggles and their event listeners
            if (this.collapseToggles) { // Check if the object exists
                Object.values(this.collapseToggles).forEach(toggle => {
                    if (toggle) {
                        toggle.removeEventListener('click', this._onCollapseToggle);
                        if (toggle.parentNode) {
                            toggle.parentNode.removeChild(toggle);
                        }
                    }
                });
                this.collapseToggles = {}; // Reset to an empty object
            }

            // Note: Reverting table.style.tableLayout or cell.style.position that were
            // set by this script would require storing their original values during init.
            // This is not currently implemented.

            // Reset internal state
            this.columnWidths = [];
            this.collapsedColumns = {};
            // this.headerRow = null; // Might be useful if table element itself is not destroyed by user
            // this.table = null; // Avoid nulling out if user might re-init, though destroy implies full cleanup.

            this.isInitialized = false;
            console.info("ResizableTable: Instance destroyed.");
        }
    }

    return ResizableTable;
}));
