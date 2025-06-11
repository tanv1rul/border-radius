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
        constructor(targetElementOrSelector) {
            this.isInitialized = false;
            this.isResizing = false;
            this.startX = 0;
            this.currentColumnIndex = -1;
            this.startWidth = 0;
            this.rafPending = false;
            this.lastMouseX = 0;
            this.collapsedColumns = {}; // Initialize collapsedColumns
            this.isTouchEvent = false;

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
            this.columnCount = headerCells.length;

            if (this.columnCount === 0 && this.headerRow) {
                console.warn("ResizableTable: No columns found in the header row.");
            }

            this.table.style.tableLayout = 'fixed';
            this.columnWidths = [];

            if (this.headerRow && this.headerRow.cells.length > 0) {
                const headerCells = Array.from(this.headerRow.cells);
                headerCells.forEach((cell, index) => {
                    try {
                        const computedWidth = window.getComputedStyle(cell).width;
                        this.columnWidths[index] = parseFloat(computedWidth);
                        cell.style.width = this.columnWidths[index] + 'px';
                        console.log(`ResizableTable: Column ${index} - Initial computed width: ${computedWidth}, Set width: ${cell.style.width}`);
                    } catch (error) {
                        console.error(`ResizableTable: Error initializing width for column ${index}: `, error);
                    }
                });
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

                headerCells.forEach((th, index) => {
                    const rSpan = th.rowSpan;
                    const cSpan = th.colSpan;

                    if (rSpan > 1) {
                        console.warn(`ResizableTable: Header cell at index ${index} ("${th.textContent.trim()}") has rowspan="${rSpan}". Advanced rowspan handling is not yet fully implemented and might affect layout.`);
                    }
                    if (cSpan > 1) {
                        console.warn(`ResizableTable: Header cell at index ${index} ("${th.textContent.trim()}") has colspan="${cSpan}". Column resizing might behave unexpectedly. Advanced colspan handling is not yet fully implemented.`);
                    }

                    const cellPosition = window.getComputedStyle(th).position;
                    if (cellPosition !== 'relative' && cellPosition !== 'absolute' && cellPosition !== 'fixed') {
                        th.style.position = 'relative';
                        console.log(`ResizableTable: Set position:relative on header cell ${index}`);
                    }

                    const handle = document.createElement('div');
                    handle.className = 'rt-resize-handle';
                    handle.dataset.columnIndex = index;

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
                    console.log(`ResizableTable: Applied touch-action: none to handle for column ${index}`);

                    th.appendChild(handle);
                    this.resizeHandles.push(handle);
                    console.log(`ResizableTable: Created resize handle for column ${index}`);
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
            const columnIndex = parseInt(toggle.dataset.columnIndex, 10);

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
            const columnIndex = parseInt(handle.dataset.columnIndex, 10);

            if (isNaN(columnIndex)) {
                console.error("ResizableTable: Invalid column index from handle.", handle);
                return;
            }

            this.isTouchEvent = isTouchEvent;
            this.startX = clientX;
            this.lastMouseX = clientX; // Use lastMouseX consistently for RAF logic, even for touch
            this.currentColumnIndex = columnIndex;

            const th = this.headerRow.cells[columnIndex];
            if (!th) {
                console.error(`ResizableTable: DragStart - Could not find header cell for column ${columnIndex}.`);
                return;
            }
            this.startWidth = parseFloat(th.style.width || window.getComputedStyle(th).width);

            this.isResizing = true;
            console.log(`ResizableTable: DragStart - Column ${columnIndex}, startX: ${this.startX.toFixed(2)}, startWidth: ${this.startWidth.toFixed(2)}px, isTouch: ${this.isTouchEvent}`);

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
            this.lastMouseX = clientX; // Update for RAF

            if (!this.rafPending) {
                this.rafPending = true;
                requestAnimationFrame(() => {
                    this._updateColumnWidth(); // _updateColumnWidth uses this.lastMouseX
                    this.rafPending = false;
                });
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

        _updateColumnWidth() {
            if (!this.isResizing) return;

            const currentX = this.lastMouseX;
            const deltaX = currentX - this.startX;
            let newWidth = this.startWidth + deltaX;

            const minWidth = 20; // px - TODO: Make configurable
            if (newWidth < minWidth) {
                newWidth = minWidth;
            }

            const th = this.headerRow.cells[this.currentColumnIndex];
            if (th) {
                // Note: If the current column were to be collapsed mid-drag (e.g. via a hypothetical keyboard shortcut),
                // accessing properties of the hidden th or setting its width might be problematic or have no visible effect
                // until expanded. Currently, collapse is via toggle click, which should interrupt resizing.
                th.style.width = newWidth + 'px';
            }
        }
    }

    return ResizableTable;
}));
