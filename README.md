# ResizableTable Plugin

A JavaScript plugin for making HTML tables resizable and collapsible.

## Features (Planned)

*   Resizable columns
*   Collapsible columns (optional, per column)
*   Persistence of column sizes/state (e.g., using localStorage)
*   Touch support for resizing
*   Programmatic control (e.g., reset to original sizes, destroy instance)
*   Callbacks/events for resize/collapse actions

## Basic Usage

To use the ResizableTable plugin, include the script in your HTML file and then instantiate the `ResizableTable` class.

1.  **Include the script:**

    Add the following script tag to your HTML, preferably before the closing `</body>` tag.
    (Note: Once a build process is in place, this will point to a file in the `dist/` directory.)

    ```html
    <script src="src/ResizableTable.js"></script>
    <!-- Or eventually: <script src="dist/ResizableTable.min.js"></script> -->
    ```

2.  **Prepare your HTML Table:**

    Ensure you have a standard HTML `<table>` element with an `id` or other selectable attribute. The table should ideally have a `<thead>` section.

    ```html
    <table id="myCoolTable">
      <thead>
        <tr>
          <th>Column 1</th>
          <th>Column 2</th>
          <th>Another Column</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Data A1</td>
          <td>Data B1</td>
          <td>Data C1</td>
        </tr>
        <!-- More rows... -->
      </tbody>
    </table>
    ```

3.  **Initialize the plugin:**

    After the DOM is loaded, create a new instance of `ResizableTable`, passing either the table element itself or a CSS selector string. You can also pass an options object as the second argument.

    ```javascript
    document.addEventListener('DOMContentLoaded', function() {
      const myTableElement = document.getElementById('myCoolTable');
      // or const myTableElement = document.querySelector('#myCoolTable');

      if (myTableElement) {
        try {
          const options = {
            minColumnWidth: 50, // Example option
            // See "Configuration Options" below for all available settings
          };
          const resizableTable = new ResizableTable(myTableElement, options);

          // Using events
          resizableTable.on('columnResized', function(data) {
            console.log('Column resized:', data.columnIndex, 'New width:', data.newWidth);
          });

        } catch (error) {
          console.error("Failed to initialize ResizableTable:", error.message);
        }
      } else {
        console.error("Table element '#myCoolTable' not found.");
      }
    });
    ```

## Configuration Options

The `ResizableTable` constructor accepts an optional second argument, an object containing configuration options to customize its behavior and appearance. If an option is not provided, its default value will be used.

| Option                        | Type      | Default                       | Description                                                                 |
|-------------------------------|-----------|-------------------------------|-----------------------------------------------------------------------------|
| `enableResizing`              | `Boolean` | `true`                        | If `true`, columns can be resized.                                          |
| `enableCollapsing`            | `Boolean` | `true`                        | If `true`, columns can be collapsed/expanded using UI toggles.              |
| `minColumnWidth`              | `Number`  | `30`                          | Minimum width (in pixels) that a column can be resized to.                  |
| `maxColumnWidth`              | `Number`  | `Infinity`                    | Maximum width (in pixels) that a column can be resized to.                  |
| `resizeHandleWidth`           | `Number`  | `12`                          | Visual width (in pixels) of the draggable resize handles.                     |
| `resizeHandleColor`           | `String`  | `'rgba(100, 100, 100, 0.2)'`  | Base background color of resize handles (applied via JS).                   |
| `usePlaceholdersForCollapse`  | `Boolean` | `true`                        | If `true`, placeholder cells are inserted when columns collapse. If `false`, original cells are hidden with `display:none`. |
| `collapseToggleSize`          | `Number`  | `10`                          | Approximate size (in pixels) for styling the collapse toggle button (width & height). |
| `collapseToggleColor`         | `String`  | `'#007bff'`                   | Background color for the collapse toggle button (applied via JS).           |
| `collapseToggleContentOpen`   | `String`  | `'-'`                         | HTML content (e.g., text, SVG, HTML entity) for the toggle when the column is expanded (visible). |
| `collapseToggleContentClosed` | `String`  | `'+'`                         | HTML content for the toggle when the column is collapsed or for the placeholder header. |
| `placeholderCellWidth`        | `Number`  | `30`                          | Width (in pixels) of placeholder cells when `usePlaceholdersForCollapse` is `true`. |
| `tableClassResizing`          | `String`  | `'rt-table-resizing'`         | CSS class added to the `<table>` element during an active column resize drag. |
| `resizeHandleClass`           | `String`  | `'rt-resize-handle'`          | Base CSS class applied to all resize handle elements.                       |
| `activeHandleClass`           | `String`  | `'rt-active-handle'`          | CSS class applied to a resize handle when it is being actively dragged.     |
| `collapseToggleClass`         | `String`  | `'rt-collapse-toggle'`        | Base CSS class applied to all collapse toggle elements.                     |
| `placeholderCellClass`        | `String`  | `'rt-col-placeholder'`        | CSS class applied to all placeholder cell elements (`<th>` and `<td>`).       |
| `onInit`                      | `Function`| `null`                        | Callback: `function({ instance })`. Fired once after the table is fully initialized. |
| `onColumnResizeStart`         | `Function`| `null`                        | Callback: `function({ columnIndex, handle, originalEvent })`. Fired when a column resize drag starts. |
| `onColumnResized`             | `Function`| `null`                        | Callback: `function({ columnIndex, newWidth, originalEvent })`. Fired when a column resize drag ends and the new width is applied. |
| `onColumnCollapse`            | `Function`| `null`                        | Callback: `function({ columnIndex })`. Fired when a column is collapsed.      |
| `onColumnExpand`              | `Function`| `null`                        | Callback: `function({ columnIndex })`. Fired when a column is expanded.       |
| `onBeforeDestroy`             | `Function`| `null`                        | Callback: `function({ instance })`. Fired at the beginning of the `destroy()` method. |
| `onColumnWidthSet`            | `Function`| `null`                        | Callback: `function({ columnIndex, newWidth, source })`. Fired when `setColumnWidth()` is called. `source` is `'programmatic'`. |

