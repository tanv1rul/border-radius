(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ResizableTable = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class ResizableTable {

        constructor(targetElementOrSelector, userOptions = {}) {

            this.isInitialized = false;
            this.isResizing = false;
            this.startX = 0;
            this.currentColumnIndex = -1;
            this.currentHeaderCellIndex = -1; // Added in previous step
            this.startWidth = 0;
            this.rafPending = false;
            this.lastMouseX = 0;
            this.collapsedColumns = {};
            this.collapsedColumnData = {};
            this.isTouchEvent = false;
            this.startY = 0;
            this.dragMoveCount = 0;
            this.scrollDetected = false;
            this.cancelledDueToScroll = false;
            this.currentHandle = null;
            this._eventListeners = {};

            this.defaultOptions = {
                enableResizing: true,
                enableCollapsing: true,
                minColumnWidth: 30,
                maxColumnWidth: Infinity,
                resizeHandleWidth: 12,
                resizeHandleColor: 'rgba(100, 100, 100, 0.2)',
                usePlaceholdersForCollapse: true,
                collapseToggleSize: 10,
                collapseToggleColor: '#007bff',
                collapseToggleContentOpen: '-',
                collapseToggleContentClosed: '+',
                placeholderCellWidth: 30,
                tableClassResizing: 'rt-table-resizing',
                resizeHandleClass: 'rt-resize-handle',
                activeHandleClass: 'rt-active-handle',
                collapseToggleClass: 'rt-collapse-toggle',
                placeholderCellClass: 'rt-col-placeholder',
                onInit: null, onColumnResizeStart: null, onColumnResized: null,
                onColumnCollapse: null, onColumnExpand: null, onBeforeDestroy: null,
                onColumnWidthSet: null
            };

            this.options = { ...this.defaultOptions, ...userOptions };
            this.minColumnWidth = this.options.minColumnWidth;
            this.maxColumnWidth = this.options.maxColumnWidth;

            this.options = Object.assign({}, {
                resizeUpdateInterval: 0, // Default to no throttling
                deferDomWrites: false // Default to synchronous DOM writes
            }, options);

            this.lastResizeUpdateTime = 0; // For throttling

            let tableElement;
            if (typeof targetElementOrSelector === 'string') {
                tableElement = document.querySelector(targetElementOrSelector);
                if (!tableElement) throw new Error(`ResizableTable: Target element not found for selector: ${targetElementOrSelector}`);
            } else {
                tableElement = targetElementOrSelector;
            }
            if (!(tableElement instanceof HTMLTableElement)) throw new Error('ResizableTable: Target element is not a <table>.');
            this.table = tableElement;

            this.init();

            this._onMouseDown = this._onMouseDown.bind(this);
            this._onCollapseToggle = this._onCollapseToggle.bind(this);
            this._onTouchStart = this._onTouchStart.bind(this);
            this._onDragStart = this._onDragStart.bind(this);
            this._onDragMoveWrapper = this._onDragMoveWrapper.bind(this);
            this._onDragEndWrapper = this._onDragEndWrapper.bind(this);
            this._throttledUpdate = this._throttledUpdate.bind(this); // Bind new method
        }

        init() {

            this.originalTableState = this.table.cloneNode(true);
            let head = this.table.tHead;
            if (!head && this.table.tBodies && this.table.tBodies.length > 0 && this.table.tBodies[0].rows.length > 0) {
                this.headerRow = this.table.tBodies[0].rows[0];
            } else if (head) {
                this.headerRow = head.rows.length > 0 ? head.rows[0] : null;

            }
            if (!this.headerRow) { console.error("RT: No header row."); return; }


            this.columnCount = (this.headerRow.cells || []).length;
            if (this.columnCount === 0) { console.warn("RT: No columns in header."); }


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

            Array.from(this.headerRow.cells).forEach((cell, index) => {
                try {
                    this.columnWidths[index] = parseFloat(window.getComputedStyle(cell).width);
                    cell.style.width = this.columnWidths[index] + 'px';
                } catch (e) { console.error(`RT: Error init width col ${index}:`, e); }
            });


            this._createResizeHandles();
            this._createCollapseToggles();
            this.isInitialized = true;
            this.initialRowCount = this.table.rows.length;
            this.initialHeaderCellCount = this.columnCount;

            const initPayload = { instance: this };
            this._emit('init', initPayload);
            if (typeof this.options.onInit === 'function') {
                try { this.options.onInit(initPayload); }
                catch (e) { console.warn(`RT: Error in onInit callback:`, e); }
            }
        }

        _createResizeHandles() {
            if (!this.options.enableResizing) return;
            if (!this.headerRow) { return; }
            try {

                Array.from(this.headerRow.cells).forEach((th, index) => {
                    if (th.rowSpan > 1 || th.colSpan > 1) { /* warn */ }
                    if (window.getComputedStyle(th).position === 'static') th.style.position = 'relative';

                    const handle = document.createElement('div');
                    handle.className = this.options.resizeHandleClass;
                    handle.dataset.columnIndex = index;
                    Object.assign(handle.style, {
                        position: 'absolute', top: '0px', height: th.offsetHeight + 'px',
                        cursor: 'col-resize', backgroundColor: this.options.resizeHandleColor,
                        zIndex: '10', touchAction: 'none',
                        width: this.options.resizeHandleWidth + 'px',
                        right: -(this.options.resizeHandleWidth / 2) + 'px'
                    });
                    handle.addEventListener('mousedown', this._onMouseDown);
                    handle.addEventListener('touchstart', this._onTouchStart, { passive: false });
                    th.appendChild(handle);
                    if(!this.resizeHandles) this.resizeHandles = [];
                    this.resizeHandles[index] = handle;
                });
            } catch (e) { console.error("RT: Error creating resize handles:", e); }

        }

        _createCollapseToggles() {
            if (!this.options.enableCollapsing || !this.headerRow) return;
            try {

                if(!this.collapseToggles) this.collapseToggles = [];
                Array.from(this.headerRow.cells).forEach((th, index) => {
                    if (window.getComputedStyle(th).position === 'static') th.style.position = 'relative';
                    const toggle = document.createElement('span');
                    toggle.className = this.options.collapseToggleClass;
                    toggle.dataset.columnIndex = index;
                    Object.assign(toggle.style, {
                        position: 'absolute', left: '5px', top: '50%',
                        transform: 'translateY(-50%)',
                        width: this.options.collapseToggleSize + 'px',
                        height: this.options.collapseToggleSize + 'px',
                        backgroundColor: this.options.collapseToggleColor,
                        border: '1px solid #0056b3',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: (this.options.collapseToggleSize * 0.8) + 'px'
                    });
                    toggle.innerHTML = this.options.collapseToggleContentOpen;
                    toggle.title = `Collapse/Expand column ${th.textContent.trim() || index + 1}`;
                    toggle.addEventListener('click', this._onCollapseToggle);
                    th.appendChild(toggle);
                    this.collapseToggles[index] = toggle;
                });
            } catch (e) { console.error("RT: Error creating collapse toggles:", e); }
        }

        _onCollapseToggle(eventOrColumnIndex) {
            let columnIndex;
            let mainToggleElement;


            if (typeof eventOrColumnIndex === 'number') {
                columnIndex = eventOrColumnIndex;
                mainToggleElement = this.collapseToggles[columnIndex];
                if (!mainToggleElement) return;
            } else {
                eventOrColumnIndex.preventDefault();
                eventOrColumnIndex.stopPropagation();
                const toggleClickedElement = eventOrColumnIndex.currentTarget;
                columnIndex = parseInt(toggleClickedElement.dataset.columnIndex, 10);
                mainToggleElement = this.collapseToggles[columnIndex] || toggleClickedElement;
                if (isNaN(columnIndex)) return;
            }

            const isCurrentlyCollapsed = this.collapsedColumns[columnIndex] === true;
            const newCollapsedState = !isCurrentlyCollapsed;
            this.collapsedColumns[columnIndex] = newCollapsedState;

            const headerCell = this.headerRow.cells[columnIndex];
            const tableRows = Array.from(this.table.rows);
            const eventPayload = { columnIndex: columnIndex };

            if (this.options.usePlaceholdersForCollapse) {
                if (newCollapsedState) {
                    this.collapsedColumnData[columnIndex] = {
                        originalHeaderCell: null, originalCells: new Map(),
                        placeholderHeaderCell: null, placeholderCells: new Map()
                    };
                    if (headerCell) {
                        this.collapsedColumnData[columnIndex].originalHeaderCell = headerCell;
                        const currentWidth = parseFloat(window.getComputedStyle(headerCell).width);
                        if (this.columnWidths[columnIndex] === undefined || Math.abs(this.columnWidths[columnIndex] - currentWidth) > 0.5) {
                            this.columnWidths[columnIndex] = currentWidth;
                        }
                        headerCell.style.display = 'none';
                        const phHeader = document.createElement('th');
                        phHeader.className = this.options.placeholderCellClass;
                        phHeader.dataset.columnIndex = columnIndex;
                        phHeader.innerHTML = this.options.collapseToggleContentClosed;
                        phHeader.title = `Expand column ${headerCell.textContent.trim() || columnIndex + 1}`;
                        Object.assign(phHeader.style, {
                            width: this.options.placeholderCellWidth + 'px',
                            minWidth: this.options.placeholderCellWidth + 'px',
                            boxSizing: 'border-box'
                        });
                        phHeader.addEventListener('click', (e) => { e.stopPropagation(); this._onCollapseToggle(columnIndex); });
                        if (headerCell.nextSibling) headerCell.parentElement.insertBefore(phHeader, headerCell.nextSibling);
                        else headerCell.parentElement.appendChild(phHeader);
                        this.collapsedColumnData[columnIndex].placeholderHeaderCell = phHeader;
                    }
                    tableRows.forEach((row) => {
                        if (row === this.headerRow) return;
                        const originalCell = row.cells[columnIndex];
                        if (originalCell) {
                            this.collapsedColumnData[columnIndex].originalCells.set(row, originalCell);
                            originalCell.style.display = 'none';
                            const phCell = document.createElement('td');
                            phCell.className = this.options.placeholderCellClass;
                            phCell.dataset.placeholderForColumn = columnIndex;
                            Object.assign(phCell.style, { width: this.options.placeholderCellWidth + 'px', minWidth: this.options.placeholderCellWidth + 'px' });
                            if (originalCell.nextSibling) originalCell.parentElement.insertBefore(phCell, originalCell.nextSibling);
                            else originalCell.parentElement.appendChild(phCell);
                            this.collapsedColumnData[columnIndex].placeholderCells.set(row, phCell);
                        }
                    });
                    if(mainToggleElement) mainToggleElement.innerHTML = this.options.collapseToggleContentClosed;
                    this._emit('columnCollapse', eventPayload);
                    if(typeof this.options.onColumnCollapse === 'function') {
                        try { this.options.onColumnCollapse(eventPayload); }
                        catch(e) { console.warn(`RT: Error in onColumnCollapse callback:`, e); }
                    }

                } else { // Expanding with placeholders
                    const columnData = this.collapsedColumnData[columnIndex];
                    if (!columnData) return;
                    if (columnData.placeholderHeaderCell && columnData.placeholderHeaderCell.parentElement) columnData.placeholderHeaderCell.remove();
                    if (columnData.originalHeaderCell) {
                        columnData.originalHeaderCell.style.display = '';
                        if (typeof this.columnWidths[columnIndex] === 'number') columnData.originalHeaderCell.style.width = this.columnWidths[columnIndex] + 'px';
                    }
                    columnData.placeholderCells.forEach((phCell) => { if (phCell.parentElement) phCell.remove(); });
                    columnData.originalCells.forEach((originalCell) => { originalCell.style.display = ''; });
                    if(mainToggleElement) mainToggleElement.innerHTML = this.options.collapseToggleContentOpen;
                    delete this.collapsedColumnData[columnIndex];
                    this._emit('columnExpand', eventPayload);
                    if(typeof this.options.onColumnExpand === 'function') {
                        try { this.options.onColumnExpand(eventPayload); }
                        catch(e) { console.warn(`RT: Error in onColumnExpand callback:`, e); }

                    }
                }
            } else { // Simple display:none strategy (no placeholders)
                if (newCollapsedState) { // Collapsing
                    if (headerCell) {
                        const currentWidth = parseFloat(window.getComputedStyle(headerCell).width);
                        this.columnWidths[columnIndex] = currentWidth;
                        headerCell.style.display = 'none';
                    }

                    tableRows.forEach(row => {
                        if (row.cells && row.cells[columnIndex]) row.cells[columnIndex].style.display = 'none';
                    });
                    if(mainToggleElement) mainToggleElement.innerHTML = this.options.collapseToggleContentClosed;
                    this._emit('columnCollapse', eventPayload);
                    if(typeof this.options.onColumnCollapse === 'function') {
                        try { this.options.onColumnCollapse(eventPayload); }
                        catch(e) { console.warn(`RT: Error in onColumnCollapse callback:`, e); }
                    }
                } else { // Expanding
                    if (headerCell) {
                        headerCell.style.display = '';
                        if (typeof this.columnWidths[columnIndex] === 'number') headerCell.style.width = this.columnWidths[columnIndex] + 'px';
                    }
                    tableRows.forEach(row => {
                        if (row.cells && row.cells[columnIndex]) row.cells[columnIndex].style.display = '';
                    });
                    if(mainToggleElement) mainToggleElement.innerHTML = this.options.collapseToggleContentOpen;
                    this._emit('columnExpand', eventPayload);
                     if(typeof this.options.onColumnExpand === 'function') {
                        try { this.options.onColumnExpand(eventPayload); }
                        catch(e) { console.warn(`RT: Error in onColumnExpand callback:`, e); }
                    }
                }
            }
            if (mainToggleElement && headerCell) {
                 mainToggleElement.title = newCollapsedState ?
                    `Expand column ${headerCell.textContent.trim() || columnIndex + 1}` :
                    `Collapse column ${headerCell.textContent.trim() || columnIndex + 1}`;

            }
        }

        _onMouseDown(event) { this._onDragStart(event, event.clientX, false); }
        _onTouchStart(event) {
            if (!this.options.enableResizing || event.touches.length > 1) return;
            this._onDragStart(event, event.touches[0].clientX, true);
        }

        _onDragStart(event, clientX, isTouchEvent) {
            if (!this.options.enableResizing) return;
            event.preventDefault();
            const handle = event.currentTarget;

            const columnIndex = parseInt(handle.dataset.columnIndex, 10);
            if (isNaN(columnIndex)) { return; }
            this.isTouchEvent = isTouchEvent;
            this.startX = clientX;
            this.lastMouseX = clientX;
            if (this.isTouchEvent) { this.startY = event.touches[0].pageY; }
            this.currentColumnIndex = columnIndex;
            const th = this.headerRow.cells[columnIndex];
            if (!th) { return; }
            this.startWidth = parseFloat(th.style.width || window.getComputedStyle(th).width);
            this.isResizing = true;
            this.currentHandle = handle;
            if (this.currentHandle) { this.currentHandle.classList.add(this.options.activeHandleClass); }
            if (this.options.tableClassResizing) this.table.classList.add(this.options.tableClassResizing);

            const eventPayload = { columnIndex: this.currentColumnIndex, handle: this.currentHandle, originalEvent: event };
            this._emit('columnResizeStart', eventPayload);
            if(typeof this.options.onColumnResizeStart === 'function') {
                try { this.options.onColumnResizeStart(eventPayload); }
                catch(e) { console.warn(`RT: Error in onColumnResizeStart callback:`, e); }

            }

            const listeners = this.isTouchEvent ?
                { move: 'touchmove', end: ['touchend', 'touchcancel'] } :
                { move: 'mousemove', end: ['mouseup'] };
            document.addEventListener(listeners.move, this._onDragMoveWrapper, this.isTouchEvent ? { passive: false } : false);
            listeners.end.forEach(endEvent => document.addEventListener(endEvent, this._onDragEndWrapper));
        }

        _onDragMoveWrapper(event) {
            if (!this.isResizing) return;
            const clientX = this.isTouchEvent ? event.touches[0].clientX : event.clientX;

            this.lastMouseX = clientX;
            if (!this.rafPending) {
                this.rafPending = true;
                requestAnimationFrame(() => {
                    this._updateColumnWidth();
                    this.rafPending = false;
                });
            }
            if (this.isTouchEvent ) { event.preventDefault(); }

        }

        _onDragEndWrapper(event) {
            if (!this.isResizing) return;
            this._updateColumnWidth();
            const th = this.headerRow.cells[this.currentColumnIndex];
            const endedColumnIndex = this.currentColumnIndex;

            if (th) {
                const finalWidth = parseFloat(th.style.width);
                this.columnWidths[endedColumnIndex] = finalWidth;
                const eventPayload = { columnIndex: endedColumnIndex, newWidth: finalWidth, originalEvent: event };
                this._emit('columnResized', eventPayload);
                if(typeof this.options.onColumnResized === 'function') {
                    try { this.options.onColumnResized(eventPayload); }
                    catch(e) { console.warn(`RT: Error in onColumnResized callback:`, e); }
                }
            } else {
                 console.warn(`RT: DragEnd - No header cell for col ${endedColumnIndex}.`);
            }

            if (this.options.tableClassResizing) this.table.classList.remove(this.options.tableClassResizing);
            this.isResizing = false;

            const listeners = this.isTouchEvent ?
                { move: 'touchmove', end: ['touchend', 'touchcancel'] } :
                { move: 'mousemove', end: ['mouseup'] };
            document.removeEventListener(listeners.move, this._onDragMoveWrapper);
            listeners.end.forEach(endEvent => document.removeEventListener(endEvent, this._onDragEndWrapper));

            if (this.currentHandle) {
                this.currentHandle.classList.remove(this.options.activeHandleClass);
                this.currentHandle = null;
            }
            this.startX = 0; this.startY = 0; this.startWidth = 0;
            this.lastMouseX = 0; this.currentColumnIndex = -1;
            this.isTouchEvent = false;
        }


        _updateColumnWidth() {

            if (!this.isResizing) return;
            const currentX = this.lastMouseX;
            const deltaX = currentX - this.startX;

            let newWidth = this.startWidth + deltaX;
            newWidth = Math.max(this.minColumnWidth, Math.min(newWidth, this.maxColumnWidth));
            const th = this.headerRow.cells[this.currentColumnIndex];
            if (th) { th.style.width = newWidth + 'px'; }
        }

        toggleColumn(columnIndex) {
            if (!this.isInitialized) { console.error("RT: Not initialized."); return; }
            const maxIndex = this.headerRow ? this.headerRow.cells.length - 1 : -1;
            if (typeof columnIndex !== 'number' || columnIndex < 0 || columnIndex > maxIndex) {
                console.error(`RT: Invalid columnIndex ${columnIndex}.`); return;

            }
            if (this.headerRow.cells[columnIndex].colSpan > 1) { /* warn */ }
            this._onCollapseToggle(columnIndex);
        }


        destroy() {
            if (!this.isInitialized) { console.warn("RT: Not initialized or destroyed."); return; }
            const eventPayload = { instance: this };
            this._emit('beforeDestroy', eventPayload);
            if(typeof this.options.onBeforeDestroy === 'function') {
                try { this.options.onBeforeDestroy(eventPayload); }
                catch(e) { console.warn(`RT: Error in onBeforeDestroy callback:`, e); }
            }
            // TODO: Full cleanup of listeners, DOM elements, etc.
            this.isInitialized = false;
            if (this.table) {
                 this.table.classList.add('rt-destroyed');
                 if (this.table.style.tableLayout === 'fixed') {
                    this.table.style.tableLayout = this.originalTableState?.style.tableLayout || '';
                 }

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

        setColumnWidth(columnIndex, width) {
            if (!this.isInitialized) { console.error("RT: Not initialized."); return; }
            const maxIndex = this.headerRow ? this.headerRow.cells.length - 1 : -1;
            if (typeof columnIndex !== 'number' || columnIndex < 0 || columnIndex > maxIndex) { return; }
            if (typeof width !== 'number' || width < 0) { return; }
            let constrainedWidth = Math.max(this.minColumnWidth, Math.min(width, this.maxColumnWidth));
            if (constrainedWidth !== width) { width = constrainedWidth; }
            this.columnWidths[columnIndex] = width;
            const headerCell = this.headerRow.cells[columnIndex];
            if (headerCell) {
                headerCell.style.width = width + 'px';
                const eventPayload = { columnIndex: columnIndex, newWidth: width, source: 'programmatic' };
                this._emit('columnWidthSet', eventPayload);
                if(typeof this.options.onColumnWidthSet === 'function') {
                    try { this.options.onColumnWidthSet(eventPayload); }
                    catch(e) { console.warn(`RT: Error in onColumnWidthSet callback:`, e); }
                }
            }
        }

        getColumnState(columnIndex) {
            if (!this.isInitialized) { return null; }
            const maxIndex = this.headerRow ? this.headerRow.cells.length - 1 : -1;
            if (typeof columnIndex !== 'number' || columnIndex < 0 || columnIndex > maxIndex) {return null;}
            const isCollapsed = !!this.collapsedColumns[columnIndex];
            const originalHeaderCell = this.headerRow.cells[columnIndex];
            let currentDisplayWidth = null; let isVisible = false;
            if (originalHeaderCell) {
                isVisible = originalHeaderCell.style.display !== 'none';
                if (isVisible) currentDisplayWidth = parseFloat(window.getComputedStyle(originalHeaderCell).width);
                else if (isCollapsed && this.columnWidths[columnIndex] !== undefined) currentDisplayWidth = this.columnWidths[columnIndex];
            }
            const state = {
                index: columnIndex, storedWidth: this.columnWidths[columnIndex],
                currentDisplayWidth: currentDisplayWidth, isCollapsed: isCollapsed,
                isVisible: isVisible, minWidth: this.minColumnWidth, maxWidth: this.maxColumnWidth,
            };
            if (isCollapsed && this.collapsedColumnData[columnIndex] && this.collapsedColumnData[columnIndex].placeholderHeaderCell) {
                state.placeholderWidth = parseFloat(window.getComputedStyle(this.collapsedColumnData[columnIndex].placeholderHeaderCell).width);
            }
            return state;
        }

        on(eventName, callback) {
            if (typeof callback !== 'function') { return; }
            if (!this._eventListeners[eventName]) { this._eventListeners[eventName] = []; }
            this._eventListeners[eventName].push(callback);
        }
        off(eventName, callback) {
            if (!this._eventListeners[eventName]) { return; }
            if (!callback) { delete this._eventListeners[eventName]; return; }
            this._eventListeners[eventName] = this._eventListeners[eventName].filter(l => l !== callback);
            if (this._eventListeners[eventName].length === 0) { delete this._eventListeners[eventName]; }
        }
        _emit(eventName, ...args) {
            const listeners = this._eventListeners[eventName];
            if (!listeners || listeners.length === 0) { return; }
            listeners.forEach(listener => {
                try { listener(...args); }
                catch (error) { console.warn(`RT: Error in event listener for '${eventName}':`, error); }
            });
        }
    }
    return ResizableTable;
}));
