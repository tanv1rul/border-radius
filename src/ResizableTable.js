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
            this._onMouseMove = this._onMouseMove.bind(this);
            this._onMouseUp = this._onMouseUp.bind(this);
            this._onCollapseToggle = this._onCollapseToggle.bind(this);
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

                    handle.addEventListener('mousedown', this._onMouseDown);

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
            console.log(`ResizableTable: Collapse toggle clicked for column index: ${columnIndex}`);
            // For now, let's change the toggle text to see an effect
            // toggle.innerHTML = toggle.innerHTML === '-' ? '+' : '-';
        }

        _onMouseDown(event) {
            event.preventDefault();
            event.stopPropagation();

            const handle = event.currentTarget;
            const columnIndex = parseInt(handle.dataset.columnIndex, 10);

            this.startX = event.clientX;
            this.lastMouseX = event.clientX; // Initialize for RAF
            this.currentColumnIndex = columnIndex;

            const th = this.headerRow.cells[columnIndex];
            // Use existing style.width if set (e.g. by previous resize), otherwise computed width
            this.startWidth = parseFloat(th.style.width || window.getComputedStyle(th).width);

            console.log(`ResizableTable: MouseDown on handle for column ${columnIndex}, startX: ${this.startX}, startWidth: ${this.startWidth}`);

            this.isResizing = true;

            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('mouseup', this._onMouseUp);
        }

        _onMouseMove(event) {
            if (!this.isResizing) return;

            this.lastMouseX = event.clientX;

            if (!this.rafPending) {
                this.rafPending = true;
                requestAnimationFrame(() => {
                    this._updateColumnWidth();
                    this.rafPending = false;
                });
            }
        }

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
                th.style.width = newWidth + 'px';
                // Optional: Throttle this log if too noisy
                // console.log(`ResizableTable: UpdateWidth - Column ${this.currentColumnIndex}, newWidth: ${newWidth.toFixed(1)}px`);
            }
        }

        _onMouseUp(event) {
            if (!this.isResizing) return;

            // Final update to ensure the last position is applied
            this._updateColumnWidth();

            const th = this.headerRow.cells[this.currentColumnIndex];
            if (th) {
                const finalWidth = parseFloat(th.style.width);
                this.columnWidths[this.currentColumnIndex] = finalWidth;
                console.log(`ResizableTable: MouseUp - Column ${this.currentColumnIndex} finalized width to: ${finalWidth}px. Stored in columnWidths: ${this.columnWidths[this.currentColumnIndex]}px`);
            } else {
                console.warn(`ResizableTable: MouseUp - Could not find header cell for column ${this.currentColumnIndex} to finalize width.`);
            }

            this.isResizing = false;
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup', this._onMouseUp);

            // Reset transient properties
            this.startX = 0;
            this.startWidth = 0;
            this.lastMouseX = 0;
            this.currentColumnIndex = -1;
        }
    }

    return ResizableTable;
}));