## Development & Testing

The `index.html` file at the root of this project provides a comprehensive demonstration and an interactive testbed for `ResizableTable.js`.

To use it:
1. Simply open `index.html` in your web browser.
2. The page initializes two table instances with different configurations:
    * The first table showcases a complex header structure with `colspan` and `rowspan`, and uses most of the default plugin features.
    * The second table is simpler and demonstrates a minimal setup (e.g., collapsing disabled).
3. You can interact with the tables directly (resizing, collapsing columns where enabled).
4. Use the control buttons provided on the page to test public API methods like `toggleColumn()`, `setColumnWidth()`, `destroy()`, and re-initialization for each table instance.
5. Observe the on-page "Event Log" to see real-time event firing from both table instances. More detailed event payloads and debug messages are also available in the browser's developer console.
6. To experiment with different configurations, you can modify the `mainTableOptions` or `table2Options` objects within the `<script>` tag at the bottom of `index.html` and refresh the page, or use the "Re-initialize" buttons.

---

**Note:** This project is currently under active development. Features and API are subject to change.

---

## Project Roadmap / Feature Status

### PHASE 1: Core Architecture and Plugin Initialization
- [x] 1. Portable Plugin Architecture (UMD Wrapper)
- [x] 2. Class Construction (Selector/DOM validation for `<table>`)
- [x] 3. Table Initialization (`init()` method)
    - [x] Find header row (`<thead>` or first `<tr>` in `<tbody>`)
    - [x] Store original table state (`this.originalTableState = this.table.cloneNode(true);`)
    - [x] Initialize `this.isInitialized = false;` (set to `true` after init)
    - [x] Store header cells (`this.headerRow`, `this.columnCount`)
    - [x] Comprehensive `defaultOptions` structure.
    - [x] Options merging in constructor.

### PHASE 2: Resizable Columns
- [x] 1. Resize Handle Implementation (`_createResizeHandles()`)
    - [x] Create `<div>` elements as handles.
    - [x] Style handles for visibility and interaction (cursor, position, color, width from options).
    - [x] Append handles to `<th>` elements.
    - [x] Ensure `<th>` has `position: relative`.
    - [x] Store handles in `this.resizeHandles`.
    - [x] Conditional creation based on `options.enableResizing`.
    - [x] Use `options.resizeHandleClass` and `options.activeHandleClass`.
- [x] 2. Resize Logic (`_onDragStart`, `_onDragMoveWrapper`, `_onDragEndWrapper`, `_updateColumnWidth`)
    - [x] Event binding and unbinding for mouse/touch events on `document`.
    - [x] Calculate width changes based on mouse/touch movement.
    - [x] Apply new width to `<th>` element.
    *   [x] Use `requestAnimationFrame` in drag move logic.
    *   [x] Store initial state on drag start.
    *   [x] Update `this.columnWidths` array on drag end.
    *   [x] Enforce min/max column width from `options`.
    *   [x] Force `table-layout: fixed` on the table.
    *   [x] Initialize column widths from computed styles.
    *   [x] Add/remove `options.tableClassResizing` to table during drag.
- [~] 3. Rowspan and Colspan Handling
    - [x] Detect and log `rowspan`/`colspan` on header cells.
    - [ ] Advanced handling logic (Not Implemented)
- [x] 4. Performance Optimization
    - [x] Use `requestAnimationFrame` for drag updates.
    - [ ] Optional throttling via user-defined `updateInterval` (Not Implemented)
    - [ ] Defer DOM writes via `requestIdleCallback` (Not Implemented)

