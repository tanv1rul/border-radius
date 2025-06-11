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
        /**
         * @param {string|HTMLTableElement} targetElementOrSelector - The table element or its selector.
         * @param {object} [options] - Optional configuration.
         * @param {number} [options.resizeUpdateInterval=0] - Interval in ms to throttle resize updates during drag. 0 for no throttling (uses rAF).
         * @param {boolean} [options.deferDomWrites=false] - If true, attempts to defer DOM write operations (setting column width) using `requestIdleCallback`. Experimental.
         */
        constructor(targetElementOrSelector, options = {}) {
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
            // Generate an ID for the table if it doesn't have one
            if (!this.table.id) {
                this.table.id = `resizable-table-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            }
            this.localStorageKey = `resizable-table-widths-${this.table.id}`;

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
            this.originalTableState = this.table.cloneNode(true);

            let head = this.table.tHead;
            if (!head && this.table.tBodies && this.table.tBodies.length > 0 && this.table.tBodies[0].rows.length > 0) {
                this.headerRow = this.table.tBodies[0].rows[0];
                console.warn("ResizableTable: No <thead> found. Using first <tr> in <tbody> as header.");
            } else if (head) {
                this.headerRow = head.rows.length > 0 ? head.rows[0] : null;
            }

            if (!this.headerRow) {
                console.error("ResizableTable: No header row found (no <thead> or <tbody> rows).");
                return;
            }

            const headerCells = this.headerRow ? Array.from(this.headerRow.cells) : [];
            // Calculate true column count considering colspans
            this.columnCount = 0;
            headerCells.forEach(cell => {
                this.columnCount += cell.colSpan || 1;
            });

            if (this.columnCount === 0 && this.headerRow) {
                console.warn("ResizableTable: No columns found in the header row (considering colspans).");
            }

            this.table.style.tableLayout = 'fixed';
            this.columnWidths = new Array(this.columnCount).fill(0); // Initialize with actual column count

            if (this.headerRow && headerCells.length > 0) {
                let currentColumnIndex = 0;
                headerCells.forEach((cell) => {
                    try {
                        const colSpan = cell.colSpan || 1;
                        const computedCellWidth = parseFloat(window.getComputedStyle(cell).width);
                        // Distribute the width of a spanned cell proportionally among the columns it spans.
                        // This is an initial guess; individual columns might have different effective widths.
                        const widthPerSpan = computedCellWidth / colSpan;

                        for (let i = 0; i < colSpan; i++) {
                            if (currentColumnIndex < this.columnCount) {
                                // For now, let's assume the browser handles initial distribution for spanned cells
                                // and we just record it. The actual width of underlying columns is tricky
                                // to get directly if they are not individually defined.
                                // We will primarily focus on making resizing affect the correct *target* column.
                                // For simplicity, we'll set the cell's style.width directly.
                                // The `this.columnWidths` array should store the individual, ideally proportional,
                                // widths of each actual column.
                                this.columnWidths[currentColumnIndex] = widthPerSpan;
                                console.log(`ResizableTable: Actual column ${currentColumnIndex} (part of cell spanning ${colSpan}) - Initial assigned width: ${widthPerSpan.toFixed(2)}px`);
                            }
                            currentColumnIndex++;
                        }
                        // Set the width on the TH element itself. This width is the total width of the columns it spans.
                        cell.style.width = computedCellWidth + 'px';
                        console.log(`ResizableTable: Header cell spanning ${colSpan} cols (visual index ${headerCells.indexOf(cell)}) - Initial computed width: ${computedCellWidth.toFixed(2)}px. Set style.width on TH: ${cell.style.width}.`);

                    } catch (error) {
                        console.error(`ResizableTable: Error initializing width for a header cell (visual index ${headerCells.indexOf(cell)}): `, error, cell);
                    }
                });

                // Second pass to ensure all actual columns have a width set if not part of a colspan
                // This might be redundant if all cells are processed correctly above
                let totalWidthSet = 0;
                this.columnWidths.forEach(w => totalWidthSet += w);
                console.log(`ResizableTable: Sum of initial columnWidths: ${totalWidthSet.toFixed(2)}px`);

                // Ensure all actual columns have their widths set on <col> elements or similar if needed
                // For now, we are setting widths on TH elements.
            }

            this._createResizeHandles();
            this._createCollapseToggles();

            // Try to load and apply saved column widths
            const savedWidths = this._loadColumnWidths();
            if (savedWidths) {
                this._applyColumnWidths(savedWidths);
            }

            this.isInitialized = true;
        }

        _saveColumnWidths() {
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(this.localStorageKey, JSON.stringify(this.columnWidths));
                    console.log(`ResizableTable: Saved column widths for table ${this.table.id}`, this.columnWidths);
                } catch (e) {
                    console.error('ResizableTable: Error saving column widths to localStorage.', e);
                }
            }
        }

        _loadColumnWidths() {
            if (typeof localStorage !== 'undefined') {
                try {
                    const storedWidths = localStorage.getItem(this.localStorageKey);
                    if (storedWidths) {
                        const parsedWidths = JSON.parse(storedWidths);
                        console.log(`ResizableTable: Loaded column widths for table ${this.table.id}`, parsedWidths);
                        return parsedWidths;
                    }
                } catch (e) {
                    console.error('ResizableTable: Error loading column widths from localStorage.', e);
                }
            }
            return null;
        }

        _applyColumnWidths(widths) {
            if (!this.headerRow || widths.length !== this.columnCount) {
                console.warn('ResizableTable: Cannot apply saved widths. Header row or column count mismatch.');
                return;
            }

            this.columnWidths = [...widths]; // Update the internal tracking array

            const headerCells = Array.from(this.headerRow.cells);
            let currentActualColumnIndex = 0;

            headerCells.forEach((th, headerCellIndex) => {
                const colSpan = th.colSpan || 1;
                let headerCellNewWidth = 0;

                for (let i = 0; i < colSpan; i++) {
                    const actualColIdx = currentActualColumnIndex + i;
                    if (actualColIdx < this.columnWidths.length && typeof this.columnWidths[actualColIdx] === 'number') {
                        headerCellNewWidth += this.columnWidths[actualColIdx];
                    } else {
                        // Fallback if a width is missing, though this shouldn't happen if saved correctly
                        console.warn(`ResizableTable: _applyColumnWidths - Missing width for actual column ${actualColIdx}. Using current computed width for this segment.`);
                        const thComputedWidth = parseFloat(window.getComputedStyle(th).width);
                        headerCellNewWidth += thComputedWidth / colSpan; // Distribute current width
                    }
                }

                if (headerCellNewWidth > 0) {
                    th.style.width = headerCellNewWidth + 'px';
                    console.log(`ResizableTable: _applyColumnWidths - Set width of header cell ${headerCellIndex} (colspan ${colSpan}) to ${headerCellNewWidth.toFixed(2)}px`);
                }
                currentActualColumnIndex += colSpan;
            });
            console.log('ResizableTable: Applied column widths from localStorage.', this.columnWidths);
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

                headerCells.forEach((th, headerCellIndex) => {
                    const rSpan = th.rowSpan;
                    const cSpan = th.colSpan || 1; // Default to 1 if colSpan is not set or is 0

                    if (rSpan > 1) {
                        console.warn(`ResizableTable: Header cell at index ${headerCellIndex} ("${th.textContent.trim()}") has rowspan="${rSpan}". Advanced rowspan handling is not yet fully implemented and might affect layout.`);
                    }
                    if (cSpan > 1) {
                        console.log(`ResizableTable: Header cell at visual index ${headerCellIndex} ("${th.textContent.trim()}") has colspan="${cSpan}". The resize handle will control the last column in this span (actual column index ${currentActualColumnIndex + cSpan - 1}).`);
                    }

                    // The resize handle for a cell, even with colspan, should control the rightmost border of that cell.
                    // This corresponds to the end of the last actual column spanned by this header cell.
                    const targetColumnIndexForHandle = currentActualColumnIndex + cSpan - 1;

                    const cellPosition = window.getComputedStyle(th).position;
                    if (cellPosition !== 'relative' && cellPosition !== 'absolute' && cellPosition !== 'fixed') {
                        th.style.position = 'relative';
                        console.log(`ResizableTable: Set position:relative on header cell ${index}`);
                    }

                    const handle = document.createElement('div');
                    handle.className = 'rt-resize-handle';
                    // Store the actual target column index this handle will resize
                    handle.dataset.columnIndex = targetColumnIndexForHandle;
                    // Store the original header cell index for reference if needed
                    handle.dataset.headerCellIndex = headerCellIndex;


                    handle.style.position = 'absolute';
                    handle.style.right = '0px';
                    handle.style.top = '0px';
                    handle.style.width = '5px';
                    handle.style.height = th.offsetHeight + 'px';
                    handle.style.cursor = 'col-resize';
                    handle.style.backgroundColor = 'rgba(100, 100, 100, 0.2)';
                    handle.style.zIndex = '10';
                    handle.style.touchAction = 'none'; // Prevent scrolling during touch drag

                    // Replace direct mousedown with new setup
                    // handle.addEventListener('mousedown', this._onMouseDown);
                    handle.addEventListener('mousedown', this._onMouseDown); // This now calls _onDragStart
                    handle.addEventListener('touchstart', this._onTouchStart, { passive: false }); // passive: false to allow preventDefault
                    console.log(`ResizableTable: Applied touch-action: none to handle for actual column ${targetColumnIndexForHandle} (header cell ${headerCellIndex})`);

                    th.appendChild(handle);
                    this.resizeHandles.push(handle);
                    console.log(`ResizableTable: Created resize handle for actual column ${targetColumnIndexForHandle} (associated with header cell ${headerCellIndex}, colspan ${cSpan})`);

                    currentActualColumnIndex += cSpan; // Move to the next actual column start index
                });
            } catch (error) {
                console.error("ResizableTable: Error creating resize handles: ", error);
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
                    // Ensure th is relatively positioned (should be by _createResizeHandles)
                    if (window.getComputedStyle(th).position === 'static') {
                        th.style.position = 'relative';
                        console.warn(`ResizableTable: Header cell ${index} was static, forced to relative for collapse toggle.`);
                    }

                    const toggle = document.createElement('span');
                    toggle.className = 'rt-collapse-toggle';
                    toggle.dataset.columnIndex = index;

                    // Basic styling for the toggle
                    toggle.style.position = 'absolute';
                    toggle.style.left = '5px';
                    toggle.style.top = '50%';
                    toggle.style.transform = 'translateY(-50%)';
                    toggle.style.width = '10px';
                    toggle.style.height = '10px';
                    toggle.style.backgroundColor = '#007bff';
                    toggle.style.border = '1px solid #0056b3';
                    toggle.style.cursor = 'pointer';
                    toggle.innerHTML = '-'; // Represents "collapse"
                    toggle.title = `Collapse/Expand column ${th.textContent.trim() || index + 1}`;

                    toggle.addEventListener('click', this._onCollapseToggle);

                    th.appendChild(toggle);
                    this.collapseToggles.push(toggle); // Store reference
                    console.log(`ResizableTable: Created collapse toggle for column ${index}`);
                });
            } catch (error) {
                console.error("ResizableTable: Error creating collapse toggles: ", error);
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
                event.currentTarget.title = `Expand column ${headerCell ? headerCell.textContent.trim() : columnIndex + 1}`;
                console.log(`ResizableTable: Column ${columnIndex} collapsed.`);

            } else { // Expanding
                if (headerCell) {
                    headerCell.style.display = ''; // Reverts to default (e.g., 'table-cell')

                    // Restore the stored width after making the column visible again,
                    // ensuring it retains its previous size (either from original layout, resize, or previous collapse).
                    if (typeof this.columnWidths[columnIndex] === 'number') {
                        headerCell.style.width = this.columnWidths[columnIndex] + 'px';
                        console.log(`ResizableTable: Restored width ${this.columnWidths[columnIndex]}px to column ${columnIndex} after expand.`);
                    } else {
                        // If no width was stored (e.g. table never resized, column never collapsed before initially)
                        // it will revert to its CSS-defined width or 'auto'.
                        console.log(`ResizableTable: No specific width stored for column ${columnIndex}. Reverting to default/CSS width on expand.`);
                    }
                }
                tableRows.forEach(row => {
                    if (row.cells && row.cells[columnIndex]) {
                        row.cells[columnIndex].style.display = '';
                    }
                });
                event.currentTarget.innerHTML = '-';
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
            this._updateColumnWidth(true); // Final update, force synchronous DOM write

            // this.currentColumnIndex is the actual column index that was resized.
            // this.columnWidths should already be updated by _updateColumnWidth.
            if (this.currentColumnIndex !== -1 && this.columnWidths[this.currentColumnIndex] !== undefined) {
                 console.log(`ResizableTable: DragEnd - Actual column ${this.currentColumnIndex} finalized width to: ${this.columnWidths[this.currentColumnIndex].toFixed(2)}px. isTouch: ${this.isTouchEvent}`);
                 this._saveColumnWidths(); // Save widths after resize
            } else if (this.currentColumnIndex !== -1) {
                // This case might indicate an issue if currentColumnIndex is set but its width is not in columnWidths
                const headerCellWithHandle = this.headerRow.cells[this.currentHeaderCellIndex];
                if (headerCellWithHandle) {
                    const finalThWidth = parseFloat(headerCellWithHandle.style.width);
                     // This is tricky because finalThWidth is for the entire cell, which might span multiple columns.
                     // _updateColumnWidth should have correctly updated the specific actual column's width in this.columnWidths.
                     // So, relying on this.columnWidths[this.currentColumnIndex] is preferred.
                    console.warn(`ResizableTable: DragEnd - Column ${this.currentColumnIndex} width might not be accurately captured in columnWidths array directly from TH width if colspan is involved. TH width: ${finalThWidth.toFixed(2)}px. Relying on earlier update to columnWidths.`);
                    // Attempt to save anyway, assuming _updateColumnWidth did its job.
                    this._saveColumnWidths();
                } else {
                    console.warn(`ResizableTable: DragEnd - Could not find header cell for column ${this.currentHeaderCellIndex} to finalize width, and currentColumnIndex is ${this.currentColumnIndex}.`);
                }
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

            const minWidth = 20; // px - TODO: Make configurable
            if (newActualColumnWidth < minWidth) {
                newActualColumnWidth = minWidth;
            }

            // this.currentColumnIndex is the actual column index to resize.
            // this.currentHeaderCellIndex is the index of the TH cell in the header row where the handle lives.
            const actualResizingColumnIndex = this.currentColumnIndex;
            const headerCellWithHandle = this.headerRow.cells[this.currentHeaderCellIndex];

            if (!headerCellWithHandle) {
                console.error(`ResizableTable: _updateColumnWidth - Cannot find header cell with index ${this.currentHeaderCellIndex}.`);
                return;
            }

            const colSpan = headerCellWithHandle.colSpan || 1;
            const oldActualColumnWidth = this.columnWidths[actualResizingColumnIndex] || this.startWidth; // Fallback to startWidth if undefined
            const changeInWidth = newActualColumnWidth - oldActualColumnWidth;

            // Update the width of the specific column being resized in our tracking array
            this.columnWidths[actualResizingColumnIndex] = newActualColumnWidth;
            console.log(`ResizableTable: _updateColumnWidth - Actual column ${actualResizingColumnIndex} (header cell ${this.currentHeaderCellIndex}) old width: ${oldActualColumnWidth.toFixed(2)}, new width: ${newActualColumnWidth.toFixed(2)}px. Change: ${changeInWidth.toFixed(2)}px.`);

            // If this header cell spans multiple columns, its total width needs to be adjusted
            // by the change in width of the column being resized.
            // The resize handle on a colspan'd TH affects the last column in its span.
            // So, actualResizingColumnIndex is the last column in this TH's span.

            const performDomUpdate = () => {
                // The width of the TH element itself needs to be the sum of the widths of the columns it spans.
                let newThWidth = 0;
                let firstColIndexInSpan = -1;

                // Need to determine which actual columns this TH spans.
                let currentActualColIdx = 0;
                for(let i = 0; i < this.headerRow.cells.length; i++) {
                    const cell = this.headerRow.cells[i];
                    const cs = cell.colSpan || 1;
                    if (i === this.currentHeaderCellIndex) {
                        firstColIndexInSpan = currentActualColIdx;
                        break;
                    }
                    currentActualColIdx += cs;
                }

                if (firstColIndexInSpan !== -1) {
                    for (let i = 0; i < colSpan; i++) {
                        const colIdx = firstColIndexInSpan + i;
                        if (typeof this.columnWidths[colIdx] === 'number' && this.columnWidths[colIdx] > 0) {
                            newThWidth += this.columnWidths[colIdx];
                        } else {
                            console.warn(`ResizableTable: _updateColumnWidth/performDomUpdate - Width for actual column ${colIdx} in span of header ${this.currentHeaderCellIndex} was undefined or invalid. Estimating.`);
                            const thCurrentTotalWidth = parseFloat(window.getComputedStyle(headerCellWithHandle).width);
                            const estimatedColWidth = thCurrentTotalWidth / colSpan; // colSpan should be > 0 here
                            newThWidth += estimatedColWidth;
                            this.columnWidths[colIdx] = estimatedColWidth;
                        }
                    }

                    if (newThWidth < minWidth * colSpan && colSpan > 0) {
                        console.warn(`ResizableTable: _updateColumnWidth/performDomUpdate - Calculated TH width ${newThWidth.toFixed(2)}px is small for colspan ${colSpan}.`);
                    }

                    console.log(`ResizableTable: _updateColumnWidth/performDomUpdate - Header cell ${this.currentHeaderCellIndex} (colspan ${colSpan}) new calculated total width: ${newThWidth.toFixed(2)}px. Applied to TH style.width. Resized actual column was ${actualResizingColumnIndex}.`);
                    headerCellWithHandle.style.width = newThWidth + 'px';
                } else {
                    console.error(`ResizableTable: _updateColumnWidth/performDomUpdate - Could not determine the span range for header cell ${this.currentHeaderCellIndex}.`);
                    if (colSpan === 1 && headerCellWithHandle) { // Fallback for single column cell
                         headerCellWithHandle.style.width = newActualColumnWidth + 'px';
                         console.log(`ResizableTable: _updateColumnWidth/performDomUpdate (fallback for colspan=1) - Set width of header cell ${this.currentHeaderCellIndex} to ${newActualColumnWidth.toFixed(2)}px.`);
                    }
                }
            };

            if (!forceSync && this.options.deferDomWrites && typeof requestIdleCallback === 'function') {
                console.log(`ResizableTable: Deferring DOM write for column ${actualResizingColumnIndex} using requestIdleCallback.`);
                requestIdleCallback(() => {
                    console.log(`ResizableTable: Executing deferred DOM write for column ${actualResizingColumnIndex}.`);
                    performDomUpdate();
                    // Note: this.columnWidths[actualResizingColumnIndex] is already updated above.
                    // The primary deferral is for the style.width DOM write.
                });
            } else {
                if (forceSync) console.log(`ResizableTable: Forcing synchronous DOM write for column ${actualResizingColumnIndex}.`);
                else if (this.options.deferDomWrites) console.log(`ResizableTable: requestIdleCallback not available or deferDomWrites is false. Writing DOM synchronously for column ${actualResizingColumnIndex}.`);
                performDomUpdate();
            }
        }
    }

    return ResizableTable;
}));
