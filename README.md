# ResizableTable Plugin

A JavaScript plugin for making HTML tables resizable and collapsible.

View a live demo of ResizableTable.js on our GitHub Pages site: [Live Demo](https://your-username.github.io/your-repository-name/)

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
        <tr>
          <td>Data A2</td>
          <td>Data B2</td>
          <td>Data C2</td>
        </tr>
      </tbody>
    </table>
    ```

3.  **Initialize the plugin:**

    After the DOM is loaded, create a new instance of `ResizableTable`, passing either the table element itself or a CSS selector string.

    ```javascript
    document.addEventListener('DOMContentLoaded', function() {
      // Ensure the table element exists in the DOM
      const myTableElement = document.getElementById('myCoolTable');
      // or const myTableElement = document.querySelector('#myCoolTable');

      if (myTableElement) {
        try {
          // Initialize with the DOM element
          const resizableTable = new ResizableTable(myTableElement);
          console.log("ResizableTable initialized for element:", myTableElement);

          // Or, initialize with a CSS selector:
          // const resizableTableFromString = new ResizableTable('#myCoolTable');
          // console.log("ResizableTable initialized for selector '#myCoolTable'");

        } catch (error) {
          console.error("Failed to initialize ResizableTable:", error.message);
        }
      } else {
        console.error("Table element '#myCoolTable' not found.");
      }
    });
    ```


4.  **Handling Table Overflow / Horizontal Scrolling (Automatic Parent Styling):**

    When columns are resized, the total width of the table might exceed the width of its containing element. To enable horizontal scrolling, the plugin now *automatically attempts* to style the table's immediate parent container.

    Key points regarding this feature:
    *   **Automatic Styling:** During initialization, the plugin inspects the `overflow-x` CSS property of the table's direct parent element.
        *   If the parent's `overflow-x` is `visible` (the default for most elements), `initial`, or `unset`, the plugin will set `parent.style.overflowX = 'auto';`. A confirmation message is logged to the console.
        *   If the parent already has an `overflow-x` value of `auto`, `scroll`, `hidden`, or any other value not listed above, the plugin will *not* change it and will log a warning message indicating that the existing style is being respected.
    *   **Parent Container Width:** For the horizontal scrollbar to appear and function correctly, the parent container must have a defined `width` (e.g., `600px`, `50vw`) or `max-width` that the table can actually exceed. The plugin *does not* set any width on the parent container; this remains the responsibility of the user's CSS.
    *   **Table Layout:** The plugin automatically sets `table-layout: fixed;` on the table itself. This is essential for predictable column resizing.
    *   **Table Width:** The table's own CSS `width` should generally be `auto` (the default) or not constrained in a way that prevents it from growing larger than its parent (e.g., avoid `width: 100%;` if the parent has a fixed width and you want the table to cause an overflow).

    **Example HTML Setup:**

    ```html
    <!-- Ensure this div has a defined width via CSS or inline style -->
    <div class="table-wrapper" style="width: 600px; border: 1px solid #ccc; /* Optional: to see container */">
      <table id="myResizableTable">
        <thead>
          <tr>
            <th>Very Wide Column 1</th>
            <th>Very Wide Column 2</th>
            <th>Very Wide Column 3</th>
            <!-- Add more columns as needed -->
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Data for column 1</td>
            <td>Data for column 2</td>
            <td>Data for column 3</td>
            <!-- Corresponding data cells -->
          </tr>
          <!-- More rows -->
        </tbody>
      </table>
    </div>

    <script>
      document.addEventListener('DOMContentLoaded', function() {
        new ResizableTable('#myResizableTable');
        // The plugin will attempt to set 'overflow-x: auto;' on 'div.table-wrapper'
        // if its current overflow-x is 'visible', 'initial', or 'unset'.
      });
    </script>
    ```
    In this example, `ResizableTable.js` will attempt to apply `overflow-x: auto;` to the `div` with class `table-wrapper`. If the sum of column widths in `myResizableTable` exceeds `600px`, the `div` should then display a horizontal scrollbar.


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
    - [x] Initial `console.log` statements for debugging.
    - [x] Store header cells (`this.headerRow`, `this.columnCount`)

### PHASE 2: Resizable Columns
- [x] 1. Resize Handle Implementation (`_createResizeHandles()`)
    - [x] Create `<div>` elements as handles.
    - [x] Style handles for visibility and interaction (cursor, position).
    - [x] Append handles to `<th>` elements.
    - [x] Ensure `<th>` has `position: relative`.
    - [x] Store handles in `this.resizeHandles`.
- [x] 2. Resize Logic (`_onMouseDown`, `_onMouseMove`, `_onMouseUp`, `_updateColumnWidth`)
    - [x] Event binding and unbinding for mouse events on `document`.
    - [x] Calculate width changes based on mouse movement (`deltaX`).
    - [x] Apply new width to `<th>` element (`th.style.width`).
    - [x] Use `requestAnimationFrame` in `_onMouseMove` for performance.
    - [x] Store initial state on mousedown (`this.startX`, `this.startWidth`, `this.currentColumnIndex`).
    - [x] Update `this.columnWidths` array on mouseup.
    - [x] Enforce minimum column width (e.g., 20px).
    - [x] Force `table-layout: fixed` on the table.
    - [x] Initialize column widths from computed styles or explicitly set `cell.style.width`.
- [~] 3. Rowspan and Colspan Handling
    - [x] Detect and log `rowspan`/`colspan` on header cells.
    - [x] Advanced handling logic for colspan. Rowspan detection continues to log warnings.
- [x] 4. Performance Optimization
    - [x] Optional throttling via user-defined `updateInterval`.
    - [x] Defer DOM writes via `requestIdleCallback` (experimental).

### PHASE 3: Collapsible Columns
- [~] 1. Collapse Toggle Setup (`_createCollapseToggles()`, `_onCollapseToggle`)
    - [x] Create `<span>` elements as toggles.
    - [x] Style toggles (placeholder styles).
    - [x] Append toggles to `<th>` elements.
    - [x] Ensure `<th>` has `position: relative`.
    - [x] Add `click` event listener to toggles.
    - [x] Basic `_onCollapseToggle` handler (logs, prevents default/propagation).
    - [ ] Prevent event propagation from handle to `th` for other interactions (Partially done with `stopPropagation` in toggle click)
    - [ ] Bounding box detection for clicks near edge (Not Implemented)
- [ ] 2. Collapse UI & Logic
    - [ ] Implement actual show/hide logic for columns.
    - [ ] Update toggle appearance (e.g., '+' to '-', icon changes).
    - [ ] Store collapsed state (e.g., in `this.collapsedColumns` array).
    - [ ] Handle `<tbody>` cells visibility.
    - [ ] Track placeholders for collapsed columns (Not Implemented)
    - [ ] Clean up fully before restore (Not Implemented)
- [ ] 3. Expand Logic
    - [ ] Implement logic to show a collapsed column.
    - [ ] Restore original or last known width.
    - [ ] Store restoration metadata (Not Implemented)
    - [ ] Validate DOM before restoring / fallback to reset (Not Implemented)

### PHASE 4: Mobile Optimization
- [ ] 1. Touch Enhancements
    - [ ] Add touch event listeners (`touchstart`, `touchmove`, `touchend`).
    - [ ] Adapt mouse event logic for touch.
    - [ ] Detect gesture direction (Not Implemented)
    - [ ] Use `touch-action: none` and `preventDefault` appropriately (Not Implemented)
- [ ] 2. Responsive Considerations
    - [ ] Enforce min handle width for touch targets (Not Implemented)
    - [ ] Hover/focus styles for touch (Not Implemented)
- [ ] 3. Width Constraints
    - [x] Enforce min width in resize logic.
    - [ ] Enforce max width in resize logic (Not Implemented).
    - [ ] Option to use CSS `min-width`/`max-width` on `<th>`/`<td>` (Not Implemented)

### PHASE 5: API and Extensibility
- [ ] 1. Public Methods
    - [x] `isInitialized` flag check in `init()`.
    - [ ] `destroy()` method.
    - [ ] `reset()` method (to original or initial state).
    - [ ] `updateOptions()` method.
    - [ ] Methods to programmatically resize/collapse/expand columns.
    - [ ] Index out of bounds validation for public methods (Not Implemented)
- [ ] 2. Event Hooks/Callbacks
    - [ ] Define events (e.g., `onResizeStart`, `onResizeEnd`, `onCollapse`, `onExpand`).
    - [ ] Helper methods for registering/unregistering callbacks (Not Implemented)
    - [ ] Warn on callback failure (Not Implemented)
- [~] 3. State Management
    - [x] Private internal state properties (`columnWidths`, `isResizing`, etc.).
    - [ ] Option for persistence (e.g., `localStorage`).
    - [ ] `this.collapsedColumns` array (To be added).
    - [ ] Avoid relying on DOM data attributes alone for critical state (Review current usage - `data-column-index` is okay for event handlers).

### PHASE 6: Testing & Validation
- [ ] 1. Test Coverage
    - [ ] Unit tests for core logic (resize, collapse, init).
    - [ ] Tests for DOM manipulations and event handling.
    - [ ] Cross-browser testing (manual for now).
- [~] 2. Edge Case Handling
    - [x] Log warnings for `colspan`/`rowspan`.
    - [x] Fallback for missing `<thead>`.
    - [ ] Handle `display:none` on table or ancestors.
    - [ ] Empty table or table with no rows/cells.
- [ ] 3. Accessibility (ARIA)
    - [ ] ARIA roles and properties for handles and toggles.
    - [ ] `aria-hidden` for collapsed content.
    - [ ] Keyboard operability for resizing and collapsing.

### PHASE 7: Documentation & Examples
- [x] README.md (Initial version created, updated with roadmap)
- [x] `index.html` basic example page.
- [ ] More examples (different configurations, themes).
- [ ] API documentation (JSDoc or similar).

### PHASE 8: Build and Distribution
- [ ] Setup build process (e.g., Webpack, Rollup).
- [ ] Minification.
- [ ] Sourcemaps.
- [ ] Add `dist/` files to `.gitignore` (once build is set up).
- [ ] Publish to npm (optional).