### PHASE 3: Collapsible Columns
- [x] 1. Collapse Toggle Setup (`_createCollapseToggles()`, `_onCollapseToggle`)
    - [x] Create `<span>` elements as toggles.
    - [x] Style toggles using `options` (size, color, content, class).
    - [x] Append toggles to `<th>` elements.
    - [x] Ensure `<th>` has `position: relative`.
    - [x] Add `click` event listener to toggles.
    - [x] `_onCollapseToggle` handler accepts event or column index.
    - [x] Conditional creation based on `options.enableCollapsing`.
- [x] 2. Collapse UI & Logic
    - [x] Implement show/hide logic for columns.
    - [x] Update toggle appearance based on `options` and state.
    - [x] Store collapsed state in `this.collapsedColumns`.
    - [x] Handle `<tbody>` cells visibility.
    - [x] Conditional placeholder strategy via `options.usePlaceholdersForCollapse`.
        - [x] Create/remove placeholder `<th>` and `<td>` elements.
        - [x] Style placeholders using `options.placeholderCellClass` and `options.placeholderCellWidth`.
        - [x] Placeholder header is clickable to expand.
    - [x] Basic DOM validation before restoring (row/header counts, column index bounds).
- [x] 3. Expand Logic
    - [x] Implemented logic to show a collapsed column (both placeholder and `display:none` strategies).
    - [x] Restore original or last known width from `this.columnWidths`.
    - [x] Store/restore cell references in `this.collapsedColumnData` for placeholder strategy.

### PHASE 4: Mobile Optimization
- [x] 1. Touch Enhancements
    - [x] Add touch event listeners (`touchstart`, `touchmove`, `touchend`, `touchcancel`) for resizing.
    - [x] Adapt mouse event logic for touch in drag handlers.
    - [~] Detect gesture direction (basic implementation for scroll vs. resize).
    - [x] Use `touch-action: none` on resize handles.
- [x] 2. Responsive Considerations
    - [x] Resize handle size/positioning adjusted for touch via `options.resizeHandleWidth`.
    - [x] Hover/focus styles (CSS handles hover, JS for active drag state).
- [x] 3. Width Constraints
    - [x] Enforce min/max width in resize logic from `options`.
    - [ ] Option to use CSS `min-width`/`max-width` on `<th>`/`<td>` (Not Implemented, JS handles now)

### PHASE 5: API and Extensibility
- [x] 1. Public Methods
    - [x] `isInitialized` flag check in public methods.
    - [x] `destroy()` method (basic implementation with TODOs for full cleanup).
    - [x] `toggleColumn(columnIndex)` with validation.
    - [x] `setColumnWidth(columnIndex, width)` with validation and constraints.
    - [x] `getColumnState(columnIndex)` with validation.
    - [ ] `reset()` method (to original or initial state).
    - [ ] `updateOptions()` method.
- [x] 2. Event Hooks/Callbacks
    *   [x] Basic event emitter (`on`, `off`, `_emit`).
    *   [x] Key events emitted (`init`, `columnResizeStart`, `columnResized`, `columnCollapse`, `columnExpand`, `beforeDestroy`, `columnWidthSet`).
    *   [x] Option-based callbacks (e.g., `onInit`) invoked with `try...catch`.
- [x] 3. State Management
    - [x] Private internal state properties (`columnWidths`, `isResizing`, `collapsedColumns`, `collapsedColumnData`, etc.).
    - [x] `dataset` attributes used for static references (e.g., `columnIndex`), not for dynamic state.
    - [ ] Option for persistence (e.g., `localStorage`). (Not Implemented)

### PHASE 6: Testing & Validation
- [ ] 1. Test Coverage
    - [ ] Unit tests for core logic.
    - [ ] Cross-browser testing (manual for now).
- [x] 2. Edge Case Handling
    - [x] Log warnings for `colspan`/`rowspan`.
    - [x] Fallback for missing `<thead>`.
    - [x] Basic DOM validation on column expand.
    - [ ] Handle `display:none` on table or ancestors.
    - [ ] Empty table or table with no rows/cells.
- [ ] 3. Accessibility (ARIA)
    - [ ] ARIA roles and properties for handles and toggles.
    - [ ] `aria-hidden` for collapsed content.
    - [ ] Keyboard operability for resizing and collapsing.

### PHASE 7: Documentation & Examples
- [x] README.md (updated with basic usage, options, roadmap, development/testing info).
- [x] `index.html` (updated to demo comprehensive options, events, multiple instances, and API controls).
- [ ] More examples (different configurations, themes).
- [ ] API documentation (JSDoc or similar for public methods and options).

### PHASE 8: Build and Distribution
- [ ] Setup build process (e.g., Webpack, Rollup).
- [ ] Minification.
- [ ] Sourcemaps.
- [ ] Add `dist/` files to `.gitignore`.
- [ ] Publish to npm (optional).
